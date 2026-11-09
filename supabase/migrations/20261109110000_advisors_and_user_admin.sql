-- Asesores de VINKA (cuentas entregadas por VINKA), administración de usuarios y asesorías gestionadas dentro de la plataforma.
-- Objetivo: que solicitudes, conversaciones, entregas y pagos queden en VINKA, y que el asesor no reciba datos de contacto del cliente.

-- ---------- Rol asesor y estado de cuenta ----------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('candidate', 'company', 'advisor'));
alter table public.profiles add column if not exists suspended_at timestamptz;
alter table public.profiles add column if not exists suspended_reason text not null default '';
alter table public.profiles add column if not exists must_change_password boolean not null default false;

create table if not exists public.advisors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  specialty text not null default '',
  active boolean not null default true,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists idx_advisors_created_by on public.advisors (created_by);
alter table public.advisors enable row level security;
create policy "asesores: el propio y administración" on public.advisors for select to authenticated
  using (user_id = (select auth.uid()) or (select is_admin()));

create or replace function public.is_advisor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from advisors where user_id = auth.uid() and active)
$$;

create or replace function public.can_access_request(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from service_requests r where r.id = p
    and (r.candidate_id = auth.uid() or (r.assigned_to = auth.uid() and is_advisor()) or is_admin()))
$$;

-- el asesor asignado también ve la solicitud (sin datos de contacto: la tabla no los tiene)
drop policy if exists "asesorías: la persona ve las suyas" on public.service_requests;
create policy "asesorías: participantes y administración" on public.service_requests for select to authenticated
  using (candidate_id = (select auth.uid()) or (assigned_to = (select auth.uid()) and (select is_advisor())) or (select is_admin()));

