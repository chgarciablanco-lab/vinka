-- Matriz de pruebas de VINKA (base de datos). No deja rastro: todo termina en un error controlado que deshace los cambios.
-- Cómo usar: pegar en el SQL Editor de Supabase (o execute_sql) y leer el mensaje final.
-- Cada línea dice OK o FALLA. La última línea resume el total.
-- Usa las cuentas de prueba *.test@example.com; requiere que existan.

create or replace function pg_temp.ok(c boolean, t text) returns text language sql as $$ select case when coalesce(c, false) then 'OK    ' else 'FALLA ' end || t || E'\n' $$;
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  if u is null then perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon';
  else perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end if;
end $$;
grant execute on function pg_temp.ok(boolean, text) to public;

do $$
declare
  nova uuid; agro uuid; cam uuid; diego uuid; adv uuid; adm uuid; co uuid; coA uuid;
  j uuid; j2 uuid; j3 uuid; m uuid; o uuid; o2 uuid; slot uuid; iv uuid; ext uuid; p1 uuid; p2 uuid; p3 uuid; pc uuid;
  st text; n int; n2 int; r jsonb; rev0 jsonb; rev1 jsonb; log text := ''; t text; res text; who text; u uuid;
  t0 timestamptz := now(); ts timestamptz := date_trunc('hour', now()) + interval '3 days 3 hours';
