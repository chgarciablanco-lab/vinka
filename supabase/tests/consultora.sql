-- Pruebas de consultora (matriz) y empresas clientes. No deja rastro: termina en un error controlado que deshace todo.
-- Cómo usar: pegar en el SQL Editor de Supabase y leer el mensaje final. Usa las cuentas *.test@example.com.

create or replace function pg_temp.ok(c boolean, t text) returns text language sql as $$ select case when coalesce(c, false) then 'OK    ' else 'FALLA ' end || t || E'\n' $$;
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  if u is null then perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon';
  else perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end if;
end $$;
grant execute on function pg_temp.ok(boolean, text) to public;

do $$
declare nova uuid; agro uuid; cam uuid; adm uuid; co uuid; hc uuid; hj uuid; hj2 uuid; r jsonb; n int; n2 int; log text := '';
begin
  select id into nova from auth.users where email = 'nova.test@example.com';
  select id into agro from auth.users where email = 'agro.test@example.com';
  select id into cam from auth.users where email = 'camila.test@example.com';
  select id into adm from auth.users where email = 'admin.test@example.com';
  select company_id into co from company_members where user_id = nova and role = 'owner';
  update jobs set status = 'paused' where company_id = co and status = 'published';
  ---------------- H. Consultora (matriz) y empresas clientes ----------------
  perform pg_temp.as_user(nova);
  perform set_company_kind(co, 'consultora');
  log := log || pg_temp.ok((select kind from companies where id = co) = 'consultora', 'H1 la dueña activa «Somos consultora»');
  hc := create_client_company(co, '{"display_name":"Cliente Matriz Prueba","legal_name":"Cliente Matriz SpA","rut":"76.555.444-3","sector":"Retail","region":"Maule","comuna":"Talca"}');
  log := log || pg_temp.ok((select parent_id from companies where id = hc) = co and (select verification_status from companies where id = hc) = 'pending', 'H2 crea cliente pendiente de verificación');
  log := log || pg_temp.ok(exists (select 1 from jsonb_array_elements(my_companies()) x where (x->>'company_id')::uuid = hc and (x->>'inherited')::boolean), 'H3 el cliente aparece en «mis empresas» de la matriz');
  log := log || pg_temp.ok(can_manage(hc) and is_company_admin(hc), 'H4 el equipo de la matriz gestiona al cliente');
  begin update companies set parent_id = null where id = hc; log := log || pg_temp.ok(false, 'H5 no se puede soltar al cliente por API');
  exception when others then log := log || pg_temp.ok(true, 'H5 no se puede soltar al cliente por API'); end;
  begin perform invite_member(hc, 'otro.reclutador@example.com', 'recruiter'); log := log || pg_temp.ok(false, 'H6 en un cliente solo se invita con rol «cliente»');
  exception when others then log := log || pg_temp.ok(true, 'H6 en un cliente solo se invita con rol «cliente»'); end;
  begin perform invite_member(co, 'otro.cliente@example.com', 'client'); log := log || pg_temp.ok(false, 'H7 la matriz no invita con rol «cliente»');
  exception when others then log := log || pg_temp.ok(true, 'H7 la matriz no invita con rol «cliente»'); end;
  reset role;
  perform pg_temp.as_user(adm);
  update companies set verification_status = 'verified' where id = hc;
  begin perform admin_set_plan(hc, 'equipo', 'active', null, ''); log := log || pg_temp.ok(false, 'H8 no se asigna plan propio a un cliente');
  exception when others then log := log || pg_temp.ok(true, 'H8 no se asigna plan propio a un cliente'); end;
  reset role;
  perform pg_temp.as_user(nova);
  insert into jobs(company_id, title, area, description, region, comuna, status, modality, salary_min, salary_max, salary_type)
  values (hc, 'Cliente vendedor', 'Ventas', 'Vacante de un cliente de la consultora para la matriz de pruebas.', 'Maule', 'Talca', 'published', 'Presencial', 600000, 800000, 'liquido') returning id into hj;
  insert into jobs(company_id, title, area, description, region, comuna, status, modality, salary_min, salary_max, salary_type, confidential)
  values (hc, 'Cliente confidencial', 'Ventas', 'Vacante confidencial de un cliente de la consultora para pruebas.', 'Maule', 'Talca', 'published', 'Presencial', 600000, 800000, 'liquido', true) returning id into hj2;
  log := log || pg_temp.ok((company_plan(hc)->>'managed_by') = (select display_name from companies where id = co)
    and (company_plan(co)->'usage'->>'jobs')::int = (company_plan(hc)->'usage'->>'jobs')::int, 'H9 el plan y el uso son de todo el grupo');
  reset role;
  r := public_job(hj);
  log := log || pg_temp.ok(r->'company'->>'display_name' = 'Cliente Matriz Prueba' and r->'company'->>'managed_by' = (select display_name from companies where id = co), 'H10 aviso público: cliente «gestionado por» la matriz');
  r := public_job(hj2);
  log := log || pg_temp.ok(r->'company'->>'display_name' = 'Empresa confidencial' and r->'company'->>'slug' is null and coalesce(r->'company'->>'description', '') = '', 'H11 vacante confidencial oculta al cliente');
  log := log || pg_temp.ok(not exists (select 1 from jsonb_array_elements(public_company((select slug from companies where id = hc))->'jobs') x where (x->>'id')::uuid = hj2), 'H12 la confidencial no sale en la página pública del cliente');
  insert into company_members(company_id, user_id, role) values (hc, agro, 'client');
  perform pg_temp.as_user(agro);
  log := log || pg_temp.ok(is_company_member(hc) and not can_manage(hc) and member_role(hc) = 'client', 'H13 usuario cliente ve su empresa sin gestionar');
  log := log || pg_temp.ok(not exists (select 1 from jsonb_array_elements(my_companies()) x where (x->>'company_id')::uuid = co), 'H14 el usuario cliente no ve la matriz');
  log := log || pg_temp.ok(not is_company_member(co) and (select count(*) from jobs where id = hj) = 1, 'H15 el usuario cliente no entra a la matriz');
  begin perform consultancy_clients(co); log := log || pg_temp.ok(false, 'H16 el usuario cliente no lista otros clientes');
  exception when others then log := log || pg_temp.ok(true, 'H16 el usuario cliente no lista otros clientes'); end;
  begin update jobs set title = 'Cambiado por cliente' where id = hj; get diagnostics n = row_count; log := log || pg_temp.ok(n = 0, 'H17 el usuario cliente no edita vacantes');
  exception when others then log := log || pg_temp.ok(true, 'H17 el usuario cliente no edita vacantes'); end;
  reset role;
  log := log || pg_temp.ok(agro = any(company_approvers(hc)) and not (nova = any(company_approvers(hc))), 'H18 con usuario cliente, él aprueba las ofertas');
  perform pg_temp.as_user(cam);
  insert into candidate_job_actions(candidate_id, job_id, action) values (cam, hj2, 'interest');
  log := log || pg_temp.ok((select company_name from my_interests() where job_id = hj2 limit 1) = 'Empresa confidencial', 'H19 el postulante no ve el nombre en confidencial');
  reset role;

  select count(*) filter (where l like 'OK%'), count(*) filter (where l like 'FALLA%') into n, n2 from unnest(string_to_array(log, E'\n')) l;
  raise exception 'SECCION H (revertida)%', E'\n' || log || format('TOTAL: %s OK, %s FALLA', n, n2);
end $$;
