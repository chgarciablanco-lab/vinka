-- Migración aplicada en Supabase (20261109122235). Exportada tal cual desde supabase_migrations.schema_migrations.

alter table public.company_members add column if not exists created_at timestamptz not null default now();

create table if not exists public.plans (
  id text primary key,
  name text not null,
  price_clp int,
  max_active_jobs int,
  max_members int,
  ai_monthly int not null,
  sort int not null default 0
);
alter table public.plans enable row level security;
create policy "planes: todos leen" on public.plans for select to anon, authenticated using (true);
insert into public.plans (id, name, price_clp, max_active_jobs, max_members, ai_monthly, sort) values
  ('gratis', 'Gratis', 0, 1, 1, 10, 1),
  ('pyme', 'Pyme', 29990, 5, 3, 200, 2),
  ('equipo', 'Equipo', 69990, 20, 10, 800, 3),
  ('empresa', 'Empresa', null, null, null, 3000, 4)
on conflict (id) do update set name = excluded.name, price_clp = excluded.price_clp, max_active_jobs = excluded.max_active_jobs,
  max_members = excluded.max_members, ai_monthly = excluded.ai_monthly, sort = excluded.sort;

create table if not exists public.subscriptions (
  company_id uuid primary key references public.companies(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'canceled')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create index if not exists idx_subscriptions_plan on public.subscriptions (plan_id);
create index if not exists idx_subscriptions_updated_by on public.subscriptions (updated_by);
alter table public.subscriptions enable row level security;
create policy "suscripción: equipo y admin leen" on public.subscriptions for select to authenticated using (is_company_member(company_id) or is_admin());

create or replace function public.company_add_subscription() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into subscriptions (company_id, plan_id, status, trial_ends_at) values (new.id, 'pyme', 'trial', now() + interval '30 days')
  on conflict (company_id) do nothing;
  return new;
end $$;
create trigger company_add_subscription after insert on public.companies for each row execute function company_add_subscription();

insert into public.subscriptions (company_id, plan_id, status, trial_ends_at, note)
select c.id,
  case when exists (select 1 from seed.companies s where s.id = c.id) then 'equipo' else 'pyme' end,
  case when exists (select 1 from seed.companies s where s.id = c.id) then 'active' else 'trial' end,
  case when exists (select 1 from seed.companies s where s.id = c.id) then null else now() + interval '30 days' end,
  case when exists (select 1 from seed.companies s where s.id = c.id) then 'Empresa de demostración' else 'Empresa existente al lanzar planes' end
from public.companies c
on conflict (company_id) do nothing;

create or replace function public.expire_trials() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in update subscriptions set plan_id = 'gratis', status = 'active', updated_at = now(), note = 'Fin de la prueba'
           where status = 'trial' and trial_ends_at < now() returning company_id loop
    perform notify_users(array(select user_id from company_members where company_id = r.company_id and role in ('owner', 'admin')),
      'plan', 'Terminó tu prueba gratuita', 'Tu empresa pasó al plan Gratis. Tus datos siguen disponibles; para publicar más vacantes elige un plan.', '/plan', true);
  end loop;
end $$;
revoke all on function public.expire_trials() from public, anon, authenticated;
select cron.schedule('vinka-fin-de-prueba', '41 6 * * *', $cron$select public.expire_trials()$cron$);

create or replace function public.plan_of(p_company uuid) returns plans
language sql stable security definer set search_path = public as $$
  select p.* from plans p
  where p.id = coalesce((select case when s.status = 'canceled' then 'gratis' else s.plan_id end from subscriptions s where s.company_id = p_company), 'gratis')
$$;

create table if not exists public.ai_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  company_id uuid references public.companies(id) on delete cascade,
  task text not null,
  job_id uuid references public.jobs(id) on delete set null,
  candidate_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_log_company_created on public.ai_log (company_id, created_at desc);
create index if not exists idx_ai_log_user on public.ai_log (user_id);
create index if not exists idx_ai_log_job on public.ai_log (job_id);
create index if not exists idx_ai_log_candidate on public.ai_log (candidate_id);
alter table public.ai_log enable row level security;
create policy "ia registro: admins de empresa" on public.ai_log for select to authenticated using (is_company_admin(company_id) or is_admin());

create or replace function public.ai_quota(p_user uuid, p_daily int, p_task text, p_job uuid default null, p_candidate uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_company uuid; v_plan plans; v_used int; v_day int;
begin
  v_company := coalesce((select company_id from jobs where id = p_job),
                        (select company_id from company_members where user_id = p_user order by created_at desc limit 1));
  if v_company is not null then
    v_plan := plan_of(v_company);
    select count(*) into v_used from ai_log where company_id = v_company and created_at >= date_trunc('month', now() at time zone 'America/Santiago') at time zone 'America/Santiago';
    if v_used >= v_plan.ai_monthly then
      return 'Tu empresa usó las ' || v_plan.ai_monthly || ' consultas de IA de su plan ' || v_plan.name || ' este mes.';
    end if;
  end if;
  v_day := ai_take(p_user, p_daily);
  if v_day > p_daily then return 'Llegaste al límite de ' || p_daily || ' usos de IA por hoy. Vuelve mañana.'; end if;
  insert into ai_log (user_id, company_id, task, job_id, candidate_id) values (p_user, v_company, left(p_task, 40), p_job, p_candidate);
  if p_candidate is not null and p_job is not null and v_company is not null then
    insert into pipeline_events (company_id, job_id, candidate_id, actor_id, kind, detail)
    values (v_company, p_job, p_candidate, p_user, 'ai', jsonb_build_object('task', p_task));
  end if;
  return null;
end $$;
revoke all on function public.ai_quota(uuid, int, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.ai_quota(uuid, int, text, uuid, uuid) to service_role;

create or replace function public.job_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan plans; v_active int;
begin
  new.updated_at := now();
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if not exists (select 1 from companies where id = new.company_id and verification_status = 'verified') then
      new.status := 'pending';
      return new;
    end if;
    if auth.uid() is not null and not is_admin() then
      v_plan := plan_of(new.company_id);
      select count(*) into v_active from jobs where company_id = new.company_id and status = 'published' and id <> new.id;
      if v_plan.max_active_jobs is not null and v_active >= v_plan.max_active_jobs then
        raise exception 'Tu plan % permite % vacante(s) publicada(s) a la vez. Pausa o cierra otra, o cambia de plan.', v_plan.name, v_plan.max_active_jobs;
      end if;
    end if;
    if auth.uid() is not null and not is_company_admin(new.company_id)
       and exists (select 1 from companies where id = new.company_id and require_approval) then
      new.status := 'review';
      perform notify_users(array(select user_id from company_members where company_id = new.company_id and role in ('owner', 'admin')),
        'approval', 'Vacante por aprobar: «' || new.title || '»', 'Un reclutador pidió publicarla. Revísala y apruébala desde el panel.', '/', false);
    end if;
  end if;
  return new;
end $$;

create or replace function public.invite_member(p_company uuid, p_email text, p_role text)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid; e text := lower(trim(p_email)); v_plan plans; v_n int;
begin
  if not is_company_admin(p_company) then raise exception 'Solo quien administra la empresa puede invitar'; end if;
  if p_role not in ('admin','recruiter','viewer') then raise exception 'Rol no válido'; end if;
  if exists (select 1 from company_members cm join auth.users u on u.id = cm.user_id where cm.company_id = p_company and lower(u.email) = e) then
    raise exception 'Esa persona ya es parte del equipo'; end if;
  v_plan := plan_of(p_company);
  select (select count(*) from company_members where company_id = p_company)
       + (select count(*) from company_invites where company_id = p_company and accepted_at is null and lower(email) <> e and created_at > now() - interval '30 days')
    into v_n;
  if v_plan.max_members is not null and v_n >= v_plan.max_members then
    raise exception 'Tu plan % permite % persona(s) en el equipo (contando invitaciones pendientes). Cambia de plan para sumar más.', v_plan.name, v_plan.max_members; end if;
  if v_n >= 25 and v_plan.max_members is null then raise exception 'El equipo llegó al máximo de 25 personas'; end if;
  delete from company_invites where company_id = p_company and lower(email) = e and accepted_at is null;
  insert into company_invites (company_id, email, role, invited_by) values (p_company, e, p_role, auth.uid()) returning id into v_id;
  perform notify_event('member_invite', v_id);
  return v_id;
end $$;

create or replace function public.join_company(p_user uuid, p_email text, p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare i company_invites; v_plan plans;
begin
  select * into i from company_invites where token = p_token and accepted_at is null and created_at > now() - interval '30 days';
  if i.id is null then raise exception 'La invitación no es válida o ya fue usada'; end if;
  if lower(i.email) <> lower(p_email) then raise exception 'Esta invitación es para %. Ingresa con ese correo.', i.email; end if;
  v_plan := plan_of(i.company_id);
  if v_plan.max_members is not null and not exists (select 1 from company_members where company_id = i.company_id and user_id = p_user)
     and (select count(*) from company_members where company_id = i.company_id) >= v_plan.max_members then
    raise exception 'El equipo de esta empresa llegó al máximo de su plan. Pide a quien te invitó que revise el plan.'; end if;
  insert into company_members (company_id, user_id, role) values (i.company_id, p_user, i.role) on conflict (company_id, user_id) do update set role = excluded.role;
  update company_invites set accepted_at = now(), accepted_by = p_user where id = i.id;
  perform notify_users(array[i.invited_by], 'team_joined', 'Se unió alguien a tu equipo',
    coalesce((select trim(first_name||' '||last_name) from profiles where id = p_user), i.email) || ' aceptó tu invitación a VINKA.', '/equipo', false);
  return i.company_id;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text := coalesce(new.raw_user_meta_data->>'role','candidate');
        t text := new.raw_user_meta_data->>'team_invite';
begin
  if r not in ('candidate','company') then r := 'candidate'; end if;
  insert into profiles (id, role, first_name, last_name, phone, marketing_opt_in, terms_accepted_at)
  values (new.id, r,
    coalesce(new.raw_user_meta_data->>'first_name',''),
    coalesce(new.raw_user_meta_data->>'last_name',''),
    nullif(new.raw_user_meta_data->>'phone',''),
    coalesce((new.raw_user_meta_data->>'marketing_opt_in')::boolean, false),
    case when (new.raw_user_meta_data->>'terms_accepted')::boolean then now() end);
  if r = 'candidate' then insert into candidate_profiles (user_id) values (new.id); end if;
  if r = 'company' and t ~ '^[0-9a-f-]{36}$' then
    begin perform join_company(new.id, new.email, t::uuid); exception when others then null; end;
  end if;
  return new;
end $$;

create or replace function public.company_plan(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s subscriptions; p plans;
begin
  if not is_company_member(p_company) and not is_admin() then raise exception 'Sin acceso'; end if;
  select * into s from subscriptions where company_id = p_company;
  p := plan_of(p_company);
  return jsonb_build_object(
    'plan', to_jsonb(p), 'status', coalesce(s.status, 'active'), 'trial_ends_at', s.trial_ends_at, 'current_period_end', s.current_period_end,
    'usage', jsonb_build_object(
      'jobs', (select count(*) from jobs where company_id = p_company and status = 'published'),
      'members', (select count(*) from company_members where company_id = p_company),
      'ai', (select count(*) from ai_log where company_id = p_company and created_at >= date_trunc('month', now() at time zone 'America/Santiago') at time zone 'America/Santiago')),
    'plans', (select jsonb_agg(to_jsonb(x) order by x.sort) from plans x));
end $$;
grant execute on function public.company_plan(uuid) to authenticated;

create or replace function public.request_plan_change(p_company uuid, p_plan text, p_message text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_company_admin(p_company) then raise exception 'Solo un administrador de la empresa puede pedir cambios de plan'; end if;
  if not exists (select 1 from plans where id = p_plan) then raise exception 'Plan no válido'; end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'plan_request', 'company', p_company, jsonb_build_object('plan', p_plan, 'message', left(coalesce(p_message, ''), 500)));
  perform notify_users(array(select user_id from admins), 'plan_request', 'Solicitud de plan ' || (select name from plans where id = p_plan),
    (select display_name from companies where id = p_company) || ' pidió cambiar de plan.', '/admin', true);
end $$;
grant execute on function public.request_plan_change(uuid, text, text) to authenticated;

create or replace function public.admin_set_plan(p_company uuid, p_plan text, p_status text, p_period_end timestamptz, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  insert into subscriptions (company_id, plan_id, status, current_period_end, note, updated_at, updated_by)
  values (p_company, p_plan, p_status, p_period_end, coalesce(p_note, ''), now(), auth.uid())
  on conflict (company_id) do update set plan_id = excluded.plan_id, status = excluded.status, current_period_end = excluded.current_period_end,
    trial_ends_at = case when excluded.status = 'trial' then subscriptions.trial_ends_at else null end,
    note = excluded.note, updated_at = now(), updated_by = auth.uid();
  insert into audit_logs (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'plan_change', 'company', p_company, jsonb_build_object('plan', p_plan, 'status', p_status, 'period_end', p_period_end, 'note', p_note));
  perform notify_users(array(select user_id from company_members where company_id = p_company and role in ('owner', 'admin')),
    'plan', 'Tu plan cambió a ' || (select name from plans where id = p_plan), 'Revisa los detalles y límites en Empresa → Plan y uso.', '/plan', false);
end $$;
grant execute on function public.admin_set_plan(uuid, text, text, timestamptz, text) to authenticated;

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  return jsonb_build_object(
    'metrics', jsonb_build_object(
      'companies', (select count(*) from companies where verification_status = 'verified'),
      'pending', (select count(*) from companies where verification_status = 'pending'),
      'candidates', (select count(*) from candidate_profiles where onboarding_done),
      'jobs_open', (select count(*) from jobs where status = 'published'),
      'matches_30d', (select count(*) from matches where created_at > now() - interval '30 days'),
      'hires_30d', (select count(*) from matches where hired_at > now() - interval '30 days'),
      'paying', (select count(*) from subscriptions where status = 'active' and plan_id <> 'gratis' and note <> 'Empresa de demostración'),
      'mrr', (select coalesce(sum(p.price_clp), 0) from subscriptions s join plans p on p.id = s.plan_id where s.status = 'active' and s.note <> 'Empresa de demostración'),
      'ai_30d', (select count(*) from ai_log where created_at > now() - interval '30 days'),
      'errors_7d', (select count(*) from client_errors where created_at > now() - interval '7 days')),
    'companies', (select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.display_name, 'legal_name', c.legal_name, 'rut', c.rut, 'verification', c.verification_status, 'created_at', c.created_at,
        'plan', s.plan_id, 'status', s.status, 'trial_ends_at', s.trial_ends_at, 'period_end', s.current_period_end, 'note', s.note,
        'jobs', (select count(*) from jobs j where j.company_id = c.id and j.status = 'published'),
        'members', (select count(*) from company_members m where m.company_id = c.id),
        'demo', exists (select 1 from seed.companies d where d.id = c.id)) order by c.created_at desc)
      from companies c left join subscriptions s on s.company_id = c.id),
    'requests', (select coalesce(jsonb_agg(jsonb_build_object('company_id', a.entity_id, 'plan', a.detail->>'plan', 'message', a.detail->>'message', 'at', a.created_at) order by a.created_at desc), '[]'::jsonb)
      from audit_logs a where a.action = 'plan_request' and a.created_at > now() - interval '60 days'),
    'errors', (select coalesce(jsonb_agg(jsonb_build_object('message', e.message, 'path', e.path, 'at', e.created_at) order by e.created_at desc), '[]'::jsonb)
      from (select * from client_errors order by created_at desc limit 30) e));
end $$;
grant execute on function public.admin_overview() to authenticated;
