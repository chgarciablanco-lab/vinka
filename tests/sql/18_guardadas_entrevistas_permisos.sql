-- Revisión 3 (migración 20261125030000) en la base AISLADA. Datos propios; todo se deshace con rollback.
-- Si alguna comprobación da «false», la prueba FALLA (lanza un error), no solo lo imprime.
begin;
create function pg_temp.act(u uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.root() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('request.jwt.claims', '{}', true); end $$;
create function pg_temp.has(t jsonb, k text) returns boolean language sql as $$ select exists (select 1 from jsonb_array_elements(t) x where x->>'key' = k) $$;

do $t$
declare
  own uuid := gen_random_uuid(); cand uuid := gen_random_uuid(); c2 uuid := gen_random_uuid();
  mown uuid := gen_random_uuid(); clown uuid := gen_random_uuid(); clown2 uuid := gen_random_uuid(); adv uuid := gen_random_uuid();
  co uuid; job uuid; m uuid; s1 uuid; s2 uuid; iv uuid; iv2 uuid; mat uuid; cli uuid; cli2 uuid; jcli uuid; jcli2 uuid;
  t jsonb; n int; ok boolean; msg text; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (own, 'duena@r3.test', '{"role":"company","first_name":"Olga","last_name":"Dueña"}'),
    (cand, 'ana@r3.test', '{"first_name":"Ana","last_name":"Postula"}'), (c2, 'bea@r3.test', '{"first_name":"Bea","last_name":"Dos"}'),
    (mown, 'matriz@r3.test', '{"role":"company","first_name":"Mara","last_name":"Matriz"}'),
    (clown, 'cliente@r3.test', '{"role":"company","first_name":"Cleo","last_name":"Cliente"}'),
    (clown2, 'cliente2@r3.test', '{"role":"company","first_name":"Cami","last_name":"Otra"}'),
    (adv, 'asesora@r3.test', '{"role":"company","first_name":"Ada","last_name":"Asesora"}');
  insert into companies (owner_id, display_name, legal_name, rut, verification_status, stale_days) values (own, 'R3 SpA', 'R3 SpA', '76.555.123-4', 'verified', 5) returning id into co;
  insert into jobs (company_id, title, area, level, description, modality, schedule, contract, region, comuna, status)
    values (co, 'Cajero/a', 'ventas', 'junior', 'Atención de caja y clientes en sala de ventas, jornada completa.', 'presencial', 'completa', 'indefinido', 'Maule', 'Talca', 'published') returning id into job;

  -- 1) Guardar mantiene el pendiente: postula → guardar → «guardadas por decidir» → decidir → deja de ser pendiente
  insert into candidate_job_actions (candidate_id, job_id, action) values (c2, job, 'interest');
  perform pg_temp.act(own); t := company_todo(co); ok := pg_temp.has(t, 'interesados') and not pg_temp.has(t, 'guardadas');
  perform pg_temp.root(); insert into company_candidate_actions (job_id, candidate_id, action, created_by) values (job, c2, 'save', own);
  perform pg_temp.act(own); t := company_todo(co);
  select count(*) into n from company_saved_list(co) s where s.candidate_id = c2 and s.job_id = job;
  ok := ok and pg_temp.has(t, 'guardadas') and n = 1 and exists (select 1 from jsonb_array_elements(t) x where x->>'key' = 'guardadas' and x->>'url' = '/pendientes/guardadas');
  perform pg_temp.root(); update company_candidate_actions set action = 'pass' where job_id = job and candidate_id = c2;
  perform pg_temp.act(own); t := company_todo(co);
  out := out || E'\n1 postula → guardar → sigue pendiente como «guardada por decidir» → al decidir deja de serlo: ' || (ok and not pg_temp.has(t, 'guardadas'));

  -- 2) «Procesos sin avanzar» cuenta procesos (una persona en dos vacantes = 2) y la lista trae a la persona para abrir su ficha
  perform pg_temp.root();
  insert into matches (job_id, candidate_id, company_id, stage, can_schedule) values (job, cand, co, 'contacto', true) returning id into m;
  insert into jobs (company_id, title, area, level, description, modality, schedule, contract, region, comuna, status)
    values (co, 'Reponedor/a', 'ventas', 'junior', 'Reposición de góndolas y orden de bodega, jornada completa.', 'presencial', 'completa', 'indefinido', 'Maule', 'Talca', 'paused') returning id into jcli;
  insert into matches (job_id, candidate_id, company_id, stage) values (jcli, cand, co, 'match');
  update matches set stage_changed_at = now() - interval '9 days', created_at = now() - interval '9 days' where company_id = co;
  perform pg_temp.act(own); t := company_todo(co);
  select count(*) into n from company_stale_list(co) s where s.candidate_id = cand;
  out := out || E'\n2 una persona en dos vacantes cuenta como 2 «procesos sin avanzar» y la lista trae su ficha: '
    || (exists (select 1 from jsonb_array_elements(t) x where x->>'key' = 'estancados' and (x->>'n')::int = 2 and x->>'label' like 'procesos sin avanzar%') and n = 2);

  -- 3) Entrevista: agendar → reprogramar (cancelar y tomar otro horario) → cancelar; empresa y persona ven lo mismo
  perform add_slots(co, jsonb_build_array(jsonb_build_object('s', now() + interval '2 days', 'e', now() + interval '2 days 30 minutes'),
                                          jsonb_build_object('s', now() + interval '3 days', 'e', now() + interval '3 days 30 minutes')), 'online', 'https://meet.example.com/r3', '', '', '', job);
  perform pg_temp.root(); select id into s1 from interview_slots where company_id = co order by starts_at limit 1; select id into s2 from interview_slots where company_id = co order by starts_at desc limit 1;
  perform pg_temp.act(cand); iv := book_slot(s1, m);
  begin perform book_slot(s2, m); msg := 'agendó dos'; exception when others then msg := sqlerrm; end;
  ok := msg like 'Ya tienes una entrevista agendada%';
  perform cancel_interview(iv, 'Me cambiaron el turno'); iv2 := book_slot(s2, m);
  perform pg_temp.root();
  ok := ok and (select status from interview_slots where id = s1) = 'open' and (select status from interviews where id = iv) = 'cancelada' and (select status from interviews where id = iv2) = 'confirmada';
  perform pg_temp.act(own); perform cancel_interview(iv2, 'Se cubrió el cargo');
  perform pg_temp.act(cand); ok := ok and exists (select 1 from my_interviews() x where x.interview_id = iv2 and x.status = 'cancelada');
  perform pg_temp.act(own); ok := ok and exists (select 1 from my_interviews() x where x.interview_id = iv2 and x.status = 'cancelada');
  perform pg_temp.root();
  out := out || E'\n3 entrevista: no permite dos a la vez; reprogramar libera el horario; al cancelar la empresa, ambos ven «cancelada»: '
    || (ok and (select status from interview_slots where id = s2) = 'cancelled' and (select count(*) from messages where match_id = m and body like 'Cancelé la entrevista%') = 2);

  -- 4) Matriz y clientes: la matriz ve el proceso de su cliente; un cliente no ve el de otro cliente; sin vínculo, nada
  insert into companies (owner_id, display_name, legal_name, rut, verification_status, kind) values (mown, 'Consultora R3', 'Consultora R3 SpA', '77.612.345-5', 'verified', 'consultora') returning id into mat;
  insert into companies (owner_id, display_name, legal_name, rut, verification_status, parent_id) values (clown, 'Cliente Uno', 'Cliente Uno SpA', '76.111.222-8', 'verified', mat) returning id into cli;
  insert into companies (owner_id, display_name, legal_name, rut, verification_status, parent_id) values (clown2, 'Cliente Dos', 'Cliente Dos SpA', '76.333.444-9', 'verified', mat) returning id into cli2;
  insert into jobs (company_id, title, area, level, description, modality, schedule, contract, region, comuna, status)
    values (cli, 'Garzón/a', 'gastronomia', 'junior', 'Atención de mesas y caja en restaurante, turnos rotativos.', 'presencial', 'completa', 'indefinido', 'Maule', 'Talca', 'published') returning id into jcli;
  insert into jobs (company_id, title, area, level, description, modality, schedule, contract, region, comuna, status)
    values (cli2, 'Cocinero/a', 'gastronomia', 'junior', 'Preparación de platos y orden de cocina, turnos rotativos.', 'presencial', 'completa', 'indefinido', 'Maule', 'Talca', 'published') returning id into jcli2;
  perform pg_temp.act(mown); begin perform job_pipeline(jcli); ok := true; exception when others then ok := false; end;
  perform pg_temp.act(clown); begin perform job_pipeline(jcli2); ok := ok and false; exception when others then null; end;
  perform pg_temp.act(clown); begin perform company_stale_list(cli2); ok := ok and false; exception when others then null; end;
  perform pg_temp.act(own); begin perform job_pipeline(jcli); ok := ok and false; exception when others then null; end;
  perform pg_temp.act(clown2); begin perform company_saved_list(cli); ok := ok and false; exception when others then null; end;
  out := out || E'\n4 matriz ve a su cliente; un cliente no ve a otro; una empresa ajena no ve nada (tablero y listas): ' || ok;

  -- 5) Colaborador (asesor) de una vacante: ve solo ese tablero y pierde el acceso al revocarse
  perform pg_temp.root();
  update profiles set role = 'advisor' where id = adv;
  insert into advisors (user_id, specialty, active, terms_accepted_at) values (adv, 'Selección', true, now());
  insert into job_collaborators (job_id, user_id, invited_by) values (jcli, adv, clown);
  perform pg_temp.act(adv); begin perform job_pipeline(jcli); ok := true; exception when others then ok := false; end;
  begin perform job_pipeline(jcli2); ok := ok and false; exception when others then null; end;
  begin perform company_stale_list(cli); ok := ok and false; exception when others then null; end;
  perform pg_temp.root(); delete from job_collaborators where job_id = jcli and user_id = adv;
  perform pg_temp.act(adv); begin perform job_pipeline(jcli); ok := ok and false; exception when others then null; end;
  perform pg_temp.root();
  out := out || E'\n5 colaborador: ve solo su vacante, no las listas de la empresa, y pierde acceso al revocarse: ' || ok;

  raise notice '%', out;
  if out ~ ': false' then raise exception 'PRUEBA FALLIDA:%', out; end if;
end $t$;
rollback;
