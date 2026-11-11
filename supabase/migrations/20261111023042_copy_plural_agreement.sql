-- Revisión editorial: concordancia de número en mensajes de límites de plan (sin «(s)»)
create or replace function public.pl(n bigint, one text, many text) returns text language sql immutable as $$ select n || ' ' || case when n = 1 then one else many end $$;
do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.invite_member'::regproc);
  n := replace(d, '''Tu plan % permite % persona(s) en el equipo (contando invitaciones pendientes). Cambia de plan para sumar más.'', v_plan.name, v_plan.max_members',
                  '''Tu plan % permite % en el equipo (contando invitaciones pendientes). Cambia de plan para sumar más.'', v_plan.name, pl(v_plan.max_members, ''persona'', ''personas'')');
  if n = d then raise exception 'invite_member'; end if; execute n;

  d := pg_get_functiondef('public.job_guard'::regproc);
  n := replace(d, '''Tu plan % permite % vacante(s) publicada(s) a la vez. Pausa o cierra otra, o cambia de plan.'', v_plan.name, v_plan.max_active_jobs',
                  '''Tu plan % permite % a la vez. Pausa o cierra otra, o cambia de plan.'', v_plan.name, pl(v_plan.max_active_jobs, ''vacante publicada'', ''vacantes publicadas'')');
  if n = d then raise exception 'job_guard'; end if; execute n;

  d := pg_get_functiondef('public.plan_limit_notice'::regproc);
  n := replace(d, '''Tu plan '' || p.name || '' permite '' || p.max_active_jobs || '' vacante(s) a la vez y tienes '' || n || ''.',
                  '''Tu plan '' || p.name || '' permite '' || pl(p.max_active_jobs, ''vacante'', ''vacantes'') || '' a la vez y tienes '' || n || ''.');
  if n = d then raise exception 'plan_limit_notice'; end if; execute n;
end $mig$;
