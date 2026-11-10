-- Asesorías: mensaje automático al confirmar el pago, plazo de primer contacto con alerta, entregables medibles
-- antes de entregar, aviso a la persona solo tras la revisión de VINKA, y WhatsApp oficial de VINKA atendido por el asesor/a.
create table if not exists backup.service_requests_20261109 as select * from public.service_requests;
create table if not exists backup.career_services_20261109 as select * from public.career_services;

alter table public.service_messages drop constraint if exists service_messages_sender_kind_check;
alter table public.service_messages add constraint service_messages_sender_kind_check check (sender_kind = any (array['candidate', 'advisor', 'admin', 'system']));
alter table public.service_logs drop constraint if exists service_logs_kind_check;
alter table public.service_logs add constraint service_logs_kind_check check (kind = any (array['cv', 'sesion', 'busqueda', 'oferta', 'nota', 'entrega', 'revision', 'estado', 'seguimiento']));
alter table public.service_requests add column if not exists started_at timestamptz;
alter table public.service_requests add column if not exists contact_alert_at timestamptz;
alter table public.career_services add column if not exists requirements jsonb not null default '{}'::jsonb;

-- Lo que debe estar hecho para entregar cada servicio (medible en el expediente)
update public.career_services set requirements = '{"advisor_files":1}' where id = 'cv';
update public.career_services set requirements = '{"sessions":1,"session_minutes":45,"picks":10}' where id = 'busqueda';
update public.career_services set requirements = '{"advisor_files":1,"sessions":2,"session_minutes":75,"picks":10,"followups":2}' where id = 'completa';
update public.career_services set includes = array['Todo lo de Revisión de CV', 'Todo lo de Asesoría de búsqueda', 'Simulación de entrevista de 30 minutos',
  'Seguimiento por WhatsApp durante 2 semanas con tu asesor/a, desde el WhatsApp oficial de VINKA'] where id = 'completa';

