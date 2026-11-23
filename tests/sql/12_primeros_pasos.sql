-- Primeros pasos guiados: los pasos se calculan con los datos de cada cuenta, según su rol, y solo para la propia cuenta.
-- Crea sus propios usuarios y empresas y TODO se deshace al final con rollback. Cada línea dice «true» si el resultado es el esperado.
begin;
create function pg_temp.act(u uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.root() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $$;
create function pg_temp.done(d jsonb, k text) returns boolean language sql as $$ select (s->>'done')::boolean from jsonb_array_elements(d->'steps') s where s->>'key' = k $$;
create function pg_temp.keys(d jsonb) returns text language sql as $$ select string_agg(s->>'key', ',' order by ord) from jsonb_array_elements(d->'steps') with ordinality t(s, ord) $$;

do $t$
declare
  cand uuid := gen_random_uuid(); own uuid := gen_random_uuid(); rec uuid := gen_random_uuid(); adv uuid := gen_random_uuid(); other uuid := gen_random_uuid();
  co uuid; co2 uuid; d jsonb; ok boolean; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (cand, 'cand@pasos.test', '{"first_name":"Ana","last_name":"Postula"}'),
    (own, 'duena@pasos.test', '{"role":"company","first_name":"Olga","last_name":"Dueña"}'),
    (rec, 'recluta@pasos.test', '{"role":"company","first_name":"Raúl","last_name":"Recluta"}'),
    (adv, 'asesora@pasos.test', '{"role":"company","first_name":"Ada","last_name":"Asesora"}'),
    (other, 'otra@pasos.test', '{"role":"company","first_name":"Sara","last_name":"Otra"}');
  update profiles set role = 'advisor' where id = adv;
  insert into advisors (user_id, specialty, active, terms_accepted_at) values (adv, 'Selección', true, now());
  insert into companies (owner_id, display_name, legal_name, rut, verification_status) values (own, 'Empresa Pasos', 'Empresa Pasos SpA', '76.555.123-4', 'pending') returning id into co;
  insert into companies (owner_id, display_name, legal_name, rut, verification_status) values (other, 'Otra Pasos', 'Otra Pasos SpA', '77.612.345-5', 'verified') returning id into co2;
  insert into company_members (company_id, user_id, role) values (co, rec, 'recruiter') on conflict do nothing;

  -- 1) Postulante: 6 pasos, ninguno hecho; al completar datos se marcan solos
  perform pg_temp.act(cand); d := my_onboarding();
  ok := pg_temp.keys(d) = 'cv,experiencia,preferencias,presentacion,interes,avisos' and (d->>'done')::int = 0 and (d->>'new')::boolean;
  perform pg_temp.root();
  update candidate_profiles set experiences = '[{"cargo":"Garzón"}]', skills = array['Servicio','Caja','Atención'], salary_expectation = 700000, modalities = array['presencial'], bio = 'Hola' where user_id = cand;
  insert into cv_files (candidate_id, uploaded_by, uploader_kind, kind, version, file_path, file_name) values (cand, cand, 'candidate', 'original', 1, cand || '/cv.pdf', 'cv.pdf');
  perform pg_temp.act(cand); d := my_onboarding();
  out := out || E'\n1 postulante: pasos propios que se completan con sus datos: ' || (ok and pg_temp.done(d, 'cv') and pg_temp.done(d, 'experiencia') and pg_temp.done(d, 'preferencias')
    and pg_temp.done(d, 'presentacion') and not pg_temp.done(d, 'interes') and (d->>'done')::int = 4);

  -- 2) Empresa: la dueña ve logo, vitrina y equipo; el reclutador no. La verificación pendiente se muestra como «en revisión»
  perform pg_temp.act(own); d := my_onboarding(co);
  ok := pg_temp.keys(d) = 'verificacion,logo,vitrina,vacante,agenda,equipo,avisos' and (d->'steps'->0->>'pending')::boolean and pg_temp.done(d, 'equipo');
  perform pg_temp.act(rec); d := my_onboarding(co);
  out := out || E'\n2 empresa: pasos según el rol (dueña 7, reclutador 4); equipo ya hecho con 2 personas: ' || (ok and pg_temp.keys(d) = 'verificacion,vacante,agenda,avisos');

  -- 3) Sin ser miembro no se pueden ver los pasos de otra empresa; sin sesión no se puede llamar
  perform pg_temp.act(own); begin perform my_onboarding(co2); ok := false; exception when others then ok := sqlerrm = 'Sin acceso'; end;
  perform pg_temp.root(); execute 'set local role anon';
  begin perform my_onboarding(); ok := false; exception when insufficient_privilege then null; end;
  begin perform onboarding_mark('ocultar'); ok := false; exception when insufficient_privilege then null; end;
  perform pg_temp.root();
  out := out || E'\n3 otra empresa y sin sesión: bloqueado: ' || ok;

  -- 4) Asesora: perfil, foto, oportunidades (se marca al visitar), comunidad y avisos
  perform pg_temp.act(adv); d := my_onboarding();
  ok := pg_temp.keys(d) = 'perfil_asesor,foto,oportunidades,comunidad,avisos' and not pg_temp.done(d, 'oportunidades');
  perform onboarding_mark('visto:oportunidades'); d := my_onboarding();
  begin perform onboarding_mark('visto:cualquiera'); ok := false; exception when others then null; end;
  out := out || E'\n4 asesora: pasos propios; «oportunidades» se marca al visitar; marcas inventadas no: ' || (ok and pg_temp.done(d, 'oportunidades'));

  -- 5) Ocultar, mostrar y recorrido solo cambian la propia cuenta
  perform pg_temp.act(cand); perform onboarding_mark('ocultar'); perform onboarding_mark('recorrido'); d := my_onboarding();
  ok := (d->>'hidden')::boolean and (d->>'tour')::boolean;
  perform pg_temp.act(own); d := my_onboarding(co); ok := ok and not (d->>'hidden')::boolean and not (d->>'tour')::boolean;
  perform pg_temp.act(cand); perform onboarding_mark('mostrar'); d := my_onboarding(); ok := ok and not (d->>'hidden')::boolean;
  begin perform onboarding_mark('borrar_todo'); ok := false; exception when others then null; end;
  perform pg_temp.root();
  out := out || E'\n5 ocultar, mostrar y recorrido: solo la propia cuenta; acciones inválidas no: ' || ok;

  raise notice '%', out;
end $t$;
rollback;
