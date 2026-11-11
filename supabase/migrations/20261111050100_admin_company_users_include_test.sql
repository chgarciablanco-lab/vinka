-- El registro de usuarios de empresas excluye los datos generados de demostración, pero muestra las cuentas de prueba (*.test@example.com)
do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.admin_company_users'::regproc);
  n := replace(d, 'not exists (select 1 from seed.users s where s.id = cm.user_id)', 'not exists (select 1 from seed.users s where s.id = cm.user_id and s.kind <> ''test'')');
  if n = d then raise exception 'admin_company_users'; end if; execute n;
end $mig$;
