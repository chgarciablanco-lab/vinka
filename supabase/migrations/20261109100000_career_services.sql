-- Asesoría con reclutador para postulantes: servicios opcionales y pagados (revisión de CV y búsqueda de empleo).
-- No influyen en postulaciones ni matches. Precios predeterminados editables desde Administración.

create table if not exists public.career_services (
  id text primary key,
  name text not null,
  summary text not null,
  includes text[] not null default '{}',
  price_clp int not null check (price_clp >= 0),
  delivery text not null default '',
  active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.career_services enable row level security;
create policy "asesorías: catálogo visible con sesión" on public.career_services for select to authenticated using (active or (select is_admin()));

insert into public.career_services (id, name, summary, includes, price_clp, delivery, sort) values
  ('cv', 'Revisión de CV', 'Un reclutador revisa tu CV y te lo devuelve mejorado para los cargos que buscas.',
   array['Revisión completa por un reclutador', 'CV mejorado en Word y PDF', 'Comentarios para tu perfil en VINKA', 'Una ronda de ajustes'], 14990, 'Entrega en 3 días hábiles', 1),
  ('busqueda', 'Asesoría de búsqueda de empleo', 'Una sesión con un reclutador para ordenar tu búsqueda y encontrar ofertas que calcen contigo.',
   array['Sesión online de 45 minutos', 'Plan de búsqueda según tu cargo y zona', 'Selección de 10 ofertas recomendadas', 'Consejos para postular y para la entrevista'], 24990, 'Sesión dentro de 5 días hábiles', 2),
  ('completa', 'Asesoría completa', 'Revisión de CV y asesoría de búsqueda en un solo pack, con seguimiento por dos semanas.',
   array['Todo lo de Revisión de CV', 'Todo lo de Asesoría de búsqueda', 'Simulación de entrevista de 30 minutos', 'Seguimiento por WhatsApp durante 2 semanas'], 34990, 'Inicio dentro de 3 días hábiles', 3)
on conflict (id) do nothing;

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references auth.users(id) on delete cascade,
  service_id text not null references public.career_services(id),
  service_name text not null,
  price_clp int not null,
  status text not null default 'solicitada' check (status in ('solicitada', 'pago_pendiente', 'en_curso', 'entregada', 'cancelada')),
  goal text not null default '',
  contact_pref text not null default 'whatsapp' check (contact_pref in ('whatsapp', 'correo', 'videollamada')),
  consent_at timestamptz not null default now(),
  admin_note text not null default '',
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_service_requests_candidate on public.service_requests (candidate_id, created_at desc);
create index if not exists idx_service_requests_service on public.service_requests (service_id);
create index if not exists idx_service_requests_assigned on public.service_requests (assigned_to);
create index if not exists idx_service_requests_status on public.service_requests (status, created_at desc);
alter table public.service_requests enable row level security;
create policy "asesorías: la persona ve las suyas" on public.service_requests for select to authenticated
  using (candidate_id = (select auth.uid()) or (select is_admin()));
-- se crean y modifican solo con las funciones de abajo

create or replace function public.request_career_service(p_service text, p_goal text, p_contact text, p_consent boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare s career_services; v_id uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  if (select role from profiles where id = auth.uid()) <> 'candidate' then raise exception 'La asesoría es para personas que buscan empleo'; end if;
  if not coalesce(p_consent, false) then raise exception 'Para continuar, autoriza que un reclutador de VINKA vea tu perfil y te contacte.'; end if;
  if p_contact not in ('whatsapp', 'correo', 'videollamada') then raise exception 'Elige cómo prefieres que te contactemos'; end if;
  select * into s from career_services where id = p_service and active;
  if s.id is null then raise exception 'Este servicio no está disponible'; end if;
  if exists (select 1 from service_requests where candidate_id = auth.uid() and service_id = p_service and status in ('solicitada', 'pago_pendiente', 'en_curso')) then
    raise exception 'Ya tienes una solicitud abierta de este servicio. Te contactaremos pronto.'; end if;
  if (select count(*) from service_requests where candidate_id = auth.uid() and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Hiciste varias solicitudes hoy. Intenta de nuevo mañana.'; end if;
  insert into service_requests (candidate_id, service_id, service_name, price_clp, goal, contact_pref)
  values (auth.uid(), s.id, s.name, s.price_clp, left(coalesce(trim(p_goal), ''), 1000), p_contact)
  returning id into v_id;
  select trim(first_name || ' ' || last_name) into v_name from profiles where id = auth.uid();
  perform notify_users(array(select user_id from admins), 'service_request', 'Nueva solicitud: ' || s.name,
    coalesce(nullif(v_name, ''), 'Una persona') || ' pidió ' || s.name || ' ($' || to_char(s.price_clp, 'FM999G999G999') || ').', '/admin', true);
  perform notify_users(array[auth.uid()], 'service_request', 'Recibimos tu solicitud de ' || s.name,
    'Un reclutador de VINKA te contactará por ' || case p_contact when 'whatsapp' then 'WhatsApp' when 'correo' then 'correo' else 'videollamada' end || ' para coordinar el pago y empezar.', '/asesoria', false);
  return v_id;
end $$;
revoke execute on function public.request_career_service(text, text, text, boolean) from public, anon;
grant execute on function public.request_career_service(text, text, text, boolean) to authenticated;

create or replace function public.cancel_service_request(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update service_requests set status = 'cancelada', updated_at = now()
  where id = p_id and candidate_id = auth.uid() and status in ('solicitada', 'pago_pendiente');
  if not found then raise exception 'Esta solicitud ya no se puede cancelar. Escríbenos si necesitas ayuda.'; end if;
  perform notify_users(array(select user_id from admins), 'service_request', 'Solicitud de asesoría cancelada',
    'Una persona canceló su solicitud de asesoría.', '/admin', false);
end $$;
revoke execute on function public.cancel_service_request(uuid) from public, anon;
grant execute on function public.cancel_service_request(uuid) to authenticated;

-- Administración: solicitudes con el perfil laboral y contacto (la persona lo autorizó al pedir el servicio)
create or replace function public.admin_service_requests()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'service_id', r.service_id, 'service', r.service_name, 'price', r.price_clp, 'status', r.status, 'goal', r.goal,
      'contact_pref', r.contact_pref, 'note', r.admin_note, 'created_at', r.created_at, 'updated_at', r.updated_at,
      'name', trim(p.first_name || ' ' || p.last_name), 'email', u.email, 'phone', p.phone,
      'headline', cp.headline, 'comuna', cp.comuna, 'region', cp.region, 'has_experience', cp.has_experience,
      'experiences', cp.experiences, 'education', cp.education, 'skills', cp.skills, 'bio', cp.bio)
    order by case when r.status in ('solicitada', 'pago_pendiente', 'en_curso') then 0 else 1 end, r.created_at desc)
    from service_requests r join profiles p on p.id = r.candidate_id join auth.users u on u.id = r.candidate_id
    left join candidate_profiles cp on cp.user_id = r.candidate_id), '[]'::jsonb);
