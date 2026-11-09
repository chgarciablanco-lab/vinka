-- Migración aplicada en Supabase (20261109140013). Exportada tal cual desde supabase_migrations.schema_migrations.

alter table public.service_requests drop constraint if exists service_requests_status_check;
alter table public.service_requests add constraint service_requests_status_check
  check (status in ('solicitada', 'pago_pendiente', 'en_curso', 'entregada', 'aprobada', 'cancelada'));
alter table public.service_requests add column if not exists reviewed_at timestamptz;
alter table public.service_requests add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
create index if not exists idx_service_requests_reviewed_by on public.service_requests (reviewed_by);

create or replace function public.is_advisor_of(p_candidate uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_advisor() and exists (select 1 from service_requests r where r.candidate_id = p_candidate and r.assigned_to = auth.uid() and r.status <> 'cancelada')
$$;

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
