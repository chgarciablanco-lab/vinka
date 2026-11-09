-- Migración aplicada en Supabase (20261109134048). Exportada tal cual desde supabase_migrations.schema_migrations.

create or replace function public.send_service_message(p_request uuid, p_body text, p_file_path text default null, p_file_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r service_requests; v_id uuid; v_body text := left(trim(coalesce(p_body, '')), 2000); v_to uuid[]; v_from text;
begin
  if not can_access_request(p_request) then raise exception 'No tienes acceso a esta asesoría'; end if;
  select * into r from service_requests where id = p_request;
  if r.status = 'cancelada' then raise exception 'Esta asesoría está cancelada'; end if;
  if v_body = '' and p_file_path is null then raise exception 'Escribe un mensaje o adjunta un archivo'; end if;
  if p_file_path is not null and request_folder(p_file_path) is distinct from p_request then raise exception 'Archivo no válido'; end if;
  if not is_admin() and has_contact_info(v_body) then
    raise exception 'Por seguridad, no compartas teléfonos, correos ni redes sociales por este chat. Toda la asesoría se coordina dentro de VINKA.'; end if;
  if (select count(*) from service_messages where sender_id = auth.uid() and created_at > now() - interval '1 minute') >= 15 then
    raise exception 'Estás enviando muchos mensajes seguidos. Espera un momento.'; end if;
  insert into service_messages (request_id, sender_id, body, file_path, file_name)
  values (p_request, auth.uid(), v_body, p_file_path, left(p_file_name, 120)) returning id into v_id;
  update service_requests set updated_at = now() where id = p_request;
  if auth.uid() = r.candidate_id then
    v_to := case when r.assigned_to is not null then array[r.assigned_to] else array(select user_id from admins) end;
    v_from := 'la persona que asesoras';
    perform notify_users(v_to, 'service_message', 'Nuevo mensaje en ' || r.service_name,
      case when p_file_path is not null then 'Te envió un archivo.' else left(v_body, 140) end,
      case when r.assigned_to is not null then '/' else '/asesorias' end, false);
  else
    perform notify_users(array[r.candidate_id], 'service_message', 'Mensaje de tu asesor/a',
      case when p_file_path is not null then 'Te envió un archivo: ' || coalesce(p_file_name, 'documento') else left(v_body, 140) end, '/asesoria', p_file_path is not null);
  end if;
  return v_id;
end $$;
revoke execute on function public.send_service_message(uuid, text, text, text) from public, anon;
grant execute on function public.send_service_message(uuid, text, text, text) to authenticated;

create or replace function public.accept_advisor_terms() returns void
language sql security definer set search_path = public as $$
  update advisors set terms_accepted_at = now() where user_id = auth.uid() and terms_accepted_at is null
$$;
revoke execute on function public.accept_advisor_terms() from public, anon;
grant execute on function public.accept_advisor_terms() to authenticated;

create or replace function public.password_changed() returns void
language sql security definer set search_path = public as $$
  update profiles set must_change_password = false where id = auth.uid()
$$;
revoke execute on function public.password_changed() from public, anon;
grant execute on function public.password_changed() to authenticated;

create or replace function public.advisor_requests() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_advisor() then raise exception 'Solo asesores de VINKA'; end if;
  if (select terms_accepted_at from advisors where user_id = auth.uid()) is null then raise exception 'Acepta el acuerdo de confidencialidad para continuar'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'service', r.service_name, 'service_id', r.service_id, 'status', r.status, 'goal', r.goal, 'contact_pref', r.contact_pref,
      'note', r.admin_note, 'created_at', r.created_at, 'updated_at', r.updated_at,
      'name', trim(p.first_name || ' ' || left(p.last_name, 1) || case when p.last_name <> '' then '.' else '' end),
      'headline', cp.headline, 'comuna', cp.comuna, 'region', cp.region, 'has_experience', cp.has_experience,
      'experiences', cp.experiences, 'education', cp.education, 'skills', cp.skills, 'bio', cp.bio, 'areas', cp.areas,
      'messages', (select count(*) from service_messages m where m.request_id = r.id),
      'last_message_at', (select max(created_at) from service_messages m where m.request_id = r.id))
    order by case r.status when 'en_curso' then 0 when 'pago_pendiente' then 1 when 'solicitada' then 2 else 3 end, r.updated_at desc)
    from service_requests r join profiles p on p.id = r.candidate_id left join candidate_profiles cp on cp.user_id = r.candidate_id
    where r.assigned_to = auth.uid()), '[]'::jsonb);
