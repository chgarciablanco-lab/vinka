-- Pruebas de controles críticos (11-11-2026). Cada bloque termina con RAISE para que TODO se revierta.
-- Cuentas de prueba: nova.test, agro.test, camila.test, diego.test, asesor.test, admin.test (@example.com).

-- 1) Aislamiento entre empresas: Agroexport (agro.test) frente a datos de Nova Retail
do $t$
declare r text := ''; nova uuid := '8ad4b23e-3f8c-443c-9e44-d54275d612db'; agro_u uuid := 'f09fef47-06c4-4d2c-a6ca-74f8d28904a7';
  t text; n int; e text; fails int := 0; j jsonb; sql text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', agro_u, 'role','authenticated')::text, true);
  set local role authenticated;
  foreach t in array array['ai_insights','ai_log','candidate_notes','candidate_tags','company_invites','company_members','evaluations','external_applicants','interview_slots','interviews','matches','message_templates','offers','payments','pipeline_events','promotions','stage_rules','subscriptions'] loop
    execute format('select count(*) from public.%I where company_id = $1', t) into n using nova;
    if n > 0 then fails := fails + 1; r := r || 'FALLA tabla ' || t || ' ve ' || n || E'\n'; end if;
  end loop;
  select count(*) into n from jobs where company_id = nova and status <> 'published';
  if n > 0 then fails := fails + 1; end if;
  select count(*) into n from messages x join matches m on m.id = x.match_id where m.company_id = nova;
  if n > 0 then fails := fails + 1; end if;
  select count(*) into n from notifications where user_id <> agro_u;
  if n > 0 then fails := fails + 1; end if;
  foreach sql in array array[
    'select to_jsonb(company_plan($1))', 'select to_jsonb(company_report($1, 90))', 'select coalesce(jsonb_agg(x),''[]'') from company_stats($1) x',
    'select coalesce(jsonb_agg(x),''[]'') from stage_times($1, 90) x', 'select coalesce(jsonb_agg(x),''[]'') from talent_pool($1) x',
    'select coalesce(jsonb_agg(x),''[]'') from team_members($1) x', 'select coalesce(jsonb_agg(x),''[]'') from company_agenda($1, now() - interval ''1 year'', now() + interval ''1 year'') x',
    'select coalesce(jsonb_agg(x),''[]'') from admin_company_team($1) x'] loop
    begin execute sql into j using nova; if not (j is null or j = '[]'::jsonb or j = 'null'::jsonb) then fails := fails + 1; r := r || 'FALLA ' || sql || E'\n'; end if;
    exception when others then null; end;
  end loop;
  foreach sql in array array[
    'select add_slots($1, ''[]''::jsonb, ''online'', null, null, null, null, null)', 'select invite_member($1, ''x@example.com'', ''admin'')',
    'select request_plan_change($1, ''empresa'', ''hola'')', 'select set_company_kind($1, ''consultora'')', 'select set_company_logo($1, ''x.png'')',
    'select set_company_photos($1, ''[]''::jsonb)', 'select set_member_role($1, ''ef0495a9-8dde-4995-8d52-b12969fe71d3'', ''viewer'')',
    'select remove_member($1, ''ef0495a9-8dde-4995-8d52-b12969fe71d3'')', 'select admin_record_payment($1, ''pyme'', 1, 1, ''x'', ''x'')',
    'select admin_set_plan($1, ''empresa'', ''active'', null, ''x'')', 'select admin_authorize_rut($1)'] loop
    begin execute sql using nova; fails := fails + 1; r := r || 'FALLA permitido: ' || sql || E'\n'; exception when others then null; end;
  end loop;
  update matches set stage = 'contratado' where company_id = nova; get diagnostics n = row_count; if n > 0 then fails := fails + 1; end if;
  update jobs set status = 'closed' where company_id = nova; get diagnostics n = row_count; if n > 0 then fails := fails + 1; end if;
  begin insert into jobs (company_id, title, description, status) values (nova, 'Prueba aislamiento', repeat('x', 40), 'draft'); fails := fails + 1; exception when others then null; end;
  begin insert into storage.objects (bucket_id, name, owner) values ('company-photos', nova || '/intruso.jpg', agro_u); fails := fails + 1; exception when others then null; end;
  begin insert into storage.objects (bucket_id, name, owner) values ('logos', nova || '/intruso.png', agro_u); fails := fails + 1; exception when others then null; end;
  reset role;
  raise exception E'AISLAMIENTO (revertido) · fallas=%\n%', fails, r;   -- esperado: fallas=0
end $t$;

-- 2) Límite de vacantes, calidad al publicar, cambios de estado, avisos, exportación y pagos
do $t$
declare r text := ''; e text; n int; j jsonb; fails int := 0;
  agro uuid := '189c6e85-2bc4-4c58-8e9f-722eb5a2a36a'; agro_u uuid := 'f09fef47-06c4-4d2c-a6ca-74f8d28904a7';
  cam uuid := '89116b44-807d-4944-8a40-c527c5b75474'; diego uuid := 'ff07a334-e037-4690-b649-a309e10638cc'; adm uuid := 'a2fe2ae1-48a1-42b8-80a3-2fbb3edbf1d4';
  mt uuid := '4d98e5bb-665c-477e-8322-3683da0584af'; s subscriptions; i int; tpl jobs;