-- ---------- Conversación y archivos de cada asesoría ----------
create table if not exists public.service_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  body text not null default '',
  file_path text,
  file_name text,
  created_at timestamptz not null default now()
);
create index if not exists idx_service_messages_request on public.service_messages (request_id, created_at);
create index if not exists idx_service_messages_sender on public.service_messages (sender_id);
alter table public.service_messages enable row level security;
create policy "asesorías: mensajes para participantes" on public.service_messages for select to authenticated
  using ((select can_access_request(request_id)));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('asesorias', 'asesorias', false, 10485760,
  array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

create or replace function public.request_folder(p_name text) returns uuid
language plpgsql immutable as $$
begin return split_part(p_name, '/', 1)::uuid; exception when others then return null; end $$;

create policy "asesorías: leer archivos de la solicitud" on storage.objects for select to authenticated
  using (bucket_id = 'asesorias' and public.can_access_request(public.request_folder(name)));
create policy "asesorías: subir archivos a la solicitud" on storage.objects for insert to authenticated
  with check (bucket_id = 'asesorias' and public.can_access_request(public.request_folder(name)));

-- Bloquea teléfonos, correos y redes en el chat para que todo se coordine dentro de VINKA
create or replace function public.has_contact_info(t text) returns boolean
language sql immutable as $$
  select coalesce(t, '') ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
      or coalesce(t, '') ~ '\d{8,}'
      or coalesce(t, '') ~ '(^|\D)9[\s.-]?\d{4}[\s.-]?\d{4}(\D|$)'
      or coalesce(t, '') ~ '\+\s*\d{2}[\s.-]*\d'
      or coalesce(t, '') ~* '(wa\.me|whatsapp\.com|api\.whatsapp|t\.me/|telegram|instagram\.com|facebook\.com|fb\.me|linkedin\.com/in|tiktok\.com)'
      or coalesce(t, '') ~* '(^|\s)@[a-z0-9._]{3,}'
$$;

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

-- ---------- Espacio del asesor ----------
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

-- Solicitudes asignadas: perfil laboral sin teléfono ni correo y nombre con inicial del apellido
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

-- El asesor solo marca como entregada una asesoría en curso (el pago y el inicio los confirma VINKA)
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

-- ---------- Administración: asesores ----------
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

-- ---------- Administración: suspender o reactivar cuentas (postulantes y asesores) ----------
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

-- ---------- Administración: postulantes ----------
create or replace function public.admin_candidates(p_q text default '', p_filter text default '', p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare q text := '%' || lower(trim(coalesce(p_q, ''))) || '%'; res jsonb; total int;
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  with base as (
    select p.id, trim(p.first_name || ' ' || p.last_name) as name, u.email, p.phone, p.created_at, p.last_seen_at, p.suspended_at, p.suspended_reason,
      cp.headline, cp.comuna, cp.region, cp.onboarding_done, cp.is_public,
      exists (select 1 from seed.users s where s.id = p.id) as demo,
      count(*) over () as n
    from profiles p join auth.users u on u.id = p.id left join candidate_profiles cp on cp.user_id = p.id
    where p.role = 'candidate' and not exists (select 1 from admins a where a.user_id = p.id)
      and (trim(coalesce(p_q, '')) = '' or lower(p.first_name || ' ' || p.last_name || ' ' || u.email || ' ' || coalesce(cp.headline, '') || ' ' || coalesce(cp.comuna, '') || ' ' || coalesce(p.phone, '')) like q)
      and case coalesce(p_filter, '')
        when 'suspendidos' then p.suspended_at is not null
        when 'activos' then p.suspended_at is null
        when 'incompletos' then not coalesce(cp.onboarding_done, false)
        when 'asesoria' then exists (select 1 from service_requests r where r.candidate_id = p.id)
        when 'reales' then not exists (select 1 from seed.users s where s.id = p.id)
        else true end
    order by p.created_at desc limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
  )
  select max(b.n), coalesce(jsonb_agg((to_jsonb(b) - 'n') || jsonb_build_object(
      'matches', (select count(*) from matches m where m.candidate_id = b.id),
      'interests', (select count(*) from candidate_job_actions a where a.candidate_id = b.id and a.action = 'interest'),
      'requests', (select count(*) from service_requests r where r.candidate_id = b.id)) order by b.created_at desc), '[]'::jsonb)
    into total, res from base b;
  return jsonb_build_object('total', coalesce(total, 0), 'rows', res);
end $$;
revoke execute on function public.admin_candidates(text, text, int, int) from public, anon;
grant execute on function public.admin_candidates(text, text, int, int) to authenticated;

create or replace function public.admin_candidate_detail(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  return jsonb_build_object(
    'profile', (select to_jsonb(cp) - 'video_path' from candidate_profiles cp where cp.user_id = p_user),
    'matches', coalesce((select jsonb_agg(jsonb_build_object('job', j.title, 'company', c.display_name, 'stage', m.stage, 'at', m.created_at) order by m.created_at desc)
       from matches m join jobs j on j.id = m.job_id join companies c on c.id = m.company_id where m.candidate_id = p_user), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('service', r.service_name, 'status', r.status, 'price', r.price_clp, 'at', r.created_at) order by r.created_at desc)
       from service_requests r where r.candidate_id = p_user), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(jsonb_build_object('action', a.action, 'at', a.created_at, 'detail', a.detail) order by a.created_at desc)
       from audit_logs a where a.entity = 'user' and a.entity_id = p_user), '[]'::jsonb));
end $$;
revoke execute on function public.admin_candidate_detail(uuid) from public, anon;
grant execute on function public.admin_candidate_detail(uuid) to authenticated;

-- Solicitudes para administración: incluye asesor asignado y cantidad de mensajes
create or replace function public.admin_service_requests()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'service_id', r.service_id, 'service', r.service_name, 'price', r.price_clp, 'status', r.status, 'goal', r.goal,
      'contact_pref', r.contact_pref, 'note', r.admin_note, 'created_at', r.created_at, 'updated_at', r.updated_at,
      'candidate_id', r.candidate_id, 'name', trim(p.first_name || ' ' || p.last_name), 'email', u.email, 'phone', p.phone,
      'headline', cp.headline, 'comuna', cp.comuna, 'region', cp.region, 'has_experience', cp.has_experience,
      'experiences', cp.experiences, 'education', cp.education, 'skills', cp.skills, 'bio', cp.bio,
      'advisor_id', r.assigned_to, 'advisor', (select trim(ap.first_name || ' ' || ap.last_name) from profiles ap where ap.id = r.assigned_to),
      'messages', (select count(*) from service_messages m where m.request_id = r.id))
    order by case when r.status in ('solicitada', 'pago_pendiente', 'en_curso') then 0 else 1 end, r.created_at desc)
    from service_requests r join profiles p on p.id = r.candidate_id join auth.users u on u.id = r.candidate_id
    left join candidate_profiles cp on cp.user_id = r.candidate_id), '[]'::jsonb);
