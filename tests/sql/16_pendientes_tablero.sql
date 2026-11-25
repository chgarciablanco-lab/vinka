-- Pendientes del Panel y desglose del tablero (migración 20261125010000). Datos propios; todo se deshace con rollback.
begin;
create function pg_temp.act(u uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.root() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('request.jwt.claims', '{}', true); end $$;
do $t$
declare own uuid := gen_random_uuid(); c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); c3 uuid := gen_random_uuid(); co uuid; job uuid; m uuid; t jsonb; j jsonb; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (own, 'duena@pend.test', '{"role":"company","first_name":"Olga","last_name":"Dueña"}'),
    (c1, 'c1@pend.test', '{"first_name":"Ana","last_name":"Uno"}'), (c2, 'c2@pend.test', '{"first_name":"Bea","last_name":"Dos"}'), (c3, 'c3@pend.test', '{"first_name":"Caro","last_name":"Tres"}');
  insert into companies (owner_id, display_name, legal_name, rut, verification_status, stale_days) values (own, 'Pend SpA', 'Pend SpA', '76.555.123-4', 'verified', 5) returning id into co;
  insert into jobs (company_id, title, area, level, description, modality, schedule, contract, region, comuna, status)
    values (co, 'Cajero/a', 'ventas', 'junior', 'Atención de caja y clientes en sala de ventas, jornada completa.', 'presencial', 'completa', 'indefinido', 'Maule', 'Talca', 'published') returning id into job;
  -- c1 postula y hace match (proceso detenido hace 10 días); c2 postula y la empresa la descarta antes del match; c3 invitada por la empresa sin postular; 1 externa
  insert into candidate_job_actions (candidate_id, job_id, action) values (c1, job, 'interest'), (c2, job, 'interest');
  insert into company_candidate_actions (job_id, candidate_id, action, created_by) values (job, c1, 'interest', own), (job, c2, 'pass', own);
  select id into m from matches where job_id = job and candidate_id = c1;
  update matches set stage_changed_at = now() - interval '10 days', created_at = now() - interval '10 days' where id = m;
  insert into matches (job_id, candidate_id, company_id, stage) values (job, c3, co, 'match');
  insert into external_applicants (company_id, job_id, full_name, email, stage, source) values (co, job, 'Daniela Externa', 'd@pend.test', 'nuevo', 'Importación');

  -- 1) Desglose del tablero: 3 postulaciones (2 VINKA + 1 externa), 1 descartada antes del match, 1 invitada sin postular
  perform pg_temp.act(own); j := job_pipeline(job);
  out := out || E'\n1 tablero con desglose (2 VINKA, 1 externa, 1 descartada antes, 1 invitada) y 3 tarjetas: '
    || ((j->'counts'->>'con_cuenta')::int = 2 and (j->'counts'->>'externas')::int = 1 and (j->'counts'->>'descartadas_antes')::int = 1 and (j->'counts'->>'invitadas')::int = 1 and jsonb_array_length(j->'cards') = 3);

  -- 2) Pendientes: con la vacante publicada aparece «1 persona sin avanzar hace más de 5 días»
  t := company_todo(co);
  out := out || E'\n2 vacante publicada: el Panel muestra 1 persona sin avanzar: ' || exists (select 1 from jsonb_array_elements(t) x where x->>'key' = 'estancados' and (x->>'n')::int = 1);

  -- 3) En pausa el proceso sigue: el pendiente se mantiene (antes desaparecía y el Panel decía «Todo al día»)
  perform pg_temp.root(); update jobs set status = 'paused' where id = job; perform pg_temp.act(own);
  t := company_todo(co);
  out := out || E'\n3 vacante en pausa: el pendiente se mantiene: ' || exists (select 1 from jsonb_array_elements(t) x where x->>'key' = 'estancados');

  -- 4) Cerrada: ya no es un pendiente
  perform pg_temp.root(); update jobs set status = 'closed' where id = job; perform pg_temp.act(own);
  t := company_todo(co);
  out := out || E'\n4 vacante cerrada: deja de ser pendiente: ' || not exists (select 1 from jsonb_array_elements(t) x where x->>'key' = 'estancados');

  -- 5) Otra empresa no ve estos pendientes
  perform pg_temp.act(c1); begin perform company_todo(co); out := out || E'\n5 otra cuenta no puede leer los pendientes: false'; exception when others then out := out || E'\n5 otra cuenta no puede leer los pendientes: true'; end;
  perform pg_temp.root();
  raise notice '%', out;
  -- Si alguna comprobación da «false», la prueba FALLA (no solo lo imprime)
  if out ~ ': false' then raise exception 'PRUEBA FALLIDA:%', out; end if;
end $t$;
rollback;
