-- Seguridad: funciones internas que un visitante sin sesión podía llamar por la API.
-- Ninguna regla de acceso para visitantes depende de ellas (solo reglas para personas con sesión), y la app
-- solo las llama con sesión iniciada. Las funciones públicas a propósito (páginas públicas, postular sin cuenta,
-- cotizar, invitaciones, fotos, avisos de error) NO se tocan.
do $m$
declare r record;
begin
  -- Funciones de apoyo: solo personas con sesión (y el servidor)
  for r in select p.oid::regprocedure as f from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and p.proname in ('can_access_request', 'company_parent', 'company_root', 'is_admin_total', 'is_advisor', 'is_advisor_of', 'my_admin_level', 'service_deadline')
  loop
    execute format('revoke execute on function %s from public, anon', r.f);
    execute format('grant execute on function %s to authenticated, service_role', r.f);
  end loop;
  -- Funciones de disparador (triggers): nadie las llama directamente
  for r in select p.oid::regprocedure as f from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and p.proname in ('audit_admin_team', 'company_rut_check', 'company_rut_dup_notice', 'guard_temp_password', 'member_single_company', 'plan_limit_notice', 'service_on_start')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.f);
  end loop;
  -- Ruta de búsqueda fija (evita que una función use objetos de otro esquema por error)
  for r in select p.oid::regprocedure as f, n.nspname as s from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where (n.nspname = 'public' and p.proname in ('has_contact_info', 'request_folder', 'temp_password', 'service_mark_delivered', 'pl', 'rut_clean', 'rut_valid', 'match_enable_schedule', 'chat_unread_since'))
              or (n.nspname = 'seed' and p.proname in ('pick', 'place', 'rut_dv', 'fmt_rut', 'slug', 'mk_user', 'level_txt', 'base_salary', 'gtitle'))
  loop
    execute format('alter function %s set search_path = %I, extensions, pg_catalog', r.f, r.s);
  end loop;
end $m$;
