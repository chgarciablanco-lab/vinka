-- Auditoría de aislamiento: cada consulta se ejecuta como un usuario real de prueba (rol authenticated, JWT simulado),
-- igual que lo haría la app. Debe devolver 0 filas ajenas o un error de permiso. Todo se deshace al final.
do $t$
declare
  camila uuid; diego uuid; nova uuid; agro uuid; paula uuid; carolina uuid; adm uuid;
  co_nova uuid := '8ad4b23e-3f8c-443c-9e44-d54275d612db'; co_agro uuid := '189c6e85-2bc4-4c58-8e9f-722eb5a2a36a';
  t record; n bigint; res text := ''; fails int := 0; total int := 0; who uuid; q text; expect text;
begin
  select id into camila from auth.users where email='camila.test@example.com';
  select id into diego from auth.users where email='diego.test@example.com';
  select id into nova from auth.users where email='nova.test@example.com';
  select id into agro from auth.users where email='agro.test@example.com';
  select id into paula from auth.users where email='asesor.test@example.com';
  select id into carolina from auth.users where email='carolina.asesora@example.com';
  select id into adm from auth.users where email='admin.test@example.com';
  -- Nova ya está verificada: para que el caso «verificarse sola» diga algo, se parte de «pending» (se deshace al final)
  update companies set verification_status = 'pending' where id = co_nova;
  create temp table cases (who text, label text, q text, expect text) on commit drop;
  insert into cases values
   -- Postulante Camila mirando datos de otros
   ('camila','Perfiles ajenos (profiles)', format('select count(*) from profiles where id <> %L', camila), 'zero'),
   ('camila','Perfiles laborales ajenos (candidate_profiles)', format('select count(*) from candidate_profiles where user_id <> %L', camila), 'zero'),
   ('camila','CV ajenos (cv_files)', format('select count(*) from cv_files where candidate_id <> %L', camila), 'zero'),
   ('camila','Mensajes de chats ajenos (messages)', format('select count(*) from messages m where not exists (select 1 from matches x where x.id = m.match_id and x.candidate_id = %L)', camila), 'zero'),
   ('camila','Matches ajenos', format('select count(*) from matches where candidate_id <> %L', camila), 'zero'),
   ('camila','Ofertas ajenas', format('select count(*) from offers where candidate_id <> %L', camila), 'zero'),
   ('camila','Entrevistas ajenas', format('select count(*) from interviews where candidate_id <> %L', camila), 'zero'),
   ('camila','Notificaciones ajenas', format('select count(*) from notifications where user_id <> %L', camila), 'zero'),
   ('camila','Asesorías ajenas (service_requests)', format('select count(*) from service_requests where candidate_id <> %L', camila), 'zero'),
   ('camila','Mensajes de asesorías ajenas', format('select count(*) from service_messages s where not exists (select 1 from service_requests r where r.id = s.request_id and r.candidate_id = %L)', camila), 'zero'),
   ('camila','Pagos (payments)', 'select count(*) from payments', 'zero'),
   ('camila','Registro de auditoría', 'select count(*) from audit_logs', 'zero'),
   ('camila','Lista de administradores', 'select count(*) from admins', 'zero'),
   ('camila','Notas internas de empresas (candidate_notes)', 'select count(*) from candidate_notes', 'zero'),
   ('camila','Evaluaciones de empresas', 'select count(*) from evaluations', 'zero'),
   ('camila','Notas del equipo VINKA (team_notes)', 'select count(*) from team_notes', 'zero'),
   ('camila','Archivos CV de otros en Storage', format('select count(*) from storage.objects where bucket_id = ''cvs'' and (storage.foldername(name))[1] <> %L', camila), 'zero'),
   ('camila','Archivos de asesorías en Storage', format('select count(*) from storage.objects where bucket_id = ''asesorias'' and name not like %L', camila || '%'), 'zero'),
   ('camila','Cambiarse el rol a empresa', format('update profiles set role = ''company'' where id = %L', camila), 'deny'),
   ('camila','Hacerse administradora', format('insert into admins (user_id) values (%L)', camila), 'deny'),
   ('camila','Editar el perfil de otra persona', format('update profiles set first_name = ''X'' where id = %L', diego), 'deny'),
   ('camila','Marcar su asesoría como pagada directamente', format('update service_requests set status = ''en_curso'' where candidate_id = %L', camila), 'deny'),
   ('camila','Crear un pago a mano', format('insert into payments (kind, candidate_id, amount_clp, method) values (''asesoria'', %L, 1, ''tarjeta'')', camila), 'deny'),
   ('camila','Leer intentos de pago', 'select count(*) from payment_attempts', 'deny'),
   ('camila','Leer valoraciones directo', 'select count(*) from advisor_reviews', 'deny'),
   ('camila','Llamar función de admin (admin_candidates)', 'select admin_candidates()', 'deny'),
   ('camila','Llamar función de admin (admin_revenue)', 'select admin_revenue(true)', 'deny'),
   ('camila','Llamar función de admin (admin_service_requests)', 'select admin_service_requests()', 'deny'),
   ('camila','Reporte de una empresa (company_report)', format('select company_report(%L, 30)', co_agro), 'deny'),
   ('camila','Banco de talento de una empresa', format('select talent_pool(%L)', co_agro), 'deny'),
   ('camila','IDs del equipo de una empresa (company_staff)', format('select coalesce(array_length(company_staff(%L, array[''owner'',''admin'']),1),0)', co_agro), 'zero'),
   -- Empresa Nova mirando a Agroexport
   ('nova','Vacantes no publicadas de otra empresa', format('select count(*) from jobs where company_id = %L and status <> ''published''', co_agro), 'zero'),
   ('nova','Matches de otra empresa', format('select count(*) from matches m join jobs j on j.id = m.job_id where j.company_id = %L', co_agro), 'zero'),
   ('nova','Notas internas de otra empresa', format('select count(*) from candidate_notes where company_id = %L', co_agro), 'zero'),
   ('nova','Evaluaciones de otra empresa', format('select count(*) from evaluations e join jobs j on j.id = e.job_id where j.company_id = %L', co_agro), 'zero'),
   ('nova','Historial (pipeline_events) de otra empresa', format('select count(*) from pipeline_events where company_id = %L', co_agro), 'zero'),
   ('nova','Miembros de otra empresa', format('select count(*) from company_members where company_id = %L', co_agro), 'zero'),
   ('nova','Postulantes externos de otra empresa', format('select count(*) from external_applicants where company_id = %L', co_agro), 'zero'),
   ('nova','Ofertas de otra empresa', format('select count(*) from offers where company_id = %L', co_agro), 'zero'),
   ('nova','Suscripción de otra empresa', format('select count(*) from subscriptions where company_id = %L', co_agro), 'zero'),
   ('nova','Mensajes de chats de otra empresa', format('select count(*) from messages ms join matches m on m.id = ms.match_id join jobs j on j.id = m.job_id where j.company_id = %L', co_agro), 'zero'),
   ('nova','Asesorías de postulantes', 'select count(*) from service_requests', 'zero'),
   ('nova','Editar otra empresa', format('update companies set display_name = ''X'' where id = %L', co_agro), 'deny'),
   ('nova','Hacerse miembro de otra empresa', format('insert into company_members (company_id, user_id, role) values (%L, %L, ''owner'')', co_agro, nova), 'deny'),
   ('nova','Verificar su propia empresa', format('update companies set verification_status = ''verified'' where id = %L', co_nova), 'deny'),
   ('nova','Cambiarse de plan sin pagar', format('update subscriptions set plan_id = ''consultora'', status = ''active'' where company_id = %L', co_nova), 'deny'),
   ('nova','Reporte de otra empresa', format('select company_report(%L, 30)', co_agro), 'deny'),
   ('nova','Banco de talento de otra empresa', format('select talent_pool(%L)', co_agro), 'deny'),
   ('nova','Pipeline de vacante de otra empresa', format('select job_pipeline((select id from jobs where company_id = %L limit 1))', co_agro), 'deny'),
   ('nova','CV de postulantes en Storage (sin match)', 'select count(*) from storage.objects where bucket_id = ''cvs''', 'info'),
   -- Asesora Paula
   ('paula','Asesorías no asignadas a ella', format('select count(*) from service_requests where assigned_to is distinct from %L', paula), 'zero'),
   ('paula','Mensajes de asesorías no asignadas', format('select count(*) from service_messages s join service_requests r on r.id = s.request_id where r.assigned_to is distinct from %L', paula), 'zero'),
   ('paula','Perfiles de postulantes sin asesoría con ella', format('select count(*) from candidate_profiles cp where not exists (select 1 from service_requests r where r.candidate_id = cp.user_id and r.assigned_to = %L)', paula), 'info'),
   ('paula','Funciones de admin', 'select admin_advisors()', 'deny'),
   ('paula','Marcar entregada una asesoría ajena', format('update service_requests set status = ''entregada'' where assigned_to is distinct from %L', paula), 'deny'),
   ('paula','Valorarse a sí misma', format('insert into advisor_reviews (request_id, advisor_id, candidate_id, service_id, overall, punctuality, quality, communication, deliverables) select id, %L, candidate_id, service_id, 5,5,5,5,5 from service_requests limit 1', paula), 'deny');
  for t in select * from cases loop
    total := total + 1;
    who := case t.who when 'camila' then camila when 'nova' then nova when 'paula' then paula end;
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      if t.q ~* '^\s*(update|insert|delete)' then
        execute t.q; get diagnostics n = row_count;
        execute 'reset role';
        if t.expect like 'deny%' and n > 0 and t.expect <> 'deny-or-same' then fails := fails + 1; res := res || E'\n✗ ' || t.who || ' · ' || t.label || ': SE PERMITIÓ (' || n || ' filas)';
        elsif t.expect = 'deny-or-same' and n > 0 then res := res || E'\n? ' || t.who || ' · ' || t.label || ': afectó ' || n || ' fila(s) — revisar';
        else res := res || E'\n✓ ' || t.who || ' · ' || t.label || ': bloqueado (0 filas)'; end if;
      else
        execute t.q into q;
        execute 'reset role';
        if t.expect = 'zero' and coalesce(nullif(q, ''), '0') ~ '^[0-9]+$' and q::bigint > 0 then fails := fails + 1; res := res || E'\n✗ ' || t.who || ' · ' || t.label || ': VE ' || q;
        elsif t.expect = 'deny' then fails := fails + 1; res := res || E'\n✗ ' || t.who || ' · ' || t.label || ': respondió (' || left(coalesce(q, 'null'), 60) || ')';
        elsif t.expect = 'info' then res := res || E'\nℹ ' || t.who || ' · ' || t.label || ': ' || left(coalesce(q,'null'), 60);
        else res := res || E'\n✓ ' || t.who || ' · ' || t.label || ': 0'; end if;
      end if;
    exception when others then
      execute 'reset role';
      if sqlstate in ('42703', '42P01', '42883', '42804', '22P02', '23502', '23503', '23505', '23514') then res := res || E'\n⚠ ' || t.who || ' · ' || t.label || ': consulta inválida [' || sqlstate || '] ' || left(sqlerrm, 70);
      elsif t.expect = 'zero' or t.expect = 'info' then res := res || E'\n✓ ' || t.who || ' · ' || t.label || ': error de permiso (' || left(sqlerrm, 50) || ')';
      else res := res || E'\n✓ ' || t.who || ' · ' || t.label || ': bloqueado (' || left(sqlerrm, 60) || ')'; end if;
    end;
  end loop;
  raise exception 'AISLAMIENTO % casos, % fallas%', total, fails, res;
end $t$;
