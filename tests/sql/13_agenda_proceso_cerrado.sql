-- Agendar entrevista solo en procesos abiertos (migración 20261124010000). Crea sus propios datos y TODO se deshace con rollback.
-- Cada línea dice «true» si el resultado es el esperado.
begin;
create function pg_temp.act(u uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.root() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('request.jwt.claims', '{}', true); end $$;

do $t$
declare
  own uuid := gen_random_uuid(); cand uuid := gen_random_uuid(); co uuid; job uuid; m uuid; s1 uuid; s2 uuid; ok boolean; out text := ''; cs boolean; n int; msg text;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (own, 'duena@agenda.test', '{"role":"company","first_name":"Olga","last_name":"Dueña"}'),
    (cand, 'cand@agenda.test', '{"first_name":"Ana","last_name":"Postula"}');
  insert into companies (owner_id, display_name, legal_name, rut, verification_status) values (own, 'Agenda SpA', 'Agenda SpA', '76.555.123-4', 'verified') returning id into co;
  insert into jobs (company_id, title, area, level, description, modality, schedule, contract, region, comuna, status)
    values (co, 'Vendedor/a', 'ventas', 'junior', 'Atención de clientes en sala de ventas y caja, jornada completa.', 'presencial', 'completa', 'indefinido', 'Maule', 'Talca', 'published') returning id into job;
  insert into matches (job_id, candidate_id, company_id, stage, can_schedule) values (job, cand, co, 'contacto', true) returning id into m;
  insert into interview_slots (company_id, starts_at, ends_at, mode) values (co, now() + interval '2 days', now() + interval '2 days 30 minutes', 'online') returning id into s1;
  insert into interview_slots (company_id, starts_at, ends_at, mode) values (co, now() + interval '3 days', now() + interval '3 days 30 minutes', 'online') returning id into s2;

  -- 1) Proceso abierto: puede agendar y ve horarios
  perform pg_temp.act(cand);
  select can_schedule into cs from my_matches() where match_id = m; select count(*) into n from available_slots(m);
  out := out || E'\n1 proceso abierto: puede agendar y ve 2 horarios: ' || (cs and n = 2);

  -- 2) Contratado/a con la invitación aún activa: ya no puede agendar, no ve horarios y el enlace antiguo falla con mensaje claro
  perform pg_temp.root(); update matches set stage = 'contratado' where id = m;
  perform pg_temp.act(cand);
  select can_schedule into cs from my_matches() where match_id = m; select count(*) into n from available_slots(m);
  begin perform book_slot(s1, m); msg := 'agendó'; exception when others then msg := sqlerrm; end;
  out := out || E'\n2 contratado/a: sin agenda, sin horarios y el enlace anterior no agenda: ' || (not cs and n = 0 and msg like 'Este proceso ya terminó%');

  -- 3) Descartado y en oferta: tampoco
  perform pg_temp.root(); update matches set stage = 'descartado' where id = m; perform pg_temp.act(cand);
  select can_schedule into cs from my_matches() where match_id = m; ok := not cs;
  perform pg_temp.root(); update matches set stage = 'oferta' where id = m; perform pg_temp.act(cand);
  select can_schedule into cs from my_matches() where match_id = m;
  out := out || E'\n3 descartado y en oferta: sin agenda: ' || (ok and not cs);

  -- 4) Vacante cerrada con el proceso en contacto: no; en pausa: sí (los procesos en curso siguen)
  perform pg_temp.root(); update matches set stage = 'contacto' where id = m; update jobs set status = 'closed' where id = job; perform pg_temp.act(cand);
  select can_schedule into cs from my_matches() where match_id = m; ok := not cs;
  perform pg_temp.root(); update jobs set status = 'paused' where id = job; perform pg_temp.act(cand);
  select can_schedule into cs from my_matches() where match_id = m;
  out := out || E'\n4 vacante cerrada: sin agenda; en pausa: sí: ' || (ok and cs);

  -- 5) Proceso abierto agenda bien, queda en entrevista y el historial (mensaje) se conserva; la empresa ve el mismo estado
  perform pg_temp.root(); update jobs set status = 'published' where id = job; perform pg_temp.act(cand);
  perform book_slot(s2, m);
  perform pg_temp.root();
  ok := (select stage from matches where id = m) = 'entrevista' and exists (select 1 from messages where match_id = m and body like 'Agendé una entrevista%');
  perform pg_temp.act(own); select can_schedule into cs from my_matches() where match_id = m;
  out := out || E'\n5 proceso abierto: agenda, pasa a entrevista, guarda el mensaje y la empresa ve lo mismo: ' || (ok and cs);
  perform pg_temp.root();
  raise notice '%', out;
  -- Si alguna comprobación da «false», la prueba FALLA (no solo lo imprime)
  if out ~ ': false' then raise exception 'PRUEBA FALLIDA:%', out; end if;
end $t$;
rollback;
