-- Auditoría 13-11-2026 · correcciones autorizadas
-- 1) Pagos DEMO con tarjeta nunca se cuentan como ventas reales (quedan como «demostración»).
-- 2) Regla de edición del propio perfil reparada (recursión infinita) + función para corregir el nombre.
-- 3) Endurecimiento: funciones auxiliares internas sin acceso directo; sin permisos de tabla innecesarios para anónimos.
create schema if not exists backup;
create table if not exists backup.fn_admin_revenue_20261113 as select now() saved_at, pg_get_functiondef('public.admin_revenue(boolean)'::regprocedure) def;
create table if not exists backup.fn_admin_service_requests_20261113 as select now() saved_at, pg_get_functiondef('public.admin_service_requests()'::regprocedure) def;
create table if not exists backup.policies_profiles_20261113 as select now() saved_at, * from pg_policies where schemaname = 'public' and tablename = 'profiles';

-- 1) Ingresos: un pago con proveedor «vinka_demo» (pasarela simulada) es siempre demostración
do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.admin_revenue(boolean)'::regprocedure);
  n := replace(d, 'or exists (select 1 from seed.users u where u.id = pay.candidate_id)) demo',
                  'or exists (select 1 from seed.users u where u.id = pay.candidate_id) or pay.provider = ''vinka_demo'') demo');
  n := replace(n, 'coalesce(s.custom_price_clp, pl.price_clp, 0) price, exists (select 1 from seed.companies d where d.id = s.company_id) demo',
                  'coalesce(s.custom_price_clp, pl.price_clp, 0) price, (exists (select 1 from seed.companies d where d.id = s.company_id)'
                  || ' or coalesce((select x.provider = ''vinka_demo'' from payments x where x.company_id = s.company_id and x.kind = ''plan'' order by x.paid_at desc limit 1), false)) demo');
  if n = d or strpos(n, 'pay.provider = ''vinka_demo''') = 0 or strpos(n, 'x.provider = ''vinka_demo''') = 0 then raise exception 'admin_revenue: no se pudo aplicar el cambio'; end if;
  execute n;
  d := pg_get_functiondef('public.admin_service_requests()'::regprocedure);
  n := replace(d, '''demo'', exists (select 1 from seed.users su where su.id = r.candidate_id),',
                  '''demo'', (exists (select 1 from seed.users su where su.id = r.candidate_id) or exists (select 1 from payments xp where xp.request_id = r.id and xp.provider = ''vinka_demo'')),');
  if n = d then raise exception 'admin_service_requests: no se pudo aplicar el cambio'; end if;
  execute n;
end $m$;

-- 2) Perfil propio: la regla consultaba la misma tabla (recursión). Se usa una función que lee el rol sin pasar por la regla.
create or replace function public.my_profile_role()
returns text language sql stable security definer set search_path = public as $$ select role from profiles where id = auth.uid() $$;
revoke execute on function public.my_profile_role() from public, anon;
grant execute on function public.my_profile_role() to authenticated;
drop policy if exists "perfil propio: editar" on public.profiles;
create policy "perfil propio: editar" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()) and role = (select public.my_profile_role()));

-- Corregir el propio nombre (queda registrado)
create or replace function public.update_my_name(p_first text, p_last text)
returns void language plpgsql security definer set search_path = public as $$
declare f text := btrim(regexp_replace(coalesce(p_first, ''), '\s+', ' ', 'g')); l text := btrim(regexp_replace(coalesce(p_last, ''), '\s+', ' ', 'g')); old profiles;
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  if char_length(f) not between 1 and 60 or char_length(l) not between 1 and 60 then raise exception 'Escribe tu nombre y apellido (hasta 60 caracteres cada uno)'; end if;
  if f || l !~ '^[[:alpha:] ''’.-]+$' then raise exception 'El nombre solo puede tener letras, espacios, apóstrofo, punto o guion'; end if;
  select * into old from profiles where id = auth.uid() for update;
  if old.first_name = f and old.last_name = l then return; end if;
  update profiles set first_name = f, last_name = l where id = auth.uid();
  insert into audit_logs (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'name_changed', 'profile', auth.uid(), jsonb_build_object('from', trim(old.first_name || ' ' || old.last_name), 'to', f || ' ' || l));
end $$;
revoke execute on function public.update_my_name(text, text) from public, anon;
grant execute on function public.update_my_name(text, text) to authenticated;

-- 3) Funciones auxiliares de uso interno (las usan otras funciones, no la app ni reglas de tabla)
revoke execute on function public.company_staff(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.company_group(uuid) from public, anon, authenticated;
revoke execute on function public.company_parent(uuid) from public, anon, authenticated;
revoke execute on function public.company_root(uuid) from public, anon, authenticated;
revoke execute on function public.company_approvers(uuid) from public, anon, authenticated;
-- Permisos de tabla que nunca necesita un visitante anónimo (las reglas ya lo bloqueaban; esto lo hace explícito)
do $g$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate, trigger, references on public.%I from anon', t);
  end loop;
end $g$;
