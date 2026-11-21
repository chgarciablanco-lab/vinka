-- Test DISC propio: enlace sin cuenta, respuestas, puntaje, integridad, permisos, cupo y uso en el informe.
-- Crea sus propios usuarios y empresas y TODO se deshace al final con rollback. Cada línea dice «true» si el resultado es el esperado.
begin;
create function pg_temp.act(u uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.anon() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon'; end $$;
create function pg_temp.root() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $$;

do $t$
declare
  o uuid := gen_random_uuid(); r uuid := gen_random_uuid(); v uuid := gen_random_uuid(); s uuid := gen_random_uuid(); col uuid := gen_random_uuid();
  ses uuid := gen_random_uuid(); ses2 uuid := gen_random_uuid();
  cons uuid; other uuid; ev uuid; c1 uuid; c2 uuid; tid uuid; tok text; tok2 text; d jsonb; ok boolean; n int; b int; i int; out text := ''; dm int[]; ds int[];
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (o, 'duena@disc.test', '{"role":"company","first_name":"Olga","last_name":"Dueña"}'), (r, 'recluta@disc.test', '{"role":"company","first_name":"Raúl","last_name":"Recluta"}'),
    (v, 'evalua@disc.test', '{"role":"company","first_name":"Vera","last_name":"Evaluadora"}'), (s, 'ajena@otra.test', '{"role":"company","first_name":"Sara","last_name":"Ajena"}'),
    (col, 'colabora@disc.test', '{"first_name":"Cole","last_name":"Colabora"}');
  insert into companies (owner_id, kind, display_name, legal_name, rut, verification_status) values (o, 'consultora', 'Consultora DISC', 'Consultora DISC SpA', '76.111.111-6', 'verified') returning id into cons;
  insert into companies (owner_id, display_name, legal_name, rut, verification_status) values (s, 'Otra Empresa', 'Otra Empresa SpA', '79.444.444-7', 'verified') returning id into other;
  insert into company_members (company_id, user_id, role) values (cons, r, 'recruiter'), (cons, v, 'viewer') on conflict do nothing;
  update subscriptions set plan_id = 'gratis', status = 'active' where company_id = cons;
  perform pg_temp.act(r); ev := eval_create(cons, 'Subadministrador', 'Restaurante', 'Liderar el turno, atender clientes y controlar costos.');
  c1 := eval_add_candidate(ev, 'Andrea Pérez', ''); c2 := eval_add_candidate(ev, 'Bruno Soto', '');

  -- 1) Crear el enlace: exige autorización de la persona y que gestione la evaluación
  begin perform disc_create(c1); ok := false; exception when others then ok := sqlerrm like 'Primero confirma%'; end;
  perform eval_set_consent(c1); perform eval_set_consent(c2);
  perform pg_temp.act(v); begin perform disc_create(c1); ok := ok and false; exception when others then null; end;
  perform pg_temp.act(s); begin perform disc_create(c1); ok := ok and false; exception when others then null; end;
  perform pg_temp.act(r); d := disc_create(c1); tid := (d->>'id')::uuid; tok := d->>'token';
  out := out || E'\n1 enlace: requiere autorización y solo quien gestiona: ' || (ok and length(tok) = 64);

  -- 2) Con el enlace (sin cuenta) se ve el cuestionario sin la clave de puntaje; un enlace inventado no
  perform pg_temp.anon(); d := disc_open(tok);
  out := out || E'\n2 abrir con enlace: 24 bloques sin factores, nombre y cargo; enlace falso no: ' || (jsonb_array_length(d->'blocks') = 24 and position('factors' in d::text) = 0
    and d->>'name' = 'Andrea' and d->>'title' = 'Subadministrador' and disc_open('inventado')->>'status' = 'no_existe');

  -- 3) Sin cuenta no se leen tablas ni funciones internas
  ok := true;
  begin perform count(*) from disc_tests; ok := false; exception when insufficient_privilege then null; end;
  begin perform count(*) from disc_items; ok := false; exception when insufficient_privilege then null; end;
  begin perform disc_score('{}'::jsonb); ok := false; exception when insufficient_privilege then null; end;
  begin perform disc_summary(c1, true); ok := false; exception when insufficient_privilege then null; end;
  begin perform disc_ai_begin(r, tid); ok := false; exception when insufficient_privilege then null; end;
  begin perform disc_create(c1); ok := false; exception when insufficient_privilege then null; end;
  out := out || E'\n3 sin cuenta: tablas, clave de puntaje y funciones internas cerradas: ' || ok;

  -- 4) Responder: antes de empezar no; respuesta inválida no
  begin perform disc_answer(tok, ses, 1, 0, 1); ok := false; exception when others then ok := true; end;
  perform disc_begin(tok, ses);
  begin perform disc_answer(tok, ses, 1, 2, 2); ok := ok and false; exception when others then null; end;
  begin perform disc_answer(tok, ses, 25, 0, 1); ok := ok and false; exception when others then null; end;
  out := out || E'\n4 no se responde antes de empezar ni con respuestas inválidas: ' || ok;

  -- 5) Elige siempre la palabra «D» como más y la «S» como menos; abrir en otro dispositivo bloquea el primero y queda registrado
  perform pg_temp.root(); update disc_tests set started_at = now() - interval '9 minutes' where id = tid;
  select array_agg(array_position(factors, 'D') - 1 order by block), array_agg(array_position(factors, 'S') - 1 order by block) into dm, ds from disc_items;
  perform pg_temp.anon();
  for b in 1..12 loop
    perform disc_answer(tok, ses, b, dm[b], ds[b]);
  end loop;
  begin perform disc_submit(tok, ses); ok := false; exception when others then ok := sqlerrm like 'Faltan 12%'; end;
  perform disc_begin(tok, ses2);
  begin perform disc_answer(tok, ses, 13, 0, 1); ok := ok and false; exception when others then ok := ok and sqlerrm like '%otro dispositivo%'; end;
  for b in 13..24 loop
    perform disc_answer(tok, ses2, b, dm[b], ds[b]);
  end loop;
  perform disc_submit(tok, ses2);
  perform pg_temp.root();
  select scores->'adaptado'->>'D', scores->'natural'->>'S', scores->>'principal', integrity->>'un_dispositivo', integrity->>'tiempo_valido' into d from disc_tests where id = tid;
  out := out || E'\n5 faltan bloques; otro dispositivo; puntaje D alto y S natural bajo; integridad: ' || (ok
    and (select (scores->'adaptado'->>'D')::int = 100 and (scores->'natural'->>'S')::int = 0 and scores->>'principal' = 'D' and scores->>'bajo_presion' = 'D'
         and (integrity->>'un_dispositivo')::boolean = false and (integrity->>'tiempo_valido')::boolean and status = 'completado' from disc_tests where id = tid));

  -- 6) Terminado: el enlace ya no sirve para responder ni para ver el cuestionario
  perform pg_temp.anon();
  begin perform disc_answer(tok, ses2, 1, 0, 1); ok := false; exception when others then ok := true; end;
  out := out || E'\n6 test terminado: enlace cerrado: ' || (ok and disc_open(tok)->>'status' = 'completado');

  -- 7) Renovar el enlace de otra persona invalida el anterior; anular lo cierra
  perform pg_temp.act(r); tok2 := disc_create(c2)->>'token'; d := disc_create(c2);
  perform pg_temp.anon(); ok := disc_open(tok2)->>'status' = 'no_existe' and disc_open(d->>'token')->>'status' = 'enviado';
  perform pg_temp.act(r); perform disc_cancel((d->>'id')::uuid); perform pg_temp.anon(); ok := ok and disc_open(d->>'token')->>'status' = 'no_existe';
  perform pg_temp.act(r); begin perform disc_create(c1); ok := ok and false; exception when others then ok := ok and sqlerrm like '%ya respondió%'; end;
  out := out || E'\n7 renovar invalida el enlace anterior; anular; no se repite un test respondido: ' || ok;

  -- 8) Quién ve el resultado: quien gestiona sí; la evaluadora solo cuando el informe de la persona está cerrado; otra empresa no
  d := eval_detail(ev); ok := (d->'candidates'->0->'disc'->>'status') = 'completado';
  perform pg_temp.act(v); d := eval_detail(ev); ok := ok and (d->'candidates'->0->'disc') = 'null'::jsonb;
  perform pg_temp.act(s); begin perform eval_detail(ev); ok := false; exception when others then null; end;
  perform pg_temp.act(col); begin perform eval_detail(ev); ok := false; exception when others then null; end;
  out := out || E'\n8 resultado visible para quien gestiona; evaluadora no (informe abierto); otros no: ' || ok;

  -- 9) Reporte con IA: solo quien gestiona; límite del plan (gratis: 5) y devolución si falla
  perform pg_temp.root();
  begin perform disc_ai_begin(v, tid); ok := false; exception when others then ok := true; end;
  for i in 1..5 loop d := disc_ai_begin(r, tid); end loop;
  begin perform disc_ai_begin(r, tid); ok := ok and false; exception when others then ok := ok and sqlerrm like '%5 reportes DISC%'; end;
  perform disc_ai_release(cons, report_month()); d := disc_ai_begin(r, tid);
  perform disc_ai_store(tid, '{"analisis":"Perfil de prueba","preguntas":["¿?"]}'::jsonb, 'm', 10, 10, 0.03);
  out := out || E'\n9 reporte DISC: permisos, límite mensual y devolución: ' || (ok and (d->'scores'->>'principal') = 'D'
    and (select disc_reports from report_usage where company_id = cons and month = report_month()) = 5);

  -- 10) El informe psicolaboral recibe el resultado del test como documento (sin otros archivos) y la evaluadora lo ve con el informe cerrado
  d := eval_ai_begin(r, c1, 'informe');
  ok := exists (select 1 from jsonb_array_elements(d->'files') f where f->>'name' = 'Test DISC VINKA' and f->>'text' like '%"principal": "D"%' and f->>'text' like '%Perfil de prueba%' and f->>'text' not like '%¿?%');
  perform eval_ai_store(r, c1, '{"antecedentes":"x","veredicto":"recomendado"}'::jsonb, 'm', 1, 1, 0);
  select id into tid from assessment_reports where assessment_candidate_id = c1;
  perform pg_temp.act(r); perform eval_report_finalize(tid, true);
  perform pg_temp.act(v); d := eval_detail(ev); ok := ok and (d->'candidates'->0->'disc'->'report'->>'analisis') = 'Perfil de prueba';
  perform pg_temp.root();
  out := out || E'\n10 el test entra al informe; la evaluadora ve el resultado con el informe cerrado: ' || ok;

  raise notice '%', out;
end $t$;
rollback;
