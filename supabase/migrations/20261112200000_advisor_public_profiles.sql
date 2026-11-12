-- Elegir asesor · Etapa 1: perfil público del asesor (aprobado por VINKA), disponibilidad y cupo,
-- y la elección del postulante («elegir asesor» o «VINKA elige») dentro de la solicitud actual.
create schema if not exists backup;
create table if not exists backup.fn_request_career_service_20261112 as
  select now() as saved_at, pg_get_functiondef('public.request_career_service(text, text, text, boolean)'::regprocedure) as def;
create table if not exists backup.fn_admin_assign_request_20261112 as
  select now() as saved_at, pg_get_functiondef('public.admin_assign_request(uuid, uuid)'::regprocedure) as def;
create table if not exists backup.fn_admin_service_requests_20261112 as
  select now() as saved_at, pg_get_functiondef('public.admin_service_requests()'::regprocedure) as def;

-- 1) Perfil público: versión publicada (la que ven los postulantes) + borrador que revisa VINKA
create table public.advisor_profiles (
  user_id uuid primary key references public.advisors(user_id) on delete cascade,
  pub jsonb,                          -- null hasta la primera aprobación
  draft jsonb,
  review_status text not null default 'sin_cambios' check (review_status in ('sin_cambios', 'en_revision', 'devuelto')),
  review_note text not null default '',
  hidden boolean not null default false,       -- VINKA lo saca del directorio
  accepting boolean not null default true,     -- el asesor recibe solicitudes
  max_active int not null default 8 check (max_active between 1 and 50),
  reviewed_at timestamptz,
  reviewed_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.advisor_profiles enable row level security;
revoke all on public.advisor_profiles from anon, authenticated;

-- 2) La solicitud guarda la elección del postulante
alter table public.service_requests add column if not exists preferred_advisor uuid references public.advisors(user_id) on delete set null;
alter table public.service_requests add column if not exists choice text not null default 'vinka' check (choice in ('vinka', 'asesor'));

