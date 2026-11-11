-- Vencimientos en horario hábil: los hitos de asesoría vencen a las 18:00 (hora de Chile) del día hábil que corresponde,
-- en vez de heredar la hora de inicio (01:01, 01:30…). El seguimiento de 2 semanas pasa a 10 días hábiles (no cae en fin de semana).
-- Los pagos de plan quedan pagados hasta las 23:59 (hora de Chile) del día de vencimiento.
create or replace function public.add_business_days(p_from timestamptz, p_days int) returns timestamptz
language plpgsql immutable set search_path = public as $$
declare t date := (p_from at time zone 'America/Santiago')::date; n int := 0;
begin
  while n < p_days loop
    t := t + 1;
    if extract(isodow from t) < 6 then n := n + 1; end if;
  end loop;
  return (t + time '18:00') at time zone 'America/Santiago';
end $$;

-- Fin del día en hora de Chile (23:59)
create or replace function public.cl_end_of_day(p timestamptz) returns timestamptz
language sql immutable set search_path = public as $$ select (((p at time zone 'America/Santiago')::date + time '23:59') at time zone 'America/Santiago') $$;

do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.service_milestones'::regproc);
  n := replace(d, '''due'', dd + interval ''14 days''', '''due'', add_business_days(dd, 10)');
  if n = d then raise exception 'service_milestones'; end if; execute n;

  d := pg_get_functiondef('public.admin_record_payment'::regproc);
  n := replace(d, 'v_from + make_interval(months => coalesce(p_months, 1))', 'cl_end_of_day(v_from + make_interval(months => coalesce(p_months, 1)))');
  if n = d then raise exception 'admin_record_payment'; end if; execute n;
end $mig$;
