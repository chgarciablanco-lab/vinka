-- Los avisos para administración abren la sección correcta del espacio de administración
do $$
declare d text;
begin
  d := replace(pg_get_functiondef('public.request_career_service(text,text,text,boolean)'::regprocedure), '''/admin''', '''/asesorias''');
  execute d;
  d := replace(pg_get_functiondef('public.cancel_service_request(uuid)'::regprocedure), '''/admin''', '''/asesorias''');
  execute d;
  d := replace(pg_get_functiondef('public.request_plan_change(uuid,text,text)'::regprocedure), '''/admin''', '''/''');
  execute d;
end $$;
update public.notifications set url = '/asesorias' where url = '/admin' and kind = 'service_request';
update public.notifications set url = '/' where url = '/admin' and kind = 'plan_request';
