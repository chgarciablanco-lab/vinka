-- Migración aplicada en Supabase (20261109140044). Exportada tal cual desde supabase_migrations.schema_migrations.

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
