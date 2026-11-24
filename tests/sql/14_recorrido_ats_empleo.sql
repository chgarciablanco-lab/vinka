-- Recorrido de punta a punta ATS ↔ Empleo en la base AISLADA, actuando como cada rol con las mismas llamadas que la app.
-- Crea sus propias cuentas y datos ficticios y TODO se deshace con rollback. Cada línea dice «true» si el resultado es el esperado.
begin;
create function pg_temp.act(u uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.anon() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon'; end $$;
create function pg_temp.root() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('request.jwt.claims', '{}', true); end $$;
create function pg_temp.notif(u uuid, k text) returns boolean language sql as $$ select exists (select 1 from notifications where user_id = u and kind = k) $$;

do $t$
declare
  own uuid := gen_random_uuid(); cand uuid := gen_random_uuid(); co uuid; job uuid; m uuid; sl uuid; ofr uuid; r text; r2 text; ok boolean; n int; j jsonb; out text := ''; msg text;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (own, 'duena@recorrido.test', '{"role":"company","first_name":"Olga","last_name":"Dueña"}'),
    (cand, 'ana@recorrido.test', '{"first_name":"Ana","last_name":"Postula"}');
  update candidate_profiles set onboarding_done = true, is_public = true, headline = 'Vendedora', experiences = '[{"cargo":"Vendedora"}]' where user_id = cand;
  insert into companies (owner_id, display_name, legal_name, rut, verification_status) values (own, 'Recorrido SpA', 'Recorrido SpA', '76.555.123-4', 'verified') returning id into co;

  -- 1) Borrador → publicación → ficha pública
  perform pg_temp.act(own);
  insert into jobs (company_id, title, area, level, description, modality, schedule, contract, region, comuna, status, salary_min, salary_max)
    values (co, 'Vendedor/a de prueba', 'ventas', 'junior', 'Atención de clientes en sala de ventas, cotizaciones y caja. Jornada completa.', 'presencial', 'completa', 'indefinido', 'Maule', 'Talca', 'draft', 600000, 750000) returning id into job;
  perform pg_temp.anon(); begin j := public_job(job); ok := j is null; exception when others then ok := true; end;
  perform pg_temp.act(own); update jobs set status = 'published' where id = job;
  perform pg_temp.anon(); j := public_job(job);
  out := out || E'\n1 borrador oculto al público; publicada se ve en su ficha pública: ' || coalesce(((ok and j->'job'->>'title' = 'Vendedor/a de prueba'))::text, 'NULO');

  -- (Explorar muestra hasta 50 vacantes; en la copia aislada hay muchas de demostración, así que se pausan dentro de esta prueba)
  perform pg_temp.root(); update jobs set status = 'paused' where status = 'published' and id <> job;
  -- 2) Postulante con cuenta: la ve en Explorar y muestra interés; la empresa la recibe en el tablero con origen VINKA y aviso
  perform pg_temp.act(cand);
  ok := exists (select 1 from job_feed(false) f where f.id = job) or exists (select 1 from job_feed(true) f where f.id = job);
  insert into candidate_job_actions (candidate_id, job_id, action) values (cand, job, 'interest');
  perform pg_temp.act(own); j := job_pipeline(job);
  out := out || E'\n2 con cuenta: la vacante aparece en Explorar: ' || ok;
  out := out || E'\n2a la postulación llega al tablero como «interesado» con origen VINKA: ' || exists (select 1 from jsonb_array_elements(j->'cards') c where c->>'kind' = 'interesado' and c->>'source' = 'vinka');
  perform pg_temp.root();
  perform pg_temp.act(own); msg := company_todo(co)::text; perform pg_temp.root();
  out := out || E'\n2b INFORMATIVO aviso inmediato a la empresa por postulación con cuenta: ' || exists (select 1 from notifications where user_id = own and created_at > now() - interval '1 minute') || ' (la empresa la ve en los pendientes del Panel: ' || (msg ilike '%interesad%') || ')';

  -- 3) Sin cuenta (página pública): llega a la empresa y vacante correctas, con origen y aviso; repetir con el mismo correo no duplica
  perform pg_temp.anon();
  r := public_apply(job, 'Bruno Externo', 'bruno@recorrido.test', '+56 9 1234 5678', 'Vendedor', 'Disponible de inmediato', true, '');
  r2 := public_apply(job, 'Bruno Externo', 'BRUNO@recorrido.test', '', '', '', true, '');
  perform pg_temp.root();
  select count(*) into n from external_applicants where job_id = job and lower(email) = 'bruno@recorrido.test' and company_id = co and source = 'Página de empleos';
  out := out || E'\n3 sin cuenta: «ok», queda 1 vez en la vacante correcta con origen «Página de empleos» y repetir responde «ya_postulaste»: ' || coalesce(((r = 'ok' and r2 = 'ya_postulaste' and n = 1))::text, 'NULO');
  out := out || E'\n3b aviso a la empresa por la postulación sin cuenta: ' || coalesce((pg_temp.notif(own, 'public_apply'))::text, 'NULO');
  perform pg_temp.anon(); begin perform public_apply(job, 'Sin Permiso', 'x@recorrido.test', '', '', '', false, ''); msg := 'aceptó'; exception when others then msg := sqlerrm; end;
  out := out || E'\n3c sin aceptar la privacidad no se puede postular: ' || coalesce(((msg like 'Debes aceptar%'))::text, 'NULO');

  -- 4) Duplicidad entre vías: la misma persona con cuenta postula también sin cuenta con su correo
  r := public_apply(job, 'Ana Postula', 'ana@recorrido.test', '', '', '', true, '');
  perform pg_temp.act(own); j := job_pipeline(job);
  select count(*) into n from jsonb_array_elements(j->'cards') c where c->>'name' ilike 'Ana%';
  out := out || E'\n4 misma persona por ambas vías: responde «ya_postulaste» y queda 1 sola tarjeta (migración 20261124020000): ' || (n = 1 and r = 'ya_postulaste');

  -- 5) Match, chat, entrevista, oferta y cierre (con avisos a cada rol)
  perform pg_temp.act(own);
  insert into company_candidate_actions (job_id, candidate_id, action, created_by) values (job, cand, 'interest', own);
  perform pg_temp.root(); select id into m from matches where job_id = job and candidate_id = cand;
  out := out || E'\n5 match al interesarse ambos y aviso a la persona: ' || coalesce(((m is not null and pg_temp.notif(cand, 'match')))::text, 'NULO');
  perform pg_temp.act(own); insert into messages (match_id, sender_id, body) values (m, own, 'Hola Ana, ¿conversamos?');
  perform pg_temp.act(cand); insert into messages (match_id, sender_id, body) values (m, cand, '¡Hola! Sí, encantada.');
  perform pg_temp.act(own); begin perform invite_to_schedule(m); msg := 'invitó'; exception when others then msg := sqlerrm; end;
  out := out || E'\n5a invitar a agendar sin horarios publicados pide publicarlos primero: ' || coalesce(((msg like 'Primero publica horarios%'))::text, 'NULO');
  perform add_slots(co, jsonb_build_array(jsonb_build_object('s', now() + interval '2 days', 'e', now() + interval '2 days 30 minutes')), 'online', 'https://meet.example.com/x', '', '', '', job);
  perform pg_temp.root(); select id into sl from interview_slots where company_id = co and status = 'open' limit 1; perform pg_temp.act(own);
  perform invite_to_schedule(m);
  perform pg_temp.root(); out := out || E'\n5a2 aviso a la persona al invitarla a agendar: ' || coalesce((exists (select 1 from notifications where user_id = cand and created_at > now() - interval '1 minute' and kind not in ('match')))::text, 'NULO'); perform pg_temp.act(own);
  perform pg_temp.act(cand); perform book_slot(sl, m);
  perform pg_temp.root();
  out := out || E'\n5b chat en ambos sentidos, invitación a agendar y entrevista agendada (etapa entrevista): ' || coalesce((((select count(*) from messages where match_id = m) >= 3 and (select stage from matches where id = m) = 'entrevista' and exists (select 1 from interviews where match_id = m and status = 'confirmada')))::text, 'NULO');
  perform pg_temp.act(own);
  ofr := send_offer(m, '{"position":"Vendedor/a de prueba","salary":700000,"salary_type":"liquido","contract":"indefinido","schedule":"completa","start_date":"2026-12-15","expires_on":"2026-12-05","letter":{"signer_name":"Olga Dueña","signer_title":"Gerenta"}}'::jsonb);
  perform pg_temp.root();
  out := out || E'\n5c oferta enviada (etapa oferta) y aviso a la persona: ' || coalesce((((select stage from matches where id = m) = 'oferta' and exists (select 1 from notifications where user_id = cand and created_at > now() - interval '1 minute' and (kind ilike '%offer%' or kind ilike '%oferta%'))))::text, 'NULO');
  perform pg_temp.act(cand); perform respond_offer(ofr, true, 'Acepto, gracias');
  perform pg_temp.root();
  out := out || E'\n5d oferta aceptada: contratada y aviso a la empresa: ' || coalesce((((select stage from matches where id = m) = 'contratado' and exists (select 1 from notifications where user_id = own and created_at > now() - interval '1 minute' and (kind ilike '%offer%' or kind ilike '%oferta%'))))::text, 'NULO');
  perform pg_temp.act(cand);
  out := out || E'\n5e contratada: ya no ve la opción de agendar (regla nueva): ' || coalesce((not (select can_schedule from my_matches() where match_id = m))::text, 'NULO');

  -- 6) Pausa y cierre de la vacante
  perform pg_temp.act(own); update jobs set status = 'paused' where id = job;
  perform pg_temp.act(cand); ok := not exists (select 1 from job_feed(false) f where f.id = job) and not exists (select 1 from job_feed(true) f where f.id = job);
  perform pg_temp.anon(); begin perform public_apply(job, 'Carla Tarde', 'carla@recorrido.test', '', '', '', true, ''); msg := 'aceptó'; exception when others then msg := sqlerrm; end;
  out := out || E'\n6 en pausa: no aparece en Explorar y la página pública no recibe postulaciones: ' || coalesce(((ok and msg = 'Esta vacante ya no recibe postulaciones'))::text, 'NULO');
  perform pg_temp.act(own); update jobs set status = 'closed' where id = job;
  perform pg_temp.act(cand); ok := not exists (select 1 from job_feed(false) f where f.id = job) and not exists (select 1 from job_feed(true) f where f.id = job);
  perform pg_temp.act(own); j := job_pipeline(job);
  out := out || E'\n6b cerrada: fuera de Explorar y el historial del proceso se conserva para la empresa: ' || coalesce(((ok and jsonb_array_length(j->'cards') >= 2))::text, 'NULO');
  perform pg_temp.root();
  raise notice '%', out;
end $t$;
rollback;
