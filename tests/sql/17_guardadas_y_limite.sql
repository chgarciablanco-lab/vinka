-- Personas guardadas en el tablero, lista de «sin avanzar» y límite del plan al publicar (migración 20261125020000).
-- Datos propios; todo se deshace con rollback.
begin;
create function pg_temp.act(u uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.root() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('request.jwt.claims', '{}', true); end $$;
do $t$
declare own uuid := gen_random_uuid(); c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); co uuid; job uuid; m uuid; j jsonb; n int; lim int; msg text; out text := ''; i int;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (own, 'duena@guard.test', '{"role":"company","first_name":"Olga","last_name":"Dueña"}'),
    (c1, 'c1@guard.test', '{"first_name":"Ana","last_name":"Uno"}'), (c2, 'c2@guard.test', '{"first_name":"Bea","last_name":"Dos"}');
  insert into companies (owner_id, display_name, legal_name, rut, verification_status, stale_days) values (own, 'Guard SpA', 'Guard SpA', '76.555.123-4', 'verified', 5) returning id into co;
  insert into jobs (company_id, title, area, level, description, modality, schedule, contract, region, comuna, status)
    values (co, 'Bodeguero/a', 'logistica', 'junior', 'Recepción y despacho de mercadería en bodega, jornada completa.', 'presencial', 'completa', 'indefinido', 'Maule', 'Talca', 'published') returning id into job;
  insert into candidate_job_actions (candidate_id, job_id, action) values (c1, job, 'interest'), (c2, job, 'interest');
  -- La empresa guarda a c1 (no decide) y hace match con c2, que queda detenido 8 días
  insert into company_candidate_actions (job_id, candidate_id, action, created_by) values (job, c1, 'save', own), (job, c2, 'interest', own);
  select id into m from matches where job_id = job and candidate_id = c2;
  update matches set stage_changed_at = now() - interval '8 days', created_at = now() - interval '8 days' where id = m;

  -- 1) La persona guardada sigue en el tablero, marcada; el desglose la cuenta
  perform pg_temp.act(own); j := job_pipeline(job);
  out := out || E'\n1 guardada sigue en el tablero con marca y el desglose dice 1 guardada (2 tarjetas): '
    || (exists (select 1 from jsonb_array_elements(j->'cards') c where c->>'candidate_id' = c1::text and (c->>'saved')::boolean)
        and (j->'counts'->>'guardadas')::int = 1 and jsonb_array_length(j->'cards') = 2);

  -- 2) Lista de «sin avanzar»: c2 con vacante, etapa y 8 días; el pendiente del Panel abre esa lista
  select count(*) into n from company_stale_list(co) s where s.match_id = m and s.days = 8 and s.job_title = 'Bodeguero/a' and s.stage = 'match';
  out := out || E'\n2 lista de personas sin avanzar con vacante, etapa y días; el pendiente lleva a esa lista: '
    || (n = 1 and exists (select 1 from jsonb_array_elements(company_todo(co)) x where x->>'key' = 'estancados' and x->>'url' = '/pendientes/sin-avanzar'));

  -- 3) Otra cuenta no puede ver la lista
  perform pg_temp.act(c1); begin perform company_stale_list(co); msg := 'vio'; exception when others then msg := sqlerrm; end;
  out := out || E'\n3 otra cuenta no puede ver la lista: ' || (msg <> 'vio');

  -- 4) Límite del plan al publicar: se puede llegar al límite, pero no pasarlo
  perform pg_temp.root(); select (plan_of(co)).max_active_jobs into lim;
  perform pg_temp.act(own);
  for i in 2..coalesce(lim, 1) loop
    insert into jobs (company_id, title, area, level, description, modality, schedule, contract, region, comuna, status)
      values (co, 'Vacante ' || i, 'ventas', 'junior', 'Atención de clientes en sala de ventas, jornada completa y turnos.', 'presencial', 'completa', 'indefinido', 'Maule', 'Talca', 'published');
  end loop;
  begin
    insert into jobs (company_id, title, area, level, description, modality, schedule, contract, region, comuna, status)
      values (co, 'Una de más', 'ventas', 'junior', 'Atención de clientes en sala de ventas, jornada completa y turnos.', 'presencial', 'completa', 'indefinido', 'Maule', 'Talca', 'published');
    msg := 'publicó';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.root(); select count(*) into n from jobs where company_id = co and status = 'published';
  out := out || E'\n4 límite del plan (' || coalesce(lim::text, 'sin límite') || ' a la vez): llega al límite y la siguiente se rechaza con mensaje claro: ' || (n = lim and msg ilike '%a la vez%') || ' («' || msg || '»)';
  raise notice '%', out;
  -- Si alguna comprobación da «false», la prueba FALLA (no solo lo imprime)
  if out ~ ': false' then raise exception 'PRUEBA FALLIDA:%', out; end if;
end $t$;
rollback;
