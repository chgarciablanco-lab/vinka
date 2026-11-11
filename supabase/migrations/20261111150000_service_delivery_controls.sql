-- Asesorías: controles de entrega y aprobación
-- 1) «Entregada» desde administración exige lo mismo que al asesor/a (todo lo vendido listo). Una asesoría aprobada no cambia de estado.
-- 2) Aprobación excepcional (con algo pendiente): solo administrador total, marcada explícitamente y con motivo de al menos 20 caracteres.
--    La persona recibe un aviso honesto (qué quedó pendiente), no «completa».
create table if not exists backup.service_requests_20261111b as select * from public.service_requests;
alter table public.service_requests add column if not exists approved_with_exception boolean not null default false;

do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.admin_update_service_request'::regproc);
  n := replace(d, 'select status into v_old from service_requests where id = p_id;',
    'select status into v_old from service_requests where id = p_id;
  if v_old = ''aprobada'' then raise exception ''Esta asesoría ya fue aprobada y no puede cambiar de estado''; end if;
  if p_status = ''entregada'' and v_old is distinct from ''entregada'' then
    if v_old <> ''en_curso'' then raise exception ''Solo una asesoría en curso puede pasar a entregada''; end if;
    if service_missing(p_id) is not null then raise exception ''Aún falta para marcarla como entregada: %'', service_missing(p_id); end if;
  end if;');
  if n = d then raise exception 'admin_update_service_request'; end if; execute n;
end $mig$;

drop function if exists public.admin_review_request(uuid, boolean, text);
create function public.admin_review_request(p_id uuid, p_approve boolean, p_note text, p_exception boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare r service_requests; v_missing text;
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  select * into r from service_requests where id = p_id;
  if r.id is null then raise exception 'Solicitud no encontrada'; end if;
  if r.status <> 'entregada' then raise exception 'Solo se revisan asesorías entregadas por el asesor/a'; end if;
  if p_approve then
    v_missing := service_missing(p_id);
    if v_missing is not null then
      if not coalesce(p_exception, false) then
        raise exception 'No se puede aprobar: falta %. Devuélvela al asesor/a o, si corresponde, usa «Aprobar como excepción».', v_missing; end if;
      if not is_admin_total() then raise exception 'Solo un administrador total puede aprobar como excepción'; end if;
      if char_length(btrim(coalesce(p_note, ''))) < 20 then raise exception 'Para aprobar como excepción, explica el motivo (al menos 20 caracteres). Queda registrado.'; end if;
    end if;
    update service_requests set status = 'aprobada', reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now(),
      approved_with_exception = v_missing is not null where id = p_id;
    perform log_service(p_id, 'revision', case when v_missing is null then 'VINKA aprobó la asesoría' else 'VINKA aprobó la asesoría como excepción' end,
      case when v_missing is null then p_note else 'Faltaba: ' || v_missing || '. Motivo: ' || btrim(p_note) end, null, false);
    if v_missing is null then
      perform notify_users(array[r.candidate_id], 'service_request', r.service_name || ': terminada',
        'Tu asesoría está completa y revisada por VINKA. Revisa los archivos y mensajes en Asesoría.', '/asesoria', true);
    else
      perform notify_users(array[r.candidate_id], 'service_request', r.service_name || ': cerrada por VINKA',
        'VINKA cerró tu asesoría. Quedó pendiente: ' || v_missing || '. Si tienes dudas, escríbenos por el chat de la asesoría.', '/asesoria', true);
    end if;
    if r.assigned_to is not null then
      perform notify_users(array[r.assigned_to], 'team_note', case when v_missing is null then 'Asesoría aprobada' else 'Asesoría cerrada como excepción' end,
        r.service_name || ': ' || case when v_missing is null then 'VINKA dio el visto bueno.' else 'VINKA la cerró con pendientes.' end || coalesce(' ' || nullif(btrim(p_note), ''), ''), '/', false);
    end if;
  else
    if coalesce(btrim(p_note), '') = '' then raise exception 'Escribe qué falta para que el asesor/a lo corrija'; end if;
    update service_requests set status = 'en_curso', updated_at = now() where id = p_id;
    perform log_service(p_id, 'revision', 'VINKA devolvió la asesoría con observaciones', p_note, null, false);
    if r.assigned_to is not null then
      insert into team_notes (advisor_id, request_id, sender_id, sender_kind, body) values (r.assigned_to, p_id, auth.uid(), 'admin', 'Observaciones de la revisión: ' || btrim(p_note));
      perform notify_users(array[r.assigned_to], 'team_note', 'Asesoría devuelta con observaciones', left(btrim(p_note), 140), '/', true);
    end if;
  end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), case when not p_approve then 'service_returned' when v_missing is null then 'service_approved' else 'service_approved_exception' end,
    'service_request', p_id, jsonb_build_object('note', p_note, 'missing', v_missing));
end $$;
revoke execute on function public.admin_review_request(uuid, boolean, text, boolean) from public, anon;
grant execute on function public.admin_review_request(uuid, boolean, text, boolean) to authenticated;
