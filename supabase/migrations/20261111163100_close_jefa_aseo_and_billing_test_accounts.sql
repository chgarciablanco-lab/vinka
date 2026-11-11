-- Cierra «Jefa aseo» (Nova Retail, prueba, descripción de 8 caracteres) y suma las empresas de las cuentas de prueba a la tarea de cobros.
create table if not exists backup.jobs_jefa_aseo_20261111 as select * from public.jobs where id = 'c1883510-c958-4bd6-bbc7-1cdc5b9a9b3c';
update public.jobs set status = 'closed' where id = 'c1883510-c958-4bd6-bbc7-1cdc5b9a9b3c' and status = 'published';

do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.billing_housekeeping'::regproc);
  n := replace(d, 'and not exists (select 1 from seed.companies sc where sc.id = x.company_id) loop',
    'and (not exists (select 1 from seed.companies sc where sc.id = x.company_id)
           or exists (select 1 from company_members cm join seed.users su on su.id = cm.user_id and su.kind = ''test'' where cm.company_id = x.company_id)) loop');
  if n = d then raise exception 'billing_housekeeping'; end if; execute n;
end $mig$;