end $$;
revoke execute on function public.advisor_requests() from public, anon;
grant execute on function public.advisor_requests() to authenticated;

create or replace function public.advisor_deliver(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare r service_requests;
begin
  if not is_advisor() then raise exception 'Solo asesores de VINKA'; end if;
  select * into r from service_requests where id = p_id and assigned_to = auth.uid();
  if r.id is null then raise exception 'Esta asesoría no está asignada a ti'; end if;
  if r.status <> 'en_curso' then raise exception 'Solo puedes entregar una asesoría en curso. VINKA la activa al confirmar el pago.'; end if;
  if has_contact_info(p_note) then raise exception 'La nota no puede incluir teléfonos, correos ni redes sociales.'; end if;
  update service_requests set status = 'entregada', admin_note = left(coalesce(p_note, ''), 1000), updated_at = now() where id = p_id;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'service_delivered', 'service_request', p_id, '{}'::jsonb);
  perform notify_users(array[r.candidate_id], 'service_request', r.service_name || ': entregada',
    coalesce(nullif(trim(p_note), ''), 'Tu asesor/a terminó la asesoría. Revisa los archivos y mensajes.'), '/asesoria', true);
  perform notify_users(array(select user_id from admins), 'service_request', 'Asesoría entregada: ' || r.service_name, 'Un asesor marcó una asesoría como entregada.', '/asesorias', false);
end $$;
revoke execute on function public.advisor_deliver(uuid, text) from public, anon;
grant execute on function public.advisor_deliver(uuid, text) to authenticated;

create or replace function public.temp_password() returns text
language sql volatile as $$
  select 'Vk-' || substr(translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/=OIl0', 'abcdefg'), 1, 10) || '7'
$$;
revoke execute on function public.temp_password() from public, anon, authenticated;

create or replace function public.admin_create_advisor(p_email text, p_first text, p_last text, p_phone text, p_specialty text)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid := gen_random_uuid(); e text := lower(trim(p_email)); pw text := temp_password();
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo no válido'; end if;
  if coalesce(trim(p_first), '') = '' or coalesce(trim(p_last), '') = '' then raise exception 'Escribe nombre y apellido'; end if;
  if exists (select 1 from auth.users where lower(email) = e) then raise exception 'Ya existe una cuenta con ese correo. Usa otro para el asesor.'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', e, crypt(pw, gen_salt('bf')), now(), '', '', '', '', '', '', '', '',
    '{"provider":"email","providers":["email"],"vinka_advisor":true}'::jsonb,
    jsonb_build_object('role', 'company', 'first_name', trim(p_first), 'last_name', trim(p_last), 'terms_accepted', true), now(), now());
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, 'email', jsonb_build_object('sub', uid::text, 'email', e, 'email_verified', true), now(), now());
  update profiles set role = 'advisor', phone = nullif(trim(p_phone), ''), must_change_password = true where id = uid;
  insert into advisors (user_id, specialty, created_by) values (uid, left(coalesce(p_specialty, ''), 200), auth.uid());
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'advisor_created', 'user', uid, jsonb_build_object('email', e));
  return jsonb_build_object('user_id', uid, 'email', e, 'password', pw);
end $$;
revoke execute on function public.admin_create_advisor(text, text, text, text, text) from public, anon;
grant execute on function public.admin_create_advisor(text, text, text, text, text) to authenticated;

