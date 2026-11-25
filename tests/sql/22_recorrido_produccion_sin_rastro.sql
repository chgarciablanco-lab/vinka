-- Recorrido en PRODUCCIÓN con las cuentas de prueba existentes (nova.test y camila.test), usando las mismas funciones que la app.
-- Todo ocurre dentro de una transacción que SIEMPRE se deshace: el bloque termina con un error a propósito que trae el resultado.
-- Avisos, correos y mensajes que se generan dentro también se deshacen (nunca salen). No queda ningún dato.
begin;
create function pg_temp.act(u uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.root() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('request.jwt.claims', '{}', true); end $$;
do $t$
declare nova uuid := 'ef0495a9-8dde-4995-8d52-b12969fe71d3'; cam uuid := '89116b44-807d-4944-8a40-c527c5b75474';
  co uuid := '8ad4b23e-3f8c-443c-9e44-d54275d612db'; job uuid := '9fd58156-c41d-4370-b81f-befaad6c3f6e';
  m uuid; s1 uuid; s2 uuid; i1 uuid; ofr uuid; ofr2 uuid; t jsonb; j jsonb; a text; b text; n int; n0 int; msg text; out text := '';
begin
  -- 0) Lo que Nova ve hoy (solo lectura): pendientes y las dos listas nuevas cargan sin error
  perform pg_temp.act(nova);
  t := company_todo(co);
  select count(*) into n from company_stale_list(co); select count(*) into n0 from company_saved_list(co);
  out := out || E'\n0 Panel de Nova hoy: ' || coalesce((select string_agg((x->>'n') || ' ' || (x->>'label'), '; ') from jsonb_array_elements(t) x), 'sin pendientes')
    || ' | lista sin avanzar: ' || n || ' | lista guardadas: ' || n0 || ': true';
  n0 := coalesce((select (x->>'n')::int from jsonb_array_elements(t) x where x->>'key' = 'guardadas'), 0);

  -- 1) Nova publica el borrador «Cajero/a» (respeta el límite del plan)
  update jobs set status = 'published' where id = job;
  perform pg_temp.root();
  out := out || E'\n1 Nova publica una vacante: ' || ((select status from jobs where id = job) = 'published');

  -- 2) Camila la ve en Explorar y postula; Nova la guarda: el Panel suma una guardada y la lista la muestra; sigue en el tablero marcada
  perform pg_temp.act(cam);
  out := out || E'\n2 Camila ve la vacante en Explorar: ' || (exists (select 1 from job_feed(false) f where f.id = job) or exists (select 1 from job_feed(true) f where f.id = job));
  insert into candidate_job_actions (candidate_id, job_id, action) values (cam, job, 'interest');
  perform pg_temp.act(nova);
  insert into company_candidate_actions (job_id, candidate_id, action, created_by) values (job, cam, 'save', nova);
  t := company_todo(co); j := job_pipeline(job);
  out := out || E'\n2b guardada: el Panel pasa de ' || n0 || ' a ' || coalesce((select x->>'n' from jsonb_array_elements(t) x where x->>'key' = 'guardadas'), '0')
    || ', la lista la muestra y sigue en el tablero marcada: '
    || (coalesce((select (x->>'n')::int from jsonb_array_elements(t) x where x->>'key' = 'guardadas'), 0) = n0 + 1
        and exists (select 1 from company_saved_list(co) s where s.candidate_id = cam and s.job_id = job)
        and exists (select 1 from jsonb_array_elements(j->'cards') c where c->>'candidate_id' = cam::text and (c->>'saved')::boolean));

  -- 3) Nova decide (me interesa): hay match y la guardada sale de pendientes
  delete from company_candidate_actions where job_id = job and candidate_id = cam;
  insert into company_candidate_actions (job_id, candidate_id, action, created_by) values (job, cam, 'interest', nova);
  t := company_todo(co);
  perform pg_temp.root(); select id into m from matches where job_id = job and candidate_id = cam;
  out := out || E'\n3 decide: hay match y la guardada sale de pendientes: '
    || (m is not null and coalesce((select (x->>'n')::int from jsonb_array_elements(t) x where x->>'key' = 'guardadas'), 0) = n0);

  -- 4) Entrevista: agenda, Nova cancela con motivo, vuelve a invitar y Camila elige otro horario; ambos ven lo mismo
  insert into interview_slots (company_id, job_id, starts_at, ends_at, mode) values (co, job, now() + interval '5 days', now() + interval '5 days 30 minutes', 'online') returning id into s1;
  insert into interview_slots (company_id, job_id, starts_at, ends_at, mode) values (co, job, now() + interval '6 days', now() + interval '6 days 30 minutes', 'online') returning id into s2;
  perform pg_temp.act(nova); perform invite_to_schedule(m);
  perform pg_temp.act(cam); perform book_slot(s1, m);
  perform pg_temp.root(); select id into i1 from interviews where match_id = m and status = 'confirmada';
  perform pg_temp.act(nova); perform cancel_interview(i1, 'Cambio de turno');
  perform invite_to_schedule(m);
  perform pg_temp.act(cam); perform book_slot(s2, m);
  select string_agg(status || '@' || to_char(starts_at, 'DD/MM HH24:MI'), ',' order by starts_at) into b from my_interviews() where match_id = m;
  perform pg_temp.act(nova); select string_agg(status || '@' || to_char(starts_at, 'DD/MM HH24:MI'), ',' order by starts_at) into a from my_interviews() where match_id = m;
  out := out || E'\n4 reprogramada por Nova: Camila y Nova ven lo mismo (' || coalesce(b, '-') || '): ' || coalesce((a = b and b like 'cancelada@%,confirmada@%'), false);

  -- 5) Oferta que vence: Camila no puede aceptarla, ambos la ven vencida; Nova reenvía y Camila acepta
  ofr := send_offer(m, '{"position":"Cajero/a","salary":650000,"contract":"indefinido","schedule":"completa","expires_on":"2030-01-01","letter":{"signer_name":"Nova Test","signer_title":"Jefa de RR.HH."}}'::jsonb);
  perform pg_temp.root(); update offers set expires_on = (now() at time zone 'America/Santiago')::date - 1 where id = ofr;
  perform pg_temp.act(cam); begin perform respond_offer(ofr, true, ''); msg := 'aceptó'; exception when others then msg := sqlerrm; end;
  perform pg_temp.root(); update offers set status = 'vencida' where id = ofr;  -- lo mismo que hace el proceso de cada hora, solo para esta oferta
  perform pg_temp.act(cam); select status into b from offers where match_id = m order by created_at desc limit 1;
  perform pg_temp.act(nova); select status into a from offers where match_id = m order by created_at desc limit 1;
  out := out || E'\n5 oferta vencida: Camila no puede aceptarla («' || msg || '») y ambos la ven vencida: ' || coalesce((msg like 'La oferta venció%' and a = 'vencida' and b = 'vencida'), false);
  ofr2 := send_offer(m, '{"position":"Cajero/a","salary":670000,"contract":"indefinido","schedule":"completa","expires_on":"2030-01-01","letter":{"signer_name":"Nova Test","signer_title":"Jefa de RR.HH."}}'::jsonb);
  perform pg_temp.act(cam); perform respond_offer(ofr2, true, 'Acepto');
  perform pg_temp.root();
  out := out || E'\n5b reenviada y aceptada: Camila queda contratada: ' || ((select stage from matches where id = m) = 'contratado');
  -- Siempre se deshace todo: el resultado viaja en este error
  raise exception 'RESULTADO_RECORRIDO:%', out;
end $t$;
rollback;