end $$;

-- Datos personales exportables: conversación de asesoría
create or replace function public.export_my_data()
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'auth' as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Inicia sesión'; end if;
  return jsonb_build_object(
    'generado', now(),
    'cuenta', (select jsonb_build_object('correo', email, 'creada', created_at) from auth.users where id = uid),
    'perfil', (select to_jsonb(p) - 'calendar_token' from profiles p where id = uid),
    'perfil_candidato', (select to_jsonb(c) from candidate_profiles c where user_id = uid),
    'intereses_en_vacantes', coalesce((select jsonb_agg(jsonb_build_object('vacante', j.title, 'accion', a.action, 'respuestas', a.answers, 'fecha', a.created_at))
        from candidate_job_actions a join jobs j on j.id = a.job_id where a.candidate_id = uid), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(jsonb_build_object('vacante', j.title, 'empresa', co.display_name, 'etapa', m.stage, 'fecha', m.created_at))
        from matches m join jobs j on j.id = m.job_id join companies co on co.id = m.company_id where m.candidate_id = uid), '[]'::jsonb),
    'mensajes_enviados', coalesce((select jsonb_agg(jsonb_build_object('texto', body, 'fecha', created_at) order by created_at) from messages where sender_id = uid), '[]'::jsonb),
    'entrevistas', coalesce((select jsonb_agg(jsonb_build_object('inicio', starts_at, 'modalidad', mode, 'estado', status)) from interviews where candidate_id = uid), '[]'::jsonb),
    'ofertas', coalesce((select jsonb_agg(to_jsonb(o) - 'created_by') from offers o where candidate_id = uid), '[]'::jsonb),
    'notificaciones', coalesce((select jsonb_agg(jsonb_build_object('titulo', title, 'texto', body, 'fecha', created_at)) from notifications where user_id = uid), '[]'::jsonb),
    'empresas', coalesce((select jsonb_agg(jsonb_build_object('empresa', co.display_name, 'rol', cm.role)) from company_members cm join companies co on co.id = cm.company_id where cm.user_id = uid), '[]'::jsonb),
    'uso_asistente_ia', coalesce((select jsonb_agg(to_jsonb(u) - 'user_id') from ai_usage u where user_id = uid), '[]'::jsonb),
    'asesorias', coalesce((select jsonb_agg(jsonb_build_object('servicio', service_name, 'precio', price_clp, 'estado', status, 'objetivo', goal, 'contacto', contact_pref, 'nota', admin_note, 'fecha', created_at,
        'mensajes', coalesce((select jsonb_agg(jsonb_build_object('texto', m.body, 'archivo', m.file_name, 'mio', m.sender_id = uid, 'fecha', m.created_at) order by m.created_at) from service_messages m where m.request_id = r.id), '[]'::jsonb)))
        from service_requests r where candidate_id = uid), '[]'::jsonb)
  );
end $function$;

-- ---------- Etiquetas: quién envió cada mensaje y nombre del asesor asignado ----------
alter table public.service_messages add column if not exists sender_kind text not null default 'candidate' check (sender_kind in ('candidate', 'advisor', 'admin'));
alter table public.service_requests add column if not exists assigned_name text not null default '';

create or replace function public.service_message_kind() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.sender_kind := case
    when exists (select 1 from service_requests r where r.id = new.request_id and r.candidate_id = new.sender_id) then 'candidate'
    when exists (select 1 from advisors a where a.user_id = new.sender_id) then 'advisor'
    else 'admin' end;
  return new;
end $$;
revoke execute on function public.service_message_kind() from public, anon, authenticated;
drop trigger if exists service_message_kind on public.service_messages;
create trigger service_message_kind before insert on public.service_messages for each row execute function public.service_message_kind();

do $$
declare d text;
begin
  d := replace(pg_get_functiondef('public.admin_assign_request(uuid,uuid)'::regprocedure),
    'update service_requests set assigned_to = p_advisor, updated_at = now() where id = p_id returning * into r;',
    'update service_requests set assigned_to = p_advisor, assigned_name = coalesce((select first_name from profiles where id = p_advisor), ''''), updated_at = now() where id = p_id returning * into r;');
  execute d;
end $$;