-- Ajustes visibles para personas con sesión (por ahora: WhatsApp oficial de VINKA)
create table if not exists public.app_settings (key text primary key, value text not null default '', updated_at timestamptz not null default now());
alter table public.app_settings enable row level security;
drop policy if exists "ajustes: leer" on public.app_settings;
create policy "ajustes: leer" on public.app_settings for select to authenticated using (true);
insert into public.app_settings (key, value) values ('whatsapp_vinka', '') on conflict (key) do nothing;
create or replace function public.admin_set_setting(p_key text, p_value text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  if p_key not in ('whatsapp_vinka') then raise exception 'Ajuste no válido'; end if;
  if p_key = 'whatsapp_vinka' and coalesce(p_value, '') <> '' and regexp_replace(p_value, '\D', '', 'g') !~ '^569\d{8}$' then
    raise exception 'Escribe un celular chileno con código: +56 9 1234 5678'; end if;
  insert into app_settings (key, value, updated_at) values (p_key, case when p_key = 'whatsapp_vinka' then regexp_replace(coalesce(p_value, ''), '\D', '', 'g') else coalesce(p_value, '') end, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;
revoke execute on function public.admin_set_setting(text, text) from public, anon;
grant execute on function public.admin_set_setting(text, text) to authenticated;

-- Los mensajes sin autor son mensajes automáticos de VINKA
create or replace function public.service_message_kind() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
begin
  new.sender_kind := case
    when new.sender_id is null then 'system'
    when exists (select 1 from service_requests r where r.id = new.request_id and r.candidate_id = new.sender_id) then 'candidate'
    when exists (select 1 from advisors a where a.user_id = new.sender_id) then 'advisor'
    else 'admin' end;
  return new;
end $function$;

-- La persona responde apenas exista un mensaje de VINKA (automático, asesor/a o administración)
create or replace function public.service_chat_advisor_first() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare r service_requests;
begin
  select * into r from service_requests where id = new.request_id;
  if new.sender_id = r.candidate_id and not exists (select 1 from service_messages x where x.request_id = new.request_id and x.sender_id is distinct from r.candidate_id) then
    raise exception 'Tu asesor/a inicia la conversación. Podrás responder apenas te escriba.';
  end if;
  return new;
end $function$;

-- Mensaje automático al confirmar el pago (la primera vez que pasa a "en curso")
create or replace function public.service_welcome_text(r service_requests) returns text
language sql stable security definer set search_path = public as $$
  select 'Hola ' || coalesce(nullif(p.first_name, ''), '') || ', confirmamos el pago de tu «' || r.service_name || '». '
    || 'Tu asesor/a' || coalesce(' ' || nullif(r.assigned_name, ''), '') || ' te escribirá por este chat dentro de 1 día hábil para coordinar los próximos pasos. '
    || coalesce('Plazo del servicio: ' || nullif(cs.delivery, '') || '. ', '')
    || case when r.service_id = 'completa' then 'El seguimiento de 2 semanas también puede ser por el WhatsApp oficial de VINKA, con tu mismo asesor/a. ' else '' end
    || 'Si tienes dudas, puedes escribir aquí cuando quieras. — Mensaje automático de VINKA'
  from profiles p left join career_services cs on cs.id = r.service_id where p.id = r.candidate_id
$$;
revoke execute on function public.service_welcome_text(service_requests) from public, anon, authenticated;

create or replace function public.service_on_start() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'en_curso' and new.started_at is null then
    new.started_at := now();
    insert into service_messages (request_id, sender_id, body) values (new.id, null, service_welcome_text(new));
  end if;
  return new;
end $$;
drop trigger if exists service_on_start on public.service_requests;
create trigger service_on_start before update of status on public.service_requests for each row execute function public.service_on_start();

-- Asesorías en curso hoy sin ningún mensaje de VINKA: reciben el mensaje automático (la persona ya puede escribir)
update public.service_requests r set started_at = coalesce(r.started_at, r.updated_at)
where r.status in ('en_curso', 'entregada', 'aprobada') and r.started_at is null;
insert into public.service_messages (request_id, sender_id, body)
select r.id, null, service_welcome_text(r) from public.service_requests r
where r.status = 'en_curso' and not exists (select 1 from service_messages m where m.request_id = r.id and m.sender_id is distinct from r.candidate_id);

-- Alerta si en 24 horas desde el pago nadie de VINKA escribió (además del mensaje automático)
create or replace function public.service_contact_alerts() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  for r in select sr.* from service_requests sr
    where sr.status = 'en_curso' and sr.started_at < now() - interval '24 hours' and sr.contact_alert_at is null
      and not exists (select 1 from service_messages m where m.request_id = sr.id and m.sender_kind in ('advisor', 'admin'))
  loop
    update service_requests set contact_alert_at = now() where id = r.id;
    perform notify_users(array(select user_id from admins), 'service_request', 'Sin primer contacto: ' || r.service_name,
      'Pasaron 24 horas desde el pago y nadie le ha escrito a la persona. Revisa la asignación.', '/asesorias', true);
    if r.assigned_to is not null then
      perform notify_users(array[r.assigned_to], 'team_note', 'Escríbele hoy: ' || r.service_name, 'Pasaron 24 horas desde el pago y la persona aún no recibe tu primer mensaje.', '/', true);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.service_contact_alerts() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'vinka-asesorias-contacto';
select cron.schedule('vinka-asesorias-contacto', '40 * * * *', 'select public.service_contact_alerts()');

-- Avance medible de lo vendido
create or replace function public.service_progress(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r service_requests; q jsonb; out jsonb := '[]'::jsonb; v int;
begin
  if not can_access_request(p_id) then raise exception 'No tienes acceso a esta asesoría'; end if;
  select * into r from service_requests where id = p_id;
  select coalesce(requirements, '{}'::jsonb) into q from career_services where id = r.service_id;
  if q ? 'advisor_files' then
    select count(*) into v from service_messages where request_id = p_id and file_path is not null and sender_kind in ('advisor', 'admin');
    out := out || jsonb_build_object('key', 'advisor_files', 'label', 'CV mejorado enviado por el chat', 'need', (q->>'advisor_files')::int, 'have', v);
  end if;
  if q ? 'sessions' then
    select count(*) into v from service_sessions where request_id = p_id and status = 'realizada';
    out := out || jsonb_build_object('key', 'sessions', 'label', 'Sesiones realizadas', 'need', (q->>'sessions')::int, 'have', v);
  end if;
  if q ? 'session_minutes' then
    select coalesce(sum(minutes), 0) into v from service_sessions where request_id = p_id and status = 'realizada';
    out := out || jsonb_build_object('key', 'session_minutes', 'label', 'Minutos de sesión', 'need', (q->>'session_minutes')::int, 'have', v);
  end if;
  if q ? 'picks' then
    select count(*) into v from service_job_picks where request_id = p_id;
    out := out || jsonb_build_object('key', 'picks', 'label', 'Ofertas recomendadas', 'need', (q->>'picks')::int, 'have', v);
  end if;
  if q ? 'followups' then
    select count(*) into v from service_logs where request_id = p_id and kind = 'seguimiento';
    out := out || jsonb_build_object('key', 'followups', 'label', 'Seguimientos registrados (WhatsApp o chat)', 'need', (q->>'followups')::int, 'have', v);
  end if;
  return (select coalesce(jsonb_agg(x || jsonb_build_object('ok', (x->>'have')::int >= (x->>'need')::int)), '[]'::jsonb) from jsonb_array_elements(out) x);
end $$;
revoke execute on function public.service_progress(uuid) from public, anon;
grant execute on function public.service_progress(uuid) to authenticated;

create or replace function public.service_missing(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select string_agg((x->>'label') || ' (' || (x->>'have') || ' de ' || (x->>'need') || ')', '; ')
  from jsonb_array_elements(service_progress(p_id)) x where not (x->>'ok')::boolean
$$;
revoke execute on function public.service_missing(uuid) from public, anon;
grant execute on function public.service_missing(uuid) to authenticated;

-- Registrar seguimientos (WhatsApp oficial o chat)
create or replace function public.add_service_log(p_request uuid, p_kind text, p_title text, p_detail text, p_minutes integer, p_visible boolean)
 returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not (is_admin() or exists (select 1 from service_requests where id = p_request and assigned_to = auth.uid() and is_advisor())) then
    raise exception 'No tienes acceso a esta asesoría'; end if;
  if p_kind not in ('cv', 'sesion', 'busqueda', 'oferta', 'nota', 'seguimiento') then raise exception 'Tipo no válido'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Escribe qué hiciste'; end if;
  if coalesce(p_visible, true) and not is_admin() and (has_contact_info(p_title) or has_contact_info(p_detail)) then
    raise exception 'El registro visible para la persona no puede incluir teléfonos, correos ni redes sociales.'; end if;
  perform log_service(p_request, p_kind, p_title, p_detail, p_minutes, coalesce(p_visible, true));
end $function$;

-- Entregar exige lo vendido; la persona recibe el aviso recién con la aprobación de VINKA
create or replace function public.advisor_deliver(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path to 'public' as $function$
declare r service_requests; v_missing text;
begin
  if not is_advisor() then raise exception 'Solo asesores de VINKA'; end if;
  select * into r from service_requests where id = p_id and assigned_to = auth.uid();
  if r.id is null then raise exception 'Esta asesoría no está asignada a ti'; end if;
  if r.status <> 'en_curso' then raise exception 'Solo puedes entregar una asesoría en curso. VINKA la activa al confirmar el pago.'; end if;
  if has_contact_info(p_note) then raise exception 'La nota no puede incluir teléfonos, correos ni redes sociales.'; end if;
  v_missing := service_missing(p_id);
  if v_missing is not null then raise exception 'Aún falta para entregar: %', v_missing; end if;
  update service_requests set status = 'entregada', admin_note = left(coalesce(p_note, ''), 1000), updated_at = now() where id = p_id;
  perform log_service(p_id, 'entrega', 'Entregó la asesoría para la revisión de VINKA', p_note, null, true);
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'service_delivered', 'service_request', p_id, '{}'::jsonb);
  perform notify_users(array(select user_id from admins), 'service_request', 'Por revisar: ' || r.service_name,
    'Un asesor/a entregó una asesoría. Revisa el expediente y da el visto bueno.', '/asesorias', true);
end $function$;

create or replace function public.admin_review_request(p_id uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path to 'public' as $function$
declare r service_requests; v_missing text;
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  select * into r from service_requests where id = p_id;
  if r.id is null then raise exception 'Solicitud no encontrada'; end if;
  if r.status <> 'entregada' then raise exception 'Solo se revisan asesorías entregadas por el asesor/a'; end if;
  if p_approve then
    v_missing := service_missing(p_id);
    if v_missing is not null and coalesce(trim(p_note), '') = '' then
      raise exception 'Falta: %. Para aprobar igual, escribe por qué (queda registrado).', v_missing; end if;
    update service_requests set status = 'aprobada', reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now() where id = p_id;
    perform log_service(p_id, 'revision', case when v_missing is null then 'VINKA aprobó la asesoría' else 'VINKA aprobó la asesoría como excepción' end,
      case when v_missing is null then p_note else 'Faltaba: ' || v_missing || '. Motivo: ' || p_note end, null, false);
    perform notify_users(array[r.candidate_id], 'service_request', r.service_name || ': terminada',
      'Tu asesoría está completa y revisada por VINKA. Revisa los archivos y mensajes en Asesoría.', '/asesoria', true);
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
  values (auth.uid(), case when p_approve then 'service_approved' else 'service_returned' end, 'service_request', p_id, jsonb_build_object('note', p_note, 'missing', v_missing));
end $function$;
