-- Cobros: la tarea automática no toca las empresas de demostración (seed.companies)
do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.billing_housekeeping'::regproc);
  n := replace(d, 'for s in select * from subscriptions where status in (''active'', ''past_due'') and current_period_end is not null loop',
    'for s in select * from subscriptions x where x.status in (''active'', ''past_due'') and x.current_period_end is not null
      and not exists (select 1 from seed.companies sc where sc.id = x.company_id) loop');
  if n = d then raise exception 'billing_housekeeping'; end if; execute n;
end $mig$;
