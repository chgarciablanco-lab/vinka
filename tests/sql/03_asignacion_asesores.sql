do $t$
declare r text := ''; e text; j jsonb; n int;
  adm uuid := 'a2fe2ae1-48a1-42b8-80a3-2fbb3edbf1d4';
  caro uuid := '5f54257e-01f8-4ad2-9a7e-7671f7a47380';
  feli uuid := 'f48354d0-5e3a-4da5-9189-8271eb88a90b';
  javi uuid := 'c456dfdf-549a-4772-8eb0-53c1427d66b4';
  diego uuid := 'ff07a334-e037-4690-b649-a309e10638cc';
  nova uuid := 'ef0495a9-8dde-4995-8d52-b12969fe71d3';
  q1 uuid; q2 uuid; q3 uuid;
begin
  -- Preparación (se deshace): Diego sin solicitudes abiertas; Javiera con perfil aprobado para probar reemplazos
  update service_requests set status = 'cancelada' where candidate_id = diego and status in ('solicitada', 'pago_pendiente', 'en_curso');
  update advisor_profiles set pub = jsonb_build_object('display_name', 'Javiera Pérez', 'bio', 'x', 'services', jsonb_build_array('cv', 'busqueda', 'completa')) where user_id = javi;
  perform set_config('request.jwt.claims', json_build_object('sub', diego, 'role','authenticated')::text, true); set local role authenticated;
  q1 := request_career_service('cv', 'Mejorar CV', 'chat', true, caro);
  q2 := request_career_service('busqueda', '', 'chat', true, null);
  q3 := request_career_service('completa', '', 'chat', true, caro);
  begin perform request_career_service('cv', '', 'chat', true, null); e := 'DUPLICÓ (mal)'; exception when others then e := 'bloqueado'; end;
  reset role;
  begin insert into service_requests (candidate_id, service_id, service_name, price_clp, status) values (diego, 'cv', 'x', 1, 'solicitada'); e := e || ' · por debajo DUPLICÓ (mal)'; exception when unique_violation then e := e || ' · también bloqueado en la base de datos'; end;
  r := r || '1. Solicitud duplicada → ' || e || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true); set local role authenticated;
  j := admin_assign_check(q1, feli); r := r || '2. Revisar a Felipe para Diego (eligió a Carolina): ' || j::text || E'\n';
  begin perform admin_assign_request(q1, feli); e := 'ASIGNÓ (mal)'; exception when others then e := sqlerrm; end;
  r := r || '3. Asignar a Felipe sin consentimiento → ' || e || E'\n';
  begin perform admin_assign_request(q1, feli, 'corto'); e := 'ASIGNÓ (mal)'; exception when others then e := 'motivo corto bloqueado'; end;
  r := r || '4. Excepción con motivo corto → ' || e || E'\n';
  perform admin_assign_request(q1, caro);
  r := r || '5. Asignar a Carolina (su elegida) → ' || ((select assigned_to from service_requests where id = q1) = caro) || E'\n';
  begin perform admin_assign_request(q2, feli); e := 'ASIGNÓ (mal)'; exception when others then e := sqlerrm; end;
  r := r || '6. «VINKA elige» pero Felipe sin perfil → ' || e || E'\n';
  perform admin_assign_request(q2, feli, 'Felipe es especialista en logística y Diego busca bodega');
  reset role;
  r := r || '7. Excepción justificada → asignado=' || ((select assigned_to from service_requests where id = q2) = feli)
    || ' · auditoría=' || exists (select 1 from audit_logs where entity_id = q2 and action = 'service_assigned_exception')
    || ' · aviso a Diego con motivo=' || exists (select 1 from notifications where user_id = diego and body like '%excepcional%') || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true); set local role authenticated;
  reset role; n := advisor_load(caro); set local role authenticated; -- advisor_load es interna: se calcula fuera del rol de la app
  perform admin_advisor_profile_set(caro, null, null, n);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true); set local role authenticated;
  begin perform admin_assign_request(q3, caro); e := 'ASIGNÓ (mal)'; exception when others then e := sqlerrm; end;
  r := r || '8. Carolina con cupo lleno → ' || e || E'\n';
  begin perform admin_propose_advisor(q3, feli, 'Carolina no tiene cupo esta semana'); e := 'PROPUSO (mal)'; exception when others then e := sqlerrm; end;
  r := r || '9. Proponer a Felipe (sin perfil) → ' || e || E'\n';
  perform admin_propose_advisor(q3, javi, 'Carolina no tiene cupo esta semana');
  select x into j from jsonb_array_elements(admin_service_requests()) x where x->>'id' = q3::text;
  r := r || '10. Propuesta enviada: VINKA ve propuesto=' || (j->>'proposed') || ' · problema de la elegida=' || (j->>'preferred_issue') || E'\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', diego, 'role','authenticated')::text, true); set local role authenticated;
  r := r || '11. Diego ve la propuesta en su ficha: ' || ((select proposed_advisor from service_requests where id = q3) = javi) || E'\n';
  perform request_answer_proposal(q3, true); reset role;
  r := r || '12. Diego acepta → asignada=' || ((select assigned_to from service_requests where id = q3) = javi) || ' · ahora su elegida=' || ((select preferred_advisor from service_requests where id = q3) = javi) || ' · propuesta limpia=' || ((select proposed_advisor from service_requests where id = q3) is null) || E'\n';
  update service_requests set status = 'en_curso' where id = q1;
  perform set_config('request.jwt.claims', json_build_object('sub', diego, 'role','authenticated')::text, true); set local role authenticated;
  begin perform request_change_advisor(q1, null); e := 'CAMBIÓ (mal)'; exception when others then e := 'bloqueado'; end; reset role;
  r := r || '13. Cambiar después del pago sin propuesta → ' || e || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true); set local role authenticated;
  begin perform admin_assign_request(q1, null); e := 'DEJÓ SIN ASESOR (mal)'; exception when others then e := 'bloqueado'; end;
  perform admin_propose_advisor(q1, javi, 'Carolina estará con licencia unos días');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', diego, 'role','authenticated')::text, true); set local role authenticated;
  perform request_change_advisor(q1, null); reset role;
  r := r || '14. En curso: dejar sin asesor → ' || e || ' · con propuesta pendiente, Diego elige «Que VINKA elija» → modo=' || (select choice from service_requests where id = q1) || ' · propuesta limpia=' || ((select proposed_advisor from service_requests where id = q1) is null) || E'\n';
  update advisors set active = false where user_id = feli;
  select x into j from jsonb_array_elements((select admin_service_requests() from (select set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true)) s)) x where x->>'id' = q2::text;
  r := r || '15. Felipe suspendido con asesoría asignada → VINKA lo ve marcado: ' || (j->>'advisor_inactive') || E'\n';
  update service_requests set assigned_to = null where id = q2; -- si ya estaba asignado a Felipe, reasignarlo no hace nada y la prueba no diría nada
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true); set local role authenticated;
  begin perform admin_assign_request(q2, feli, 'Motivo suficientemente largo para la prueba'); e := 'ASIGNÓ (mal)'; exception when others then e := 'bloqueado'; end; reset role;
  r := r || '16. Asignar a una cuenta inactiva, incluso como excepción → ' || e || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', diego, 'role','authenticated')::text, true); set local role authenticated;
  begin perform admin_assign_request(q2, caro); e := 'LLAMÓ (mal)'; exception when others then e := 'bloqueado'; end;
  begin perform service_do_assign(q2, caro, null, 'x'); e := e || ' · interna LLAMADA (mal)'; exception when others then e := e || ' · interna bloqueada'; end;
  begin perform admin_propose_advisor(q2, caro, 'Autopropuesta del postulante'); e := e || ' · PROPUSO (mal)'; exception when others then e := e || ' · proponer bloqueado'; end; reset role;
  r := r || '17. El postulante intenta funciones de VINKA → ' || e;
  raise exception E'PRUEBA P1 (revertida)\n%', r;
end $t$;
