-- P1 · Asignación de asesores: respetar la elección del postulante, verificar disponibilidad y cupo,
-- reemplazo solo con su consentimiento, y asignaciones excepcionales justificadas y auditadas.
create schema if not exists backup;
create table if not exists backup.fn_admin_assign_request_p1_20261112 as
  select now() as saved_at, pg_get_functiondef('public.admin_assign_request(uuid, uuid)'::regprocedure) as def;
create table if not exists backup.fn_request_change_advisor_20261112 as
  select now() as saved_at, pg_get_functiondef('public.request_change_advisor(uuid, uuid)'::regprocedure) as def;
create table if not exists backup.fn_advisor_load_20261112 as
  select now() as saved_at, pg_get_functiondef('public.advisor_load(uuid)'::regprocedure) as def;

-- 1) Propuesta de reemplazo que el postulante acepta o no
alter table public.service_requests add column if not exists proposed_advisor uuid references public.advisors(user_id) on delete set null;
alter table public.service_requests add column if not exists proposal_note text not null default '';
alter table public.service_requests add column if not exists proposed_at timestamptz;

-- 2) Una sola solicitud abierta por persona y servicio, también ante dos toques simultáneos
create unique index if not exists service_requests_one_open
  on public.service_requests (candidate_id, service_id) where status in ('solicitada', 'pago_pendiente', 'en_curso');

-- 3) El cupo cuenta toda asesoría ya asignada que no ha terminado
create or replace function public.advisor_load(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from service_requests where assigned_to = p_user and status in ('solicitada', 'pago_pendiente', 'en_curso')
$$;

-- 4) Por qué un asesor no puede tomar un servicio (null = puede). Una sola regla para la app y la base de datos.
create or replace function public.advisor_unavailable_reason(p_user uuid, p_service text default null)
returns text language sql stable security definer set search_path = public as $$
  select case
    when a.user_id is null then 'no es asesor/a de VINKA'
    when not a.active then 'su cuenta está inactiva'
    when ap.pub is null then 'no tiene perfil aprobado'
    when ap.hidden then 'su perfil está oculto'
    when p_service is not null and not (ap.pub->'services' ? p_service) then 'no ofrece este servicio'
    when not ap.accepting then 'pausó la recepción de solicitudes'
    when advisor_load(a.user_id) >= ap.max_active then 'tiene el cupo lleno (' || advisor_load(a.user_id) || ' de ' || ap.max_active || ')'
  end
  from (select p_user as id) x left join advisors a on a.user_id = x.id left join advisor_profiles ap on ap.user_id = x.id
$$;

create or replace function public.advisor_available(p_user uuid, p_service text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select advisor_unavailable_reason(p_user, p_service) is null
$$;

-- 5) Asignación efectiva (uso interno): guarda, registra y avisa
create or replace function public.service_do_assign(p_id uuid, p_advisor uuid, p_exception text, p_by text)
returns void language plpgsql security definer set search_path = public as $$
declare r service_requests; v_name text;
begin
  update service_requests set assigned_to = p_advisor, assigned_name = coalesce((select first_name from profiles where id = p_advisor), ''),
         proposed_advisor = null, proposal_note = '', proposed_at = null, updated_at = now()
   where id = p_id returning * into r;
  insert into audit_logs (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), case when p_exception is not null then 'service_assigned_exception' else 'service_assigned' end, 'service_request', p_id,
    jsonb_build_object('advisor', p_advisor, 'preferred', r.preferred_advisor, 'choice', r.choice, 'by', p_by, 'reason', p_exception));
  if p_exception is not null then
    perform log_service(p_id, 'revision', 'Asignación excepcional de VINKA', p_exception, null, false);
  end if;
  if p_advisor is not null then
    select coalesce((select pub->>'display_name' from advisor_profiles where user_id = p_advisor), trim(first_name || ' ' || last_name)) into v_name from profiles where id = p_advisor;
    perform notify_users(array[p_advisor], 'service_request', 'Te asignaron: ' || r.service_name, 'Revisa la solicitud en tu panel de asesorías.', '/asesorias', true);
    perform notify_users(array[r.candidate_id], 'service_request', 'Ya tienes asesor/a',
      coalesce(v_name, 'Un reclutador') || ' te acompañará en tu ' || r.service_name
      || case when p_exception is not null then '. VINKA lo asignó de forma excepcional: ' || left(p_exception, 160) else '' end
      || '. Conversen desde Asesoría con reclutador.', '/asesoria', false);
  end if;
end $$;

