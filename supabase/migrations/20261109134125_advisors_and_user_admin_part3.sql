-- Migración aplicada en Supabase (20261109134125). Exportada tal cual desde supabase_migrations.schema_migrations.

create or replace function public.admin_candidates(p_q text default '', p_filter text default '', p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare q text := '%' || lower(trim(coalesce(p_q, ''))) || '%'; res jsonb; total int;
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  with base as (
    select p.id, trim(p.first_name || ' ' || p.last_name) as name, u.email, p.phone, p.created_at, p.last_seen_at, p.suspended_at, p.suspended_reason,
      cp.headline, cp.comuna, cp.region, cp.onboarding_done, cp.is_public,
      exists (select 1 from seed.users s where s.id = p.id) as demo,
      count(*) over () as n
    from profiles p join auth.users u on u.id = p.id left join candidate_profiles cp on cp.user_id = p.id
    where p.role = 'candidate' and not exists (select 1 from admins a where a.user_id = p.id)
      and (trim(coalesce(p_q, '')) = '' or lower(p.first_name || ' ' || p.last_name || ' ' || u.email || ' ' || coalesce(cp.headline, '') || ' ' || coalesce(cp.comuna, '') || ' ' || coalesce(p.phone, '')) like q)
      and case coalesce(p_filter, '')
        when 'suspendidos' then p.suspended_at is not null
        when 'activos' then p.suspended_at is null
        when 'incompletos' then not coalesce(cp.onboarding_done, false)
        when 'asesoria' then exists (select 1 from service_requests r where r.candidate_id = p.id)
        when 'reales' then not exists (select 1 from seed.users s where s.id = p.id)
        else true end
    order by p.created_at desc limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
  )
  select max(b.n), coalesce(jsonb_agg((to_jsonb(b) - 'n') || jsonb_build_object(
      'matches', (select count(*) from matches m where m.candidate_id = b.id),
      'interests', (select count(*) from candidate_job_actions a where a.candidate_id = b.id and a.action = 'interest'),
      'requests', (select count(*) from service_requests r where r.candidate_id = b.id)) order by b.created_at desc), '[]'::jsonb)
    into total, res from base b;
  return jsonb_build_object('total', coalesce(total, 0), 'rows', res);
end $$;
revoke execute on function public.admin_candidates(text, text, int, int) from public, anon;
grant execute on function public.admin_candidates(text, text, int, int) to authenticated;

create or replace function public.admin_candidate_detail(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  return jsonb_build_object(
    'profile', (select to_jsonb(cp) - 'video_path' from candidate_profiles cp where cp.user_id = p_user),
    'matches', coalesce((select jsonb_agg(jsonb_build_object('job', j.title, 'company', c.display_name, 'stage', m.stage, 'at', m.created_at) order by m.created_at desc)
       from matches m join jobs j on j.id = m.job_id join companies c on c.id = m.company_id where m.candidate_id = p_user), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('service', r.service_name, 'status', r.status, 'price', r.price_clp, 'at', r.created_at) order by r.created_at desc)
       from service_requests r where r.candidate_id = p_user), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(jsonb_build_object('action', a.action, 'at', a.created_at, 'detail', a.detail) order by a.created_at desc)
       from audit_logs a where a.entity = 'user' and a.entity_id = p_user), '[]'::jsonb));
end $$;
revoke execute on function public.admin_candidate_detail(uuid) from public, anon;
grant execute on function public.admin_candidate_detail(uuid) to authenticated;

create or replace function public.admin_service_requests()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'service_id', r.service_id, 'service', r.service_name, 'price', r.price_clp, 'status', r.status, 'goal', r.goal,
      'contact_pref', r.contact_pref, 'note', r.admin_note, 'created_at', r.created_at, 'updated_at', r.updated_at,
      'candidate_id', r.candidate_id, 'name', trim(p.first_name || ' ' || p.last_name), 'email', u.email, 'phone', p.phone,
      'headline', cp.headline, 'comuna', cp.comuna, 'region', cp.region, 'has_experience', cp.has_experience,
      'experiences', cp.experiences, 'education', cp.education, 'skills', cp.skills, 'bio', cp.bio,
      'advisor_id', r.assigned_to, 'advisor', (select trim(ap.first_name || ' ' || ap.last_name) from profiles ap where ap.id = r.assigned_to),
      'messages', (select count(*) from service_messages m where m.request_id = r.id))
    order by case when r.status in ('solicitada', 'pago_pendiente', 'en_curso') then 0 else 1 end, r.created_at desc)
    from service_requests r join profiles p on p.id = r.candidate_id join auth.users u on u.id = r.candidate_id
    left join candidate_profiles cp on cp.user_id = r.candidate_id), '[]'::jsonb);
end $$;

create or replace function public.export_my_data()
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'auth' as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Inicia sesión'; end if;
  return jsonb_build_object(
    'generado', now(),
    'cuenta', (select jsonb_build_object('correo', email, 'creada', created_at) from auth.users where id = uid),
    'perfil', (select to_jsonb(p) - 'calendar_token' from profiles p where id = uid),
    'perfil_candidato', (select to_jsonb(c) from candidate_profiles c where user_id = uid),
    'intereses_en_vacantes', coalesce((select jsonb_agg(jsonb_build_object('vacante', j.title, 'accion', a.action, 'respuestas', a.answers, 'fecha', a.created_at))
        from candidate_job_actions a join jobs j on j.id = a.job_id where a.candidate_id = uid), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(jsonb_build_object('vacante', j.title, 'empresa', co.display_name, 'etapa', m.stage, 'fecha', m.created_at))
        from matches m join jobs j on j.id = m.job_id join companies co on co.id = m.company_id where m.candidate_id = uid), '[]'::jsonb),
    'mensajes_enviados', coalesce((select jsonb_agg(jsonb_build_object('texto', body, 'fecha', created_at) order by created_at) from messages where sender_id = uid), '[]'::jsonb),
    'entrevistas', coalesce((select jsonb_agg(jsonb_build_object('inicio', starts_at, 'modalidad', mode, 'estado', status)) from interviews where candidate_id = uid), '[]'::jsonb),
    'ofertas', coalesce((select jsonb_agg(to_jsonb(o) - 'created_by') from offers o where candidate_id = uid), '[]'::jsonb),
    'notificaciones', coalesce((select jsonb_agg(jsonb_build_object('titulo', title, 'texto', body, 'fecha', created_at)) from notifications where user_id = uid), '[]'::jsonb),
    'empresas', coalesce((select jsonb_agg(jsonb_build_object('empresa', co.display_name, 'rol', cm.role)) from company_members cm join companies co on co.id = cm.company_id where cm.user_id = uid), '[]'::jsonb),
    'uso_asistente_ia', coalesce((select jsonb_agg(to_jsonb(u) - 'user_id') from ai_usage u where user_id = uid), '[]'::jsonb),
    'asesorias', coalesce((select jsonb_agg(jsonb_build_object('servicio', service_name, 'precio', price_clp, 'estado', status, 'objetivo', goal, 'contacto', contact_pref, 'nota', admin_note, 'fecha', created_at,
        'mensajes', coalesce((select jsonb_agg(jsonb_build_object('texto', m.body, 'archivo', m.file_name, 'mio', m.sender_id = uid, 'fecha', m.created_at) order by m.created_at) from service_messages m where m.request_id = r.id), '[]'::jsonb)))
        from service_requests r where candidate_id = uid), '[]'::jsonb)
  );
end $function$;
