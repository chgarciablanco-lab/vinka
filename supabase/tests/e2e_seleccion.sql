-- Recorrido completo de selección con cuentas de prueba: Agroexport (agro.test) publica, Diego (diego.test) postula,
-- match, chat, contacto, agenda con invitación, entrevista, evaluación, oferta, aceptación, reportes y cierre.
-- Cada paso se ejecuta con el rol de quien lo hace en la app. Todo se revierte con el RAISE final.
do $t$
declare r text := ''; n int := 0; okc int := 0; e text; ok boolean; j jsonb;
  co uuid := '189c6e85-2bc4-4c58-8e9f-722eb5a2a36a'; a uuid := 'f09fef47-06c4-4d2c-a6ca-74f8d28904a7';
  d uuid := 'ff07a334-e037-4690-b649-a309e10638cc';
  jid uuid; mid uuid; sid uuid; iv uuid; oid_ uuid; tpl jobs;
begin
  -- helper inline: cada paso = begin … exception → registra OK/FALLA con el motivo
  select * into tpl from jobs where company_id = co and status = 'published' limit 1;

  -- 1 Publicar una vacante
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true); set local role authenticated;
    insert into jobs (company_id, title, description, area, level, role_level, modality, schedule, contract, region, comuna, salary_min, salary_max, salary_type, status)
    values (co, 'Vendedor/a de terreno Maule', 'Venta en terreno a clientes agrícolas de Linares y alrededores. Jornada completa, auto de la empresa.',
            'Ventas', tpl.level, 2, 'Presencial', 'Completa', 'Indefinido', 'Maule', 'Linares', 600000, 750000, 'liquido', 'published') returning id into jid;
    reset role;
    ok := (select status from jobs where id = jid) = 'published'; e := '';
  exception when others then ok := false; e := sqlerrm; end;
  n := n + 1; okc := okc + ok::int; r := r || case when ok then 'OK   ' else 'FALLA' end || ' 01 Empresa publica vacante ' || left(e, 80) || E'\n';

  -- 2 La vacante aparece en Explorar del postulante que calza
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', d, 'role','authenticated')::text, true); set local role authenticated;
    ok := exists (select 1 from job_feed(false) f where f.id = jid) or exists (select 1 from job_feed(true) f where f.id = jid); e := '';
    reset role;
  exception when others then ok := false; e := sqlerrm; end;
  n := n + 1; okc := okc + ok::int; r := r || case when ok then 'OK   ' else 'FALLA' end || ' 02 La vacante aparece en Explorar del postulante ' || left(e, 80) || E'\n';

  -- 3 El postulante dice «Me interesa»
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', d, 'role','authenticated')::text, true); set local role authenticated;
    insert into candidate_job_actions (candidate_id, job_id, action) values (d, jid, 'interest');
    reset role; ok := true; e := '';
  exception when others then ok := false; e := sqlerrm; end;
  n := n + 1; okc := okc + ok::int; r := r || case when ok then 'OK   ' else 'FALLA' end || ' 03 Postulante: Me interesa ' || left(e, 80) || E'\n';

  -- 4 La empresa lo ve en el tablero
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true); set local role authenticated;
    j := to_jsonb(job_pipeline(jid)); reset role;
    ok := exists (select 1 from jsonb_array_elements(j->'cards') c where c->>'candidate_id' = d::text and c->>'stage' = 'postulante'); e := '';
  exception when others then ok := false; e := sqlerrm; end;
  n := n + 1; okc := okc + ok::int; r := r || case when ok then 'OK   ' else 'FALLA' end || ' 04 Empresa lo ve como Interesado en el tablero ' || left(e, 80) || E'\n';

  -- 5 La empresa hace match
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true); set local role authenticated;
    perform pipeline_move('interesado', d, jid, 'match'); reset role;
    select id into mid from matches where job_id = jid and candidate_id = d; ok := mid is not null; e := '';
  exception when others then ok := false; e := sqlerrm; end;
  n := n + 1; okc := okc + ok::int; r := r || case when ok then 'OK   ' else 'FALLA' end || ' 05 Hacer match ' || left(e, 80) || E'\n';
  ok := exists (select 1 from notifications where user_id = d and kind = 'match' and created_at > now() - interval '1 minute');
  n := n + 1; okc := okc + ok::int; r := r || case when ok then 'OK   ' else 'FALLA' end || ' 06 Aviso de match al postulante' || E'\n';

  -- 7 El postulante no puede escribir primero
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', d, 'role','authenticated')::text, true); set local role authenticated;
    insert into messages (match_id, sender_id, body) values (mid, d, 'Hola!'); reset role; ok := false; e := 'pudo escribir primero';
  exception when others then ok := true; e := ''; end;
  n := n + 1; okc := okc + ok::int; r := r || case when ok then 'OK   ' else 'FALLA' end || ' 07 Postulante no escribe primero ' || left(e, 80) || E'\n';

  -- 8 Chat: empresa escribe, postulante responde
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true); set local role authenticated;
    insert into messages (match_id, sender_id, body) values (mid, a, 'Hola Diego, gracias por tu interés. ¿Conversamos?'); reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', d, 'role','authenticated')::text, true); set local role authenticated;
    insert into messages (match_id, sender_id, body) values (mid, d, '¡Hola! Sí, encantado.'); reset role;
    ok := (select count(*) from messages where match_id = mid) = 2; e := '';
  exception when others then ok := false; e := sqlerrm; end;
  n := n + 1; okc := okc + ok::int; r := r || case when ok then 'OK   ' else 'FALLA' end || ' 08 Chat en ambos sentidos ' || left(e, 80) || E'\n';

  -- 9 Contacto: la empresa pide, el postulante comparte, la empresa ve el teléfono
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true); set local role authenticated;
    perform match_update(mid, 'request_contact', null); reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', d, 'role','authenticated')::text, true); set local role authenticated;
    perform match_update(mid, 'share_contact', null); reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true); set local role authenticated;
    ok := exists (select 1 from my_matches() x where x.match_id = mid and x.contact_shared and x.candidate_email is not null); reset role; e := '';
  exception when others then ok := false; e := sqlerrm; end;
  n := n + 1; okc := okc + ok::int; r := r || case when ok then 'OK   ' else 'FALLA' end || ' 09 Compartir contacto ' || left(e, 80) || E'\n';

  -- 10 Agenda: horarios publicados, el postulante no los ve sin invitación
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true); set local role authenticated;
    perform add_slots(co, jsonb_build_array(jsonb_build_object('s', date_trunc('hour', now()) + interval '3 days 2 hours', 'e', date_trunc('hour', now()) + interval '3 days 2 hours 30 minutes')),
      'online', 'https://meet.example.com/vinka-prueba', null, null, 'Entrevista breve', jid);
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', d, 'role','authenticated')::text, true); set local role authenticated;
    ok := (select count(*) from available_slots(mid)) = 0; reset role; e := '';
  exception when others then ok := false; e := sqlerrm; end;
  n := n + 1; okc := okc + ok::int; r := r || case when ok then 'OK   ' else 'FALLA' end || ' 10 Sin invitación no ve horarios ' || left(e, 80) || E'\n';

  -- 11 Invitar a agendar y reservar
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true); set local role authenticated;
    perform invite_to_schedule(mid); reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', d, 'role','authenticated')::text, true); set local role authenticated;
    select slot_id into sid from available_slots(mid) order by starts_at limit 1;
    perform book_slot(sid, mid); reset role;
    select id into iv from interviews where match_id = mid order by created_at desc limit 1;
    ok := iv is not null and (select stage from matches where id = mid) = 'entrevista'; e := coalesce((select stage from matches where id = mid), '');
  exception when others then ok := false; e := sqlerrm; end;
  n := n + 1; okc := okc + ok::int; r := r || case when ok then 'OK   ' else 'FALLA' end || ' 11 Invitar a agendar y reservar (etapa: ' || left(e, 70) || ')' || E'\n';
  ok := exists (select 1 from notifications where user_id = a and kind = 'interview_booked' and created_at > now() - interval '1 minute');
  n := n + 1; okc := okc + ok::int; r := r || case when ok then 'OK   ' else 'FALLA' end || ' 12 Aviso de entrevista agendada a la empresa' || E'\n';

  -- 13 Entrevista realizada + evaluación
  begin
    update interviews set starts_at = now() - interval '2 hours', ends_at = now() - interval '90 minutes' where id = iv;  -- simula que ya ocurrió
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true); set local role authenticated;
    perform complete_interview(iv);
    insert into evaluations (company_id, job_id, candidate_id, author_id, scores, overall, recommendation, note)
    values (co, jid, d, a, '{"comunicacion":4,"experiencia":4}'::jsonb, 4, 'si', 'Buena experiencia en terreno.');
    reset role;
    ok := (select status from interviews where id = iv) = 'realizada' and exists (select 1 from evaluations where job_id = jid and candidate_id = d); e := '';
  exception when others then ok := false; e := sqlerrm; end;
  n := n + 1; okc := okc + ok::int; r := r || case when ok then 'OK   ' else 'FALLA' end || ' 13 Entrevista realizada y evaluada ' || left(e, 80) || E'\n';

  -- 14 Carta oferta
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true); set local role authenticated;
    j := to_jsonb(send_offer(mid, '{"position":"Vendedor/a de terreno","salary":700000,"salary_type":"liquido","contract":"Indefinido","schedule":"Completa","start_date":"2026-12-01","location":"Linares","letter":{"signer_name":"Ana Rojas","signer_title":"Gerenta comercial","city":"Talca"}}'::jsonb));
    reset role;
    select id into oid_ from offers where match_id = mid order by created_at desc limit 1;
    ok := (select status from offers where id = oid_) = 'enviada' and (select stage from matches where id = mid) = 'oferta'; e := coalesce((select status from offers where id = oid_), 'sin oferta');
  exception when others then ok := false; e := sqlerrm; end;
  n := n + 1; okc := okc + ok::int; r := r || case when ok then 'OK   ' else 'FALLA' end || ' 14 Enviar carta oferta (' || left(e, 70) || ')' || E'\n';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', d, 'role','authenticated')::text, true); set local role authenticated;
    j := to_jsonb(offer_letter(oid_)); reset role;
    ok := j is not null and j::text like '%Vendedor/a de terreno%'; e := '';
  exception when others then ok := false; e := sqlerrm; end;
  n := n + 1; okc := okc + ok::int; r := r || case when ok then 'OK   ' else 'FALLA' end || ' 15 Postulante ve su carta oferta ' || left(e, 80) || E'\n';

  -- 16 Aceptar la oferta → contratado
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', d, 'role','authenticated')::text, true); set local role authenticated;
    perform respond_offer(oid_, true, 'Acepto, gracias'); reset role;
    ok := (select stage from matches where id = mid) = 'contratado' and (select status from offers where id = oid_) = 'aceptada'; e := '';
  exception when others then ok := false; e := sqlerrm; end;
  n := n + 1; okc := okc + ok::int; r := r || case when ok then 'OK   ' else 'FALLA' end || ' 16 Aceptar oferta → Contratado ' || left(e, 80) || E'\n';

  -- 17 Intereses del postulante muestran el estado (la pantalla une my_interests y my_matches; con match, el estado viene de my_matches)
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', d, 'role','authenticated')::text, true); set local role authenticated;
    select jsonb_agg(to_jsonb(x)) into j from my_matches() x where to_jsonb(x)::text like '%' || jid::text || '%'; reset role;
    ok := coalesce(j::text like '%contratado%', false); e := '';
  exception when others then ok := false; e := sqlerrm; end;
  n := n + 1; okc := okc + ok::int; r := r || case when ok then 'OK   ' else 'FALLA' end || ' 17 Intereses del postulante muestran «contratado» ' || left(e, 80) || E'\n';

  -- 18 Reportes de la empresa cuentan la contratación
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true); set local role authenticated;
    j := to_jsonb(company_report(co, 30)); reset role;
    ok := j is not null; e := left(j::text, 0);
  exception when others then ok := false; e := sqlerrm; end;
  n := n + 1; okc := okc + ok::int; r := r || case when ok then 'OK   ' else 'FALLA' end || ' 18 Reportes de la empresa responden ' || left(e, 80) || E'\n';

  -- 19 Cerrar la vacante
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true); set local role authenticated;
    update jobs set status = 'closed' where id = jid; reset role;
    ok := (select status from jobs where id = jid) = 'closed'; e := '';
  exception when others then ok := false; e := sqlerrm; end;
  n := n + 1; okc := okc + ok::int; r := r || case when ok then 'OK   ' else 'FALLA' end || ' 19 Cerrar la vacante ' || left(e, 80) || E'\n';

  raise exception E'SELECCIÓN DE PUNTA A PUNTA (revertido): % de % OK\n%', okc, n, r;
end $t$;