begin
  select id into nova from auth.users where email = 'nova.test@example.com';
  select id into agro from auth.users where email = 'agro.test@example.com';
  select id into cam from auth.users where email = 'camila.test@example.com';
  select id into diego from auth.users where email = 'diego.test@example.com';
  select id into adv from auth.users where email = 'asesor.test@example.com';
  select id into adm from auth.users where email = 'admin.test@example.com';
  select company_id into co from company_members where user_id = nova and role = 'owner';
  select company_id into coA from company_members where user_id = agro and role = 'owner';
  update jobs set status = 'paused' where company_id = co and status = 'published';
  update candidate_profiles set is_public = true where user_id in (cam, diego);

  ---------------- A. ATS de punta a punta ----------------
  perform pg_temp.as_user(nova);
  insert into jobs(company_id, title, area, description, region, comuna, status, modality, salary_min, salary_max, salary_type, questions)
  values (co, 'Matriz vendedor', 'Ventas', 'Vacante de la matriz de pruebas con descripción suficiente.', 'Maule', 'Talca', 'published', 'Presencial', 600000, 800000, 'liquido',
    '[{"id":"q1","text":"¿Licencia B?","type":"yesno","knockout":"no"}]') returning id, status into j, st;
  log := log || pg_temp.ok(st = 'published', 'A1 crear y publicar vacante');
  reset role;
  perform pg_temp.as_user(cam); insert into candidate_job_actions(candidate_id, job_id, action, answers) values (cam, j, 'interest', '{"q1":"si"}'); reset role;
  perform pg_temp.as_user(diego); insert into candidate_job_actions(candidate_id, job_id, action, answers) values (diego, j, 'interest', '{"q1":"no"}'); reset role;
  perform public_apply(j, 'Externa Matriz', 'externa.matriz@example.com', '+56911112222', 'Vendedora', 'hola', true, '');
  select id into ext from external_applicants where job_id = j;
  log := log || pg_temp.ok(ext is not null and exists (select 1 from notifications where kind = 'public_apply' and created_at >= t0), 'A5 postulación pública sin registro entra y avisa a la empresa');
  perform pg_temp.as_user(nova);
  r := subject_detail(j, diego);
  log := log || pg_temp.ok((r->>'knocked_out')::boolean, 'A4 respuesta eliminatoria marca al postulante');
  m := pipeline_move('interesado', cam, j, 'contacto');
  log := log || pg_temp.ok((select stage from matches where id = m) = 'contacto', 'A6 avanzar postulante crea match');
  insert into evaluations(company_id, job_id, candidate_id, author_id, scores, overall, recommendation, note) values (co, j, cam, nova, '{"comunicacion":4}', 4, 'si', 'ok');
  log := log || pg_temp.ok(jsonb_array_length(subject_detail(j, cam)->'evaluations') = 1, 'A7 evaluación visible en la ficha');
  perform pipeline_move('externo', ext, j, 'descartado');
  perform pipeline_move('interesado', diego, j, 'descartado');
  log := log || pg_temp.ok((select stage from external_applicants where id = ext) = 'descartado', 'A8 descartar postulante externo');
  reset role;
  log := log || pg_temp.ok(exists (select 1 from notifications where user_id = diego and kind = 'applicant_declined' and created_at >= t0), 'A9 descartado antes del match recibe aviso');
  perform pg_temp.as_user(diego);
  log := log || pg_temp.ok((select status from my_interests() where job_id = j) = 'no_seleccionado', 'A9b descartado ve «No seleccionado» en Intereses');
  reset role;
  perform pg_temp.as_user(nova);
  perform add_slots(co, jsonb_build_array(jsonb_build_object('s', ts, 'e', ts + interval '45 minutes')), 'online', 'https://meet.google.com/abc-defg-hij', '', '', '', j);
  select id into slot from interview_slots where company_id = co and starts_at = ts;
  reset role;
  perform pg_temp.as_user(cam); perform book_slot(slot, m); reset role;
  select id into iv from interviews where match_id = m;
  log := log || pg_temp.ok(iv is not null and (select stage from matches where id = m) = 'entrevista', 'A10 reservar entrevista pasa a etapa entrevista');
  update interviews set starts_at = now() + interval '30 minutes', ends_at = now() + interval '75 minutes' where id = iv;
  perform send_interview_reminders(); perform send_interview_reminders();
  select count(*) into n from notifications where kind = 'interview_reminder' and created_at >= t0 and user_id in (cam, nova);
  log := log || pg_temp.ok(n = 2, 'A11 recordatorio una vez por persona (2 corridas)');
  update interviews set starts_at = ts, ends_at = ts + interval '45 minutes' where id = iv;
  perform pg_temp.as_user(nova);
  perform complete_interview(iv);
  o := send_offer(m, '{"position":"Vendedor","salary":"700000","salary_type":"liquido","letter":{"signer_name":"Nova Test","signer_title":"Gerenta","hack":"x"}}');
  log := log || pg_temp.ok((select stage from matches where id = m) = 'oferta', 'A12 enviar oferta pasa a etapa oferta');
  log := log || pg_temp.ok(not ((select letter from offers where id = o) ? 'hack'), 'C1 la carta descarta campos no permitidos');
  o2 := send_offer(m, '{"position":"Vendedor Sr","salary":"750000","salary_type":"liquido","letter":{"signer_name":"Nova Test","signer_title":"Gerenta"}}');
  log := log || pg_temp.ok((select status from offers where id = o) = 'retirada' and (select status from offers where id = o2) = 'enviada', 'C9 editar y reenviar reemplaza la anterior');
  begin perform email_offer(o2, true); log := log || pg_temp.ok(false, 'C6 reenvío inmediato se bloquea');
  exception when others then log := log || pg_temp.ok(true, 'C6 reenvío inmediato se bloquea'); end;
  reset role;
  update offers set emailed_at = now() - interval '11 minutes' where id = o2;
  perform pg_temp.as_user(nova); perform email_offer(o2, true); reset role;
  log := log || pg_temp.ok(exists (select 1 from notifications where user_id = nova and kind = 'offer_copy' and created_at >= t0), 'C5/C7 envío por correo con copia a quien envía');
  perform pg_temp.as_user(cam);
  begin perform respond_offer(o, true, ''); log := log || pg_temp.ok(false, 'A13 oferta reemplazada no se puede aceptar');
  exception when others then log := log || pg_temp.ok(true, 'A13 oferta reemplazada no se puede aceptar'); end;
  r := offer_letter(o2);
  log := log || pg_temp.ok(r->'candidate'->>'email' is not null and not (r->>'can_manage')::boolean, 'C3 la persona ve su carta con su correo y sin permisos de empresa');
  perform respond_offer(o2, true, 'feliz');
  reset role;
  log := log || pg_temp.ok((select status from offers where id = o2) = 'aceptada', 'C10 aceptar oferta registra la respuesta');
  update offers set status = 'enviada', expires_on = (now() at time zone 'America/Santiago')::date - 1 where id = o2;
  perform pg_temp.as_user(cam);
  begin perform respond_offer(o2, true, ''); log := log || pg_temp.ok(false, 'C11 oferta vencida no se puede aceptar');
  exception when others then log := log || pg_temp.ok(true, 'C11 oferta vencida no se puede aceptar'); end;
  reset role;
  update offers set status = 'aceptada', expires_on = null where id = o2;
  perform pg_temp.as_user(nova); perform match_update(m, 'stage', 'contratado'); reset role;
  log := log || pg_temp.ok((select hired_at from matches where id = m) is not null, 'A15 contratar registra la fecha');
  log := log || pg_temp.ok(not exists (select 1 from pipeline_events where job_id = j and actor_id is null and kind not in ('applied', 'imported')), 'A16 historial con autor en cada movimiento');

  ---------------- B. Destacados e ingresos ----------------
  select id into j from jobs where company_id = co and status = 'paused' and title <> 'Matriz vendedor' order by created_at limit 1;
  select id into j2 from jobs where company_id = co and status = 'paused' and id <> j order by created_at offset 1 limit 1;
  select id into j3 from jobs where company_id = co and status = 'paused' and id not in (j, j2) order by created_at offset 2 limit 1;
  update jobs set status = 'published' where id in (j, j2, j3);
  delete from promotions where job_id in (j, j2, j3);
  delete from promotions where company_id = co and source = 'plan';
  perform pg_temp.as_user(adm); rev0 := admin_revenue(false); reset role;
  perform pg_temp.as_user(nova);
  p1 := (request_promotion('job_7', j))->>'id'; p2 := (request_promotion('job_15', j2))->>'id'; p3 := (request_promotion('job_30', j3))->>'id';
  log := log || pg_temp.ok((select string_agg(total_clp::text, ',' order by days) from promotions where id in (p1, p2, p3)) = '5938,10698,17838', 'B1 precios 7/15/30 días con IVA');
  begin perform request_promotion('job_7', j); log := log || pg_temp.ok(false, 'B2 no se duplica un destacado en la misma vacante');
  exception when others then log := log || pg_temp.ok(true, 'B2 no se duplica un destacado en la misma vacante'); end;
  reset role;
  perform pg_temp.as_user(adm);
  rev1 := admin_revenue(false);
  log := log || pg_temp.ok(rev1->>'month' = rev0->>'month', 'B4 una solicitud no cuenta como ingreso');
  perform admin_activate_promotion(p1, true, 'transferencia', 'matriz');
  perform admin_activate_promotion(p2, false, 'transferencia', 'cortesía');
  perform admin_set_promotion(p3, 'cancelar');
  log := log || pg_temp.ok(exists (select 1 from payments where promotion_id = p1 and net_clp = 4990 and iva_clp = 948), 'B5 activar con pago registra neto e IVA');
  log := log || pg_temp.ok((select payment_id is null and source = 'cortesia' from promotions where id = p2), 'B6 cortesía sin pago');
  log := log || pg_temp.ok((select status from promotions where id = p3) = 'cancelada', 'B7 cancelar solicitud');
  log := log || pg_temp.ok((select round(extract(epoch from ends_at - starts_at) / 86400.0, 2) from promotions where id = p1) = 7.00, 'B8 duración exacta de 7 días');
  rev1 := admin_revenue(false);
  log := log || pg_temp.ok(rev1->>'month' = rev0->>'month', 'B17 pagos de cuentas de prueba no cuentan como ingreso real');
  perform admin_set_promotion(p1, 'pausar'); perform admin_set_promotion(p1, 'reanudar'); perform admin_set_promotion(p1, 'extender', 7);
  log := log || pg_temp.ok((select round(extract(epoch from ends_at - now()) / 86400.0) from promotions where id = p1) = 14, 'B9 pausar, reanudar y extender conservan los días');
  perform admin_set_promotion(p1, 'finalizar');
  reset role;
  update jobs set status = 'paused' where id = j2;
  log := log || pg_temp.ok((select status = 'pausada' and paused_by = 'job' from promotions where id = p2), 'B10 vacante pausada pausa el destacado');
  update jobs set status = 'published' where id = j2;
  log := log || pg_temp.ok((select status from promotions where id = p2) = 'activa', 'B10b vacante republicada reactiva el destacado');
  update promo_settings set max_jobs = (select count(*) from promotions where target = 'job' and status = 'activa' and ends_at > now());
  perform pg_temp.as_user(nova); pc := (request_promotion('job_7', j))->>'id'; reset role;
  perform pg_temp.as_user(adm);
  begin perform admin_activate_promotion(pc, true); log := log || pg_temp.ok(false, 'B11 límite de espacios bloquea activaciones');
  exception when others then log := log || pg_temp.ok(true, 'B11 límite de espacios bloquea activaciones'); end;
  reset role;
  update promo_settings set max_jobs = 40;
  perform pg_temp.as_user(cam);
  select count(*) filter (where featured), count(*) into n, n2 from (select * from job_feed(false) union all select * from job_feed(true)) f;
  log := log || pg_temp.ok(n <= ceil(n2 * 0.2) + 1, 'B12 máximo 2 destacadas de cada 10 resultados');
  reset role;
  update candidate_profiles set is_public = false where user_id = diego;
  perform pg_temp.as_user(diego);
  begin perform request_promotion('profile_7', null, false, true); log := log || pg_temp.ok(false, 'B14 perfil oculto no puede destacarse');
  exception when others then log := log || pg_temp.ok(true, 'B14 perfil oculto no puede destacarse'); end;
  reset role;

  ---------------- E. Bloque 2 y regla de chat ----------------
  select to_jsonb(mm) into r from matches mm where mm.company_id = co and not mm.closed and mm.stage <> 'contratado' limit 1;
  m := (r->>'id')::uuid; u := (r->>'candidate_id')::uuid;
  delete from messages where match_id = m;
  perform pg_temp.as_user(u);
  begin insert into messages(match_id, sender_id, body) values (m, u, 'hola');
    log := log || pg_temp.ok(false, 'E1 la persona no puede iniciar el chat');
  exception when others then log := log || pg_temp.ok(sqlerrm like 'La empresa inicia%', 'E1 la persona no puede iniciar el chat'); end;
  reset role;
  perform pg_temp.as_user(nova); insert into messages(match_id, sender_id, body) values (m, nova, 'Hola, gracias por postular'); reset role;
  perform pg_temp.as_user(u);
  begin insert into messages(match_id, sender_id, body) values (m, u, 'gracias');
    log := log || pg_temp.ok(true, 'E2 la persona responde después de la empresa');
  exception when others then log := log || pg_temp.ok(false, 'E2 la persona responde después de la empresa'); end;
  reset role;
  select id into ext from service_requests where candidate_id = cam limit 1;
  if ext is null then
    insert into service_requests (candidate_id, service_id, service_name, price_clp, goal, status) select cam, id, name, price_clp, 'prueba', 'en_curso' from career_services limit 1 returning id into ext;
  end if;
  delete from service_messages where request_id = ext;
  update service_requests set status = 'en_curso', assigned_to = adv where id = ext;
  perform pg_temp.as_user(cam);
  begin perform send_service_message(ext, 'hola asesor'); log := log || pg_temp.ok(false, 'E3 la persona no puede iniciar el chat de asesoría');
  exception when others then log := log || pg_temp.ok(sqlerrm like 'Tu asesor/a inicia%', 'E3 la persona no puede iniciar el chat de asesoría'); end;
  reset role;
  perform pg_temp.as_user(adv); perform accept_advisor_terms(); perform send_service_message(ext, 'Hola, soy tu asesora'); reset role;
  perform pg_temp.as_user(cam);
  begin perform send_service_message(ext, 'gracias'); log := log || pg_temp.ok(true, 'E4 la persona responde después de su asesor/a');
  exception when others then log := log || pg_temp.ok(false, 'E4 la persona responde después de su asesor/a: ' || sqlerrm); end;
  reset role;
  perform pg_temp.as_user(nova); o := send_offer(m, '{"position":"Prueba E","salary":"700000","salary_type":"liquido","expires_on":"2030-01-01","letter":{"signer_name":"Nova","signer_title":"Gerenta"}}'); reset role;
  perform pg_temp.as_user(u); perform respond_offer(o, true, ''); reset role;
  log := log || pg_temp.ok((select stage from matches where id = m) = 'contratado', 'E5 oferta aceptada pasa sola a contratado');
  perform pg_temp.as_user(nova); o2 := send_offer(m, '{"position":"Prueba E2","salary":"700000","salary_type":"liquido","letter":{"signer_name":"Nova","signer_title":"Gerenta"}}'); reset role;
  update offers set expires_on = (now() at time zone 'America/Santiago')::date - 1 where id = o2;
  perform expire_offers();
  log := log || pg_temp.ok((select status from offers where id = o2) = 'vencida' and exists (select 1 from notifications where kind = 'offer_expired' and created_at >= t0), 'E6 oferta vencida cambia de estado y avisa a la empresa');
  perform pg_temp.as_user(nova); log := log || pg_temp.ok(jsonb_array_length(offer_history(m)) >= 2, 'E7 historial muestra todas las versiones'); reset role;
  perform pg_temp.as_user(agro);
  begin perform offer_history(m); log := log || pg_temp.ok(false, 'E7b otra empresa no ve el historial');
  exception when others then log := log || pg_temp.ok(true, 'E7b otra empresa no ve el historial'); end;
  reset role;
  update candidate_profiles set is_public = true where user_id = diego;
  delete from promotions where candidate_id = diego;
  insert into promotions (product_id, target, candidate_id, status, source, days, starts_at, ends_at) values ('profile_7', 'profile', diego, 'activa', 'cortesia', 7, now(), now() + interval '7 days') returning id into p1;
  update candidate_profiles set is_public = false where user_id = diego;
  log := log || pg_temp.ok((select status = 'pausada' and paused_by = 'profile' from promotions where id = p1), 'E8 ocultar el perfil pausa su destacado');
  update candidate_profiles set is_public = true where user_id = diego;
  log := log || pg_temp.ok((select status = 'activa' and ends_at > now() + interval '6 days 23 hours' from promotions where id = p1), 'E9 mostrarlo de nuevo lo reanuda con sus días');
  select id into p2 from promotions where target = 'job' and status = 'activa' and ends_at > now() limit 1;
  select coalesce(sum(impressions), 0) into n from promo_stats where promotion_id = p2;
  perform pg_temp.as_user(null);
  for n2 in 1..50 loop perform promo_track(array[p2], 'impression', 'navegador-de-prueba-1'); end loop;
  perform promo_track(array[p2], 'impression', null);
  reset role;
  log := log || pg_temp.ok((select coalesce(sum(impressions), 0) from promo_stats where promotion_id = p2) - n = 1, 'E10 50 vistas del mismo navegador cuentan 1; sin identificador, 0');


  ---------------- F. Revisión: renta, asesorías, carta, plan ----------------
  select id into j from jobs where company_id = co and status = 'published' limit 1;
  perform pg_temp.as_user(nova);
  select count(*), count(*) filter (where c.salary_min is not null and c.salary_min % 100000 = 0 and c.salary_max > c.salary_min)
    into n, n2 from candidates_for_job(j, false) c;
  reset role;
  log := log || pg_temp.ok(n > 0 and n2 > 0 and pg_get_function_result('public.candidates_for_job'::regproc) not like '%salary_expectation%', 'F1 la empresa recibe la renta como rango, nunca el monto exacto');
  insert into service_requests (candidate_id, service_id, service_name, price_clp, goal, status, assigned_to, assigned_name)
    select diego, id, name, price_clp, 'prueba F', 'pago_pendiente', adv, 'Asesora Test' from career_services where id = 'busqueda' returning id into ext;
  update service_requests set status = 'en_curso' where id = ext;
  log := log || pg_temp.ok(exists (select 1 from service_messages where request_id = ext and sender_kind = 'system' and body like '%1 día hábil%'), 'F2 al confirmar el pago VINKA escribe con el plazo');
  perform pg_temp.as_user(diego);
  begin perform send_service_message(ext, 'gracias, quedo atento'); log := log || pg_temp.ok(true, 'F3 tras el mensaje automático la persona puede escribir');
  exception when others then log := log || pg_temp.ok(false, 'F3 tras el mensaje automático la persona puede escribir: ' || sqlerrm); end;
  reset role;
  perform pg_temp.as_user(adv);
  begin perform advisor_deliver(ext, 'listo'); log := log || pg_temp.ok(false, 'F4 no se puede entregar sin sesiones ni ofertas');
  exception when others then log := log || pg_temp.ok(sqlerrm like 'Aún falta para entregar%', 'F4 no se puede entregar sin sesiones ni ofertas'); end;
  reset role;
  update service_requests set status = 'entregada' where id = ext;
  perform pg_temp.as_user(adm);
  begin perform admin_review_request(ext, true, ''); log := log || pg_temp.ok(false, 'F5 aprobar con faltantes exige un motivo');
  exception when others then log := log || pg_temp.ok(sqlerrm like 'Falta:%', 'F5 aprobar con faltantes exige un motivo'); end;
  perform admin_review_request(ext, true, 'Excepción de prueba');
  reset role;
  log := log || pg_temp.ok((select status from service_requests where id = ext) = 'aprobada' and exists (select 1 from notifications where user_id = diego and title like '%terminada' and created_at >= t0), 'F6 la persona recibe «terminada» recién con la aprobación');
  perform pg_temp.as_user(cam);
  begin perform service_progress(ext); log := log || pg_temp.ok(false, 'F7 otra persona no ve el avance de una asesoría ajena');
  exception when others then log := log || pg_temp.ok(true, 'F7 otra persona no ve el avance de una asesoría ajena'); end;
  reset role;
  select m2.id into m from matches m2 where m2.company_id = co and not m2.closed limit 1;
  perform pg_temp.as_user(nova);
  begin perform send_offer(m, '{"position":"Sin firma","letter":{"signer_name":"Nova"}}'); log := log || pg_temp.ok(false, 'F8 la carta exige nombre y cargo de quien firma');
  exception when others then log := log || pg_temp.ok(sqlerrm like '%quien firma%', 'F8 la carta exige nombre y cargo de quien firma'); end;
  reset role;
  insert into subscriptions (company_id, plan_id, status) values (co, 'gratis', 'active') on conflict (company_id) do update set plan_id = 'gratis', status = 'active';
  log := log || pg_temp.ok(exists (select 1 from notifications where kind = 'plan' and title like 'Tienes más vacantes%' and created_at >= t0), 'F9 bajar de plan con vacantes de más avisa a la empresa');


  ---------------- G. Asistente y reportes ----------------
  perform pg_temp.as_user(cam);
  ext := submit_feedback('error', 'No puedo subir mi CV', 'Queda cargando', '/perfil', 'matriz');
  select count(*) into n from feedback where user_id is distinct from cam;
  log := log || pg_temp.ok(ext is not null and n = 0, 'G1 la persona crea reportes y solo ve los suyos');
  begin perform admin_feedback(); log := log || pg_temp.ok(false, 'G2 la persona no ve la bandeja de reportes');
  exception when others then log := log || pg_temp.ok(true, 'G2 la persona no ve la bandeja de reportes'); end;
  reset role;
  perform pg_temp.as_user(null);
  begin perform help_quota('a:matriz', 5, 10); log := log || pg_temp.ok(false, 'G3 el cupo del asistente solo se usa desde el servidor');
  exception when others then log := log || pg_temp.ok(true, 'G3 el cupo del asistente solo se usa desde el servidor'); end;
  reset role;
  perform pg_temp.as_user(adm); perform admin_update_feedback(ext, 'resuelto', 'Corregido', true); reset role;
  log := log || pg_temp.ok(exists (select 1 from notifications where kind = 'feedback' and user_id = adm and created_at >= t0) and exists (select 1 from notifications where kind = 'feedback' and user_id = cam and created_at >= t0), 'G4 el reporte avisa a administración y la respuesta a la persona');

  ---------------- D. Permisos (se espera error o 0 filas) ----------------
  select id into j from jobs where company_id = co and status = 'published' limit 1;
  select id into o from offers where company_id = co order by created_at desc limit 1;
  for who, t in select * from (values
    ('agro', format('select count(*) from candidates_for_job(%L, true)', j)),
    ('agro', format('select talent_pool(%L)::text', co)),
    ('agro', format('select job_pipeline(%L)::text', j)),
    ('agro', format('select subject_detail(%L, %L)::text', j, cam)),
    ('agro', format('select company_report(%L, 30)::text', co)),
    ('agro', format('select job_promotions(%L)::text', j)),
    ('agro', format('select request_promotion(%L, %L)::text', 'job_7', j)),
    ('agro', format('select stop_promotion(%L)::text', p2)),
    ('agro', format('select offer_letter(%L)::text', o)),
    ('agro', format('select email_offer(%L, false)::text', o)),
    ('agro', format('select set_company_logo(%L, %L)::text', co, co || '/x.png')),
    ('agro', format('select company_plan(%L)::text', co)),
    ('agro', format('select count(*) from promotions where company_id = %L', co)),
    ('agro', format('select count(*) from offers where company_id = %L', co)),
    ('agro', format('select count(*) from evaluations where company_id = %L', co)),
    ('agro', format('select count(*) from candidate_notes where company_id = %L', co)),
    ('agro', format('select count(*) from external_applicants where company_id = %L', co)),
    ('agro', format('select count(*) from pipeline_events where company_id = %L', co)),
    ('agro', 'select count(*) from payments'),
    ('agro', 'select count(*) from cv_files'),
    ('cam', format('select offer_letter(%L)::text', (select id from offers where candidate_id <> cam limit 1))),
    ('cam', 'select admin_revenue(true)::text'),
    ('cam', 'select admin_promotions(''job'', true)::text'),
    ('cam', format('select admin_activate_promotion(%L, true)::text', pc)),
    ('cam', 'select admin_candidates('''', '''', 5)::text'),
    ('cam', 'select admin_overview()::text'),
    ('cam', 'select admin_promo_config(''[]'', ''{"max_jobs":999}'')::text'),
    ('cam', 'select count(*) from promotions where candidate_id is distinct from auth.uid()'),
    ('cam', 'select count(*) from service_requests where candidate_id <> auth.uid()'),
    ('cam', 'select count(*) from candidate_profiles where user_id <> auth.uid()'),
    ('cam', 'select count(*) from cv_files where candidate_id <> auth.uid()'),
    ('cam', format('select count(*) from candidates_for_job(%L, true)', j)),
    ('nova', 'select admin_revenue(true)::text'),
    ('nova', 'select count(*) from service_requests'),
    ('nova', 'select count(*) from cv_files'),
    ('nova', 'select count(*) from promotions where target = ''profile'''),
    ('nova', 'select count(*) from payments'),
    ('adv', 'select admin_revenue(true)::text'),
    ('adv', 'select count(*) from service_requests where assigned_to is distinct from auth.uid()'),
    ('adv', 'select count(*) from service_messages m where not exists (select 1 from service_requests r where r.id = m.request_id and r.assigned_to = auth.uid())'),
    ('adv', 'select count(*) from payments'),
    ('adv', 'select count(*) from promotions'),
    ('adv', format('select count(*) from candidates_for_job(%L, true)', j)),
    ('anon', 'select count(*) from promotions'),
    ('anon', 'select count(*) from payments'),
    ('anon', 'select count(*) from offers'),
    ('anon', 'select count(*) from candidate_profiles'),
    ('anon', 'select count(*) from profiles'),
    ('anon', 'select count(*) from promo_stats'),
    ('anon', 'select count(*) from promo_settings'),
    ('anon', format('select request_promotion(%L, %L)::text', 'job_7', j)),
    ('anon', 'select admin_revenue(true)::text'),
    ('cam', 'select admin_resolve_errors()::text'),
    ('cam', 'select admin_set_setting(''whatsapp_vinka'', ''+56911112222'')::text'),
    ('adv', 'select admin_resolve_errors()::text'),
    ('anon', 'select count(*) from app_settings'),
    ('anon', 'select count(*) from service_requests')
  ) v(a, b) loop
    u := case who when 'agro' then agro when 'cam' then cam when 'nova' then nova when 'adv' then adv else null end;
    perform pg_temp.as_user(u);
    begin
      execute t into res;
      log := log || pg_temp.ok(res is null or (res ~ '^\d+$' and res::int = 0), 'D ' || who || ' · ' || left(t, 90));
    exception when others then log := log || pg_temp.ok(true, 'D ' || who || ' · ' || left(t, 90));
    end;
    execute 'reset role';
  end loop;

  select count(*) filter (where l like 'OK%'), count(*) filter (where l like 'FALLA%') into n, n2 from unnest(string_to_array(log, E'\n')) l;
  raise exception 'MATRIZ (revertida)%', E'\n' || log || format('TOTAL: %s OK, %s FALLA', n, n2);
end $$;