begin
  select * into tpl from jobs where company_id = agro and status = 'published' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', agro_u, 'role','authenticated')::text, true);
  set local role authenticated;
  for i in 1..3 loop
    begin
      insert into jobs (company_id, title, description, area, level, modality, schedule, contract, region, comuna, status)
      values (agro, 'Prueba límite ' || i, repeat('Funciones de prueba. ', 3), tpl.area, tpl.level, tpl.modality, tpl.schedule, tpl.contract, tpl.region, tpl.comuna, 'published');
      e := 'publicada';
    exception when others then e := 'bloqueada: ' || sqlerrm; end;
    r := r || 'A.vacante_' || i || ' → ' || e || E'\n';   -- esperado: 2 publicadas y la 3.ª bloqueada por el plan
  end loop;
  begin insert into jobs (company_id, title, description, area, modality, schedule, region, comuna, status) values (agro, 'G', '', tpl.area, tpl.modality, tpl.schedule, tpl.region, tpl.comuna, 'published'); fails := fails + 1;
  exception when others then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', cam, 'role','authenticated')::text, true);
  set local role authenticated;
  update matches set stage = 'contratado' where id = mt; get diagnostics n = row_count; if n > 0 then fails := fails + 1; end if;
  update offers set status = 'aceptada' where candidate_id = cam; get diagnostics n = row_count; if n > 0 then fails := fails + 1; end if;
  update service_requests set status = 'aprobada' where candidate_id = cam; get diagnostics n = row_count; if n > 0 then fails := fails + 1; end if;
  update notifications set read_at = now() where user_id = diego; get diagnostics n = row_count; if n > 0 then fails := fails + 1; end if;
  begin perform notify_users(array[diego], 'plan', 'falso', 'falso', '/', false); fails := fails + 1; exception when others then null; end;
  j := to_jsonb(export_my_data());
  if position(diego::text in j::text) > 0 or position(cam::text in j::text) = 0 then fails := fails + 1; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', agro_u, 'role','authenticated')::text, true);
  set local role authenticated;
  begin perform admin_record_payment(agro, 'pyme', 1, 1, 'x', 'x'); fails := fails + 1; exception when others then null; end;
  reset role;
  update admins set level = 'operaciones' where user_id = adm;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  set local role authenticated;
  begin perform admin_record_payment(agro, 'pyme', 29990, 1, 'transferencia', 'prueba'); fails := fails + 1; exception when others then null; end;
  reset role; update admins set level = 'total' where user_id = adm; set local role authenticated;
  perform admin_record_payment(agro, 'pyme', 29990, 1, 'transferencia', 'prueba');
  reset role;
  select * into s from subscriptions where company_id = agro;
  r := r || 'E.pago: estado=' || s.status || ' pagado_hasta=' || to_char(s.current_period_end at time zone 'America/Santiago', 'DD-MM-YYYY HH24:MI') || E'\n';  -- esperado: active, 23:59
  raise exception E'CONTROLES (revertido) · fallas=%\n%', fails, r;   -- esperado: fallas=0
end $t$;

-- 3) Asesorías: entrega incompleta y aprobación excepcional (caso de camila.test en curso, asesor.test)
do $t$
declare r text := ''; e text; sid uuid := '3f8f85a0-2dde-4524-9f18-378389b7ac7b'; adv uuid := '63e7e733-078c-4e78-afd9-58408b87cb20'; adm uuid := 'a2fe2ae1-48a1-42b8-80a3-2fbb3edbf1d4';
  s service_requests;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', adv, 'role','authenticated')::text, true);
  set local role authenticated;
  begin perform advisor_deliver(sid, 'Listo'); e := 'ENTREGÓ'; exception when others then e := sqlerrm; end;
  reset role; r := r || '1.asesor_entrega_incompleta: ' || e || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  set local role authenticated;
  begin perform admin_update_service_request(sid, 'entregada', ''); e := 'CAMBIÓ'; exception when others then e := sqlerrm; end;
  reset role; r := r || '2.admin_marca_entregada_incompleta: ' || e || E'\n';
  update service_requests set status = 'entregada' where id = sid;
  set local role authenticated;
  begin perform admin_review_request(sid, true, 'ok'); e := 'APROBÓ'; exception when others then e := sqlerrm; end;
  r := r || '3.aprobar_sin_excepcion: ' || e || E'\n';
  begin perform admin_review_request(sid, true, 'corto', true); e := 'APROBÓ'; exception when others then e := sqlerrm; end;
  r := r || '4.excepcion_motivo_corto: ' || e || E'\n';
  reset role; update admins set level = 'operaciones' where user_id = adm; set local role authenticated;
  begin perform admin_review_request(sid, true, 'La persona no asistió a la sesión pese a 3 intentos', true); e := 'APROBÓ'; exception when others then e := sqlerrm; end;
  r := r || '5.excepcion_por_operaciones: ' || e || E'\n';
  reset role; update admins set level = 'total' where user_id = adm; set local role authenticated;
  perform admin_review_request(sid, true, 'La persona no asistió a la sesión pese a 3 intentos', true);
  reset role;
  select * into s from service_requests where id = sid;
  r := r || '6.excepcion_total: estado=' || s.status || ' marcada=' || s.approved_with_exception || E'\n';
  set local role authenticated;
  begin perform admin_update_service_request(sid, 'en_curso', ''); e := 'CAMBIÓ'; exception when others then e := sqlerrm; end;
  reset role; r := r || '7.cambiar_aprobada: ' || e || E'\n';
  raise exception E'ASESORÍAS (revertido)\n%', r;   -- esperado: 1–5 y 7 bloqueados; 6 aprobada marcada=true
end $t$;
