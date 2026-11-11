-- Notas internas asesor/a ↔ VINKA: cada nota trae el caso (persona, servicio, estado) y la lista de casos para elegir al escribir.
create or replace function public.team_notes_list(p_advisor uuid default null, p_request uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_adv uuid;
begin
  if is_admin() then v_adv := coalesce(p_advisor, (select assigned_to from service_requests where id = p_request));
  elsif is_advisor() then v_adv := auth.uid();
  else raise exception 'Solo asesores y administración de VINKA'; end if;
  if p_request is not null and not exists (select 1 from service_requests where id = p_request and (is_admin() or assigned_to = auth.uid())) then raise exception 'Sin acceso'; end if;
  return jsonb_build_object(
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'sender_kind', t.sender_kind, 'body', t.body, 'created_at', t.created_at, 'request_id', t.request_id,
        'case', case when r.id is null then null else jsonb_build_object('name', trim(p.first_name || ' ' || left(coalesce(p.last_name, ''), 1) || case when coalesce(p.last_name, '') <> '' then '.' else '' end),
          'service', r.service_name, 'status', r.status) end) order by t.created_at)
      from team_notes t left join service_requests r on r.id = t.request_id left join profiles p on p.id = r.candidate_id
      where (p_request is not null and t.request_id = p_request) or (p_request is null and t.advisor_id = v_adv)), '[]'::jsonb),
    'cases', case when p_request is not null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', r.id,
        'name', trim(p.first_name || ' ' || left(coalesce(p.last_name, ''), 1) || case when coalesce(p.last_name, '') <> '' then '.' else '' end), 'service', r.service_name, 'status', r.status) order by r.updated_at desc)
      from service_requests r join profiles p on p.id = r.candidate_id where r.assigned_to = v_adv and r.status not in ('cancelada')), '[]'::jsonb) end);
end $$;
revoke execute on function public.team_notes_list(uuid, uuid) from public, anon;
grant execute on function public.team_notes_list(uuid, uuid) to authenticated;

-- Avisos de notas: enlazan al caso
do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.send_team_note'::regproc);
  n := replace(d, 'left(v_body, 140), ''/asesores'', false);', 'left(v_body, 140), case when p_request is null then ''/asesores'' else ''/asesorias?caso='' || p_request end, false);');
  n := replace(n, 'case when p_request is null then ''/equipo'' else ''/'' end, false);', 'case when p_request is null then ''/equipo'' else ''/?caso='' || p_request end, false);');
  if n = d or position('caso=' in n) = 0 then raise exception 'send_team_note'; end if; execute n;
end $mig$;
