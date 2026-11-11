-- Auditoría 11-11-2026: hallazgos P1 (F01, F02, F04, F05) y la baja directa por SQL (F03).
-- Ejecutar ANTES del arreglo (deben aparecer FALLA) y DESPUÉS (todo OK). Todo se revierte con el RAISE final.
do $t$
declare r text := ''; e text; ok boolean; n int; res jsonb;
  nova uuid := '8ad4b23e-3f8c-443c-9e44-d54275d612db'; nova_u uuid := 'ef0495a9-8dde-4995-8d52-b12969fe71d3';
  ferre uuid := '27911b47-d5c9-4676-92c4-d7f3eed1d328'; adm uuid := 'a2fe2ae1-48a1-42b8-80a3-2fbb3edbf1d4';
  adv uuid := '63e7e733-078c-4e78-afd9-58408b87cb20'; sr uuid := 'c791986c-db55-48e8-8d49-b177b0f9b66e';
  j_nova uuid; j_ferre uuid; tpl jobs;
begin
  -- F02: la dueña de Nova no puede borrar su cuenta (ni con ella la empresa)
  -- (en un subbloque que siempre se deshace, para que el resto de la prueba tenga a Nova aunque hoy se borre)
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', nova_u, 'role','authenticated')::text, true);
    set local role authenticated;
    begin perform delete_my_account(); e := 'borró'; exception when others then e := sqlerrm; end;
    reset role;
    ok := exists (select 1 from companies where id = nova) and exists (select 1 from auth.users where id = nova_u);
    raise exception 'deshacer_f02';
  exception when others then reset role;
  end;
  r := r || case when ok then 'OK  ' else 'FALLA' end || ' F02 dueña no puede borrar su cuenta · ' || left(e, 90) || E'\n';
  begin perform delete_account_data(nova_u); e := 'borró'; exception when others then e := sqlerrm; end;
  ok := exists (select 1 from companies where id = nova);
  r := r || case when ok then 'OK  ' else 'FALLA' end || ' F02 baja de servidor rechaza a la dueña · ' || left(e, 90) || E'\n';
  begin delete from profiles where id = nova_u; e := 'borró'; exception when others then e := sqlerrm; end;
  ok := exists (select 1 from companies where id = nova);
  r := r || case when ok then 'OK  ' else 'FALLA' end || ' F02 la base no borra la empresa en cascada · ' || left(e, 70) || E'\n';

  -- F04: «ya cambié mi contraseña» sin cambiarla no debe quitar la obligación
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  set local role authenticated;
  perform admin_reset_advisor_password(adv);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adv, 'role','authenticated')::text, true);
  set local role authenticated;
  begin perform password_changed(); e := 'sin error'; exception when others then e := sqlerrm; end;
  reset role;
  ok := (select must_change_password from profiles where id = adv);
  r := r || case when ok then 'OK  ' else 'FALLA' end || ' F04 sin cambio real sigue obligada · ' || left(e, 80) || E'\n';
  update auth.users set encrypted_password = crypt('Otra-clave-2026', gen_salt('bf')) where id = adv;  -- cambio real
  set local role authenticated;
  perform password_changed();
  reset role;
  ok := not (select must_change_password from profiles where id = adv);
  r := r || case when ok then 'OK  ' else 'FALLA' end || ' F04 con cambio real se libera' || E'\n';

  -- F05: Cancelada → En curso no puede saltarse el control de pago
  update admins set level = 'operaciones' where user_id = adm;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  set local role authenticated;
  perform admin_update_service_request(sr, 'cancelada', 'prueba');
  begin perform admin_update_service_request(sr, 'en_curso', 'prueba'); e := 'activó'; exception when others then e := sqlerrm; end;
  reset role;
  ok := (select status from service_requests where id = sr) = 'cancelada';
  r := r || case when ok then 'OK  ' else 'FALLA' end || ' F05 operaciones no activa desde cancelada · ' || left(e, 80) || E'\n';
  update admins set level = 'total' where user_id = adm;
  set local role authenticated;
  begin perform admin_update_service_request(sr, 'en_curso', 'prueba'); e := 'activó'; exception when others then e := sqlerrm; end;
  reset role;
  ok := (select status from service_requests where id = sr) = 'cancelada' or exists (select 1 from payments where request_id = sr);
  r := r || case when ok then 'OK  ' else 'FALLA' end || ' F05 activar siempre deja pago o se rechaza · ' || left(e, 80) || E'\n';
  set local role authenticated;
  perform admin_update_service_request(sr, 'solicitada', 'reabierta');
  perform admin_update_service_request(sr, 'en_curso', 'pago confirmado');
  reset role;
  ok := (select status from service_requests where id = sr) = 'en_curso' and (select count(*) from payments where request_id = sr) = 1;
  r := r || case when ok then 'OK  ' else 'FALLA' end || ' F05 reabrir y confirmar deja exactamente 1 pago' || E'\n';

  -- F01: los destacados del plan son del grupo (matriz + clientes)
  select * into tpl from jobs where company_id = nova and status = 'published' limit 1;
  select id into j_nova from jobs j where company_id = nova and status = 'published'
    and not exists (select 1 from promotions p where p.job_id = j.id and p.status in ('solicitada','activa','pausada')) limit 1;
  insert into jobs (company_id, title, description, area, level, modality, schedule, contract, region, comuna, status)
  values (ferre, 'Vendedor/a de ferretería', 'Atención de clientes en sala de ventas, caja y reposición.', tpl.area, tpl.level, tpl.modality, tpl.schedule, tpl.contract, tpl.region, tpl.comuna, 'published')
  returning id into j_ferre;
  delete from promotions where company_id in (nova, ferre) and source = 'plan' and created_at >= date_trunc('month', now() at time zone 'America/Santiago') at time zone 'America/Santiago';
  perform set_config('request.jwt.claims', json_build_object('sub', nova_u, 'role','authenticated')::text, true);
  set local role authenticated;
  perform request_promotion(null, j_nova, true, false);
  begin perform request_promotion(null, j_ferre, true, false); e := 'usó otro crédito'; exception when others then e := sqlerrm; end;
  res := company_plan(ferre);
  reset role;
  select count(*) into n from promotions where company_id in (nova, ferre) and source = 'plan' and status = 'activa';
  r := r || case when n = 1 then 'OK  ' else 'FALLA' end || ' F01 un solo destacado del plan para el grupo (usados=' || n || ') · ' || left(e, 70) || E'\n';
  r := r || case when res->>'status' = (select status from subscriptions where company_id = nova) and (res->'usage'->>'promos')::int = 1 then 'OK  ' else 'FALLA' end
     || ' F01 el cliente ve el estado y consumo del grupo (estado=' || (res->>'status') || ', destacados=' || coalesce(res->'usage'->>'promos', '?') || ')' || E'\n';

  -- F03: la baja directa por SQL (que no borra archivos físicos) ya no se puede llamar desde la app
  ok := not has_function_privilege('authenticated', 'public.delete_my_account()', 'execute');
  r := r || case when ok then 'OK  ' else 'FALLA' end || ' F03 baja solo por la función de servidor (borra archivos con la API de Storage)' || E'\n';

  raise exception E'AUDITORÍA P1 (revertido)\n%', r;
end $t$;
