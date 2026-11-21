-- Colaboración y crédito de asesores (fase 1 corregida). Crea sus propios usuarios (@prueba.test y dominios de prueba)
-- y TODO se deshace al final con rollback. Cada línea dice «true» si el resultado es el esperado.
begin;
create function pg_temp.act(u uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.root() returns void language plpgsql as $$ begin execute 'reset role'; end $$;

do $t$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); x uuid := gen_random_uuid(); d uuid := gen_random_uuid(); e uuid := gen_random_uuid(); f uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); cl uuid := gen_random_uuid(); p uuid := gen_random_uuid(); g uuid := gen_random_uuid();
  adm uuid; ws uuid; ws_b uuid; cli uuid; cli2 uuid; job1 uuid; job2 uuid; job3 uuid; m1 uuid; m2 uuid; inv uuid; tok uuid; pco uuid; gco uuid;
  cap uuid; cap2 uuid; tok2 uuid; h1 uuid; h2 uuid; h3 uuid; auth_c uuid; auth_c2 uuid; pr1 uuid; pr2 uuid; req uuid; v jsonb; n int; n2 int; ok boolean; out text := ''; published_rut text;
begin
  select user_id into adm from admins where level = 'total' limit 1;
  insert into auth.users (id, email, raw_user_meta_data) values
    (a, 'ana@prueba.test', '{"first_name":"Ana","last_name":"Captadora"}'), (b, 'bruno@prueba.test', '{"first_name":"Bruno","last_name":"Proponente"}'),
    (x, 'ximena@prueba.test', '{"first_name":"Ximena","last_name":"SinPerfil"}'), (d, 'diana@prueba.test', '{"first_name":"Diana","last_name":"Cuenta"}'),
    (e, 'elias@prueba.test', '{"first_name":"Elias","last_name":"Colabora"}'), (f, 'fabio@prueba.test', '{"first_name":"Fabio","last_name":"Equipo"}'),
    (c, 'carla@prueba.test', '{"role":"candidate","first_name":"Carla","last_name":"Postulante"}'), (c2, 'dario@prueba.test', '{"role":"candidate","first_name":"Dario","last_name":"Postulante"}'),
    (cl, 'contacto@ferreteriasur.cl', '{"role":"company","first_name":"Rosa","last_name":"Cliente"}'),
    (p, 'rrhh@maderasdelsur.cl', '{"role":"company","first_name":"Pedro","last_name":"Propia"}'),
    (g, 'empresa.gratis@gmail.com', '{"role":"company","first_name":"Gina","last_name":"Gratis"}');
  update profiles set role = 'advisor' where id in (a, b, x, d, e, f);
  delete from candidate_profiles where user_id in (a, b, x, d, e, f);
  insert into advisors (user_id, specialty, terms_accepted_at) values (a, 'Retail', now()), (b, 'Logística', now()), (x, 'General', now()), (d, 'Retail', now()), (e, 'Retail', now()), (f, 'Retail', now());
  insert into advisor_profiles (user_id, pub, max_active) select u, '{"display_name":"A","bio":"x","services":["cv"]}', 20 from unnest(array[a, b, d, e, f]) u;
  update candidate_profiles set onboarding_done = true, is_public = true, headline = 'Vendedora' where user_id in (c, c2);
  insert into service_requests (candidate_id, service_id, service_name, price_clp, status, assigned_to) values (c, 'cv', 'Mejora de CV', 14990, 'en_curso', b), (c2, 'cv', 'Mejora de CV', 14990, 'en_curso', b);
  select c.rut into published_rut from companies c join jobs j on j.company_id = c.id and j.status = 'published' where c.parent_id is null limit 1;

  -- 1) Asesor sin perfil aprobado no puede captar
  perform pg_temp.act(x);
  begin perform capture_register_prospect('76.111.111-6', 'Prueba SpA', 'a@b.cl'); out := out || E'\n1 sin perfil aprobado no capta: false';
  exception when others then out := out || E'\n1 sin perfil aprobado no capta: true'; end;

  -- 2) Mismo RUT: el segundo asesor queda fuera, sin saber quién lo tiene
  perform pg_temp.act(a); v := capture_register_prospect('77.222.222-K', 'Maderas del Sur SpA', 'rrhh@maderasdelsur.cl'); cap := (v->>'id')::uuid; tok := (v->>'token')::uuid;
  perform pg_temp.act(b);
  begin perform capture_register_prospect('77.222.222-K', 'Maderas del Sur SpA', 'otro@maderasdelsur.cl'); out := out || E'\n2 mismo RUT, segundo asesor rechazado: false';
  exception when others then out := out || E'\n2 mismo RUT, segundo asesor rechazado: ' || (sqlerrm = 'Esta empresa ya está en proceso de captación'); end;

  -- 3) Empresa que ya publica en VINKA
  begin perform capture_register_prospect(published_rut, 'Ya publica SpA', 'x@y.cl'); out := out || E'\n3 empresa que ya publica rechazada: false';
  exception when others then out := out || E'\n3 empresa que ya publica rechazada: ' || (sqlerrm = 'Esta empresa ya publica en VINKA'); end;

  -- 4) Sin respuesta en 30 días: vence y el RUT queda libre
  v := capture_register_prospect('78.333.333-3', 'Vence SpA', 'contacto@vence.cl'); cap2 := (v->>'id')::uuid;
  perform pg_temp.root(); update company_captures set registered_at = now() - interval '31 days', reserved_until = now() - interval '1 day', activate_by = now() + interval '29 days' where id = cap2;
  perform capture_refresh(cap2);
  perform pg_temp.act(a);
  begin perform capture_register_prospect('78.333.333-3', 'Vence SpA', 'contacto@vence.cl'); ok := true; exception when others then ok := false; end;
  perform pg_temp.root();
  out := out || E'\n4 captación vencida a los 30 días y RUT libre: ' || ((select status from company_captures where id = cap2) = 'vencida' and ok);

  -- 5) Cliente gestionado: registrar, invitar, aceptar el día 20, publicar el día 55 → activada
  ws := advisor_create_workspace();
  cli := create_client_company(ws, '{"display_name":"Ferretería Sur","legal_name":"Ferretería Sur SpA","rut":"81.234.567-2","website":"https://www.ferreteriasur.cl"}');
  perform pg_temp.root(); out := out || E'\n5a cliente creado queda «registrada»: ' || coalesce((select status = 'registrada' from company_captures where company_id = cli), false);
  perform pg_temp.act(a); inv := invite_member(cli, 'contacto@ferreteriasur.cl', 'client');
  perform pg_temp.root(); out := out || E'\n5b invitación enviada queda «contactada»: ' || coalesce((select status = 'contactada' from company_captures where company_id = cli), false);
  update company_captures set registered_at = now() - interval '20 days', reserved_until = now() + interval '10 days', activate_by = now() + interval '40 days' where company_id = cli;
  select token into tok2 from company_invites where id = inv;
  perform pg_temp.act(cl); perform accept_member_invite(tok2);
  perform pg_temp.root();
  out := out || E'\n5c aceptó el día 20: verificada y reserva hasta el día 60: ' || coalesce((select status = 'verificada' and reserved_until = activate_by from company_captures where company_id = cli), false);
  out := out || E'\n19 cliente de bajo riesgo verificado automáticamente: ' || coalesce((select verification_status = 'verified' and verification_method = 'automatica' from companies where id = cli), false);
  update company_captures set registered_at = now() - interval '55 days', activate_by = now() + interval '5 days', reserved_until = now() + interval '5 days' where company_id = cli;
  perform pg_temp.act(a);
  insert into jobs (company_id, title, area, level, description, modality, schedule, contract, region, comuna, status)
  values (cli, 'Vendedor/a de ferretería', 'ventas', 'junior', 'Atención de clientes en sala de ventas y caja, jornada completa.', 'presencial', 'completa', 'indefinido', 'Maule', 'Talca', 'published');
  perform pg_temp.root(); select id into job1 from jobs where company_id = cli;
  out := out || E'\n5d primera vacante el día 55: activada y captadora asignada: ' || coalesce((select status = 'activada' from company_captures where company_id = cli), false)
    || ' · ' || exists (select 1 from company_advisor_roles where company_id = cli and role = 'captador' and advisor_id = a and until is null);
  out := out || E'\n5e la app no puede cambiar el responsable directamente: ';
  perform pg_temp.act(a); update jobs set owner_id = b where id = job1; perform pg_temp.root();
  out := out || ((select owner_id from jobs where id = job1) = a);

  -- 6) Primera vacante el día 61: vencida, sin captador
  perform pg_temp.act(b); ws_b := advisor_create_workspace();
  cli2 := create_client_company(ws_b, '{"display_name":"Bodegas Norte","legal_name":"Bodegas Norte SpA","rut":"79.444.444-7","website":"bodegasnorte.cl"}');
  perform pg_temp.act(adm); update companies set verification_status = 'verified' where id = cli2; perform pg_temp.root();
  update company_captures set status = 'verificada', contact_accepted_at = now() - interval '50 days', verified_at = now() - interval '50 days',
         registered_at = now() - interval '61 days', reserved_until = now() - interval '1 day', activate_by = now() - interval '1 day' where company_id = cli2;
  perform pg_temp.act(b);
  insert into jobs (company_id, title, area, level, description, modality, schedule, contract, region, comuna, status)
  values (cli2, 'Operario/a de bodega', 'logistica', 'junior', 'Recepción, ordenamiento y despacho de mercadería en bodega.', 'presencial', 'completa', 'indefinido', 'Maule', 'Talca', 'published');
  perform pg_temp.root(); perform capture_refresh((select id from company_captures where company_id = cli2));
  out := out || E'\n6 vacante el día 61: vencida y sin captador: ' || ((select status from company_captures where company_id = cli2) = 'vencida'
    and not exists (select 1 from company_advisor_roles where company_id = cli2 and role = 'captador'));

  -- Vacantes abiertas a la red (Ana las abre)
  perform pg_temp.act(a);
  insert into jobs (company_id, title, area, level, description, modality, schedule, contract, region, comuna, status)
  values (cli, 'Cajero/a', 'ventas', 'junior', 'Caja y atención de clientes en la sala de ventas, jornada completa.', 'presencial', 'completa', 'indefinido', 'Maule', 'Talca', 'published');
  perform pg_temp.root(); select id into job2 from jobs where company_id = cli and title = 'Cajero/a';
  perform pg_temp.act(a); perform job_set_network(job1, true); perform job_set_network(job2, true);

  -- 7) Proponer sin autorización
  perform pg_temp.act(b);
  begin perform proposal_create(job1, c, ''); out := out || E'\n7 proponer sin autorización rechazado: false';
  exception when others then out := out || E'\n7 proponer sin autorización rechazado: ' || (sqlerrm like 'Necesitas la autorización%'); end;

  -- 8) Autoriza, recibe dos propuestas y revoca: ambas retiradas y la empresa no ve nada
  auth_c := rep_auth_request(c);
  perform pg_temp.act(c); perform rep_auth_answer(auth_c, true);
  perform pg_temp.act(b); pr1 := proposal_create(job1, c, 'Tiene experiencia en ventas'); pr2 := proposal_create(job2, c, '');
  perform pg_temp.act(c); n := rep_auth_revoke(auth_c);
  perform pg_temp.root();
  out := out || E'\n8 revocar retira las propuestas pendientes y la empresa no ve nada: ' || (n = 2
    and (select count(*) from candidate_proposals where id in (pr1, pr2) and status = 'retirada') = 2
    and not exists (select 1 from candidate_job_actions where candidate_id = c and job_id in (job1, job2)));

  -- 9) Si la persona ya postuló sola, no hay propuesta ni crédito
  perform pg_temp.act(b); auth_c2 := rep_auth_request(c2);
  perform pg_temp.act(c2); perform rep_auth_answer(auth_c2, true);
  perform pg_temp.root(); insert into candidate_job_actions (candidate_id, job_id, action) values (c2, job1, 'interest');
  perform pg_temp.act(b);
  begin perform proposal_create(job1, c2, ''); out := out || E'\n9 ya postuló sola: propuesta rechazada: false';
  exception when others then out := out || E'\n9 ya postuló sola: propuesta rechazada: ' || (sqlerrm like '%ya postuló%'); end;

  -- 17) Pedir colaborar: rechazado si la vacante no está abierta; aceptado si lo está
  perform pg_temp.root(); insert into jobs (company_id, title, area, level, description, modality, schedule, contract, region, comuna, status, owner_id)
  values (cli, 'Bodeguero/a', 'logistica', 'junior', 'Ordenar y despachar productos de ferretería en bodega.', 'presencial', 'completa', 'indefinido', 'Maule', 'Talca', 'published', a) returning id into job3;
  perform pg_temp.act(e);
  begin perform collab_request_create(job3, 'Hola'); ok := false; exception when others then ok := true; end;
  req := collab_request_create(job1, 'Tengo candidatos de retail');
  out := out || E'\n17a pedir colaborar en vacante no abierta rechazado: ' || ok;
  v := network_opportunities();
  out := out || E'\n17b Oportunidades muestra las 2 vacantes abiertas: ' || ((select count(*) from jsonb_array_elements(v) o where (o->>'id')::uuid in (job1, job2)) = 2);
  perform pg_temp.act(a); perform collab_request_answer(req, true);
  perform pg_temp.root(); out := out || E'\n17c al aceptar queda como colaborador: ' || exists (select 1 from job_collaborators where job_id = job1 and user_id = e);

  -- 10) Contratación con todos los roles: captadora, encargada de cuenta, responsable, proponente y colaborador
  perform pg_temp.act(a); perform company_set_account_manager(cli, d);
  perform pg_temp.act(b); auth_c := rep_auth_request(c);
  perform pg_temp.act(c); perform rep_auth_answer(auth_c, true);
  perform pg_temp.act(b); pr1 := proposal_create(job1, c, 'Experiencia en ventas');
  perform pg_temp.act(c); perform proposal_answer(pr1, true);
  perform pg_temp.root();
  insert into collab_suggestions (job_id, collaborator_id, candidate_id, action, from_stage, to_stage, status) values (job1, e, c, 'avanzar', 'interesado', 'entrevista', 'aprobada');
  insert into company_members (company_id, user_id, role) values (ws, f, 'recruiter');
  insert into matches (job_id, candidate_id, company_id, stage) values (job1, c, cli, 'entrevista') returning id into m1;
  update matches set stage = 'contratado' where id = m1;
  out := out || E'\n10 cinco créditos correctos: ' || ((select string_agg(role || ':' || case advisor_id when a then 'a' when b then 'b' when d then 'd' when e then 'e' else '?' end, ',' order by role) from hire_contributions where match_id = m1)
    = 'capto_empresa:a,colaboro:e,gestiono:a,llevo_cuenta:d,propuso_candidato:b');
  -- 11) Otro asesor del mismo espacio que no tocó la vacante no recibe crédito
  out := out || E'\n11 asesor del espacio que no participó sin crédito: ' || not exists (select 1 from hire_contributions where match_id = m1 and advisor_id = f);

  -- 12) Nadie confirma lo propio
  select id into h1 from hire_contributions where match_id = m1 and role = 'gestiono';
  select id into h3 from hire_contributions where match_id = m1 and role = 'colaboro';
  perform pg_temp.act(a);
  begin perform contribution_confirm(h1); ok := false; exception when others then ok := true; end;
  out := out || E'\n12a la responsable no confirma su propio crédito: ' || ok;

  -- 14) El cliente objeta el día 3 (segunda contratación)
  perform pg_temp.root(); insert into matches (job_id, candidate_id, company_id, stage) values (job2, c2, cli, 'oferta') returning id into m2;
  update matches set stage = 'contratado' where id = m2;
  select id into h2 from hire_contributions where match_id = m2 and role = 'llevo_cuenta';
  perform pg_temp.act(cl); perform contribution_dispute(h2, 'No recuerdo que Diana participara en esto');
  perform pg_temp.root();

  -- 13) Pasan 7 días: se confirman los del sistema; «Colaboró» y el objetado siguen esperando
  update hire_contributions set auto_confirm_at = now() - interval '1 minute' where match_id in (m1, m2) and source = 'sistema';
  v := collab_daily();
  out := out || E'\n13 a los 7 días: sistema confirmado, «Colaboró» por confirmar: ' || ((select count(*) from hire_contributions where match_id = m1 and status = 'confirmada') = 4
    and (select status from hire_contributions where match_id = m1 and role = 'colaboro') = 'por_confirmar');
  out := out || E'\n14 el objetado no se confirma solo y llega a VINKA: ' || ((select status from hire_contributions where match_id = m2 and role = 'llevo_cuenta') = 'desacuerdo');
  perform pg_temp.act(adm); v := admin_contributions('desacuerdo', true); perform pg_temp.root();
  out := out || ' · ' || ((select count(*) from jsonb_array_elements(v) o where (o->>'match_id')::uuid = m2) = 1);
  perform pg_temp.act(a); perform contribution_confirm(h3); perform pg_temp.root();
  out := out || E'\n12b la responsable sí confirma «Colaboró» de otro: ' || ((select status from hire_contributions where match_id = m1 and role = 'colaboro') = 'confirmada');

  -- 15) La tarea diaria es idempotente
  select count(*) into n from hire_contributions where match_id in (m1, m2);
  v := collab_daily(); select count(*) into n2 from hire_contributions where match_id in (m1, m2);
  out := out || E'\n15 segunda corrida sin cambios ni duplicados: ' || (n = n2 and (v->>'credits_confirmed')::int = 0 and (v->>'captures_expired')::int = 0);

  -- 16) Colaborador: ficha reducida
  update matches set contact_shared = true where id = m1; update profiles set phone = '+56 9 0000 0000' where id = c;
  perform pg_temp.act(e); v := subject_detail(job1, c); perform pg_temp.root();
  out := out || E'\n16 colaborador sin teléfono, correo ni notas: ' || (not (v->'candidate' ? 'phone') and not (v->'candidate' ? 'email') and jsonb_array_length(v->'notes') = 0);

  -- 18) Lectura directa de las tablas nuevas, con y sin sesión: denegada
  ok := true;
  for n in 1..2 loop
    if n = 1 then perform pg_temp.act(a); else perform pg_temp.root(); execute 'set local role anon'; end if;
    begin perform count(*) from company_captures; ok := false; exception when insufficient_privilege then null; end;
    begin perform count(*) from company_advisor_roles; ok := false; exception when insufficient_privilege then null; end;
    begin perform count(*) from representation_authorizations; ok := false; exception when insufficient_privilege then null; end;
    begin perform count(*) from candidate_proposals; ok := false; exception when insufficient_privilege then null; end;
    begin perform count(*) from job_collab_requests; ok := false; exception when insufficient_privilege then null; end;
    begin perform count(*) from network_dismissals; ok := false; exception when insufficient_privilege then null; end;
    begin perform count(*) from hire_contributions; ok := false; exception when insufficient_privilege then null; end;
    begin perform capture_refresh(cap); ok := false; exception when insufficient_privilege then null; end;
    begin perform collab_daily(); ok := false; exception when insufficient_privilege then null; end;
  end loop;
  perform pg_temp.root(); out := out || E'\n18 tablas y funciones internas cerradas para la app: ' || ok;

  -- 20) Empresa propia con correo gratuito: queda pendiente
  perform pg_temp.act(g);
  insert into companies (owner_id, display_name, legal_name, rut, website) values (g, 'Gratis', 'Gratis SpA', '76.555.555-8', 'gratis.cl');
  perform pg_temp.root(); out := out || E'\n20 correo gratuito: queda pendiente de revisión manual: ' || ((select verification_status from companies where owner_id = g) = 'pending');

  -- 21) Empresa propia con el enlace del asesor: queda ligada, se verifica sola y se activa al publicar
  perform pg_temp.act(p); v := get_capture_invite(tok);
  insert into companies (owner_id, display_name, legal_name, rut, website) values (p, 'Maderas del Sur', 'Maderas del Sur SpA', '77.222.222-K', 'https://maderasdelsur.cl');
  perform pg_temp.root(); select id into pco from companies where owner_id = p;
  out := out || E'\n21a enlace abierto, empresa ligada y verificada: ' || coalesce((select status = 'verificada' and company_id = pco from company_captures where id = cap), false);
  perform pg_temp.act(p);
  insert into jobs (company_id, title, area, level, description, modality, schedule, contract, region, comuna, status)
  values (pco, 'Carpintero/a', 'produccion', 'semi', 'Fabricación de muebles a medida en taller, jornada completa.', 'presencial', 'completa', 'indefinido', 'Maule', 'Talca', 'published');
  perform pg_temp.root();
  out := out || E'\n21b primera vacante: activada y Ana captadora: ' || coalesce((select status = 'activada' from company_captures where id = cap), false)
    || ' · ' || exists (select 1 from company_advisor_roles where company_id = pco and role = 'captador' and advisor_id = a);

  -- 22) Un postulante ajeno llama cada función con datos de otros: todas rechazan
  declare stranger uuid; q text; leaks text := ''; calls text[];
  begin
    select user_id into stranger from candidate_profiles where user_id not in (c, c2) limit 1;
    calls := array[
      format('select hire_attribution(%L)', m1), format('select contribution_confirm(%L)', h3), format('select contribution_dispute(%L, %L)', h1, 'Objeción de alguien ajeno'),
      format('select rep_auth_revoke(%L)', auth_c), format('select rep_auth_answer(%L, true)', auth_c2), format('select rep_auth_request(%L)', c),
      format('select proposal_answer(%L, true)', pr2), format('select proposal_create(%L, %L, %L)', job1, c, ''), format('select my_proposable_candidates(%L)', job1),
      format('select collab_request_answer(%L, true)', req), format('select collab_requests_for_job(%L)', job1), format('select collab_request_create(%L, %L)', job2, ''),
      format('select company_roles(%L)', cli), format('select company_set_account_manager(%L, %L)', cli, b), format('select job_set_owner(%L, %L)', job1, stranger),
      format('select job_set_network(%L, false)', job1), 'select my_captures()', 'select network_opportunities()', format('select network_dismiss(%L)', job1),
      'select my_contributions()', 'select admin_contributions()', format('select admin_contribution_resolve(%L, %L, %L)', h1, 'anulada', 'Intento de alguien ajeno'),
      'select admin_captures()', format('select admin_capture_annul(%L, %L)', cap, 'Intento de alguien ajeno'), 'select admin_auto_verified()',
      format('select admin_auto_verified_ok(%L)', cli), format('select funnel_metrics(30, %L)', cli), format('select funnel_metrics(30, null, %L)', a),
      format('select capture_register_prospect(%L, %L, %L)', '76.111.111-6', 'Ajena SpA', 'x@ajena.cl'), format('select advisors_for_job(%L)', job1),
      format('select job_invite_advisor(%L, %L)', job2, b)];
    perform pg_temp.act(stranger);
    foreach q in array calls loop
      begin execute q; leaks := leaks || ' [' || q || ']'; exception when others then null; end;
    end loop;
    perform pg_temp.root();
    out := out || E'\n22 postulante ajeno rechazado en las ' || array_length(calls, 1) || ' funciones: ' || (leaks = '') || leaks;
  end;

  raise notice '%', out;
end $t$;
rollback;
