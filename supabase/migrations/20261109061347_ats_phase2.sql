-- Migración aplicada en Supabase (20261109061347). Exportada tal cual desde supabase_migrations.schema_migrations.

create index if not exists idx_messages_sender_created on public.messages (sender_id, created_at desc);

create or replace function public.message_rate_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from messages where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 60 then
    raise exception 'Estás enviando demasiados mensajes seguidos. Espera un minuto e inténtalo de nuevo.';
  end if;
  if (select count(*) from messages where sender_id = new.sender_id and created_at > now() - interval '1 day') >= 1500 then
    raise exception 'Llegaste al máximo de mensajes por día. Podrás seguir mañana.';
  end if;
  return new;
end $$;
drop trigger if exists message_rate_guard on public.messages;
create trigger message_rate_guard before insert on public.messages for each row execute function message_rate_guard();

create or replace function public.invite_external(p_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_company uuid; v_left int;
begin
  select company_id into v_company from external_applicants where id = any(p_ids) limit 1;
  if v_company is null or not is_company_member(v_company) then return 0; end if;
  v_left := 200 - (select count(*) from external_applicants where company_id = v_company and invited_at > now() - interval '1 day');
  if v_left <= 0 then raise exception 'Llegaste al máximo de 200 invitaciones por día. Podrás seguir mañana.'; end if;
  for r in update external_applicants set invited_at = now(), invite_status = 'enviando'
           where id in (select id from external_applicants
                        where id = any(p_ids) and company_id = v_company and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and linked_user_id is null
                        limit v_left)
           returning id loop
    perform notify_event('invite', r.id); n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.notify_job_closed() returns trigger
language plpgsql security definer set search_path = public as $$
declare co text;
begin
  if new.status = 'closed' and old.status in ('published', 'paused') then
    select display_name into co from companies where id = new.company_id;
    perform notify_users(array(
      select a.candidate_id from candidate_job_actions a
      where a.job_id = new.id and a.action = 'interest'
        and not exists (select 1 from matches m where m.job_id = new.id and m.candidate_id = a.candidate_id)
        and not exists (select 1 from company_candidate_actions c where c.job_id = new.id and c.candidate_id = a.candidate_id and c.action = 'pass')),
      'job_closed', 'La vacante «' || new.title || '» cerró',
      co || ' cerró este proceso. Gracias por tu interés: sigue explorando vacantes parecidas en VINKA.', '/', false);
    perform notify_users(array(
      select m.candidate_id from matches m
      where m.job_id = new.id and not m.closed and m.stage not in ('contratado', 'descartado')),
      'job_closed', 'Proceso cerrado: «' || new.title || '»',
      co || ' cerró este proceso de selección. Si tenías una conversación abierta, puedes seguir escribiendo desde tus chats.', '/chats', false);
  end if;
  return new;
end $$;
drop trigger if exists on_job_closed on public.jobs;
create trigger on_job_closed after update of status on public.jobs for each row execute function notify_job_closed();

create table if not exists public.stage_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stage text not null check (stage in ('contacto', 'entrevista', 'oferta', 'contratado', 'descartado')),
  body text not null check (length(trim(body)) between 1 and 2000),
  enabled boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (company_id, stage)
);
create index if not exists idx_stage_rules_created_by on public.stage_rules (created_by);
alter table public.stage_rules enable row level security;
create policy "reglas: leer" on public.stage_rules for select to authenticated using (is_company_member(company_id));
create policy "reglas: crear" on public.stage_rules for insert to authenticated with check (is_company_admin(company_id));
create policy "reglas: editar" on public.stage_rules for update to authenticated using (is_company_admin(company_id)) with check (is_company_admin(company_id));
create policy "reglas: borrar" on public.stage_rules for delete to authenticated using (is_company_admin(company_id));

create or replace function public.apply_stage_rule() returns trigger
language plpgsql security definer set search_path = public as $$
declare r stage_rules; v_uid uuid := auth.uid(); v_body text;
begin
  if new.stage is not distinct from old.stage or new.closed then return new; end if;
  if v_uid is null or not is_company_member(new.company_id) then return new; end if;
  select * into r from stage_rules where company_id = new.company_id and stage = new.stage and enabled;
  if r.id is null then return new; end if;
  if exists (select 1 from messages where match_id = new.id and sender_id = v_uid and created_at > now() - interval '1 minute') then return new; end if;
  v_body := replace(replace(replace(r.body,
    '{nombre}', coalesce((select first_name from profiles where id = new.candidate_id), '')),
    '{cargo}', coalesce((select title from jobs where id = new.job_id), '')),
    '{empresa}', coalesce((select display_name from companies where id = new.company_id), ''));
  insert into messages (match_id, sender_id, body) values (new.id, v_uid, v_body);
  perform log_event(new.company_id, new.job_id, new.candidate_id, null, 'auto_message', jsonb_build_object('stage', new.stage));
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists apply_stage_rule on public.matches;
create trigger apply_stage_rule after update of stage on public.matches for each row execute function apply_stage_rule();

