-- Consultoras: una empresa matriz (consultora) maneja varias empresas clientes.
-- · El equipo de la matriz trabaja en sus clientes con el mismo rol (permisos heredados).
-- · El cliente puede tener usuarios con rol «cliente»: ven y evalúan sus procesos y aprueban ofertas; no ven la matriz ni otros clientes.
-- · El plan de la matriz cubre a todo el grupo (el límite de vacantes suma matriz + clientes).
-- · VINKA verifica cada cliente. Los postulantes ven al cliente «gestionado por» la matriz, o «Empresa confidencial» si la vacante lo es.
create table if not exists backup.companies_20261110 as select * from public.companies;
create table if not exists backup.company_members_20261110 as select * from public.company_members;
create table if not exists backup.subscriptions_20261110 as select * from public.subscriptions;

alter table public.companies add column if not exists parent_id uuid references public.companies(id) on delete restrict;
alter table public.companies add column if not exists kind text not null default 'empresa';
alter table public.companies drop constraint if exists companies_kind_check;
alter table public.companies add constraint companies_kind_check check (kind in ('empresa', 'consultora'));
alter table public.companies drop constraint if exists companies_not_self_parent;
alter table public.companies add constraint companies_not_self_parent check (parent_id is distinct from id);
create index if not exists idx_companies_parent on public.companies (parent_id);
alter table public.jobs add column if not exists confidential boolean not null default false;

do $mig$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.company_members'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%viewer%' loop
    execute format('alter table public.company_members drop constraint %I', c);
  end loop;
end $mig$;
alter table public.company_members add constraint company_members_role_check check (role in ('owner', 'admin', 'recruiter', 'viewer', 'client'));

insert into public.plans (id, name, price_clp, max_active_jobs, max_members, ai_monthly, sort, promo_credits, promo_days)
values ('consultora', 'Consultora', 129990, 40, 15, 2000, 4, 5, 15) on conflict (id) do nothing;
update public.plans set sort = 5 where id = 'empresa' and sort = 4;

-- Grupo de empresas
create or replace function public.company_parent(cid uuid) returns uuid language sql stable security definer set search_path = public as $$ select parent_id from companies where id = cid $$;
create or replace function public.company_root(cid uuid) returns uuid language sql stable security definer set search_path = public as $$ select coalesce(parent_id, id) from companies where id = cid $$;
create or replace function public.company_group(cid uuid) returns setof uuid language sql stable security definer set search_path = public as $$
  select id from companies where id = company_root(cid) or parent_id = company_root(cid) $$;

-- Permisos: membresía propia o heredada de la matriz (el rol «cliente» no se hereda: solo existe en el cliente)
create or replace function public.is_company_member(cid uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from company_members where user_id = auth.uid() and (company_id = cid or company_id = (select parent_id from companies where id = cid))) $$;
create or replace function public.can_manage(cid uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from company_members where user_id = auth.uid() and role in ('owner', 'admin', 'recruiter') and (company_id = cid or company_id = (select parent_id from companies where id = cid))) $$;
create or replace function public.is_company_admin(cid uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from company_members where user_id = auth.uid() and role in ('owner', 'admin') and (company_id = cid or company_id = (select parent_id from companies where id = cid))) $$;
create or replace function public.member_role(cid uuid) returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce((select role from company_members where company_id = cid and user_id = auth.uid()),
                  (select role from company_members where company_id = (select parent_id from companies where id = cid) and user_id = auth.uid())) $$;
create or replace function public.is_match_participant(mid uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from matches m where m.id = mid and not m.closed and (m.candidate_id = auth.uid() or is_company_member(m.company_id))) $$;
create or replace function public.company_user_ids(p_company uuid) returns uuid[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(distinct user_id), '{}') from company_members where company_id = p_company or company_id = (select parent_id from companies where id = p_company) $$;
create or replace function public.company_staff(cid uuid, p_roles text[]) returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct user_id), '{}') from company_members
  where role = any(p_roles) and (company_id = cid or company_id = (select parent_id from companies where id = cid)) $$;
