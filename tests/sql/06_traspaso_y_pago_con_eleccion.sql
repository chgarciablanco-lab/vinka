-- Auditoría comercial 17-11-2026: F02 (traspaso de empresa) y C01 (el pago respeta al asesor elegido).
-- Se ejecuta como usuarios reales de prueba y termina con RAISE: no deja ningún cambio.
do $t$
declare nova uuid; camila uuid; diego uuid; agro uuid; co uuid := '8ad4b23e-3f8c-443c-9e44-d54275d612db'; cli uuid; caro uuid := '5f54257e-01f8-4ad2-9a7e-7671f7a47380';
  rA uuid := '61158fa3-56eb-4b8a-911c-d7c158703906'; rV uuid := 'd538f6f6-68ea-4611-b22e-fee3016c2c48'; rB uuid := '49a385db-fed5-4359-97d2-0333718d82cc';
  out text := ''; j jsonb; ld int;
begin
  select id into nova from auth.users where email='nova.test@example.com'; select id into camila from auth.users where email='camila.test@example.com';
  select id into diego from auth.users where email='diego.test@example.com'; select id into agro from auth.users where email='agro.test@example.com';
  select id into cli from companies where parent_id = co limit 1;
  begin insert into company_members (company_id, user_id, role) values (co, camila, 'recruiter'); exception when others then out := out || E'\n(no se pudo crear integrante de prueba: ' || sqlerrm || ')'; end;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', nova, 'role', 'authenticated')::text, true);
  begin perform transfer_company_ownership(co, agro); out := out || E'\n✗ F1'; exception when others then out := out || E'\n✓ F1 destinatario fuera del equipo: ' || sqlerrm; end;
  update companies set owner_id = camila where id = co;
  out := out || E'\n' || (select case when owner_id = nova then '✓' else '✗' end from companies where id = co) || ' F2 cambio directo de dueño ignorado';
  perform transfer_company_ownership(co, camila);
  out := out || E'\n' || (select case when owner_id = camila then '✓' else '✗' end from companies where id = co) || ' F3 traspaso: matriz y cliente (' || coalesce((select (owner_id = camila)::text from companies where id = cli), 'sin cliente') || ') · roles nueva=' || (select role from company_members where company_id = co and user_id = camila) || ' anterior=' || (select role from company_members where company_id = co and user_id = nova);
  begin perform transfer_company_ownership(co, camila); out := out || E'\n✗ F4'; exception when others then out := out || E'\n✓ F4 la dueña anterior ya no puede traspasar'; end;
  execute 'reset role';
  out := out || E'\n✓ F5 baja libre: anterior=' || jsonb_array_length(owned_companies(nova)) || ' nueva=' || jsonb_array_length(owned_companies(camila));
  update service_requests set status = 'pago_pendiente', assigned_to = null, proposed_advisor = null where id in (rA, rV, rB);
  select advisor_load(caro) into ld;
  update advisor_profiles set max_active = ld where user_id = caro;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', diego, 'role', 'authenticated')::text, true);
  j := checkout_quote('asesoria', rA); out := out || E'\n' || case when j->>'reason' is not null then '✓' else '✗' end || ' C1 elegida sin cupo no se paga: ' || coalesce(j->>'reason', '');
  begin perform checkout_pay('asesoria', rA, 'visa_ok', 'credito'); out := out || E'\n✗ C2 pagó'; exception when others then out := out || E'\n✓ C2 pago bloqueado'; end;
  execute 'reset role';
  update advisor_profiles set max_active = ld + 1 where user_id = caro;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', diego, 'role', 'authenticated')::text, true);
  j := checkout_pay('asesoria', rA, 'visa_ok', 'credito');
  execute 'reset role';
  out := out || E'\n' || (select case when assigned_to = caro and status = 'en_curso' then '✓' else '✗' end from service_requests where id = rA) || ' C3 paga y queda con su elegida · cupo ' || advisor_load(caro) || '/' || (select max_active from advisor_profiles where user_id = caro);
  execute 'set local role authenticated';
  begin perform checkout_pay('asesoria', rV, 'visa_ok', 'credito'); out := out || E'\n✗ C4 excedió el cupo'; exception when others then out := out || E'\n✓ C4 último cupo ocupado: no se excede'; end;
  execute 'reset role';
  update advisor_profiles set max_active = ld + 3 where user_id = caro;
  update service_requests set proposed_advisor = caro where id = rV;
  execute 'set local role authenticated';
  j := checkout_quote('asesoria', rV); out := out || E'\n' || case when j->>'reason' is not null then '✓' else '✗' end || ' C5 propuesta pendiente bloquea el pago';
  execute 'reset role';
  update service_requests set assigned_to = caro, proposed_advisor = null where id = rB; update advisors set active = false where user_id = caro;
  execute 'set local role authenticated';
  j := checkout_quote('asesoria', rB); out := out || E'\n' || case when j->>'reason' is not null then '✓' else '✗' end || ' C6 asesora asignada inactiva bloquea el pago';
  execute 'reset role';
  raise exception 'RESULTADO (se deshace) %', out;
end $t$;
