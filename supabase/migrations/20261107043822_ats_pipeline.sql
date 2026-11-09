-- Migración aplicada en Supabase (20261107043822). Exportada tal cual desde supabase_migrations.schema_migrations.

-- ===== Preguntas de filtro =====
alter table jobs add column if not exists questions jsonb not null default '[]'::jsonb;
alter table jobs drop constraint if exists jobs_questions_chk;
alter table jobs add constraint jobs_questions_chk check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 8);
alter table candidate_job_actions add column if not exists answers jsonb;

create or replace function knocked_out(q jsonb, a jsonb) returns boolean language sql immutable as $$
  select coalesce(bool_or(a->>(e->>'id') = e->>'knockout'), false)
  from jsonb_array_elements(coalesce(q, '[]'::jsonb)) e where e->>'knockout' in ('si','no') and a is not null;
$$;

-- ===== Seguimiento de etapas =====
alter table matches add column if not exists stage_changed_at timestamptz not null default now();
alter table matches add column if not exists hired_at timestamptz;
alter table external_applicants add column if not exists stage_changed_at timestamptz not null default now();
update matches set stage_changed_at = created_at where stage_changed_at > created_at;
update external_applicants set stage_changed_at = created_at where stage_changed_at > created_at;

create table if not exists pipeline_events (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  candidate_id uuid references auth.users(id) on delete cascade,
  external_id uuid references external_applicants(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null, detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists pipeline_events_subject on pipeline_events (job_id, candidate_id, created_at desc);
create index if not exists pipeline_events_ext on pipeline_events (external_id, created_at desc);
alter table pipeline_events enable row level security;
create policy "historial: equipo" on pipeline_events for select to authenticated using (is_company_member(company_id));

create or replace function log_event(p_company uuid, p_job uuid, p_cand uuid, p_ext uuid, p_kind text, p_detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into pipeline_events (company_id, job_id, candidate_id, external_id, actor_id, kind, detail)
  values (p_company, p_job, p_cand, p_ext, auth.uid(), p_kind, coalesce(p_detail, '{}'::jsonb));
$$;

create or replace function track_match_stage() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_event(new.company_id, new.job_id, new.candidate_id, null, 'match', '{}'::jsonb);
    return new;
  end if;
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
    if new.stage = 'contratado' then new.hired_at := coalesce(new.hired_at, now()); end if;
    perform log_event(new.company_id, new.job_id, new.candidate_id, null, 'stage', jsonb_build_object('from', old.stage, 'to', new.stage));
  end if;
  return new;
end $$;
drop trigger if exists match_track_stage on matches;
create trigger match_track_stage before update of stage on matches for each row execute function track_match_stage();
drop trigger if exists match_track_insert on matches;
create trigger match_track_insert after insert on matches for each row execute function track_match_stage();

create or replace function track_external_stage() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_event(new.company_id, new.job_id, null, new.id, 'imported', jsonb_build_object('source', new.source));
    return new;
  end if;
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
    perform log_event(new.company_id, new.job_id, null, new.id, 'stage', jsonb_build_object('from', old.stage, 'to', new.stage));
  end if;
  return new;
end $$;
drop trigger if exists ext_track_stage on external_applicants;
create trigger ext_track_stage before update of stage on external_applicants for each row execute function track_external_stage();
drop trigger if exists ext_track_insert on external_applicants;
create trigger ext_track_insert after insert on external_applicants for each row execute function track_external_stage();

create or replace function track_candidate_interest() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.action = 'interest' and (tg_op = 'INSERT' or old.action is distinct from 'interest') then
    perform log_event((select company_id from jobs where id = new.job_id), new.job_id, new.candidate_id, null, 'applied', '{}'::jsonb);
  end if;
  return new;
end $$;
drop trigger if exists cand_track_interest on candidate_job_actions;
create trigger cand_track_interest after insert or update on candidate_job_actions for each row execute function track_candidate_interest();

-- ===== Sujeto de evaluación (candidato VINKA o postulante externo) =====
create or replace function subject_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.candidate_id is null) = (new.external_id is null) then raise exception 'Indica un candidato o un postulante externo'; end if;
  new.company_id := (select company_id from jobs where id = new.job_id);
  if new.company_id is null then raise exception 'Vacante no encontrada'; end if;
  if new.external_id is not null and not exists (select 1 from external_applicants where id = new.external_id and job_id = new.job_id) then
    raise exception 'Postulante no corresponde a la vacante'; end if;
  if new.candidate_id is not null and not (
       exists (select 1 from candidate_job_actions where job_id = new.job_id and candidate_id = new.candidate_id and action = 'interest')
    or exists (select 1 from company_candidate_actions where job_id = new.job_id and candidate_id = new.candidate_id)
    or exists (select 1 from matches where job_id = new.job_id and candidate_id = new.candidate_id)) then
    raise exception 'Este candidato aún no participa en la vacante'; end if;
  if tg_op = 'INSERT' then new.author_id := auth.uid(); end if;
  return new;
end $$;

-- ===== Evaluaciones =====
create table if not exists evaluations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  candidate_id uuid references auth.users(id) on delete cascade,
  external_id uuid references external_applicants(id) on delete cascade,
  author_id uuid references auth.users(id) on delete cascade,
  scores jsonb not null default '{}'::jsonb,
  overall int not null check (overall between 1 and 5),
  recommendation text not null check (recommendation in ('si','tal_vez','no')),
  note text not null default '' check (length(note) <= 2000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists evaluations_one_c on evaluations (job_id, candidate_id, author_id) where candidate_id is not null;
create unique index if not exists evaluations_one_e on evaluations (external_id, author_id) where external_id is not null;
alter table evaluations enable row level security;
create policy "evaluaciones: leer" on evaluations for select to authenticated using (is_company_member(company_id));
create policy "evaluaciones: crear" on evaluations for insert to authenticated with check (author_id = auth.uid() and is_company_member(company_id));
create policy "evaluaciones: editar" on evaluations for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid() and is_company_member(company_id));
create policy "evaluaciones: borrar" on evaluations for delete to authenticated using (author_id = auth.uid());
drop trigger if exists evaluations_guard on evaluations;
create trigger evaluations_guard before insert or update on evaluations for each row execute function subject_guard();

create or replace function after_evaluation() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  perform log_event(new.company_id, new.job_id, new.candidate_id, new.external_id, 'evaluation',
    jsonb_build_object('overall', new.overall, 'recommendation', new.recommendation, 'updated', tg_op = 'UPDATE'));
  return new;
end $$;
drop trigger if exists evaluations_log on evaluations;
create trigger evaluations_log before insert or update on evaluations for each row execute function after_evaluation();

-- ===== Notas internas con @menciones =====
create table if not exists candidate_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  candidate_id uuid references auth.users(id) on delete cascade,
  external_id uuid references external_applicants(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 2000),
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists candidate_notes_subject on candidate_notes (job_id, candidate_id, created_at);
alter table candidate_notes enable row level security;
create policy "notas: leer" on candidate_notes for select to authenticated using (is_company_member(company_id));
create policy "notas: crear" on candidate_notes for insert to authenticated with check (author_id = auth.uid() and is_company_member(company_id));
create policy "notas: borrar" on candidate_notes for delete to authenticated using (author_id = auth.uid());
drop trigger if exists notes_guard on candidate_notes;
create trigger notes_guard before insert on candidate_notes for each row execute function subject_guard();

create or replace function after_note() returns trigger language plpgsql security definer set search_path = public as $$
declare who text := (select trim(first_name||' '||last_name) from profiles where id = new.author_id);
        url text := '/vacantes/' || new.job_id || case when new.candidate_id is not null then '/candidato/' || new.candidate_id else '/externo/' || new.external_id end;
        targets uuid[];
begin
  perform log_event(new.company_id, new.job_id, new.candidate_id, new.external_id, 'note', '{}'::jsonb);
  select array_agg(distinct m) into targets from unnest(new.mentions) m
   where m <> new.author_id and exists (select 1 from company_members where company_id = new.company_id and user_id = m);
  if targets is not null then
    perform notify_users(targets, 'mention', coalesce(who, 'Alguien') || ' te mencionó', left(new.body, 140), url, true);
  end if;
  return new;
end $$;
drop trigger if exists notes_after on candidate_notes;
create trigger notes_after after insert on candidate_notes for each row execute function after_note();

-- ===== Etiquetas (banco de talento) =====
create table if not exists candidate_tags (
  company_id uuid not null references companies(id) on delete cascade,
  subject_id uuid not null,
  tag text not null check (length(trim(tag)) between 1 and 30),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (company_id, subject_id, tag)
);
alter table candidate_tags enable row level security;
create policy "etiquetas: leer" on candidate_tags for select to authenticated using (is_company_member(company_id));
create policy "etiquetas: crear" on candidate_tags for insert to authenticated with check (can_manage(company_id));
create policy "etiquetas: borrar" on candidate_tags for delete to authenticated using (can_manage(company_id));

-- ===== Plantillas de mensajes =====
create table if not exists message_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  body text not null check (length(trim(body)) between 1 and 2000),
  kind text not null default 'general' check (kind in ('general','contacto','entrevista','oferta','rechazo')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table message_templates enable row level security;
create policy "plantillas: leer" on message_templates for select to authenticated using (is_company_member(company_id));
create policy "plantillas: escribir" on message_templates for all to authenticated using (can_manage(company_id)) with check (can_manage(company_id));

-- ===== Resultados de IA guardados =====
create table if not exists ai_insights (
  company_id uuid not null references companies(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  candidate_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('fit','questions')),
  data jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (job_id, candidate_id, kind)
);
alter table ai_insights enable row level security;
create policy "ia resultados: equipo" on ai_insights for select to authenticated using (is_company_member(company_id));

-- ===== Cartas oferta =====
create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  candidate_id uuid not null references auth.users(id) on delete cascade,
  position text not null check (length(trim(position)) between 2 and 120),
  salary int check (salary is null or salary between 100000 and 100000000),
  salary_type text not null default 'liquido' check (salary_type in ('liquido','bruto')),
  start_date date, contract text not null default '', schedule text not null default '', location text not null default '',
  benefits text not null default '' check (length(benefits) <= 1500),
  message text not null default '' check (length(message) <= 2000),
  expires_on date,
  status text not null default 'enviada' check (status in ('enviada','aceptada','rechazada','retirada')),
  response_note text not null default '' check (length(response_note) <= 1000),
  responded_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists offers_match on offers (match_id, created_at desc);
alter table offers enable row level security;
create policy "ofertas: participantes" on offers for select to authenticated using (candidate_id = auth.uid() or is_company_member(company_id));

create or replace function send_offer(p_match uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare m matches; v_id uuid; co text; jt text;
begin
  select * into m from matches where id = p_match;
  if m.id is null or not can_manage(m.company_id) then raise exception 'No tienes permiso para enviar ofertas'; end if;
  if m.closed then raise exception 'Esta conversación está cerrada'; end if;
  update offers set status = 'retirada' where match_id = p_match and status = 'enviada';
  insert into offers (match_id, company_id, job_id, candidate_id, position, salary, salary_type, start_date, contract, schedule, location, benefits, message, expires_on, created_by)
  values (m.id, m.company_id, m.job_id, m.candidate_id, trim(p->>'position'), nullif(p->>'salary','')::int, coalesce(nullif(p->>'salary_type',''),'liquido'),
    nullif(p->>'start_date','')::date, coalesce(p->>'contract',''), coalesce(p->>'schedule',''), coalesce(p->>'location',''),
    coalesce(p->>'benefits',''), coalesce(p->>'message',''), nullif(p->>'expires_on','')::date, auth.uid())
  returning id into v_id;
  select display_name into co from companies where id = m.company_id;
  select title into jt from jobs where id = m.job_id;
  perform log_event(m.company_id, m.job_id, m.candidate_id, null, 'offer_sent', jsonb_build_object('offer', v_id));
  perform notify_users(array[m.candidate_id], 'offer', '¡Recibiste una carta oferta!', co || ' te envió una oferta para «' || jt || '». Revísala y responde desde VINKA.', '/ofertas/' || v_id, true);
  if m.stage <> 'oferta' then update matches set stage = 'oferta' where id = m.id; end if;
  return v_id;
end $$;

create or replace function respond_offer(p_id uuid, p_accept boolean, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare o offers; who text; members uuid[];
begin
  select * into o from offers where id = p_id;
  if o.id is null or o.candidate_id <> auth.uid() then raise exception 'Oferta no encontrada'; end if;
  if o.status <> 'enviada' then raise exception 'Esta oferta ya no está vigente'; end if;
  if o.expires_on is not null and o.expires_on < (now() at time zone 'America/Santiago')::date then raise exception 'La oferta venció. Escríbele a la empresa por el chat.'; end if;
  update offers set status = case when p_accept then 'aceptada' else 'rechazada' end, responded_at = now(), response_note = left(coalesce(p_note,''), 1000) where id = p_id;
  perform log_event(o.company_id, o.job_id, o.candidate_id, null, case when p_accept then 'offer_accepted' else 'offer_rejected' end, '{}'::jsonb);
  select trim(first_name || ' ' || last_name) into who from profiles where id = o.candidate_id;
  select array_agg(user_id) into members from company_members where company_id = o.company_id and role <> 'viewer';
  perform notify_users(members, 'offer_response',
    case when p_accept then who || ' aceptó la oferta' else who || ' rechazó la oferta' end,
    case when p_accept then 'Para «' || o.position || '». Márcalo como contratado/a cuando confirmen el ingreso.' else 'Para «' || o.position || '».' || case when coalesce(p_note,'') <> '' then ' Comentario: ' || left(p_note, 120) else '' end end,
    '/chats/' || o.match_id, true);
end $$;

create or replace function withdraw_offer(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update offers set status = 'retirada' where id = p_id and status = 'enviada' and can_manage(company_id);
  if not found then raise exception 'No se pudo retirar la oferta'; end if;
end $$;

-- El aviso genérico de "oferta" no se duplica si se envió carta oferta
create or replace function public.notify_stage_change() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare job text := (select title from jobs where id = new.job_id);
        co text := (select display_name from companies where id = new.company_id);
        t text; b text; u text := '/chats/' || new.id;
begin
  if new.stage is not distinct from old.stage then return new; end if;
  if new.stage = 'entrevista' and exists (select 1 from interviews where match_id = new.id and status = 'confirmada' and created_at > now() - interval '1 minute') then return new; end if;
  if new.stage = 'oferta' and exists (select 1 from offers where match_id = new.id and created_at > now() - interval '1 minute') then return new; end if;
  case new.stage
    when 'contacto' then t := 'Avanzaste en tu proceso'; b := co || ' quiere conversar contigo sobre «' || job || '». Revisa el chat.';
    when 'entrevista' then t := 'Te invitan a una entrevista'; b := co || ' quiere entrevistarte para «' || job || '». Elige un horario en el chat.'; u := '/chats/' || new.id || '/agendar';
    when 'oferta' then t := '¡Tienes una oferta!'; b := co || ' avanzó a la etapa de oferta para «' || job || '». Revisa el chat para conocer los detalles.';
    when 'contratado' then t := '¡Felicitaciones!'; b := co || ' te marcó como contratado/a para «' || job || '». ¡Mucho éxito en este nuevo desafío!';
    when 'descartado' then t := 'Actualización de tu proceso'; b := co || ' decidió avanzar con otras personas para «' || job || '». Gracias por tu interés: sigue explorando, hay más vacantes para ti.'; u := '/';
    else return new;
  end case;
  perform notify_users(array[new.candidate_id], 'stage_' || new.stage, t, b, u, true);
  return new;
end $function$;

-- ===== Vistas de avisos (para el embudo) =====
create table if not exists job_views (
  job_id uuid not null references jobs(id) on delete cascade,
  candidate_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (job_id, candidate_id)
);
alter table job_views enable row level security;
create or replace function log_views(p_jobs uuid[]) returns void language sql security definer set search_path = public as $$
  insert into job_views (job_id, candidate_id)
  select j, auth.uid() from unnest(p_jobs[1:20]) j
  where auth.uid() is not null and exists (select 1 from jobs where id = j and status = 'published')
  on conflict do nothing;
$$;

revoke execute on function knocked_out(jsonb,jsonb), log_event(uuid,uuid,uuid,uuid,text,jsonb), send_offer(uuid,jsonb), respond_offer(uuid,boolean,text), withdraw_offer(uuid), log_views(uuid[]) from public, anon;
revoke execute on function log_event(uuid,uuid,uuid,uuid,text,jsonb) from authenticated;
grant execute on function knocked_out(jsonb,jsonb), send_offer(uuid,jsonb), respond_offer(uuid,boolean,text), withdraw_offer(uuid), log_views(uuid[]) to authenticated;
revoke execute on function track_match_stage(), track_external_stage(), track_candidate_interest(), subject_guard(), after_evaluation(), after_note() from public, anon, authenticated;
