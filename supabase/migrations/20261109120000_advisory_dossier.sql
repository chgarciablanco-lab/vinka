-- Expediente de asesoría: CV guardados (con versiones), historial de trabajo del asesor, búsquedas y ofertas sugeridas,
-- calendario de sesiones, notas internas asesor ↔ administración y revisión final (visto bueno) de VINKA.

-- ---------- Estados: la administración da el visto bueno final ----------
alter table public.service_requests drop constraint if exists service_requests_status_check;
alter table public.service_requests add constraint service_requests_status_check
  check (status in ('solicitada', 'pago_pendiente', 'en_curso', 'entregada', 'aprobada', 'cancelada'));
alter table public.service_requests add column if not exists reviewed_at timestamptz;
alter table public.service_requests add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
create index if not exists idx_service_requests_reviewed_by on public.service_requests (reviewed_by);

-- el asesor/a ve los datos de una persona solo mientras tenga una asesoría asignada con ella
create or replace function public.is_advisor_of(p_candidate uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_advisor() and exists (select 1 from service_requests r where r.candidate_id = p_candidate and r.assigned_to = auth.uid() and r.status <> 'cancelada')
$$;

-- ---------- Historial de trabajo ----------
create table if not exists public.service_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_kind text not null default 'advisor' check (author_kind in ('candidate', 'advisor', 'admin', 'system')),
  kind text not null check (kind in ('cv', 'sesion', 'busqueda', 'oferta', 'nota', 'entrega', 'revision', 'estado')),
  title text not null,
  detail text not null default '',
  minutes int check (minutes is null or (minutes >= 0 and minutes <= 600)),
  visible boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_service_logs_request on public.service_logs (request_id, created_at desc);
create index if not exists idx_service_logs_author on public.service_logs (author_id);
alter table public.service_logs enable row level security;
create policy "asesorías: historial" on public.service_logs for select to authenticated using (
  (select is_admin())
  or exists (select 1 from service_requests r where r.id = request_id and r.assigned_to = (select auth.uid()) and (select is_advisor()))
  or (visible and exists (select 1 from service_requests r where r.id = request_id and r.candidate_id = (select auth.uid()))));

create or replace function public.log_service(p_request uuid, p_kind text, p_title text, p_detail text default '', p_minutes int default null, p_visible boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into service_logs (request_id, author_id, author_kind, kind, title, detail, minutes, visible)
  values (p_request, auth.uid(),
    case when auth.uid() is null then 'system' when is_admin() then 'admin' when is_advisor() then 'advisor' else 'candidate' end,
    p_kind, left(p_title, 200), left(coalesce(p_detail, ''), 3000), p_minutes, p_visible);
end $$;
revoke execute on function public.log_service(uuid, text, text, text, int, boolean) from public, anon, authenticated;

-- Registro manual del asesor o la administración (trabajo hecho, notas internas)
create or replace function public.add_service_log(p_request uuid, p_kind text, p_title text, p_detail text, p_minutes int, p_visible boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (is_admin() or exists (select 1 from service_requests where id = p_request and assigned_to = auth.uid() and is_advisor())) then
    raise exception 'No tienes acceso a esta asesoría'; end if;
  if p_kind not in ('cv', 'sesion', 'busqueda', 'oferta', 'nota') then raise exception 'Tipo no válido'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Escribe qué hiciste'; end if;
  if coalesce(p_visible, true) and not is_admin() and (has_contact_info(p_title) or has_contact_info(p_detail)) then
    raise exception 'El registro visible para la persona no puede incluir teléfonos, correos ni redes sociales.'; end if;
  perform log_service(p_request, p_kind, p_title, p_detail, p_minutes, coalesce(p_visible, true));
end $$;
revoke execute on function public.add_service_log(uuid, text, text, text, int, boolean) from public, anon;
grant execute on function public.add_service_log(uuid, text, text, text, int, boolean) to authenticated;

-- ---------- CV guardados en VINKA (originales y versiones mejoradas) ----------
create table if not exists public.cv_files (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid references public.service_requests(id) on delete set null,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploader_kind text not null check (uploader_kind in ('candidate', 'advisor', 'admin')),
  kind text not null check (kind in ('original', 'mejorado')),
  version int not null,
  file_path text not null unique,
  file_name text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_cv_files_candidate on public.cv_files (candidate_id, created_at desc);
create index if not exists idx_cv_files_request on public.cv_files (request_id);
create index if not exists idx_cv_files_uploaded_by on public.cv_files (uploaded_by);
alter table public.cv_files enable row level security;
create policy "cv: dueño, asesor asignado y administración" on public.cv_files for select to authenticated
  using (candidate_id = (select auth.uid()) or (select is_admin()) or (select is_advisor_of(candidate_id)));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cvs', 'cvs', false, 10485760,
  array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "cv: leer" on storage.objects for select to authenticated
  using (bucket_id = 'cvs' and (public.request_folder(name) = auth.uid() or public.is_admin() or public.is_advisor_of(public.request_folder(name))));
create policy "cv: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'cvs' and (public.request_folder(name) = auth.uid() or public.is_admin() or public.is_advisor_of(public.request_folder(name))));
create policy "cv: borrar los propios" on storage.objects for delete to authenticated
  using (bucket_id = 'cvs' and public.request_folder(name) = auth.uid());

create or replace function public.register_cv(p_path text, p_name text, p_request uuid default null, p_note text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_cand uuid := request_folder(p_path); v_kind text; v_by text; v_id uuid; v_ver int; r service_requests;
begin
  if v_cand is null then raise exception 'Archivo no válido'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'cvs' and name = p_path) then raise exception 'Primero sube el archivo'; end if;
  if p_request is not null then
    select * into r from service_requests where id = p_request;
    if r.id is null or r.candidate_id <> v_cand then raise exception 'La solicitud no corresponde a esta persona'; end if;
  end if;
  if v_cand = auth.uid() then v_kind := 'original'; v_by := 'candidate';
  elsif is_admin() then v_kind := 'mejorado'; v_by := 'admin';
  elsif p_request is not null and r.assigned_to = auth.uid() and is_advisor() then v_kind := 'mejorado'; v_by := 'advisor';
  else raise exception 'No tienes permiso para guardar este CV'; end if;
  select coalesce(max(version), 0) + 1 into v_ver from cv_files where candidate_id = v_cand;
  insert into cv_files (candidate_id, request_id, uploaded_by, uploader_kind, kind, version, file_path, file_name, note)
  values (v_cand, p_request, auth.uid(), v_by, v_kind, v_ver, p_path, left(coalesce(p_name, ''), 120), left(coalesce(p_note, ''), 500))
  returning id into v_id;
  if p_request is not null then
    perform log_service(p_request, 'cv', case when v_kind = 'mejorado' then 'Subió CV mejorado (versión ' || v_ver || ')' else 'La persona subió su CV (versión ' || v_ver || ')' end, p_note, null, true);
    if v_kind = 'mejorado' then
      perform notify_users(array[v_cand], 'service_request', 'Tienes una nueva versión de tu CV', 'Tu asesor/a subió tu CV mejorado. Revísalo en Mi CV o en tu asesoría.', '/asesoria', true);
    end if;
  end if;
  return v_id;
end $$;
revoke execute on function public.register_cv(text, text, uuid, text) from public, anon;
grant execute on function public.register_cv(text, text, uuid, text) to authenticated;

create or replace function public.delete_my_cv(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_path text;
begin
  delete from cv_files where id = p_id and candidate_id = auth.uid() and kind = 'original' returning file_path into v_path;
  if v_path is null then raise exception 'Solo puedes borrar los CV que subiste tú'; end if;
  return v_path;
end $$;
revoke execute on function public.delete_my_cv(uuid) from public, anon;
grant execute on function public.delete_my_cv(uuid) to authenticated;

-- CV de la persona de una asesoría (para el asesor asignado y la administración)
create or replace function public.request_cvs(p_request uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_cand uuid;
begin
  if not can_access_request(p_request) then raise exception 'No tienes acceso a esta asesoría'; end if;
  select candidate_id into v_cand from service_requests where id = p_request;
  return jsonb_build_object('candidate_id', v_cand, 'files', coalesce((select jsonb_agg(jsonb_build_object(
      'id', f.id, 'kind', f.kind, 'version', f.version, 'file_path', f.file_path, 'file_name', f.file_name, 'note', f.note,
      'uploader_kind', f.uploader_kind, 'request_id', f.request_id, 'created_at', f.created_at) order by f.version desc)
    from cv_files f where f.candidate_id = v_cand), '[]'::jsonb));
end $$;
revoke execute on function public.request_cvs(uuid) from public, anon;
grant execute on function public.request_cvs(uuid) to authenticated;

-- ---------- Calendario de sesiones ----------
create table if not exists public.service_sessions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  starts_at timestamptz not null,
  minutes int not null default 45 check (minutes between 10 and 240),
  mode text not null default 'videollamada' check (mode in ('videollamada', 'presencial')),
  link text not null default '',
  place text not null default '',
  status text not null default 'agendada' check (status in ('agendada', 'realizada', 'cancelada', 'no_asistio')),
  summary text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_service_sessions_request on public.service_sessions (request_id, starts_at);
create index if not exists idx_service_sessions_starts on public.service_sessions (starts_at);
create index if not exists idx_service_sessions_created_by on public.service_sessions (created_by);
alter table public.service_sessions enable row level security;
create policy "asesorías: sesiones" on public.service_sessions for select to authenticated using ((select can_access_request(request_id)));

create or replace function public.save_service_session(p_id uuid, p_request uuid, p_starts timestamptz, p_minutes int, p_mode text, p_link text, p_place text, p_status text, p_summary text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r service_requests; v_id uuid := p_id; v_new boolean := p_id is null; v_when text;
begin
  select * into r from service_requests where id = p_request;
  if r.id is null or not (is_admin() or (r.assigned_to = auth.uid() and is_advisor())) then raise exception 'No tienes acceso a esta asesoría'; end if;
  if r.status in ('cancelada', 'aprobada') then raise exception 'Esta asesoría ya está cerrada'; end if;
  if p_mode not in ('videollamada', 'presencial') or p_status not in ('agendada', 'realizada', 'cancelada', 'no_asistio') then raise exception 'Datos no válidos'; end if;
  if not is_admin() and (has_contact_info(p_summary) or has_contact_info(p_place)) then raise exception 'No incluyas teléfonos, correos ni redes sociales.'; end if;
  if coalesce(p_link, '') <> '' and p_link !~* '^https://(meet\.google\.com|[a-z0-9-]+\.zoom\.us|zoom\.us|teams\.microsoft\.com|teams\.live\.com|meet\.jit\.si|whereby\.com)/' then
    raise exception 'Usa un enlace de Google Meet, Zoom, Teams, Jitsi o Whereby.'; end if;
  if v_new then
    insert into service_sessions (request_id, starts_at, minutes, mode, link, place, status, summary, created_by)
    values (p_request, p_starts, coalesce(p_minutes, 45), p_mode, coalesce(p_link, ''), left(coalesce(p_place, ''), 200), p_status, left(coalesce(p_summary, ''), 2000), auth.uid())
    returning id into v_id;
  else
    update service_sessions set starts_at = p_starts, minutes = coalesce(p_minutes, minutes), mode = p_mode, link = coalesce(p_link, ''), place = left(coalesce(p_place, ''), 200),
      status = p_status, summary = left(coalesce(p_summary, ''), 2000), updated_at = now()
    where id = p_id and request_id = p_request;
    if not found then raise exception 'Sesión no encontrada'; end if;
  end if;
  v_when := to_char(p_starts at time zone 'America/Santiago', 'DD-MM-YYYY HH24:MI');
  perform log_service(p_request, 'sesion',
    case when v_new then 'Agendó sesión para el ' || v_when when p_status = 'realizada' then 'Sesión realizada (' || v_when || ')'
         when p_status = 'cancelada' then 'Sesión cancelada (' || v_when || ')' when p_status = 'no_asistio' then 'La persona no asistió (' || v_when || ')'
         else 'Reprogramó sesión para el ' || v_when end,
    p_summary, case when p_status = 'realizada' then coalesce(p_minutes, 45) end, true);
  perform notify_users(array[r.candidate_id], 'service_request',
    case when v_new then 'Sesión agendada: ' || v_when when p_status = 'cancelada' then 'Sesión cancelada' else 'Sesión actualizada' end,
    r.service_name || '. Revisa los detalles en tu asesoría.', '/asesoria', v_new);
  return v_id;
end $$;
revoke execute on function public.save_service_session(uuid, uuid, timestamptz, int, text, text, text, text, text) from public, anon;
grant execute on function public.save_service_session(uuid, uuid, timestamptz, int, text, text, text, text, text) to authenticated;

-- ---------- Búsquedas y ofertas sugeridas ----------
create table if not exists public.service_job_picks (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  title text not null,
  company text not null default '',
  comuna text not null default '',
  url text not null default '',
  note text not null default '',
  status text not null default 'sugerida' check (status in ('sugerida', 'postulo', 'entrevista', 'descartada')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_service_job_picks_request on public.service_job_picks (request_id, created_at desc);
create index if not exists idx_service_job_picks_job on public.service_job_picks (job_id);
create index if not exists idx_service_job_picks_created_by on public.service_job_picks (created_by);
alter table public.service_job_picks enable row level security;
create policy "asesorías: ofertas sugeridas" on public.service_job_picks for select to authenticated using ((select can_access_request(request_id)));

-- Búsqueda de vacantes publicadas en VINKA; queda registrada en el historial
create or replace function public.advisor_search_jobs(p_request uuid, p_q text, p_comuna text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare q text := lower(trim(coalesce(p_q, ''))); res jsonb;
begin
  if not (is_admin() or exists (select 1 from service_requests where id = p_request and assigned_to = auth.uid() and is_advisor())) then
    raise exception 'No tienes acceso a esta asesoría'; end if;
  if length(q) < 2 and coalesce(trim(p_comuna), '') = '' then raise exception 'Escribe un cargo, área o comuna para buscar'; end if;
  select coalesce(jsonb_agg(x), '[]'::jsonb) into res from (
    select jsonb_build_object('id', j.id, 'title', j.title, 'company', c.display_name, 'comuna', j.comuna, 'region', j.region, 'area', j.area,
      'modality', j.modality, 'schedule', j.schedule, 'salary_min', j.salary_min, 'salary_max', j.salary_max, 'created_at', j.created_at) x
    from jobs j join companies c on c.id = j.company_id
    where j.status = 'published'
      and (q = '' or lower(j.title || ' ' || coalesce(j.area, '') || ' ' || coalesce(j.description, '') || ' ' || c.display_name) like '%' || q || '%')
      and (coalesce(trim(p_comuna), '') = '' or lower(coalesce(j.comuna, '') || ' ' || coalesce(j.region, '')) like '%' || lower(trim(p_comuna)) || '%')
    order by j.created_at desc limit 30) s;
  perform log_service(p_request, 'busqueda', 'Búsqueda: «' || left(coalesce(p_q, ''), 80) || '»' || case when coalesce(trim(p_comuna), '') <> '' then ' en ' || left(p_comuna, 60) else '' end,
    jsonb_array_length(res) || ' vacantes encontradas en VINKA', null, true);
  return res;
end $$;
revoke execute on function public.advisor_search_jobs(uuid, text, text) from public, anon;
grant execute on function public.advisor_search_jobs(uuid, text, text) to authenticated;

create or replace function public.add_job_pick(p_request uuid, p_job uuid, p_title text, p_company text, p_comuna text, p_url text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r service_requests; v_id uuid; j record;
begin
  select * into r from service_requests where id = p_request;
  if r.id is null or not (is_admin() or (r.assigned_to = auth.uid() and is_advisor())) then raise exception 'No tienes acceso a esta asesoría'; end if;
  if p_job is not null then
    select jj.title, c.display_name company, jj.comuna into j from jobs jj join companies c on c.id = jj.company_id where jj.id = p_job and jj.status = 'published';
    if j.title is null then raise exception 'Esa vacante ya no está publicada'; end if;
    if exists (select 1 from service_job_picks where request_id = p_request and job_id = p_job) then raise exception 'Ya sugeriste esta vacante'; end if;
  else
    if coalesce(trim(p_title), '') = '' then raise exception 'Escribe el cargo de la oferta'; end if;
    if coalesce(p_url, '') <> '' and p_url !~* '^https?://' then raise exception 'El enlace debe empezar con https://'; end if;
  end if;
  if not is_admin() and (has_contact_info(p_note) or has_contact_info(p_url)) then raise exception 'No incluyas teléfonos, correos ni redes sociales.'; end if;
  insert into service_job_picks (request_id, job_id, title, company, comuna, url, note, created_by)
  values (p_request, p_job, coalesce(j.title, left(trim(p_title), 120)), coalesce(j.company, left(coalesce(p_company, ''), 120)), coalesce(j.comuna, left(coalesce(p_comuna, ''), 80)),
    case when p_job is null then left(coalesce(p_url, ''), 500) else '' end, left(coalesce(p_note, ''), 500), auth.uid())
  returning id into v_id;
  perform log_service(p_request, 'oferta', 'Sugirió la oferta: ' || coalesce(j.title, trim(p_title)) || coalesce(' — ' || nullif(coalesce(j.company, p_company), ''), ''), p_note, null, true);
  return v_id;
end $$;
revoke execute on function public.add_job_pick(uuid, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.add_job_pick(uuid, uuid, text, text, text, text, text) to authenticated;

create or replace function public.set_job_pick_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare v_req uuid; v_title text;
begin
  if p_status not in ('sugerida', 'postulo', 'entrevista', 'descartada') then raise exception 'Estado no válido'; end if;
  select request_id, title into v_req, v_title from service_job_picks where id = p_id;
  if v_req is null or not can_access_request(v_req) then raise exception 'No tienes acceso'; end if;
  update service_job_picks set status = p_status, updated_at = now() where id = p_id;
  perform log_service(v_req, 'oferta', v_title || ': ' || case p_status when 'postulo' then 'postuló' when 'entrevista' then 'quedó en entrevista' when 'descartada' then 'descartada' else 'sugerida' end, '', null, true);
end $$;
revoke execute on function public.set_job_pick_status(uuid, text) from public, anon;
grant execute on function public.set_job_pick_status(uuid, text) to authenticated;

-- ---------- Notas internas asesor ↔ administración (la persona asesorada no las ve) ----------
create table if not exists public.team_notes (
  id uuid primary key default gen_random_uuid(),
  advisor_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid references public.service_requests(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_kind text not null check (sender_kind in ('advisor', 'admin')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_team_notes_advisor on public.team_notes (advisor_id, created_at);
create index if not exists idx_team_notes_request on public.team_notes (request_id, created_at);
create index if not exists idx_team_notes_sender on public.team_notes (sender_id);
alter table public.team_notes enable row level security;
create policy "notas internas: asesor y administración" on public.team_notes for select to authenticated
  using ((advisor_id = (select auth.uid()) and (select is_advisor())) or (select is_admin()));

create or replace function public.send_team_note(p_advisor uuid, p_request uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_adv uuid; v_id uuid; v_body text := left(trim(coalesce(p_body, '')), 3000); v_kind text; v_title text;
begin
  if v_body = '' then raise exception 'Escribe un mensaje'; end if;
  if is_admin() then
    v_kind := 'admin';
    v_adv := coalesce(p_advisor, (select assigned_to from service_requests where id = p_request));
    if v_adv is null or not exists (select 1 from advisors where user_id = v_adv) then raise exception 'Elige un asesor/a'; end if;
  elsif is_advisor() then
    v_kind := 'advisor'; v_adv := auth.uid();
    if p_request is not null and not exists (select 1 from service_requests where id = p_request and assigned_to = auth.uid()) then raise exception 'Esta asesoría no está asignada a ti'; end if;
  else raise exception 'Solo asesores y administración de VINKA'; end if;
  if p_request is not null and not exists (select 1 from service_requests where id = p_request and assigned_to = v_adv) and v_kind = 'admin' then
    raise exception 'Esa asesoría no está asignada a ese asesor/a'; end if;
  insert into team_notes (advisor_id, request_id, sender_id, sender_kind, body) values (v_adv, p_request, auth.uid(), v_kind, v_body) returning id into v_id;
  select service_name || ' de ' || (select first_name from profiles where id = r.candidate_id) into v_title from service_requests r where r.id = p_request;
  if v_kind = 'advisor' then
    perform notify_users(array(select user_id from admins), 'team_note', 'Nota de ' || (select first_name from profiles where id = auth.uid()) || coalesce(' · ' || v_title, ''), left(v_body, 140), '/asesores', false);
  else
    perform notify_users(array[v_adv], 'team_note', 'Mensaje de VINKA' || coalesce(' · ' || v_title, ''), left(v_body, 140), case when p_request is null then '/equipo' else '/' end, false);
  end if;
  return v_id;
end $$;
revoke execute on function public.send_team_note(uuid, uuid, text) from public, anon;
grant execute on function public.send_team_note(uuid, uuid, text) to authenticated;

-- ---------- Entrega del asesor y visto bueno de la administración ----------
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
  perform log_service(p_id, 'entrega', 'Marcó la asesoría como entregada', p_note, null, true);
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'service_delivered', 'service_request', p_id, '{}'::jsonb);
  perform notify_users(array[r.candidate_id], 'service_request', r.service_name || ': entregada',
    coalesce(nullif(trim(p_note), ''), 'Tu asesor/a terminó la asesoría. Revisa los archivos y mensajes.'), '/asesoria', true);
  perform notify_users(array(select user_id from admins), 'service_request', 'Por revisar: ' || r.service_name,
    'Un asesor/a entregó una asesoría. Revisa el expediente y da el visto bueno.', '/asesorias', true);
end $$;

create or replace function public.admin_review_request(p_id uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare r service_requests;
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  select * into r from service_requests where id = p_id;
  if r.id is null then raise exception 'Solicitud no encontrada'; end if;
  if r.status <> 'entregada' then raise exception 'Solo se revisan asesorías entregadas por el asesor/a'; end if;
  if p_approve then
    update service_requests set status = 'aprobada', reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now() where id = p_id;
    perform log_service(p_id, 'revision', 'VINKA aprobó la asesoría', p_note, null, false);
    if r.assigned_to is not null then
      perform notify_users(array[r.assigned_to], 'team_note', 'Asesoría aprobada', r.service_name || ': VINKA dio el visto bueno.' || coalesce(' ' || nullif(trim(p_note), ''), ''), '/', false);
    end if;
  else
    if coalesce(trim(p_note), '') = '' then raise exception 'Escribe qué falta para que el asesor/a lo corrija'; end if;
    update service_requests set status = 'en_curso', updated_at = now() where id = p_id;
    perform log_service(p_id, 'revision', 'VINKA devolvió la asesoría con observaciones', p_note, null, false);
    if r.assigned_to is not null then
      insert into team_notes (advisor_id, request_id, sender_id, sender_kind, body) values (r.assigned_to, p_id, auth.uid(), 'admin', 'Observaciones de la revisión: ' || trim(p_note));
      perform notify_users(array[r.assigned_to], 'team_note', 'Asesoría devuelta con observaciones', left(trim(p_note), 140), '/', true);
    end if;
  end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), case when p_approve then 'service_approved' else 'service_returned' end, 'service_request', p_id, jsonb_build_object('note', p_note));
end $$;
revoke execute on function public.admin_review_request(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_request(uuid, boolean, text) to authenticated;

-- la administración puede marcar "aprobada" solo con la revisión; cambios de estado quedan en el historial
create or replace function public.admin_update_service_request(p_id uuid, p_status text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare r service_requests; v_old text;
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  if p_status not in ('solicitada', 'pago_pendiente', 'en_curso', 'entregada', 'cancelada') then raise exception 'Estado no válido (para aprobar usa la revisión)'; end if;
  select status into v_old from service_requests where id = p_id;
  update service_requests set status = p_status, admin_note = left(coalesce(p_note, ''), 1000), updated_at = now() where id = p_id returning * into r;
  if r.id is null then raise exception 'Solicitud no encontrada'; end if;
  if v_old is distinct from p_status then
    perform log_service(p_id, 'estado', 'Estado: ' || replace(p_status, '_', ' '), case when p_status = 'en_curso' and v_old = 'pago_pendiente' then 'Pago confirmado por VINKA' else '' end, null, false);
  end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'service_request', 'service_request', p_id, jsonb_build_object('status', p_status));
  perform notify_users(array[r.candidate_id], 'service_request',
    r.service_name || ': ' || case p_status when 'pago_pendiente' then 'pago pendiente' when 'en_curso' then 'en curso' when 'entregada' then 'entregada' when 'cancelada' then 'cancelada' else 'recibida' end,
    coalesce(nullif(trim(p_note), ''), 'Revisa el detalle en Asesoría con reclutador.'), '/asesoria', p_status in ('pago_pendiente', 'entregada'));
  if r.assigned_to is not null and p_status = 'en_curso' and v_old = 'pago_pendiente' then
    perform notify_users(array[r.assigned_to], 'team_note', 'Pago confirmado: puedes comenzar', r.service_name, '/', true);
  end if;
end $$;

-- ---------- Resúmenes para administración ----------
create or replace function public.admin_service_requests()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'service_id', r.service_id, 'service', r.service_name, 'price', r.price_clp, 'status', r.status, 'goal', r.goal,
      'contact_pref', r.contact_pref, 'note', r.admin_note, 'created_at', r.created_at, 'updated_at', r.updated_at, 'reviewed_at', r.reviewed_at,
      'candidate_id', r.candidate_id, 'name', trim(p.first_name || ' ' || p.last_name), 'email', u.email, 'phone', p.phone,
      'headline', cp.headline, 'comuna', cp.comuna, 'region', cp.region, 'has_experience', cp.has_experience,
      'experiences', cp.experiences, 'education', cp.education, 'skills', cp.skills, 'bio', cp.bio, 'areas', cp.areas,
      'advisor_id', r.assigned_to, 'advisor', (select trim(ap.first_name || ' ' || ap.last_name) from profiles ap where ap.id = r.assigned_to),
      'messages', (select count(*) from service_messages m where m.request_id = r.id),
      'logs', (select count(*) from service_logs l where l.request_id = r.id),
      'minutes', (select coalesce(sum(minutes), 0) from service_logs l where l.request_id = r.id),
      'sessions', (select count(*) from service_sessions s where s.request_id = r.id),
      'picks', (select count(*) from service_job_picks k where k.request_id = r.id),
      'cvs', (select count(*) from cv_files f where f.request_id = r.id),
      'notes', (select count(*) from team_notes t where t.request_id = r.id))
    order by case r.status when 'entregada' then 0 when 'solicitada' then 1 when 'pago_pendiente' then 2 when 'en_curso' then 3 else 4 end, r.created_at desc)
    from service_requests r join profiles p on p.id = r.candidate_id join auth.users u on u.id = r.candidate_id
    left join candidate_profiles cp on cp.user_id = r.candidate_id), '[]'::jsonb);
end $$;

-- Calendario de todas las sesiones (administración)
create or replace function public.admin_sessions(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'request_id', s.request_id, 'starts_at', s.starts_at, 'minutes', s.minutes, 'mode', s.mode,
      'status', s.status, 'link', s.link, 'service', r.service_name,
      'candidate', (select trim(first_name || ' ' || last_name) from profiles where id = r.candidate_id),
      'advisor', (select trim(first_name || ' ' || last_name) from profiles where id = r.assigned_to)) order by s.starts_at)
    from service_sessions s join service_requests r on r.id = s.request_id
    where s.starts_at between p_from and p_to), '[]'::jsonb);
end $$;
revoke execute on function public.admin_sessions(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_sessions(timestamptz, timestamptz) to authenticated;

-- Al borrar la cuenta también se borran los CV guardados
create or replace function public.delete_my_account()
 returns void language plpgsql security definer set search_path to 'public', 'auth' as $function$
begin
  delete from storage.objects where bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text;
  delete from storage.objects where bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text;
  delete from companies where owner_id = auth.uid();
  delete from auth.users where id = auth.uid();
end $function$;

-- Corrección: sugerir ofertas externas (sin vacante de VINKA)
create or replace function public.add_job_pick(p_request uuid, p_job uuid, p_title text, p_company text, p_comuna text, p_url text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r service_requests; v_id uuid; v_title text := left(trim(coalesce(p_title, '')), 120); v_company text := left(coalesce(p_company, ''), 120); v_comuna text := left(coalesce(p_comuna, ''), 80);
begin
  select * into r from service_requests where id = p_request;
  if r.id is null or not (is_admin() or (r.assigned_to = auth.uid() and is_advisor())) then raise exception 'No tienes acceso a esta asesoría'; end if;
  if p_job is not null then
    select jj.title, c.display_name, coalesce(jj.comuna, '') into v_title, v_company, v_comuna
      from jobs jj join companies c on c.id = jj.company_id where jj.id = p_job and jj.status = 'published';
    if not found then raise exception 'Esa vacante ya no está publicada'; end if;
    if exists (select 1 from service_job_picks where request_id = p_request and job_id = p_job) then raise exception 'Ya sugeriste esta vacante'; end if;
  else
    if v_title = '' then raise exception 'Escribe el cargo de la oferta'; end if;
    if coalesce(p_url, '') <> '' and p_url !~* '^https?://' then raise exception 'El enlace debe empezar con https://'; end if;
  end if;
  if not is_admin() and (has_contact_info(p_note) or has_contact_info(p_url)) then raise exception 'No incluyas teléfonos, correos ni redes sociales.'; end if;
  insert into service_job_picks (request_id, job_id, title, company, comuna, url, note, created_by)
  values (p_request, p_job, v_title, v_company, v_comuna, case when p_job is null then left(coalesce(p_url, ''), 500) else '' end, left(coalesce(p_note, ''), 500), auth.uid())
  returning id into v_id;
  perform log_service(p_request, 'oferta', 'Sugirió la oferta: ' || v_title || coalesce(' — ' || nullif(v_company, ''), ''), p_note, null, true);
  return v_id;
end $$;

-- Exportación de datos: CV guardados, sesiones y ofertas sugeridas
do $$
declare d text;
begin
  d := replace(pg_get_functiondef('public.export_my_data()'::regprocedure), '''asesorias'',',
    '''cv_guardados'', coalesce((select jsonb_agg(jsonb_build_object(''archivo'', f.file_name, ''tipo'', f.kind, ''version'', f.version, ''nota'', f.note, ''fecha'', f.created_at) order by f.version) from cv_files f where f.candidate_id = uid), ''[]''::jsonb),
    ''sesiones_asesoria'', coalesce((select jsonb_agg(jsonb_build_object(''inicio'', s.starts_at, ''modalidad'', s.mode, ''estado'', s.status, ''resumen'', s.summary)) from service_sessions s join service_requests r on r.id = s.request_id where r.candidate_id = uid), ''[]''::jsonb),
    ''ofertas_sugeridas'', coalesce((select jsonb_agg(jsonb_build_object(''cargo'', k.title, ''empresa'', k.company, ''estado'', k.status, ''fecha'', k.created_at)) from service_job_picks k join service_requests r on r.id = k.request_id where r.candidate_id = uid), ''[]''::jsonb),
    ''asesorias'',');
  execute d;
end $$;