-- 6) Asignar (administración). Con elección del postulante: solo a su elegido/a. Siempre: asesor/a disponible.
--    Fuera de eso, solo como excepción con motivo (queda registrada y se avisa al postulante).
drop function if exists public.admin_assign_request(uuid, uuid);
create function public.admin_assign_request(p_id uuid, p_advisor uuid, p_exception text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r service_requests; v_reason text; v_consent boolean; v_exc text := nullif(btrim(coalesce(p_exception, '')), '');
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  select * into r from service_requests where id = p_id for update;
  if r.id is null then raise exception 'Solicitud no encontrada'; end if;
  if r.status not in ('solicitada', 'pago_pendiente', 'en_curso', 'entregada') then raise exception 'Esta asesoría ya terminó'; end if;
  if p_advisor is not null then
    -- Bloquea al asesor mientras se verifica su cupo (evita que dos asignaciones ocupen el último cupo)
    perform 1 from advisor_profiles where user_id = p_advisor for update;
    if p_advisor is not distinct from r.assigned_to then return; end if;
    v_reason := advisor_unavailable_reason(p_advisor, r.service_id);
    v_consent := r.choice = 'vinka' or p_advisor = r.preferred_advisor;
    if (v_reason is not null or not v_consent) then
      if v_exc is null then
        raise exception '%', case when not v_consent then 'El postulante eligió a otra persona. Propónle este reemplazo para que lo acepte, o asígnalo como excepción con un motivo.'
          else 'No se puede asignar: ' || v_reason || '. Elige a otra persona, propón un reemplazo o asígnalo como excepción con un motivo.' end;
      end if;
      if char_length(v_exc) < 20 then raise exception 'Para asignar como excepción, explica el motivo (al menos 20 caracteres). Queda registrado y el postulante lo verá.'; end if;
      if not exists (select 1 from advisors where user_id = p_advisor and active) then
        raise exception 'No se puede asignar a una cuenta inactiva, ni como excepción'; end if;
    else
      v_exc := null;
    end if;
  else
    v_exc := null;
    if r.status in ('en_curso', 'entregada') then raise exception 'Una asesoría en curso no puede quedar sin asesor/a. Asigna a otra persona.'; end if;
  end if;
  perform service_do_assign(p_id, p_advisor, v_exc, 'admin');
end $$;

-- 7) Proponer un reemplazo al postulante (no cambia nada hasta que acepte)
create or replace function public.admin_propose_advisor(p_id uuid, p_advisor uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare r service_requests; v_reason text; v_name text;
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  select * into r from service_requests where id = p_id for update;
  if r.id is null or r.status not in ('solicitada', 'pago_pendiente', 'en_curso') then raise exception 'Solo se proponen reemplazos en asesorías abiertas'; end if;
  if p_advisor is null or p_advisor is not distinct from r.assigned_to then raise exception 'Elige a la persona que propones'; end if;
  v_reason := advisor_unavailable_reason(p_advisor, r.service_id);
  if v_reason is not null then raise exception 'No se puede proponer: %', v_reason; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'Explícale al postulante por qué propones el cambio (al menos 10 caracteres)'; end if;
  update service_requests set proposed_advisor = p_advisor, proposal_note = left(btrim(p_note), 300), proposed_at = now(), updated_at = now() where id = p_id;
  select coalesce((select pub->>'display_name' from advisor_profiles where user_id = p_advisor), first_name) into v_name from profiles where id = p_advisor;
  insert into audit_logs (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'service_advisor_proposed', 'service_request', p_id, jsonb_build_object('advisor', p_advisor, 'preferred', r.preferred_advisor, 'note', p_note));
  perform notify_users(array[r.candidate_id], 'service_request', 'VINKA te propone a ' || v_name,
    left(btrim(p_note), 140) || ' Acepta, elige a otra persona o deja que VINKA elija.', '/asesoria', true);
end $$;

-- 8) El postulante responde a la propuesta: al aceptar, queda asignado/a de inmediato
create or replace function public.request_answer_proposal(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r service_requests; v_reason text;
begin
  select * into r from service_requests where id = p_id and candidate_id = auth.uid() for update;
  if r.id is null or r.proposed_advisor is null then raise exception 'No hay una propuesta pendiente'; end if;
  if not p_accept then
    update service_requests set proposed_advisor = null, proposal_note = '', proposed_at = null, updated_at = now() where id = p_id;
    insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'service_proposal_declined', 'service_request', p_id, jsonb_build_object('advisor', r.proposed_advisor));
    perform notify_users(array(select user_id from admins), 'service_request', 'Propuesta rechazada: ' || r.service_name, 'El postulante no aceptó el reemplazo propuesto.', '/asesorias', false);
    return;
  end if;
  perform 1 from advisor_profiles where user_id = r.proposed_advisor for update;
  v_reason := advisor_unavailable_reason(r.proposed_advisor, r.service_id);
  if v_reason is not null then raise exception 'Esa persona ya no está disponible (%). Elige a otra o deja que VINKA elija.', v_reason; end if;
  update service_requests set preferred_advisor = r.proposed_advisor, choice = 'asesor' where id = p_id;
  perform service_do_assign(p_id, r.proposed_advisor, null, 'postulante');
  perform notify_users(array(select user_id from admins), 'service_request', 'Reemplazo aceptado: ' || r.service_name, 'El postulante aceptó y quedó asignado/a.', '/asesorias', false);
