-- Informes psicolaborales con IA: permisos, consentimiento, cupo mensual, archivos y cierre.
-- Crea sus propios usuarios y empresas y TODO se deshace al final con rollback. Cada línea dice «true» si el resultado es el esperado.
begin;
create function pg_temp.act(u uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.root() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $$;

do $t$
declare
  o uuid := gen_random_uuid(); r uuid := gen_random_uuid(); v uuid := gen_random_uuid(); k uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  col uuid := gen_random_uuid(); cand uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  cons uuid; cli uuid; other uuid; job uuid; ev uuid; ev2 uuid; c1 uuid; c2 uuid; f1 uuid; rep uuid; d jsonb; ok boolean; n int; out text := ''; q text; leaks text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (o, 'duena@consultora.test', '{"role":"company","first_name":"Olga","last_name":"Dueña"}'), (r, 'recluta@consultora.test', '{"role":"company","first_name":"Raúl","last_name":"Recluta"}'),
    (v, 'evalua@consultora.test', '{"role":"company","first_name":"Vera","last_name":"Evaluadora"}'), (k, 'cliente@cliente.test', '{"role":"company","first_name":"Kati","last_name":"Cliente"}'),
    (s, 'ajena@otra.test', '{"role":"company","first_name":"Sara","last_name":"Ajena"}'), (col, 'colabora@prueba.test', '{"first_name":"Cole","last_name":"Colabora"}'),
    (cand, 'postula@prueba.test', '{"role":"candidate","first_name":"Pía","last_name":"Postulante"}'), (x, 'otra.persona@prueba.test', '{"role":"candidate","first_name":"Xavi","last_name":"Otro"}');
  update profiles set role = 'advisor' where id = col; delete from candidate_profiles where user_id = col;
  insert into advisors (user_id, specialty, terms_accepted_at) values (col, 'Retail', now());
  insert into companies (owner_id, kind, display_name, legal_name, rut, verification_status) values (o, 'consultora', 'Consultora Prueba', 'Consultora Prueba SpA', '76.111.111-6', 'verified') returning id into cons;
  perform set_config('vinka.company_admin', '1', true);
  insert into companies (owner_id, parent_id, kind, display_name, legal_name, rut, verification_status) values (o, cons, 'empresa', 'Cliente Prueba', 'Cliente Prueba SpA', '78.333.333-3', 'verified') returning id into cli;
  perform set_config('vinka.company_admin', '', true);
  insert into companies (owner_id, display_name, legal_name, rut, verification_status) values (s, 'Otra Empresa', 'Otra Empresa SpA', '79.444.444-7', 'verified') returning id into other;
  insert into company_members (company_id, user_id, role) values (cons, r, 'recruiter'), (cons, v, 'viewer'), (cli, k, 'client') on conflict do nothing;
  update subscriptions set plan_id = 'pyme', status = 'active' where company_id = cons;
  insert into jobs (company_id, title, area, level, description, modality, schedule, contract, region, comuna, status)
  values (cli, 'Subadministrador/a', 'gastronomia', 'senior', 'Apoyar al administrador del local en operación, equipo, costos e inventarios.', 'presencial', 'completa', 'indefinido', 'Maule', 'Talca', 'published') returning id into job;
  insert into job_collaborators (job_id, user_id, invited_by) values (job, col, o);
  insert into candidate_job_actions (candidate_id, job_id, action) values (cand, job, 'interest');

  -- 1) Crear: reclutador sí; evaluador, cliente y ajena no
  perform pg_temp.act(r); ev := eval_create(cons, 'Subadministrador', 'Alemán Experto', 'Perfil del cargo de prueba');
  perform pg_temp.act(v); begin perform eval_create(cons, 'X', '', ''); ok := false; exception when others then ok := true; end;
  perform pg_temp.act(s); begin perform eval_create(cons, 'X', '', ''); ok := ok and false; exception when others then ok := ok and true; end;
  out := out || E'\n1 solo quien gestiona crea evaluaciones: ' || (ev is not null and ok);

  -- 2) Postulante de una vacante: crea la evaluación de la vacante con su perfil; alguien que no postuló no
  perform pg_temp.act(o); d := eval_for_applicant(job, cand); ev2 := (d->>'assessment_id')::uuid; c2 := (d->>'assessment_candidate_id')::uuid;
  begin perform eval_for_applicant(job, x); ok := false; exception when others then ok := true; end;
  perform pg_temp.root();
  out := out || E'\n2 evaluación de la vacante con su perfil; ajeno al proceso rechazado: ' || ((select job_profile like 'Apoyar al administrador%' from assessments where id = ev2) and ok);

  -- 3) Archivos: texto pegado sí; ruta fuera de la carpeta o inexistente no
  perform pg_temp.act(r); c1 := eval_add_candidate(ev, 'Persona de Prueba', 'persona@prueba.test');
  f1 := eval_add_file(ev, c1, 'transcripcion', 'Entrevista', null, 'text/plain', 0, 'Entrevistadora: cuéntame de tu experiencia. Persona: trabajé cinco años como jefa de local.');
  begin perform eval_add_file(ev, c1, 'cv', 'cv.pdf', ev2::text || '/cv.pdf', 'application/pdf', 100, null); ok := false; exception when others then ok := true; end;
  begin perform eval_add_file(ev, c1, 'cv', 'cv.pdf', ev::text || '/no-existe.pdf', 'application/pdf', 100, null); ok := ok and false; exception when others then ok := ok and true; end;
  out := out || E'\n3 archivo válido sí; ruta ajena o inexistente no: ' || (f1 is not null and ok);

  -- 4) Archivo real en el espacio privado: la reclutadora sube; la evaluadora y la ajena no pueden leerlo
  insert into storage.objects (bucket_id, name, owner) values ('evaluaciones', ev::text || '/cv.pdf', r);
  perform eval_add_file(ev, c1, 'cv', 'cv.pdf', ev::text || '/cv.pdf', 'application/pdf', 1000, null);
  perform pg_temp.act(v); select count(*) into n from storage.objects where bucket_id = 'evaluaciones';
  perform pg_temp.act(s); n := n + (select count(*) from storage.objects where bucket_id = 'evaluaciones');
  begin insert into storage.objects (bucket_id, name, owner) values ('evaluaciones', ev::text || '/intruso.pdf', s); ok := false; exception when others then ok := true; end;
  perform pg_temp.act(r);
  out := out || E'\n4 archivos privados: solo quien gestiona los ve o sube: ' || (n = 0 and ok and (select count(*) from storage.objects where bucket_id = 'evaluaciones' and name like ev::text || '/%') = 1);

  -- 5) Sin consentimiento no se genera
  perform pg_temp.root();
  begin perform eval_ai_begin(r, c1, 'informe'); ok := false; exception when others then ok := sqlerrm like 'Confirma que la persona autorizó%'; end;
  out := out || E'\n5 sin consentimiento no se genera: ' || ok;

  -- 6) Con consentimiento: reserva cupo y entrega perfil + archivos de la persona (no los de otra persona)
  perform pg_temp.act(r); perform eval_set_consent(c1); c2 := eval_add_candidate(ev, 'Otra Persona', '');
  perform eval_add_file(ev, c2, 'cv', 'Texto', null, '', 0, 'CV de otra persona que no debe mezclarse con la primera.');
  perform pg_temp.root(); d := eval_ai_begin(r, c1, 'informe');
  out := out || E'\n6 entrega perfil y solo los archivos de esa persona: ' || ((d->'evaluation'->>'job_profile') = 'Perfil del cargo de prueba'
     and jsonb_array_length(d->'files') = 2 and not exists (select 1 from jsonb_array_elements(d->'files') f where f->>'text' like 'CV de otra persona%'));
  rep := eval_ai_store(r, c1, '{"antecedentes":"Texto","veredicto":"","fortalezas":[]}'::jsonb, 'claude-sonnet-5-5', 30000, 3000, 0.09);

  -- 7) Límite mensual: plan Pyme = 10; al llegar al límite se rechaza; si la IA falla se devuelve
  update report_usage set reports = 10 where company_id = cons and month = report_month();
  begin perform eval_ai_begin(r, c1, 'informe'); ok := false; exception when others then ok := sqlerrm like 'Tu plan Pyme permite 10 informes%'; end;
  perform eval_ai_release(cons, report_month());
  perform eval_ai_begin(r, c1, 'informe');
  out := out || E'\n7 límite del plan respetado y cupo devuelto si falla: ' || (ok and (select reports from report_usage where company_id = cons and month = report_month()) = 10);
  -- 8) Regenerar una sección no consume cupo de informes
  perform eval_ai_begin(r, c1, 'seccion'); perform eval_ai_store_section(r, c1, 'motivacion', '"Nueva motivación"'::jsonb, 1000, 200, 0.004);
  out := out || E'\n8 sección no consume informes y queda guardada: ' || ((select reports from report_usage where company_id = cons and month = report_month()) = 10
     and (select sections->>'motivacion' from assessment_reports where id = rep) = 'Nueva motivación');

  -- 9) Cerrar exige la recomendación final; la evaluadora solo ve informes cerrados y sin archivos
  perform pg_temp.act(r);
  begin perform eval_report_finalize(rep, true); ok := false; exception when others then ok := true; end;
  perform pg_temp.act(v); d := eval_detail(ev);
  ok := ok and (select (c->'report') = 'null'::jsonb and jsonb_array_length(c->'files') = 0 from jsonb_array_elements(d->'candidates') c where (c->>'id')::uuid = c1);
  perform pg_temp.act(r); perform eval_report_save(rep, '{"antecedentes":"Texto editado","veredicto":"con_observaciones","fortalezas":[]}'::jsonb); perform eval_report_finalize(rep, true);
  perform pg_temp.act(v); d := eval_detail(ev);
  out := out || E'\n9 cerrar exige recomendación; evaluadora ve solo el cerrado: ' || (ok and (select c->'report'->>'status' = 'final' from jsonb_array_elements(d->'candidates') c where (c->>'id')::uuid = c1));
  begin perform eval_report_save(rep, '{}'::jsonb); ok := false; exception when others then ok := true; end;
  perform pg_temp.act(r); begin perform eval_report_save(rep, '{"x":1}'::jsonb); ok := ok and false; exception when others then ok := ok and true; end;
  out := out || E'\n10 informe cerrado no se edita; evaluadora no edita: ' || ok;

  -- 11) Cliente de la consultora ve los informes cerrados de su empresa; colaborador, postulante y otra empresa no ven nada
  perform pg_temp.act(o); -- evaluación de la vacante (empresa cliente)
  d := eval_for_applicant(job, cand); c2 := (d->>'assessment_candidate_id')::uuid; perform eval_set_consent(c2);
  perform eval_add_file(ev2, c2, 'transcripcion', 'Entrevista', null, '', 0, 'Entrevista de la postulante con datos de su experiencia en restaurantes.');
  perform pg_temp.root(); perform eval_ai_store(o, c2, '{"veredicto":"recomendado"}'::jsonb, 'm', 1, 1, 0); select id into rep from assessment_reports where assessment_candidate_id = c2;
  perform pg_temp.act(o); perform eval_report_finalize(rep, true);
  perform pg_temp.act(k); d := eval_detail(ev2);
  ok := (select c->'report'->>'status' = 'final' from jsonb_array_elements(d->'candidates') c where (c->>'id')::uuid = c2) and (d->>'job_profile') = '';
  foreach q in array array[format('select eval_detail(%L)', ev2), format('select eval_detail(%L)', ev), format('select eval_for_applicant(%L, %L)', job, cand)] loop
    perform pg_temp.act(col); begin execute q; leaks := leaks || ' colaborador:' || q; exception when others then null; end;
    perform pg_temp.act(cand); begin execute q; leaks := leaks || ' postulante:' || q; exception when others then null; end;
    perform pg_temp.act(s); begin execute q; leaks := leaks || ' otra empresa:' || q; exception when others then null; end;
  end loop;
  out := out || E'\n11 cliente ve el cerrado; colaborador, postulante y otra empresa no ven nada: ' || (ok and leaks = '') || leaks;

  -- 12) Lectura directa de tablas y funciones del servidor: denegadas con y sin sesión
  ok := true;
  for n in 1..2 loop
    if n = 1 then perform pg_temp.act(o); else perform pg_temp.root(); execute 'set local role anon'; end if;
    begin perform count(*) from assessments; ok := false; exception when insufficient_privilege then null; end;
    begin perform count(*) from assessment_candidates; ok := false; exception when insufficient_privilege then null; end;
    begin perform count(*) from assessment_files; ok := false; exception when insufficient_privilege then null; end;
    begin perform count(*) from assessment_reports; ok := false; exception when insufficient_privilege then null; end;
    begin perform count(*) from report_usage; ok := false; exception when insufficient_privilege then null; end;
    begin perform eval_ai_begin(o, c1, 'informe'); ok := false; exception when insufficient_privilege then null; end;
    begin perform eval_ai_store(o, c1, '{}'::jsonb, 'm', 1, 1, 0); ok := false; exception when insufficient_privilege then null; end;
    begin perform eval_purge(); ok := false; exception when insufficient_privilege then null; end;
  end loop;
  perform pg_temp.root(); out := out || E'\n12 tablas y funciones del servidor cerradas para la app: ' || ok;

  -- 13) Cerrar la evaluación borra los archivos de respaldo (salvo los reportes de test, para el anexo); el archivo físico queda como huérfano para la limpieza
  perform pg_temp.act(r); perform eval_add_file(ev, c1, 'test', 'DISC', null, '', 0, 'Reporte DISC de prueba con el estilo de la persona evaluada.');
  perform eval_set_status(ev, true); perform pg_temp.root();
  update storage.objects set created_at = now() - interval '2 days' where bucket_id = 'evaluaciones' and name like ev::text || '/%';
  out := out || E'\n13 al cerrar se borran los archivos (menos los tests) y la limpieza los detecta: ' || (not exists (select 1 from assessment_files where assessment_id = ev and kind <> 'test')
    and (select count(*) from assessment_files where assessment_id = ev and kind = 'test') = 1
    and exists (select 1 from orphan_storage_objects('24 hours', 1000) o where o.bucket = 'evaluaciones' and o.path = ev::text || '/cv.pdf')
    and exists (select 1 from assessment_reports r join assessment_candidates c on c.id = r.assessment_candidate_id where c.assessment_id = ev and r.status = 'final'));

  -- 14) Administración ve consumo sin contenido; nadie más
  perform pg_temp.act((select user_id from admins where level = 'total' limit 1)); d := admin_report_usage(1);
  perform pg_temp.act(o); begin perform admin_report_usage(1); ok := false; exception when others then ok := true; end;
  perform pg_temp.root();
  out := out || E'\n14 consumo visible solo para administración y sin contenido: ' || (ok and jsonb_array_length(d->'usage') >= 1 and position('Texto editado' in d::text) = 0);

  -- 15) Comparativo: exige 2 personas con informe, usa un informe del cupo y no entrega la nota interna «faltantes»
  perform pg_temp.root(); update report_usage set reports = 0 where company_id = cons and month = report_month();
  begin perform eval_compare_begin(r, ev); ok := false; exception when others then ok := sqlerrm like 'Se necesitan al menos 2 personas%'; end;
  select id into c2 from assessment_candidates where assessment_id = ev and full_name = 'Otra Persona';
  perform eval_ai_store(r, c2, '{"antecedentes":"Otro texto","veredicto":"recomendado","faltantes":["dato interno"]}'::jsonb, 'm', 1, 1, 0);
  begin perform eval_compare_begin(v, ev); ok := ok and false; exception when others then ok := ok and true; end;
  d := eval_compare_begin(r, ev);
  out := out || E'\n15 comparativo: 2 personas, solo quien gestiona, cupo y sin notas internas: ' || (ok and jsonb_array_length(d->'people') = 2
    and position('dato interno' in d::text) = 0 and (select reports from report_usage where company_id = cons and month = report_month()) = 1);

  -- 16) El borrador del comparativo lo ve y edita quien gestiona; la evaluadora solo lo ve cerrado; colaborador y otra empresa no
  rep := eval_compare_store(r, ev, '{"resumen":"Resumen de prueba","candidatos":[]}'::jsonb, 'm', 10, 10, 0.01);
  perform pg_temp.act(v); d := eval_detail(ev); ok := (d->'comparison') = 'null'::jsonb;
  begin perform eval_compare_save(rep, '{"resumen":"x"}'::jsonb); ok := false; exception when others then null; end;
  perform pg_temp.act(r); perform eval_compare_save(rep, '{"resumen":"Resumen editado","candidatos":[]}'::jsonb); perform eval_compare_finalize(rep, true);
  begin perform eval_compare_save(rep, '{"resumen":"y"}'::jsonb); ok := false; exception when others then null; end;
  perform pg_temp.act(v); d := eval_detail(ev); ok := ok and (d->'comparison'->'content'->>'resumen') = 'Resumen editado';
  perform pg_temp.act(s); begin perform eval_compare_finalize(rep, false); ok := false; exception when others then null; end;
  perform pg_temp.act(col); begin perform eval_detail(ev); ok := false; exception when others then null; end;
  perform pg_temp.act(o); begin perform count(*) from assessment_comparisons; ok := false; exception when insufficient_privilege then null; end;
  begin perform eval_compare_begin(o, ev); ok := false; exception when insufficient_privilege then null; end;
  begin perform eval_compare_store(o, ev, '{}'::jsonb, 'm', 1, 1, 0); ok := false; exception when insufficient_privilege then null; end;
  perform pg_temp.root();
  out := out || E'\n16 comparativo: permisos de ver, editar y cerrar; tabla y funciones del servidor cerradas: ' || ok;

  raise notice '%', out;
end $t$;
rollback;
