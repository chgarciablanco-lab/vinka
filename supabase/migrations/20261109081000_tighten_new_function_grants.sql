-- Funciones de disparadores e internas: nadie las llama por la API
revoke execute on function public.company_add_subscription() from public, anon, authenticated;
revoke execute on function public.apply_stage_rule() from public, anon, authenticated;
revoke execute on function public.message_rate_guard() from public, anon, authenticated;
revoke execute on function public.notify_job_closed() from public, anon, authenticated;
revoke execute on function public.company_slug() from public, anon, authenticated;
revoke execute on function public.plan_of(uuid) from public, anon, authenticated;
-- Solo con sesión (además validan permisos dentro)
revoke execute on function public.admin_overview() from public, anon;
revoke execute on function public.admin_set_plan(uuid, text, text, timestamptz, text) from public, anon;
revoke execute on function public.company_plan(uuid) from public, anon;
revoke execute on function public.request_plan_change(uuid, text, text) from public, anon;
revoke execute on function public.approve_job(uuid) from public, anon;
revoke execute on function public.approve_offer(uuid, boolean) from public, anon;
revoke execute on function public.stage_times(uuid, integer) from public, anon;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_set_plan(uuid, text, text, timestamptz, text) to authenticated;
grant execute on function public.company_plan(uuid) to authenticated;
grant execute on function public.request_plan_change(uuid, text, text) to authenticated;
grant execute on function public.approve_job(uuid) to authenticated;
grant execute on function public.approve_offer(uuid, boolean) to authenticated;
grant execute on function public.stage_times(uuid, integer) to authenticated;
alter function public.slugify(text) set search_path = public;