alter table public.companies add column if not exists stale_days int not null default 5 check (stale_days between 0 and 60);

create or replace function public.stale_digest() returns void
language plpgsql security definer set search_path = public as $$
declare c record; n int;
begin
  for c in select id, stale_days from companies where verification_status = 'verified' and stale_days > 0 loop
    select (select count(*) from matches m join jobs j on j.id = m.job_id
              where m.company_id = c.id and not m.closed and j.status = 'published'
                and m.stage in ('match', 'contacto', 'entrevista', 'oferta')
                and coalesce(m.stage_changed_at, m.created_at) < now() - make_interval(days => c.stale_days))
         + (select count(*) from candidate_job_actions a join jobs j on j.id = a.job_id
              where j.company_id = c.id and j.status = 'published' and a.action = 'interest'
                and a.created_at < now() - make_interval(days => c.stale_days)
                and not exists (select 1 from matches m where m.job_id = a.job_id and m.candidate_id = a.candidate_id)
                and not exists (select 1 from company_candidate_actions x where x.job_id = a.job_id and x.candidate_id = a.candidate_id))
      into n;
    if n > 0 then
      perform notify_users(array(select user_id from company_members where company_id = c.id and role in ('owner', 'admin', 'recruiter')),
        'stale', n || (case when n = 1 then ' persona lleva' else ' personas llevan' end) || ' más de ' || c.stale_days || ' días sin avanzar',
        'Revisa tus procesos de selección para responderles a tiempo.', '/', false);
    end if;
  end loop;
end $$;
revoke all on function public.stale_digest() from public, anon, authenticated;
select cron.schedule('vinka-procesos-detenidos', '7 12 * * 1-5', $$select public.stale_digest()$$);

create or replace function public.stage_times(p_company uuid, p_days int default 90)
returns table (stage text, avg_days numeric, n bigint)
language sql stable security definer set search_path = public as $$
  with ev as (
    select e.job_id, e.candidate_id, e.created_at,
           case when e.kind = 'match' then 'match' else e.detail->>'to' end as stage
    from pipeline_events e
    where e.company_id = p_company and is_company_member(p_company) and e.candidate_id is not null
      and (e.kind = 'match' or (e.kind = 'stage' and e.detail ? 'to'))
      and e.created_at > now() - make_interval(days => p_days)
  ), d as (
    select stage, extract(epoch from (lead(created_at) over w - created_at)) / 86400.0 as days
    from ev window w as (partition by job_id, candidate_id order by created_at)
  )
  select stage, round(avg(days)::numeric, 1), count(*) from d
  where days is not null and stage in ('match', 'contacto', 'entrevista', 'oferta')
  group by stage
$$;
grant execute on function public.stage_times(uuid, int) to authenticated;

alter table public.companies add column if not exists require_approval boolean not null default false;
alter table public.jobs drop constraint jobs_status_check;
alter table public.jobs add constraint jobs_status_check check (status in ('draft', 'pending', 'review', 'published', 'paused', 'closed'));
alter table public.offers drop constraint offers_status_check;
alter table public.offers add constraint offers_status_check check (status in ('por_aprobar', 'enviada', 'aceptada', 'rechazada', 'retirada'));

create or replace function public.job_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if not exists (select 1 from companies where id = new.company_id and verification_status = 'verified') then
      new.status := 'pending';
    elsif auth.uid() is not null and not is_company_admin(new.company_id)
          and exists (select 1 from companies where id = new.company_id and require_approval) then
      new.status := 'review';
      perform notify_users(array(select user_id from company_members where company_id = new.company_id and role in ('owner', 'admin')),
        'approval', 'Vacante por aprobar: «' || new.title || '»', 'Un reclutador pidió publicarla. Revísala y apruébala desde el panel.', '/', false);
    end if;
  end if;
  return new;
end $$;

