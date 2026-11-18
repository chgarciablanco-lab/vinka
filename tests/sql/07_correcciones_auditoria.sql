-- Auditoría 13-11-2026: pagos DEMO fuera de ventas reales, edición del propio perfil, «corregir mi nombre» y funciones auxiliares cerradas.
-- Termina con RAISE: no deja ningún cambio.
do $t$
declare camila uuid; nova uuid; adm uuid; owner uuid; co uuid; b jsonb; a jsonb; n int; out text := ''; nm text;
begin
  select id into camila from auth.users where email='camila.test@example.com';
  select id into nova from auth.users where email='nova.test@example.com';
  select a2.user_id into adm from admins a2 where a2.level = 'total' limit 1;
  select c.id, m.user_id into co, owner from companies c join company_members m on m.company_id = c.id and m.role = 'owner'
   where c.parent_id is null and c.verification_status = 'verified' and not exists (select 1 from seed.companies s where s.id = c.id) limit 1;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true); b := admin_revenue(false);
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true); perform checkout_pay('plan', co, 'visa_ok', 'credito', 1, 'pyme', 1);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true); a := admin_revenue(false);
  out := out || E'\n' || case when b->>'month' = a->>'month' and b->>'mrr' = a->>'mrr' then '✓' else '✗' end || ' 1 pago DEMO de empresa real no suma a ventas ni MRR';
  perform set_config('request.jwt.claims', json_build_object('sub', camila, 'role', 'authenticated')::text, true);
  begin update profiles set first_name = first_name where id = camila; get diagnostics n = row_count; out := out || E'\n✓ 2 editar perfil propio (' || n || ' fila)'; exception when others then out := out || E'\n✗ 2 ' || sqlerrm; end;
  begin update profiles set role = 'company' where id = camila; get diagnostics n = row_count; out := out || E'\n✗ 3 cambió el rol'; exception when others then out := out || E'\n✓ 3 cambiarse el rol sigue bloqueado'; end;
  perform update_my_name('María José', 'Pérez-Núñez'); select first_name || ' ' || last_name into nm from profiles where id = camila; out := out || E'\n✓ 4 corregir nombre: ' || nm;
  begin perform update_my_name('<script>', 'x'); out := out || E'\n✗ 5'; exception when others then out := out || E'\n✓ 5 nombre inválido rechazado'; end;
  begin perform company_staff(co, array['owner']); out := out || E'\n✗ 6 company_staff abierto'; exception when others then out := out || E'\n✓ 6 funciones auxiliares cerradas'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', nova, 'role', 'authenticated')::text, true);
  perform talent_pool('8ad4b23e-3f8c-443c-9e44-d54275d612db'); perform company_plan('8ad4b23e-3f8c-443c-9e44-d54275d612db');
  out := out || E'\n✓ 7 funciones de empresa siguen funcionando';
  execute 'reset role';
  raise exception 'RESULTADO (se deshace) %', out;
end $t$;