end $$;

-- 9) Cambiar la elección: antes del pago, siempre; después, solo si VINKA propuso un cambio o su asesor/a quedó inactivo/a
create or replace function public.request_change_advisor(p_request uuid, p_advisor uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare r service_requests; v_adv text; v_reason text;
begin
  select * into r from service_requests where id = p_request and candidate_id = auth.uid() for update;
  if r.id is null then raise exception 'Solicitud no encontrada'; end if;
  if not (r.status in ('solicitada', 'pago_pendiente')
          or (r.status = 'en_curso' and (r.proposed_advisor is not null or exists (select 1 from advisors where user_id = r.assigned_to and not active)))) then
    raise exception 'La asesoría ya empezó: para cambiar de asesor/a, escríbele a VINKA por el chat'; end if;
  if p_advisor is not null then
    v_reason := advisor_unavailable_reason(p_advisor, r.service_id);
    if v_reason is not null then raise exception 'Esa persona no está disponible ahora (%). Elige a otra o deja que VINKA elija.', v_reason; end if;
  end if;
  update service_requests set preferred_advisor = p_advisor, choice = case when p_advisor is null then 'vinka' else 'asesor' end,
         proposed_advisor = null, proposal_note = '', proposed_at = null, updated_at = now() where id = r.id;
  select pub->>'display_name' into v_adv from advisor_profiles where user_id = p_advisor;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'service_choice_changed', 'service_request', r.id, jsonb_build_object('advisor', p_advisor));
  perform notify_users(array(select user_id from admins), 'service_request', 'Cambio de asesor/a: ' || r.service_name,
    coalesce('Ahora prefiere a ' || v_adv, 'Ahora deja que VINKA elija') || '.', '/asesorias', false);
end $$;

-- 10) Administración: ¿puede asignar a esta persona sin excepción? (para avisar antes de intentarlo)
create or replace function public.admin_assign_check(p_id uuid, p_advisor uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r service_requests;
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  select * into r from service_requests where id = p_id;
  return jsonb_build_object('reason', advisor_unavailable_reason(p_advisor, r.service_id),
    'consent', r.choice = 'vinka' or p_advisor = r.preferred_advisor);
end $$;

-- 11) La lista de solicitudes de VINKA muestra la propuesta pendiente y si el asesor asignado quedó inactivo
do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.admin_service_requests()'::regprocedure);
  n := replace(d, '''choice'', r.choice, ''preferred_id'', r.preferred_advisor,',
    '''choice'', r.choice, ''preferred_id'', r.preferred_advisor, ''proposed_id'', r.proposed_advisor, ''proposal_note'', r.proposal_note,'
    || ' ''proposed'', (select coalesce(ap.pub->>''display_name'', trim(pp.first_name || '' '' || pp.last_name)) from profiles pp left join advisor_profiles ap on ap.user_id = pp.id where pp.id = r.proposed_advisor),'
    || ' ''advisor_inactive'', exists (select 1 from advisors ax where ax.user_id = r.assigned_to and not ax.active),'
    || ' ''preferred_issue'', case when r.preferred_advisor is null then null else advisor_unavailable_reason(r.preferred_advisor, r.service_id) end,');
  if n = d then raise exception 'admin_service_requests: no se encontró dónde agregar la propuesta'; end if;
  execute n;
end $m$;

do $g$
declare f text;
begin
  foreach f in array array['admin_assign_request(uuid, uuid, text)', 'admin_propose_advisor(uuid, uuid, text)', 'request_answer_proposal(uuid, boolean)',
    'request_change_advisor(uuid, uuid)', 'admin_assign_check(uuid, uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['service_do_assign(uuid, uuid, text, text)', 'advisor_unavailable_reason(uuid, text)', 'advisor_available(uuid, text)', 'advisor_load(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $g$;
