-- Parte A de VINKA Comunidad: espacio de reclutamiento del asesor.
-- Cada asesor puede tener su propia consultora (clientes, vacantes, proceso, agenda, ofertas, reportes) creada por VINKA,
-- con un plan «Asesor» sin cobro. El plan no se ofrece a las empresas (no es público).
create schema if not exists backup;
create table if not exists backup.fn_company_plan_20261112 as
  select now() as saved_at, pg_get_functiondef('public.company_plan(uuid)'::regprocedure) as def;
create table if not exists backup.fn_presence_20261112 as
  select now() as saved_at, pg_get_functiondef('public.presence(uuid[], uuid[])'::regprocedure) as def;
create table if not exists backup.fn_request_plan_change_20261112 as
  select now() as saved_at, pg_get_functiondef('public.request_plan_change(uuid, text, text)'::regprocedure) as def;

-- 1) Planes: los no públicos no se muestran ni se pueden pedir
alter table public.plans add column if not exists public boolean not null default true;
insert into public.plans (id, name, price_clp, max_active_jobs, max_members, ai_monthly, sort, promo_credits, promo_days, public)
values ('asesor', 'Asesor', 0, 40, 5, 2000, 90, 0, 7, false)
on conflict (id) do update set public = false;

drop policy if exists "planes: todos leen" on public.plans;
drop policy if exists planes_publicos on public.plans;
drop policy if exists planes_publicos_visitantes on public.plans;
-- Visitantes: solo planes públicos (no pueden ejecutar la verificación de administrador)
create policy planes_publicos_visitantes on public.plans for select to anon using (public);
-- Con sesión: planes públicos; la administración ve todos
create policy planes_publicos on public.plans for select to authenticated using (public or is_admin());

do $m$
declare d text; n text;
begin
  -- Lista de planes del panel de la empresa: solo públicos (más el que ya tiene)
  d := pg_get_functiondef('public.company_plan(uuid)'::regprocedure);
  n := replace(d, '(select jsonb_agg(to_jsonb(x) order by x.sort) from plans x)', '(select jsonb_agg(to_jsonb(x) order by x.sort) from plans x where x.public or x.id = p.id)');
  if n = d then raise exception 'company_plan: no se encontró la lista de planes'; end if;
  execute n;
  -- Pedir cambio de plan: solo planes públicos
  d := pg_get_functiondef('public.request_plan_change(uuid, text, text)'::regprocedure);
  n := replace(d, 'if not exists (select 1 from plans where id = p_plan) then', 'if not exists (select 1 from plans where id = p_plan and public) then');
  if n = d then raise exception 'request_plan_change: no se encontró la validación del plan'; end if;
  execute n;
  -- Estado en línea: quien tiene empresa (también un asesor con su consultora) ve como empresa
  d := pg_get_functiondef('public.presence(uuid[], uuid[])'::regprocedure);
  n := replace(d, '(me.role = ''company'' and exists', '((me.role = ''company'' or exists (select 1 from company_members cmx where cmx.user_id = me.id)) and exists');
  if n = d then raise exception 'presence: no se encontró la condición de empresa'; end if;
  execute n;
end $m$;

-- 2) Crear el espacio de reclutamiento de un asesor (solo administración total)
create or replace function public.admin_create_advisor_workspace(p_advisor uuid, p_rut text default null, p_legal_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text; v_rut text := coalesce(nullif(trim(p_rut), ''), '77.854.185-8');
begin
  if not is_admin_total() then raise exception 'Solo un administrador total de VINKA puede hacer esto'; end if;
  if not exists (select 1 from advisors where user_id = p_advisor) then raise exception 'Esa cuenta no es de asesor'; end if;
  if exists (select 1 from company_members where user_id = p_advisor) then raise exception 'Este asesor ya tiene su espacio de reclutamiento'; end if;
  if not rut_valid(v_rut) then raise exception 'RUT no válido (ej.: 76.123.456-7)'; end if;
  select trim(first_name || ' ' || last_name) into v_name from profiles where id = p_advisor;
  perform set_config('vinka.company_admin', '1', true);
  insert into companies (owner_id, kind, display_name, legal_name, rut, sector, verification_status, rut_dup_ok, description)
  values (p_advisor, 'consultora', left(coalesce(v_name, 'Asesor') || ' · Reclutamiento', 120),
          left(coalesce(nullif(trim(p_legal_name), ''), 'VINKA Plataforma Laboral SpA'), 160), v_rut,
          'Reclutamiento y selección', 'verified', true, 'Espacio de reclutamiento de un asesor de VINKA.')
  returning id into v_id;
  perform set_config('vinka.company_admin', '', true);
  -- El dueño y la suscripción se crean solos al insertar la empresa; aquí se pasa al plan Asesor, sin vencimiento ni cobro
  update subscriptions set plan_id = 'asesor', status = 'active', trial_ends_at = null, current_period_end = null,
         note = 'Espacio de reclutamiento de asesor (sin cobro)', updated_at = now(), updated_by = auth.uid()
   where company_id = v_id;
  insert into audit_logs (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'advisor_workspace_created', 'company', v_id, jsonb_build_object('advisor', p_advisor, 'rut', v_rut));
  perform notify_users(array[p_advisor], 'company_verified', 'Tu espacio de reclutamiento está listo',
    'Ahora puedes agregar clientes, publicar vacantes y gestionar procesos desde «Reclutamiento».', '/', true);
  return v_id;
end $$;
revoke execute on function public.admin_create_advisor_workspace(uuid, text, text) from public, anon;
grant execute on function public.admin_create_advisor_workspace(uuid, text, text) to authenticated;
