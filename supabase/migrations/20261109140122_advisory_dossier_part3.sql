-- Migración aplicada en Supabase (20261109140122). Exportada tal cual desde supabase_migrations.schema_migrations.

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

create or replace function public.delete_my_account()
 returns void language plpgsql security definer set search_path to 'public', 'auth' as $function$
begin
  delete from storage.objects where bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text;
  delete from storage.objects where bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text;
  delete from companies where owner_id = auth.uid();
  delete from auth.users where id = auth.uid();
end $function$;