create or replace function public.admin_reset_advisor_password(p_user uuid) returns text
language plpgsql security definer set search_path = public, auth, extensions as $$
declare pw text := temp_password();
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  if not exists (select 1 from advisors where user_id = p_user) then raise exception 'Solo se puede reiniciar la clave de cuentas de asesor'; end if;
  update auth.users set encrypted_password = crypt(pw, gen_salt('bf')), updated_at = now() where id = p_user;
  update profiles set must_change_password = true where id = p_user;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'advisor_password_reset', 'user', p_user, '{}'::jsonb);
  return pw;
end $$;
revoke execute on function public.admin_reset_advisor_password(uuid) from public, anon;
grant execute on function public.admin_reset_advisor_password(uuid) to authenticated;

create or replace function public.admin_advisors() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.user_id, 'name', trim(p.first_name || ' ' || p.last_name), 'email', u.email, 'phone', p.phone, 'specialty', a.specialty,
      'active', a.active, 'suspended', p.suspended_at is not null, 'terms_accepted_at', a.terms_accepted_at, 'created_at', a.created_at,
      'last_seen_at', p.last_seen_at, 'pending_password', p.must_change_password,
      'open', (select count(*) from service_requests r where r.assigned_to = a.user_id and r.status in ('solicitada', 'pago_pendiente', 'en_curso')),
      'delivered', (select count(*) from service_requests r where r.assigned_to = a.user_id and r.status = 'entregada'))
    order by a.active desc, p.first_name)
    from advisors a join profiles p on p.id = a.user_id join auth.users u on u.id = a.user_id), '[]'::jsonb);
end $$;
revoke execute on function public.admin_advisors() from public, anon;
grant execute on function public.admin_advisors() to authenticated;

create or replace function public.admin_assign_request(p_id uuid, p_advisor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r service_requests; v_name text;
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  if p_advisor is not null and not exists (select 1 from advisors where user_id = p_advisor and active) then raise exception 'Asesor no disponible'; end if;
  update service_requests set assigned_to = p_advisor, updated_at = now() where id = p_id returning * into r;
  if r.id is null then raise exception 'Solicitud no encontrada'; end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'service_assigned', 'service_request', p_id, jsonb_build_object('advisor', p_advisor));
  if p_advisor is not null then
    select first_name into v_name from profiles where id = p_advisor;
    perform notify_users(array[p_advisor], 'service_request', 'Te asignaron: ' || r.service_name, 'Revisa la solicitud en tu panel de asesorías.', '/', true);
    perform notify_users(array[r.candidate_id], 'service_request', 'Ya tienes asesor/a',
      coalesce(v_name, 'Un reclutador') || ' te acompañará en tu ' || r.service_name || '. Conversen desde Asesoría con reclutador.', '/asesoria', false);
  end if;
end $$;
revoke execute on function public.admin_assign_request(uuid, uuid) from public, anon;
grant execute on function public.admin_assign_request(uuid, uuid) to authenticated;

create or replace function public.admin_set_suspended(p_user uuid, p_suspend boolean, p_reason text default '')
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  if p_user = auth.uid() then raise exception 'No puedes suspender tu propia cuenta'; end if;
  if exists (select 1 from admins where user_id = p_user) then raise exception 'No se puede suspender una cuenta de administración'; end if;
  if p_suspend then
    update auth.users set banned_until = now() + interval '100 years' where id = p_user;
    update profiles set suspended_at = now(), suspended_reason = left(coalesce(p_reason, ''), 300) where id = p_user;
    update candidate_profiles set is_public = false where user_id = p_user;
    update advisors set active = false where user_id = p_user;
    delete from auth.refresh_tokens where user_id = p_user::text;
    delete from auth.sessions where user_id = p_user;
  else
    update auth.users set banned_until = null where id = p_user;
    update profiles set suspended_at = null, suspended_reason = '' where id = p_user;
    update advisors set active = true where user_id = p_user;
  end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), case when p_suspend then 'user_suspended' else 'user_reactivated' end, 'user', p_user, jsonb_build_object('reason', p_reason));
end $$;
revoke execute on function public.admin_set_suspended(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_suspended(uuid, boolean, text) to authenticated;