-- Quién aprueba ofertas: en un cliente con usuarios «cliente», ellos; si no, los administradores (propios o de la matriz)
create or replace function public.company_approvers(cid uuid) returns uuid[] language sql stable security definer set search_path = public as $$
  select case when company_parent(cid) is not null and exists (select 1 from company_members where company_id = cid and role = 'client')
    then (select array_agg(user_id) from company_members where company_id = cid and role = 'client')
    else company_staff(cid, array['owner', 'admin']) end $$;
revoke execute on function public.company_staff(uuid, text[]), public.company_approvers(uuid), public.company_group(uuid) from public, anon;

-- Plan: un cliente usa el plan de su matriz
create or replace function public.plan_of(p_company uuid) returns plans language sql stable security definer set search_path to 'public' as $$
  select p.* from plans p where p.id = coalesce((select case when s.status = 'canceled' then 'gratis' else s.plan_id end from subscriptions s where s.company_id = company_root(p_company)), 'gratis') $$;
create or replace function public.company_add_subscription() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.parent_id is not null then return new; end if;
  insert into subscriptions (company_id, plan_id, status, trial_ends_at) values (new.id, 'pyme', 'trial', now() + interval '30 days') on conflict (company_id) do nothing;
  return new;
end $$;
create or replace function public.company_add_owner() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.parent_id is not null then return new; end if;  -- el equipo de la matriz ya tiene acceso al cliente
  insert into company_members (company_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;

-- La relación matriz–cliente y el tipo de empresa solo cambian por las funciones de VINKA (create_client_company, set_company_kind)
create or replace function public.company_guard() returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare api boolean := coalesce(auth.role(), '') in ('authenticated', 'anon'); internal boolean := coalesce(current_setting('vinka.company_admin', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    if api and not is_admin() then new.verification_status := 'pending'; new.verification_note := ''; end if;
    if api and not internal and not is_admin() then new.parent_id := null; end if;
    if new.parent_id is not null then
      if not exists (select 1 from companies where id = new.parent_id and kind = 'consultora' and parent_id is null) then raise exception 'La matriz debe ser una consultora'; end if;
      new.kind := 'empresa';
    end if;
    return new;
  end if;
  if (new.verification_status is distinct from old.verification_status or new.verification_note is distinct from old.verification_note) then
    if api and not is_admin() then raise exception 'Solo administración puede cambiar la verificación'; end if;
    insert into audit_logs (actor_id, action, entity, entity_id, detail)
    values (auth.uid(), 'verification_change', 'company', new.id, jsonb_build_object('from', old.verification_status, 'to', new.verification_status, 'note', new.verification_note));
  end if;
  if (new.parent_id is distinct from old.parent_id or new.kind is distinct from old.kind) and api and not internal and not is_admin() then
    raise exception 'Este cambio se hace desde «Clientes» o «Empresa»';
  end if;
  if new.parent_id is not null and new.kind = 'consultora' then raise exception 'Una empresa cliente no puede ser consultora'; end if;
  if new.kind = 'empresa' and old.kind = 'consultora' and exists (select 1 from companies where parent_id = new.id) then
    raise exception 'Primero traslada o cierra a tus clientes'; end if;
  new.owner_id := old.owner_id;
  return new;
end $function$;

-- Avisos que iban «a la empresa»: ahora incluyen al equipo de la matriz
do $mig$
declare f text; d text; d2 text;
begin
  foreach f in array array['admin_activate_promotion', 'admin_record_payment', 'admin_set_plan', 'expire_offers', 'expire_trials', 'job_guard',
                           'plan_limit_notice', 'promo_housekeeping', 'public_apply', 'send_offer', 'stale_digest'] loop
    d := pg_get_functiondef(('public.' || f)::regproc);
    d2 := regexp_replace(d, 'select\s+user_id\s+from\s+company_members\s+where\s+company_id\s*=\s*([a-z_.]+)\s+and\s+role\s+in\s*\(([^)]*)\)', 'select unnest(company_staff(\1, array[\2]))', 'g');
    d2 := regexp_replace(d2, 'select\s+user_id\s+from\s+company_members\s+where\s+company_id\s*=\s*([a-z_.]+)\s+and\s+role\s*<>\s*''viewer''', 'select unnest(company_staff(\1, array[''owner'', ''admin'', ''recruiter'', ''client'']))', 'g');
    if d2 = d then raise exception 'No se actualizaron los avisos de %', f; end if;
    execute d2;
  end loop;
end $mig$;

-- Límites del plan por grupo, aprobación de ofertas por el cliente, roles «cliente»
do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.job_guard'::regproc);
  n := replace(d, 'select count(*) into v_active from jobs where company_id = new.company_id and status = ''published'' and id <> new.id;',
                  'select count(*) into v_active from jobs where company_id in (select company_group(new.company_id)) and status = ''published'' and id <> new.id;');
  if n = d then raise exception 'job_guard'; end if; execute n;

  d := pg_get_functiondef('public.plan_limit_notice'::regproc);
  n := replace(d, 'select count(*) into n from jobs where company_id = new.company_id and status = ''published'';',
                  'select count(*) into n from jobs where company_id in (select company_group(new.company_id)) and status = ''published'';');
  if n = d then raise exception 'plan_limit_notice'; end if; execute n;

  d := pg_get_functiondef('public.company_plan'::regproc);
  n := replace(d, '''jobs'', (select count(*) from jobs where company_id = p_company and status = ''published'')',
                  '''jobs'', (select count(*) from jobs where company_id in (select company_group(p_company)) and status = ''published'')');
  n := replace(n, 'return jsonb_build_object(', 'return jsonb_build_object(''managed_by'', (select display_name from companies where id = company_parent(p_company)), ''clients'', (select count(*) from companies where parent_id = p_company), ');
  if n = d or position('managed_by' in n) = 0 then raise exception 'company_plan'; end if; execute n;

  foreach n in array array['admin_set_plan', 'admin_record_payment'] loop
    d := pg_get_functiondef(('public.' || n)::regproc);
    d := replace(d, 'if not is_admin() then raise exception ''Solo administración de VINKA''; end if;',
      'if not is_admin() then raise exception ''Solo administración de VINKA''; end if;
  if company_parent(p_company) is not null then raise exception ''Esta empresa es cliente de una consultora: usa el plan de su matriz''; end if;');
    if position('cliente de una consultora' in d) = 0 then raise exception '%', n; end if; execute d;
  end loop;

  d := pg_get_functiondef('public.send_offer'::regproc);
  n := replace(d, 'needs := not is_company_admin(m.company_id) and exists (select 1 from companies where id = m.company_id and require_approval);',
    'needs := exists (select 1 from companies where id = m.company_id and require_approval) and (case
    when company_parent(m.company_id) is not null and exists (select 1 from company_members where company_id = m.company_id and role = ''client'')
      then coalesce((select role from company_members where company_id = m.company_id and user_id = auth.uid()), '''') <> ''client''
    else not is_company_admin(m.company_id) end);');
  n := replace(n, 'unnest(company_staff(m.company_id, array[''owner'', ''admin'']))', 'unnest(company_approvers(m.company_id))');
  if position('company_approvers' in n) = 0 or position('role = ''client''' in n) = 0 then raise exception 'send_offer'; end if; execute n;

  d := pg_get_functiondef('public.approve_offer'::regproc);
  n := replace(d, 'if o.id is null or not is_company_admin(o.company_id) then raise exception ''Solo un administrador puede aprobar ofertas''; end if;',
    'if o.id is null or not (is_company_admin(o.company_id) or member_role(o.company_id) = ''client'') then raise exception ''Solo un administrador o el cliente pueden aprobar ofertas''; end if;');
  if n = d then raise exception 'approve_offer'; end if; execute n;

  d := pg_get_functiondef('public.invite_member'::regproc);
  n := replace(d, 'if p_role not in (''admin'',''recruiter'',''viewer'') then raise exception ''Rol no válido''; end if;',
    'if p_role not in (''admin'',''recruiter'',''viewer'',''client'') or (p_role = ''client'') <> (company_parent(p_company) is not null and p_role = ''client'') then raise exception ''Rol no válido''; end if;
  if company_parent(p_company) is not null and p_role <> ''client'' then raise exception ''En una empresa cliente solo se invita con rol «cliente»; el equipo de la consultora ya tiene acceso''; end if;');
  n := replace(n, '(select count(*) from company_members where company_id = p_company)', '(select count(*) from company_members where company_id in (select company_group(p_company)) and role <> ''client'')');
  n := replace(n, 'if v_plan.max_members is not null and v_n >= v_plan.max_members then', 'if p_role <> ''client'' and v_plan.max_members is not null and v_n >= v_plan.max_members then');
  if position('company_group' in n) = 0 or position('rol «cliente»' in n) = 0 or position('p_role <> ''client'' and v_plan' in n) = 0 then raise exception 'invite_member'; end if; execute n;

  d := pg_get_functiondef('public.join_company'::regproc);
  n := replace(d, 'and (select count(*) from company_members where company_id = i.company_id) >= v_plan.max_members then',
    'and i.role <> ''client'' and (select count(*) from company_members where company_id in (select company_group(i.company_id)) and role <> ''client'') >= v_plan.max_members then');
  if n = d then raise exception 'join_company'; end if; execute n;

  d := pg_get_functiondef('public.set_member_role'::regproc);
  n := replace(d, 'if p_role not in (''admin'',''recruiter'',''viewer'') then raise exception ''Rol no válido''; end if;',
    'if p_role not in (''admin'',''recruiter'',''viewer'',''client'') or (p_role = ''client'' and company_parent(p_company) is null) or (p_role <> ''client'' and company_parent(p_company) is not null) then raise exception ''Rol no válido''; end if;');
  if n = d then raise exception 'set_member_role'; end if; execute n;
end $mig$;

-- Lo que ven los postulantes: cliente «gestionado por» la matriz, o «Empresa confidencial»
do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.job_feed'::regproc);
  n := replace(d, 'promotion_id uuid)', 'promotion_id uuid, managed_by text)');
  n := replace(n, 'select j.*, co.display_name, co.sector, co.size, co.description as co_desc, co.benefits as co_ben,',
    'select j.*, case when j.confidential then ''Empresa confidencial'' else co.display_name end as display_name,
      case when j.confidential then '''' else co.sector end as sector, case when j.confidential then '''' else co.size end as size,
      case when j.confidential then '''' else co.description end as co_desc, case when j.confidential then '''' else co.benefits end as co_ben,
      (select pc.display_name from companies pc where pc.id = co.parent_id) as managed_by,');
  n := replace(n, 'r.promo is not null, r.promo
  from numbered r', 'r.promo is not null, r.promo, r.managed_by
  from numbered r');
  if position('managed_by text)' in n) = 0 or position('r.promo, r.managed_by' in n) = 0 or position('as managed_by,' in n) = 0 then raise exception 'job_feed'; end if;
  drop function public.job_feed(boolean);
  execute n;
  revoke execute on function public.job_feed(boolean) from public, anon;
  grant execute on function public.job_feed(boolean) to authenticated;

  d := pg_get_functiondef('public.public_job'::regproc);
  n := replace(d, '''company'', jsonb_build_object(''slug'', c.slug, ''display_name'', c.display_name, ''description'', c.description, ''sector'', c.sector, ''benefits'', c.benefits))',
    '''company'', case when j.confidential then jsonb_build_object(''slug'', null, ''display_name'', ''Empresa confidencial'', ''description'', '''', ''sector'', '''', ''benefits'', '''', ''confidential'', true,
        ''managed_by'', (select pc.display_name from companies pc where pc.id = c.parent_id))
      else jsonb_build_object(''slug'', c.slug, ''display_name'', c.display_name, ''description'', c.description, ''sector'', c.sector, ''benefits'', c.benefits,
        ''managed_by'', (select pc.display_name from companies pc where pc.id = c.parent_id)) end)');
  if n = d then raise exception 'public_job'; end if; execute n;

  d := pg_get_functiondef('public.public_featured_jobs'::regproc);
  n := replace(d, '''company'', c.display_name, ''slug'', c.slug)',
    '''company'', case when j.confidential then ''Empresa confidencial'' else c.display_name end, ''slug'', case when j.confidential then null else c.slug end,
      ''managed_by'', (select pc.display_name from companies pc where pc.id = c.parent_id))');
  if n = d then raise exception 'public_featured_jobs'; end if; execute n;

  d := pg_get_functiondef('public.public_company'::regproc);
  n := replace(d, 'where j.company_id = c.id and j.status = ''published''), ''[]''::jsonb))', 'where j.company_id = c.id and j.status = ''published'' and not j.confidential), ''[]''::jsonb))');
  n := replace(n, '''website'', c.website, ''size'', c.size)', '''website'', c.website, ''size'', c.size, ''managed_by'', (select pc.display_name from companies pc where pc.id = c.parent_id))');
  if n = d or position('managed_by' in n) = 0 then raise exception 'public_company'; end if; execute n;

  d := pg_get_functiondef('public.my_matches'::regproc);
  n := replace(d, 'select m.id, j.id, j.title, co.id, co.display_name,', 'select m.id, j.id, j.title, co.id,
    case when j.confidential and m.candidate_id = auth.uid() then ''Confidencial · vía '' || coalesce((select pc.display_name from companies pc where pc.id = co.parent_id), ''VINKA'') else co.display_name end,');
  if n = d then raise exception 'my_matches'; end if; execute n;

  d := pg_get_functiondef('public.my_interviews'::regproc);
  n := replace(d, 'j.title, c.display_name,', 'j.title, case when coalesce(j.confidential, false) and i.candidate_id = auth.uid() then ''Confidencial · vía '' || coalesce((select pc.display_name from companies pc where pc.id = c.parent_id), ''VINKA'') else c.display_name end,');
  if n = d then raise exception 'my_interviews'; end if; execute n;

  d := pg_get_functiondef('public.my_interests'::regproc);
  n := replace(d, 'co.display_name', 'case when j.confidential then ''Empresa confidencial'' else co.display_name end');
  if n = d then raise exception 'my_interests'; end if; execute n;
end $mig$;

-- Consultora: tipo de empresa, clientes y lista de empresas que manejo
create or replace function public.set_company_kind(p_company uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from company_members where company_id = p_company and user_id = auth.uid() and role = 'owner') then raise exception 'Solo quien creó la empresa puede cambiar esto'; end if;
  if p_kind not in ('empresa', 'consultora') then raise exception 'Tipo no válido'; end if;
  if company_parent(p_company) is not null then raise exception 'Una empresa cliente no puede ser consultora'; end if;
  perform set_config('vinka.company_admin', '1', true);
  update companies set kind = p_kind where id = p_company;
  perform set_config('vinka.company_admin', '', true);
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'company_kind', 'company', p_company, jsonb_build_object('kind', p_kind));
end $$;

create or replace function public.create_client_company(p_parent uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_rut text := upper(regexp_replace(coalesce(p->>'rut', ''), '[^0-9kK-]', '', 'g'));
begin
  if not exists (select 1 from company_members where company_id = p_parent and user_id = auth.uid() and role in ('owner', 'admin')) then
    raise exception 'Solo quien administra la consultora puede agregar clientes'; end if;
  if not exists (select 1 from companies where id = p_parent and kind = 'consultora' and parent_id is null) then raise exception 'Activa primero «Somos consultora» en Empresa'; end if;
  if not exists (select 1 from companies where id = p_parent and verification_status = 'verified') then raise exception 'Tu consultora debe estar verificada para agregar clientes'; end if;
  if coalesce(trim(p->>'display_name'), '') = '' or coalesce(trim(p->>'legal_name'), '') = '' or v_rut = '' then raise exception 'Indica nombre, razón social y RUT del cliente'; end if;
  if v_rut !~ '^[0-9]{7,8}-[0-9K]$' then raise exception 'RUT no válido (ej.: 76.123.456-7)'; end if;
  if exists (select 1 from companies where parent_id = p_parent and upper(regexp_replace(rut, '[^0-9kK-]', '', 'g')) = v_rut) then raise exception 'Ese cliente ya está en tu cuenta'; end if;
  if (select count(*) from companies where parent_id = p_parent) >= 100 then raise exception 'Llegaste al máximo de 100 clientes'; end if;
  perform set_config('vinka.company_admin', '1', true);
  insert into companies (owner_id, parent_id, kind, display_name, legal_name, rut, sector, size, region, comuna, description, website)
  values (auth.uid(), p_parent, 'empresa', left(trim(p->>'display_name'), 120), left(trim(p->>'legal_name'), 160), v_rut,
    left(coalesce(p->>'sector', ''), 80), left(coalesce(p->>'size', ''), 40), left(coalesce(p->>'region', ''), 80), left(coalesce(p->>'comuna', ''), 80),
    left(coalesce(p->>'description', ''), 2000), left(coalesce(p->>'website', ''), 200))
  returning id into v_id;
  perform set_config('vinka.company_admin', '', true);
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'client_created', 'company', v_id, jsonb_build_object('parent', p_parent));
  perform notify_users(array(select user_id from admins), 'verification', 'Cliente de consultora por verificar',
    (select display_name from companies where id = p_parent) || ' agregó a ' || trim(p->>'display_name') || ' (RUT ' || v_rut || ').', '/', false);
  return v_id;
end $$;

-- Mis empresas: las propias y los clientes de mis consultoras (con el rol heredado)
create or replace function public.my_companies() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'sort_key'), '[]'::jsonb) from (
    select jsonb_build_object('company_id', c.id, 'role', cm.role, 'created_at', cm.created_at, 'inherited', false,
      'companies', to_jsonb(c) || jsonb_build_object('managed_by', (select pc.display_name from companies pc where pc.id = c.parent_id), 'clients', (select count(*) from companies k where k.parent_id = c.id)),
      'sort_key', coalesce((select pc.display_name from companies pc where pc.id = c.parent_id), c.display_name) || case when c.parent_id is null then ' 0' else ' 1 ' || c.display_name end) x
    from company_members cm join companies c on c.id = cm.company_id where cm.user_id = auth.uid()
    union all
    select jsonb_build_object('company_id', c.id, 'role', cm.role, 'created_at', cm.created_at, 'inherited', true,
      'companies', to_jsonb(c) || jsonb_build_object('managed_by', p.display_name, 'clients', 0),
      'sort_key', p.display_name || ' 1 ' || c.display_name)
    from company_members cm join companies p on p.id = cm.company_id join companies c on c.parent_id = p.id
    where cm.user_id = auth.uid() and cm.role <> 'client'
      and not exists (select 1 from company_members own where own.company_id = c.id and own.user_id = auth.uid())
  ) s $$;
revoke execute on function public.my_companies() from public, anon;
grant execute on function public.my_companies() to authenticated;

-- Panel de la consultora: sus clientes con el estado de cada uno
create or replace function public.consultancy_clients(p_parent uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from company_members where company_id = p_parent and user_id = auth.uid() and role <> 'client') then raise exception 'Sin acceso'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'display_name', c.display_name, 'legal_name', c.legal_name, 'rut', c.rut, 'comuna', c.comuna,
      'verification', c.verification_status, 'note', c.verification_note, 'created_at', c.created_at, 'logo_path', c.logo_path,
      'jobs', (select count(*) from jobs j where j.company_id = c.id and j.status = 'published'),
      'confidential', (select count(*) from jobs j where j.company_id = c.id and j.status = 'published' and j.confidential),
      'processes', (select count(*) from matches m where m.company_id = c.id and not m.closed and m.stage not in ('contratado', 'descartado')),
      'hired', (select count(*) from matches m where m.company_id = c.id and m.stage = 'contratado'),
      'client_users', (select count(*) from company_members cm where cm.company_id = c.id and cm.role = 'client'))
    order by c.display_name) from companies c where c.parent_id = p_parent), '[]'::jsonb);
end $$;
revoke execute on function public.consultancy_clients(uuid) from public, anon;
grant execute on function public.consultancy_clients(uuid) to authenticated;
revoke execute on function public.create_client_company(uuid, jsonb), public.set_company_kind(uuid, text) from public, anon;
grant execute on function public.create_client_company(uuid, jsonb), public.set_company_kind(uuid, text) to authenticated;

-- Administración: tipo de empresa y matriz en la lista de empresas
do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.admin_overview'::regproc);
  n := replace(d, '''note'', s.note,', '''note'', s.note, ''kind'', c.kind, ''parent'', (select pc.display_name from companies pc where pc.id = c.parent_id),');
  if n = d then raise exception 'admin_overview'; end if; execute n;
end $mig$;
