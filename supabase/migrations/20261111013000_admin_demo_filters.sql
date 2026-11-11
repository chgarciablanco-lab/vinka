-- Administración: los datos de demostración se pueden excluir en todas las cifras, no solo en las listas.
-- admin_overview: 'metrics' pasa a ser solo datos reales y 'metrics_all' incluye la demostración.
-- admin_sessions y admin_advisors marcan qué es de demostración.
do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.admin_overview'::regproc);
  n := replace(d, '''metrics'', jsonb_build_object(', '''metrics'', jsonb_build_object(
      ''companies'', (select count(*) from companies c where verification_status = ''verified'' and not exists (select 1 from seed.companies s where s.id = c.id)),
      ''pending'', (select count(*) from companies c where verification_status = ''pending'' and not exists (select 1 from seed.companies s where s.id = c.id)),
      ''candidates'', (select count(*) from candidate_profiles cp where onboarding_done and not exists (select 1 from seed.users s where s.id = cp.user_id)),
      ''jobs_open'', (select count(*) from jobs j where status = ''published'' and not exists (select 1 from seed.companies s where s.id = j.company_id)),
      ''matches_30d'', (select count(*) from matches m where created_at > now() - interval ''30 days'' and not exists (select 1 from seed.companies s where s.id = m.company_id) and not exists (select 1 from seed.users s where s.id = m.candidate_id)),
      ''hires_30d'', (select count(*) from matches m where hired_at > now() - interval ''30 days'' and not exists (select 1 from seed.companies s where s.id = m.company_id) and not exists (select 1 from seed.users s where s.id = m.candidate_id)),
      ''paying'', (select count(*) from subscriptions s where status = ''active'' and plan_id <> ''gratis'' and not exists (select 1 from seed.companies d where d.id = s.company_id)),
      ''mrr'', (select coalesce(sum(p.price_clp), 0) from subscriptions s join plans p on p.id = s.plan_id where s.status = ''active'' and not exists (select 1 from seed.companies d where d.id = s.company_id)),
      ''ai_30d'', (select count(*) from ai_log a where created_at > now() - interval ''30 days'' and not exists (select 1 from seed.companies s where s.id = a.company_id) and not exists (select 1 from seed.users s where s.id = a.user_id)),
      ''errors_7d'', (select count(*) from client_errors where resolved_at is null and created_at > now() - interval ''7 days'')),
    ''metrics_all'', jsonb_build_object(');
  if n = d or position('metrics_all' in n) = 0 then raise exception 'admin_overview'; end if; execute n;

  d := pg_get_functiondef('public.admin_sessions'::regproc);
  n := replace(d, '''status'', s.status, ''link'', s.link,', '''status'', s.status, ''link'', s.link, ''demo'', exists (select 1 from seed.users su where su.id = r.candidate_id),');
  if n = d then raise exception 'admin_sessions'; end if; execute n;

  d := pg_get_functiondef('public.admin_advisors'::regproc);
  n := replace(d, '''delivered'', (select count(*) from service_requests r where r.assigned_to = a.user_id and r.status = ''entregada''))',
    '''delivered'', (select count(*) from service_requests r where r.assigned_to = a.user_id and r.status = ''entregada''),
      ''open_demo'', (select count(*) from service_requests r where r.assigned_to = a.user_id and r.status in (''solicitada'', ''pago_pendiente'', ''en_curso'') and exists (select 1 from seed.users su where su.id = r.candidate_id)),
      ''delivered_demo'', (select count(*) from service_requests r where r.assigned_to = a.user_id and r.status = ''entregada'' and exists (select 1 from seed.users su where su.id = r.candidate_id)))');
  if n = d then raise exception 'admin_advisors'; end if; execute n;
end $mig$;
