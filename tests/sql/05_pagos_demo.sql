do $t$
declare
  rq uuid := '61158fa3-56eb-4b8a-911c-d7c158703906'; rq2 uuid := 'd538f6f6-68ea-4611-b22e-fee3016c2c48'; co uuid := '8ad4b23e-3f8c-443c-9e44-d54275d612db'; job uuid := 'cf2e318a-acc6-4064-9a00-ac3fcd893403';
  diego uuid; nova uuid; camila uuid; promo uuid; j jsonb; out text := ''; s subscriptions;
begin
  select id into diego from auth.users where email = 'diego.test@example.com';
  select id into nova from auth.users where email = 'nova.test@example.com';
  select id into camila from auth.users where email = 'camila.test@example.com';
  update service_requests set status = 'pago_pendiente' where id = rq;
  insert into promotions (product_id, target, job_id, company_id, status, source, days, net_clp, iva_clp, total_clp, requested_by)
  values ('job_7', 'job', job, co, 'solicitada', 'compra', 7, 4990, 948, 5938, nova) returning id into promo;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', diego, 'role', 'authenticated')::text, true);
  j := checkout_quote('asesoria', rq2); out := out || E'\n1 solicitada aún no se paga: ' || coalesce(j->>'reason', 'SIN MOTIVO');
  j := checkout_quote('asesoria', rq); out := out || E'\n2 cotización: total=' || (j->>'total') || ' neto=' || (j->>'net') || ' iva=' || (j->>'iva') || ' motivo=' || coalesce(j->>'reason', 'ninguno');
  begin perform checkout_pay('asesoria', rq, '4111111111111111', 'credito'); out := out || E'\n3 tarjeta real: FALLA'; exception when others then out := out || E'\n3 tarjeta no de prueba: ' || sqlerrm; end;
  begin perform checkout_pay('asesoria', rq, 'redcompra_ok', 'credito'); out := out || E'\n4 débito como crédito: FALLA'; exception when others then out := out || E'\n4 débito como crédito: ' || sqlerrm; end;
  j := checkout_pay('asesoria', rq, 'mc_rechazo', 'credito', 3); out := out || E'\n5 rechazo: ' || (j->>'status') || ' · ' || (j->>'reason') || ' · estado=' || (select status from service_requests where id = rq);
  j := checkout_pay('asesoria', rq, 'visa_ok', 'credito', 3);
  out := out || E'\n6 aprobado: ' || (j->>'status') || ' orden=' || (j->>'order') || ' auth=' || (j->>'auth_code') || ' cuotas=' || (j->>'installments');
  out := out || E'\n6b solicitud: ' || (select status || ' asesor=' || coalesce(assigned_to::text = '5f54257e-01f8-4ad2-9a7e-7671f7a47380', false)::text || ' inicio=' || (started_at is not null) from service_requests where id = rq);
  begin perform checkout_pay('asesoria', rq, 'visa_ok', 'credito'); out := out || E'\n7 doble cobro: FALLA'; exception when others then out := out || E'\n7 doble cobro bloqueado: ' || sqlerrm; end;
  j := my_payment_receipts(); out := out || E'\n8 comprobantes Diego: ' || jsonb_array_length(j) || ' (' || (j->0->>'status') || ', ' || (j->1->>'status') || ')';
  begin perform checkout_quote('plan', co, 'pyme', 1); out := out || E'\n9 Diego paga plan ajeno: FALLA'; exception when others then out := out || E'\n9 plan ajeno: ' || sqlerrm; end;
  perform set_config('request.jwt.claims', json_build_object('sub', nova, 'role', 'authenticated')::text, true);
  begin perform checkout_quote('plan', co, 'empresa', 1); out := out || E'\n10 plan cotización: FALLA'; exception when others then out := out || E'\n10 plan a cotizar: ' || sqlerrm; end;
  j := checkout_quote('plan', co, 'equipo', 12); out := out || E'\n11 equipo 12 meses: ' || (j->>'total') || ' (' || (j->>'title') || ')';
  j := checkout_pay('plan', co, 'redcompra_ok', 'debito', 6, 'equipo', 12);
  select * into s from subscriptions where company_id = co;
  out := out || E'\n12 plan pagado: ' || (j->>'status') || ' cuotas=' || (j->>'installments') || ' → ' || s.plan_id || ' ' || s.status || ' hasta ' || to_char(s.current_period_end, 'YYYY-MM-DD');
  j := checkout_pay('promocion', promo, 'sin_fondos', 'credito'); out := out || E'\n13 destacado sin fondos: ' || (j->>'status') || ' · ' || (j->>'reason');
  j := checkout_pay('promocion', promo, 'visa_ok', 'credito'); out := out || E'\n14 destacado: ' || (j->>'status') || ' → ' || (select status || ' ' || source || ' hasta ' || to_char(ends_at, 'YYYY-MM-DD') from promotions where id = promo);
  j := my_payment_receipts(co); out := out || E'\n15 comprobantes empresa: ' || jsonb_array_length(j);
  perform set_config('request.jwt.claims', json_build_object('sub', camila, 'role', 'authenticated')::text, true);
  begin perform checkout_quote('promocion', promo); out := out || E'\n16 ajeno: FALLA'; exception when others then out := out || E'\n16 destacado ajeno: ' || sqlerrm; end;
  begin perform my_payment_receipts(co); out := out || E'\n17 FALLA'; exception when others then out := out || E'\n17 comprobantes ajenos: ' || sqlerrm; end;
  begin perform 1 from payment_attempts; out := out || E'\n18 FALLA'; exception when others then out := out || E'\n18 tabla cerrada: ' || sqlerrm; end;
  execute 'reset role';
  out := out || E'\n19 pagos registrados: ' || (select string_agg(kind || ':' || method || ':' || provider || ':' || total_clp, ', ') from payments where provider = 'vinka_demo');
  out := out || E'\n20 sin pago duplicado por trigger: ' || (select count(*) from payments where request_id = rq);
  raise exception 'ROLLBACK OK %', out;
end $t$;
