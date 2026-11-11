-- Equipo VINKA con niveles:
--  · total: todo, incluidos pagos, planes, precios, destacados, ajustes y dar o quitar accesos.
--  · operaciones: verificación, denuncias, reportes, cotizaciones, usuarios, equipos de empresas y asesorías (sin confirmar pagos).
create table if not exists backup.admins_20261111 as select * from public.admins;
alter table public.admins add column if not exists level text not null default 'total';
alter table public.admins drop constraint if exists admins_level_check;
alter table public.admins add constraint admins_level_check check (level in ('total', 'operaciones'));
alter table public.admins add column if not exists created_at timestamptz not null default now();
alter table public.admins add column if not exists created_by uuid references auth.users(id) on delete set null;

create or replace function public.is_admin_total() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid() and level = 'total') $$;
create or replace function public.my_admin_level() returns text language sql stable security definer set search_path = public as $$
  select level from admins where user_id = auth.uid() $$;
grant execute on function public.is_admin_total(), public.my_admin_level() to authenticated;

do $mig$
declare f text; d text; n text;
begin
  foreach f in array array['admin_set_plan', 'admin_record_payment', 'admin_revenue', 'admin_activate_promotion', 'admin_set_promotion', 'admin_promo_config',
                           'admin_promotions', 'admin_upsert_service', 'admin_set_setting', 'admin_create_advisor', 'admin_reset_advisor_password'] loop
    d := pg_get_functiondef(('public.' || f)::regproc);
    n := replace(d, 'not is_admin()', 'not is_admin_total()');
    if n = d then raise exception 'Sin control de administración en %', f; end if;
    n := replace(n, '''Solo administración de VINKA''', '''Solo un administrador total de VINKA puede hacer esto''');
    execute n;
  end loop;

  d := pg_get_functiondef('public.admin_update_service_request'::regproc);
  n := replace(d, '  select status into v_old from service_requests where id = p_id;',
    '  select status into v_old from service_requests where id = p_id;
  if p_status = ''en_curso'' and v_old in (''solicitada'', ''pago_pendiente'') and not is_admin_total() then
    raise exception ''Solo un administrador total confirma pagos''; end if;');
  if n = d then raise exception 'admin_update_service_request'; end if; execute n;
end $mig$;

create or replace function public.vinka_team() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  return jsonb_build_object('me', auth.uid(), 'my_level', my_admin_level(),
    'admins', coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'name', trim(p.first_name || ' ' || p.last_name), 'email', u.email, 'level', a.level,
        'since', a.created_at, 'added_by', (select trim(first_name || ' ' || last_name) from profiles where id = a.created_by), 'last_seen_at', p.last_seen_at,
        'pending_password', p.must_change_password, 'test', u.email like '%@example.com')
        order by case a.level when 'total' then 0 else 1 end, p.first_name)
      from admins a join profiles p on p.id = a.user_id join auth.users u on u.id = a.user_id), '[]'::jsonb));
end $$;

create or replace function public.admin_add_staff(p_email text, p_first text, p_last text, p_level text) returns jsonb
language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid; e text := lower(trim(p_email)); pw text := null;
begin
  if not is_admin_total() then raise exception 'Solo un administrador total de VINKA puede dar accesos'; end if;
  if p_level not in ('total', 'operaciones') then raise exception 'Nivel no válido'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo no válido'; end if;
  select id into uid from auth.users where lower(email) = e;
  if uid is not null then
    if exists (select 1 from admins where user_id = uid) then raise exception 'Esa persona ya es parte del equipo VINKA'; end if;
    if exists (select 1 from company_members where user_id = uid) then raise exception 'Ese correo es de una cuenta de empresa. Usa otro correo para el equipo VINKA.'; end if;
    if exists (select 1 from advisors where user_id = uid) then raise exception 'Ese correo es de un asesor/a. Usa otro correo para administración.'; end if;
  else
    if coalesce(trim(p_first), '') = '' or coalesce(trim(p_last), '') = '' then raise exception 'Escribe nombre y apellido'; end if;
    uid := gen_random_uuid(); pw := temp_password();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', e, crypt(pw, gen_salt('bf')), now(), '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"],"vinka_staff":true}'::jsonb,
      jsonb_build_object('role', 'candidate', 'first_name', trim(p_first), 'last_name', trim(p_last), 'terms_accepted', true), now(), now());
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text, 'email', jsonb_build_object('sub', uid::text, 'email', e, 'email_verified', true), now(), now());
    update profiles set must_change_password = true where id = uid;
  end if;
  insert into admins (user_id, level, created_by) values (uid, p_level, auth.uid());
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'staff_added', 'user', uid, jsonb_build_object('email', e, 'level', p_level, 'new_account', pw is not null));
  return jsonb_build_object('user_id', uid, 'email', e, 'password', pw);
end $$;

create or replace function public.admin_set_staff_level(p_user uuid, p_level text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_total() then raise exception 'Solo un administrador total de VINKA puede cambiar niveles'; end if;
  if p_level not in ('total', 'operaciones') then raise exception 'Nivel no válido'; end if;
  if p_user = auth.uid() then raise exception 'No puedes cambiar tu propio nivel'; end if;
  update admins set level = p_level where user_id = p_user;
  if not found then raise exception 'Esa persona no es parte del equipo VINKA'; end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'staff_level', 'user', p_user, jsonb_build_object('level', p_level));
end $$;

create or replace function public.admin_remove_staff(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_total() then raise exception 'Solo un administrador total de VINKA puede quitar accesos'; end if;
  if p_user = auth.uid() then raise exception 'No puedes quitarte tu propio acceso'; end if;
  if (select level from admins where user_id = p_user) = 'total' and (select count(*) from admins where level = 'total') <= 1 then
    raise exception 'VINKA debe tener al menos un administrador total'; end if;
  delete from admins where user_id = p_user;
  if not found then raise exception 'Esa persona no es parte del equipo VINKA'; end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'staff_removed', 'user', p_user, '{}'::jsonb);
end $$;
revoke execute on function public.vinka_team(), public.admin_add_staff(text, text, text, text), public.admin_set_staff_level(uuid, text), public.admin_remove_staff(uuid) from public, anon;
grant execute on function public.vinka_team(), public.admin_add_staff(text, text, text, text), public.admin_set_staff_level(uuid, text), public.admin_remove_staff(uuid) to authenticated;