create or replace function public.approve_job(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
declare j jobs;
begin
  select * into j from jobs where id = p_job;
  if j.id is null or not is_company_admin(j.company_id) then raise exception 'Solo un administrador puede aprobar vacantes'; end if;
  if j.status <> 'review' then raise exception 'La vacante no está esperando aprobación'; end if;
  update jobs set status = 'published' where id = p_job;
end $$;
grant execute on function public.approve_job(uuid) to authenticated;

create or replace function public.send_offer(p_match uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare m matches; v_id uuid; co text; jt text; needs boolean;
begin
  select * into m from matches where id = p_match;
  if m.id is null or not can_manage(m.company_id) then raise exception 'No tienes permiso para enviar ofertas'; end if;
  if m.closed then raise exception 'Esta conversación está cerrada'; end if;
  needs := not is_company_admin(m.company_id) and exists (select 1 from companies where id = m.company_id and require_approval);
  update offers set status = 'retirada' where match_id = p_match and status in ('enviada', 'por_aprobar');
  insert into offers (match_id, company_id, job_id, candidate_id, position, salary, salary_type, start_date, contract, schedule, location, benefits, message, expires_on, created_by, status)
  values (m.id, m.company_id, m.job_id, m.candidate_id, trim(p->>'position'), nullif(p->>'salary','')::int, coalesce(nullif(p->>'salary_type',''),'liquido'),
    nullif(p->>'start_date','')::date, coalesce(p->>'contract',''), coalesce(p->>'schedule',''), coalesce(p->>'location',''),
    coalesce(p->>'benefits',''), coalesce(p->>'message',''), nullif(p->>'expires_on','')::date, auth.uid(),
    case when needs then 'por_aprobar' else 'enviada' end)
  returning id into v_id;
  select display_name into co from companies where id = m.company_id;
  select title into jt from jobs where id = m.job_id;
  if needs then
    perform log_event(m.company_id, m.job_id, m.candidate_id, null, 'offer_pending', jsonb_build_object('offer', v_id));
    perform notify_users(array(select user_id from company_members where company_id = m.company_id and role in ('owner', 'admin')),
      'approval', 'Carta oferta por aprobar', 'Hay una oferta para «' || jt || '» esperando tu aprobación.', '/vacantes/' || m.job_id || '/candidato/' || m.candidate_id, false);
    return v_id;
  end if;
  perform log_event(m.company_id, m.job_id, m.candidate_id, null, 'offer_sent', jsonb_build_object('offer', v_id));
  perform notify_users(array[m.candidate_id], 'offer', '¡Recibiste una carta oferta!', co || ' te envió una oferta para «' || jt || '». Revísala y responde desde VINKA.', '/ofertas/' || v_id, true);
  if m.stage <> 'oferta' then update matches set stage = 'oferta' where id = m.id; end if;
  return v_id;
end $$;

create or replace function public.approve_offer(p_id uuid, p_approve boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare o offers; co text; jt text;
begin
  select * into o from offers where id = p_id;
  if o.id is null or not is_company_admin(o.company_id) then raise exception 'Solo un administrador puede aprobar ofertas'; end if;
  if o.status <> 'por_aprobar' then raise exception 'Esta oferta no está esperando aprobación'; end if;
  if not p_approve then
    update offers set status = 'retirada' where id = p_id;
    perform log_event(o.company_id, o.job_id, o.candidate_id, null, 'offer_rejected_internal', jsonb_build_object('offer', p_id));
    perform notify_users(array[o.created_by], 'approval', 'Oferta no aprobada', 'Un administrador no aprobó la carta oferta. Revisa los datos y vuelve a enviarla.', '/vacantes/' || o.job_id || '/candidato/' || o.candidate_id, false);
    return;
  end if;
  update offers set status = 'enviada', created_at = now() where id = p_id;
  select display_name into co from companies where id = o.company_id;
  select title into jt from jobs where id = o.job_id;
  perform log_event(o.company_id, o.job_id, o.candidate_id, null, 'offer_sent', jsonb_build_object('offer', p_id, 'approved', true));
  perform notify_users(array[o.candidate_id], 'offer', '¡Recibiste una carta oferta!', co || ' te envió una oferta para «' || jt || '». Revísala y responde desde VINKA.', '/ofertas/' || p_id, true);
  update matches set stage = 'oferta' where id = o.match_id and stage <> 'oferta';
end $$;
grant execute on function public.approve_offer(uuid, boolean) to authenticated;

alter policy "ofertas: participantes" on public.offers
  using ((candidate_id = (select auth.uid()) and status <> 'por_aprobar') or is_company_member(company_id));

alter table public.candidate_profiles add column if not exists job_alerts boolean not null default true;

create or replace function public.job_alerts_digest() returns void
language plpgsql security definer set search_path = public as $$
declare c record; n int;
begin
  for c in select cp.* from candidate_profiles cp where cp.job_alerts and cp.onboarding_done and cp.is_public and cp.role_family is not null loop
    select count(*) into n from jobs j join companies co on co.id = j.company_id
     where j.status = 'published' and co.verification_status = 'verified'
       and j.created_at > now() - interval '1 day'
       and coalesce(role_fit(c.role_family, c.role_related, c.role_level, j.role_family, j.role_related, j.role_level), -1) >= 0
       and (j.modality = 'Remota' or j.region = c.region or j.region = any(c.locations))
       and not exists (select 1 from candidate_job_actions a where a.job_id = j.id and a.candidate_id = c.user_id);
    if n > 0 then
      perform notify_users(array[c.user_id], 'job_alert',
        case when n = 1 then 'Hay 1 vacante nueva para ti' else 'Hay ' || n || ' vacantes nuevas para ti' end,
        'Publicadas en las últimas 24 horas y compatibles con tu cargo y zona.', '/', false);
    end if;
  end loop;
end $$;
revoke all on function public.job_alerts_digest() from public, anon, authenticated;
select cron.schedule('vinka-alertas-vacantes', '13 14 * * *', $$select public.job_alerts_digest()$$);