end $$;
revoke execute on function public.admin_service_requests() from public, anon;
grant execute on function public.admin_service_requests() to authenticated;

create or replace function public.admin_update_service_request(p_id uuid, p_status text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare r service_requests;
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  if p_status not in ('solicitada', 'pago_pendiente', 'en_curso', 'entregada', 'cancelada') then raise exception 'Estado no válido'; end if;
  update service_requests set status = p_status, admin_note = left(coalesce(p_note, ''), 1000), updated_at = now(),
    assigned_to = coalesce(assigned_to, auth.uid())
  where id = p_id returning * into r;
  if r.id is null then raise exception 'Solicitud no encontrada'; end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'service_request', 'service_request', p_id, jsonb_build_object('status', p_status));
  perform notify_users(array[r.candidate_id], 'service_request',
    r.service_name || ': ' || case p_status when 'pago_pendiente' then 'pago pendiente' when 'en_curso' then 'en curso' when 'entregada' then 'entregada' when 'cancelada' then 'cancelada' else 'recibida' end,
    coalesce(nullif(trim(p_note), ''), 'Revisa el detalle en Asesoría con reclutador.'), '/asesoria', p_status in ('pago_pendiente', 'entregada'));
end $$;
revoke execute on function public.admin_update_service_request(uuid, text, text) from public, anon;
grant execute on function public.admin_update_service_request(uuid, text, text) to authenticated;

create or replace function public.admin_upsert_service(p_id text, p_name text, p_summary text, p_includes text[], p_price int, p_delivery text, p_active boolean, p_sort int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  if coalesce(trim(p_name), '') = '' or p_price is null or p_price < 0 then raise exception 'Completa nombre y precio'; end if;
  insert into career_services (id, name, summary, includes, price_clp, delivery, active, sort, updated_at)
  values (p_id, trim(p_name), coalesce(p_summary, ''), coalesce(p_includes, '{}'), p_price, coalesce(p_delivery, ''), coalesce(p_active, true), coalesce(p_sort, 0), now())
  on conflict (id) do update set name = excluded.name, summary = excluded.summary, includes = excluded.includes, price_clp = excluded.price_clp,
    delivery = excluded.delivery, active = excluded.active, sort = excluded.sort, updated_at = now();
  insert into audit_logs (actor_id, action, entity, detail)
  values (auth.uid(), 'service_price', 'career_service', jsonb_build_object('id', p_id, 'price', p_price, 'active', p_active));
end $$;
revoke execute on function public.admin_upsert_service(text, text, text, text[], int, text, boolean, int) from public, anon;
grant execute on function public.admin_upsert_service(text, text, text, text[], int, text, boolean, int) to authenticated;

-- Exportación de datos personales: incluye las asesorías
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
    'asesorias', coalesce((select jsonb_agg(jsonb_build_object('servicio', service_name, 'precio', price_clp, 'estado', status, 'objetivo', goal, 'contacto', contact_pref, 'nota', admin_note, 'fecha', created_at)) from service_requests where candidate_id = uid), '[]'::jsonb)
  );
end $function$;