-- 3) Fotos de asesores (públicas para mostrarlas; cada asesor sube solo en su carpeta)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('advisor-photos', 'advisor-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "fotos asesor: subir" on storage.objects;
drop policy if exists "fotos asesor: borrar" on storage.objects;
create policy "fotos asesor: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'advisor-photos' and (((storage.foldername(name))[1] = (auth.uid())::text and is_advisor()) or is_admin()));
create policy "fotos asesor: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'advisor-photos' and (((storage.foldername(name))[1] = (auth.uid())::text and is_advisor()) or is_admin()));

-- ===================== Apoyo (uso interno) =====================
-- Limpia y valida lo que se escribe en un perfil
create or replace function public.advisor_profile_clean(p jsonb, p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_name text := btrim(coalesce(p->>'display_name', '')); v_years int; v_photo text := nullif(btrim(coalesce(p->>'photo', '')), '');
begin
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'Escribe tu nombre profesional (2 a 80 caracteres)'; end if;
  begin v_years := nullif(p->>'years', '')::int; exception when others then raise exception 'Los años de experiencia deben ser un número'; end;
  if v_years is not null and (v_years < 0 or v_years > 60) then raise exception 'Años de experiencia: entre 0 y 60'; end if;
  if char_length(btrim(coalesce(p->>'bio', ''))) < 40 then raise exception 'Cuéntale al postulante quién eres (al menos 40 caracteres)'; end if;
  if v_photo is not null and v_photo not like p_owner::text || '/%' then raise exception 'Foto no válida'; end if;
  return jsonb_build_object(
    'display_name', v_name,
    'headline', left(btrim(coalesce(p->>'headline', '')), 120),
    'bio', left(btrim(coalesce(p->>'bio', '')), 1500),
    'years', v_years,
    'specialties', coalesce((select jsonb_agg(left(btrim(x), 40)) from (select jsonb_array_elements_text(coalesce(p->'specialties', '[]')) x limit 8) s where btrim(x) <> ''), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(c.id order by c.sort) from career_services c where c.id in (select jsonb_array_elements_text(coalesce(p->'services', '[]')))), '[]'::jsonb),
    'photo', v_photo);
end $$;

-- Asesorías que ocupan cupo: pago pendiente o en curso
create or replace function public.advisor_load(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from service_requests where assigned_to = p_user and status in ('pago_pendiente', 'en_curso')
$$;

create or replace function public.advisor_available(p_user uuid, p_service text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from advisor_profiles ap join advisors a on a.user_id = ap.user_id
                 where ap.user_id = p_user and a.active and ap.pub is not null and not ap.hidden and ap.accepting
                   and advisor_load(ap.user_id) < ap.max_active
                   and (p_service is null or ap.pub->'services' ? p_service))
$$;

-- Lo que ve el postulante de un asesor (solo la versión aprobada)
create or replace function public.advisor_card(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select ap.pub || jsonb_build_object('id', ap.user_id, 'available', advisor_available(ap.user_id),
    'service_names', coalesce((select jsonb_agg(c.name order by c.sort) from career_services c where ap.pub->'services' ? c.id), '[]'::jsonb),
    'ratings', 0)  -- las valoraciones llegan en la etapa 2
  from advisor_profiles ap where ap.user_id = p_user and ap.pub is not null
$$;

-- «VINKA elige»: hace el servicio, está disponible y tiene menos asesorías en curso
create or replace function public.advisor_suggest(p_service text)
returns uuid language sql stable security definer set search_path = public as $$
  select ap.user_id from advisor_profiles ap
  where advisor_available(ap.user_id, p_service)
  order by advisor_load(ap.user_id), md5(ap.user_id::text || current_date::text) limit 1
$$;

-- ===================== Directorio (postulantes, asesores y VINKA) =====================
create or replace function public.advisor_directory(p_service text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_admin() or exists (select 1 from profiles where id = auth.uid() and role in ('candidate', 'advisor'))) then
    raise exception 'El directorio de asesores es para postulantes'; end if;
  -- Orden: primero los disponibles; luego un orden que cambia según quién mira (sin ranking)
  return coalesce((select jsonb_agg(advisor_card(ap.user_id) order by advisor_available(ap.user_id, p_service) desc, md5(ap.user_id::text || coalesce(auth.uid()::text, '')))
    from advisor_profiles ap join advisors a on a.user_id = ap.user_id
    where a.active and ap.pub is not null and not ap.hidden and (p_service is null or ap.pub->'services' ? p_service)), '[]'::jsonb);
end $$;

create or replace function public.advisor_public_profile(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not (is_admin() or exists (select 1 from profiles where id = auth.uid() and role in ('candidate', 'advisor'))) then
    raise exception 'El perfil de asesores es para postulantes'; end if;
  select advisor_card(ap.user_id) into v from advisor_profiles ap join advisors a on a.user_id = ap.user_id
   where ap.user_id = p_user and a.active and not ap.hidden;
  if v is null then raise exception 'Este perfil no está disponible'; end if;
  return v;
end $$;

-- ===================== El asesor =====================
create or replace function public.my_advisor_profile()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r advisor_profiles;
begin
  if not is_advisor() then raise exception 'Solo para asesores'; end if;
  insert into advisor_profiles (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * into r from advisor_profiles where user_id = auth.uid();
  return jsonb_build_object('pub', r.pub, 'draft', coalesce(r.draft, r.pub), 'review_status', r.review_status, 'review_note', r.review_note,
    'hidden', r.hidden, 'accepting', r.accepting, 'max_active', r.max_active, 'load', advisor_load(auth.uid()), 'available', advisor_available(auth.uid()),
    'services', (select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by sort) from career_services where active));
end $$;

create or replace function public.advisor_profile_save(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not is_advisor() then raise exception 'Solo para asesores'; end if;
  v := advisor_profile_clean(p, auth.uid());
  insert into advisor_profiles (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update advisor_profiles set draft = v, updated_at = now(),
         review_status = case when pub is not distinct from v then 'sin_cambios' else 'en_revision' end, review_note = ''
   where user_id = auth.uid();
  if (select review_status from advisor_profiles where user_id = auth.uid()) = 'en_revision' then
    perform notify_users(array(select user_id from admins), 'service_request', 'Perfil de asesor por revisar',
      v->>'display_name' || ' actualizó su perfil público.', '/asesores', false);
  end if;
end $$;

create or replace function public.advisor_set_accepting(p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_advisor() then raise exception 'Solo para asesores'; end if;
  insert into advisor_profiles (user_id, accepting) values (auth.uid(), p_on)
  on conflict (user_id) do update set accepting = p_on, updated_at = now();
end $$;

-- ===================== El postulante =====================
drop function if exists public.request_career_service(text, text, text, boolean);
create function public.request_career_service(p_service text, p_goal text, p_contact text, p_consent boolean, p_advisor uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s career_services; v_id uuid; v_name text; v_adv text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  if (select role from profiles where id = auth.uid()) <> 'candidate' then raise exception 'La asesoría es para personas que buscan empleo'; end if;
  if not coalesce(p_consent, false) then raise exception 'Para continuar, autoriza que un reclutador de VINKA vea tu perfil y te contacte.'; end if;
  select * into s from career_services where id = p_service and active;
  if s.id is null then raise exception 'Este servicio no está disponible'; end if;
  if exists (select 1 from service_requests where candidate_id = auth.uid() and service_id = p_service and status in ('solicitada', 'pago_pendiente', 'en_curso')) then
    raise exception 'Ya tienes una solicitud abierta de este servicio. Te contactaremos pronto.'; end if;
  if (select count(*) from service_requests where candidate_id = auth.uid() and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Hiciste varias solicitudes hoy. Intenta de nuevo mañana.'; end if;
  if p_advisor is not null and not advisor_available(p_advisor, p_service) then
    raise exception 'Ese asesor/a no está disponible ahora para este servicio. Elige a otra persona o deja que VINKA elija.'; end if;
  insert into service_requests (candidate_id, service_id, service_name, price_clp, goal, contact_pref, preferred_advisor, choice)
  values (auth.uid(), s.id, s.name, s.price_clp, left(coalesce(trim(p_goal), ''), 1000), 'chat', p_advisor, case when p_advisor is null then 'vinka' else 'asesor' end)
  returning id into v_id;
  select trim(first_name || ' ' || last_name) into v_name from profiles where id = auth.uid();
  select pub->>'display_name' into v_adv from advisor_profiles where user_id = p_advisor;
  perform notify_users(array(select user_id from admins), 'service_request', 'Nueva solicitud: ' || s.name,
    coalesce(nullif(v_name, ''), 'Una persona') || ' pidió ' || s.name || ' ($' || to_char(s.price_clp, 'FM999G999G999') || ')'
    || case when v_adv is not null then '. Eligió a ' || v_adv || '.' else '. Deja que VINKA elija.' end, '/asesorias', true);
  perform notify_users(array[auth.uid()], 'service_request', 'Recibimos tu solicitud de ' || s.name,
    'VINKA te escribirá por el chat de tu asesoría, dentro de la app, para coordinar el pago y empezar.', '/asesoria', false);
  return v_id;
end $$;

-- Cambiar la elección antes de que empiece (por ejemplo, si el elegido dejó de estar disponible)
create or replace function public.request_change_advisor(p_request uuid, p_advisor uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare r service_requests; v_adv text;
begin
  select * into r from service_requests where id = p_request and candidate_id = auth.uid();
  if r.id is null then raise exception 'Solicitud no encontrada'; end if;
  if r.status not in ('solicitada', 'pago_pendiente') then raise exception 'La asesoría ya empezó: para cambiar de asesor/a, escríbele a VINKA por el chat'; end if;
  if p_advisor is not null and not advisor_available(p_advisor, r.service_id) then
    raise exception 'Ese asesor/a no está disponible ahora para este servicio'; end if;
  update service_requests set preferred_advisor = p_advisor, choice = case when p_advisor is null then 'vinka' else 'asesor' end, updated_at = now() where id = r.id;
  select pub->>'display_name' into v_adv from advisor_profiles where user_id = p_advisor;
  perform notify_users(array(select user_id from admins), 'service_request', 'Cambio de asesor/a: ' || r.service_name,
    coalesce('Ahora prefiere a ' || v_adv, 'Ahora deja que VINKA elija') || '.', '/asesorias', false);
end $$;

-- ===================== VINKA =====================
create or replace function public.admin_assign_request(p_id uuid, p_advisor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r service_requests; v_name text; v_other boolean;
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  if p_advisor is not null and not exists (select 1 from advisors where user_id = p_advisor and active) then raise exception 'Asesor no disponible'; end if;
  select * into r from service_requests where id = p_id;
  if r.id is null then raise exception 'Solicitud no encontrada'; end if;
  v_other := r.preferred_advisor is not null and p_advisor is distinct from r.preferred_advisor;
  update service_requests set assigned_to = p_advisor, assigned_name = coalesce((select first_name from profiles where id = p_advisor), ''), updated_at = now() where id = p_id returning * into r;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'service_assigned', 'service_request', p_id,
    jsonb_build_object('advisor', p_advisor, 'preferred', r.preferred_advisor));
  if p_advisor is not null then
    select coalesce((select pub->>'display_name' from advisor_profiles where user_id = p_advisor), first_name) into v_name from profiles where id = p_advisor;
    perform notify_users(array[p_advisor], 'service_request', 'Te asignaron: ' || r.service_name, 'Revisa la solicitud en tu panel de asesorías.', '/asesorias', true);
    perform notify_users(array[r.candidate_id], 'service_request', 'Ya tienes asesor/a',
      case when v_other then 'La persona que elegiste no estaba disponible, así que VINKA asignó a ' || coalesce(v_name, 'un reclutador')
           else coalesce(v_name, 'Un reclutador') end
      || ' para tu ' || r.service_name || '. Conversen desde Asesoría con reclutador.', '/asesoria', false);
  end if;
end $$;

-- La lista de solicitudes muestra la elección y la sugerencia
do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.admin_service_requests()'::regprocedure);
  n := replace(d, '''notes'', (select count(*) from team_notes t where t.request_id = r.id), ''next'', service_next(r))',
    '''notes'', (select count(*) from team_notes t where t.request_id = r.id), ''next'', service_next(r), ''choice'', r.choice, ''preferred_id'', r.preferred_advisor,'
    || ' ''preferred'', (select coalesce(ap.pub->>''display_name'', trim(pp.first_name || '' '' || pp.last_name)) from profiles pp left join advisor_profiles ap on ap.user_id = pp.id where pp.id = r.preferred_advisor),'
    || ' ''preferred_available'', case when r.preferred_advisor is null then null else advisor_available(r.preferred_advisor, r.service_id) end,'
    || ' ''suggested_id'', case when r.assigned_to is null and r.status in (''solicitada'', ''pago_pendiente'') then advisor_suggest(r.service_id) end)');
  if n = d then raise exception 'admin_service_requests: no se encontró dónde agregar la elección'; end if;
  execute n;
end $m$;

create or replace function public.admin_advisor_profiles()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  insert into advisor_profiles (user_id) select user_id from advisors on conflict (user_id) do nothing;
  return coalesce((select jsonb_object_agg(ap.user_id, jsonb_build_object('pub', ap.pub, 'draft', ap.draft, 'review_status', ap.review_status, 'review_note', ap.review_note,
      'hidden', ap.hidden, 'accepting', ap.accepting, 'max_active', ap.max_active, 'load', advisor_load(ap.user_id), 'available', advisor_available(ap.user_id)))
    from advisor_profiles ap), '{}'::jsonb);
end $$;

-- Aprobar (publica el borrador) o devolver con observaciones
create or replace function public.admin_advisor_profile_review(p_user uuid, p_approve boolean, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare r advisor_profiles;
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  select * into r from advisor_profiles where user_id = p_user;
  if r.user_id is null or r.draft is null then raise exception 'No hay cambios por revisar'; end if;
  if not p_approve and char_length(btrim(coalesce(p_note, ''))) < 5 then raise exception 'Escribe qué debe corregir'; end if;
  if p_approve then
    update advisor_profiles set pub = draft, review_status = 'sin_cambios', review_note = '', reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now() where user_id = p_user;
  else
    update advisor_profiles set review_status = 'devuelto', review_note = left(btrim(p_note), 500), reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now() where user_id = p_user;
  end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), case when p_approve then 'advisor_profile_approved' else 'advisor_profile_returned' end, 'user', p_user, jsonb_build_object('note', p_note));
  perform notify_users(array[p_user], 'team_note', case when p_approve then 'Tu perfil público está publicado' else 'Tu perfil público necesita cambios' end,
    case when p_approve then 'Los postulantes ya pueden verte y elegirte.' else left(btrim(p_note), 140) end, '/cuenta', false);
end $$;

-- Ajustes de VINKA: ocultar, disponibilidad y cupo
create or replace function public.admin_advisor_profile_set(p_user uuid, p_hidden boolean, p_accepting boolean, p_max int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  if not exists (select 1 from advisors where user_id = p_user) then raise exception 'Esa cuenta no es de asesor'; end if;
  insert into advisor_profiles (user_id) values (p_user) on conflict (user_id) do nothing;
  update advisor_profiles set hidden = coalesce(p_hidden, hidden), accepting = coalesce(p_accepting, accepting),
         max_active = coalesce(p_max, max_active), updated_at = now() where user_id = p_user;
  insert into audit_logs (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'advisor_profile_settings', 'user', p_user, jsonb_build_object('hidden', p_hidden, 'accepting', p_accepting, 'max', p_max));
end $$;

-- ===================== Permisos =====================
do $g$
declare f text;
begin
  foreach f in array array['advisor_directory(text)', 'advisor_public_profile(uuid)', 'my_advisor_profile()', 'advisor_profile_save(jsonb)',
    'advisor_set_accepting(boolean)', 'request_career_service(text, text, text, boolean, uuid)', 'request_change_advisor(uuid, uuid)',
    'admin_assign_request(uuid, uuid)', 'admin_advisor_profiles()', 'admin_advisor_profile_review(uuid, boolean, text)',
    'admin_advisor_profile_set(uuid, boolean, boolean, int)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['advisor_profile_clean(jsonb, uuid)', 'advisor_load(uuid)', 'advisor_available(uuid, text)', 'advisor_card(uuid)', 'advisor_suggest(text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $g$;
