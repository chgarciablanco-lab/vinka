-- Primeros pasos guiados para empresas, asesores y postulantes.
-- Cada paso se calcula con los datos que ya existen (no hay que marcarlo a mano), salvo los pasos de «conocer» una pantalla,
-- que se marcan al visitarla. Lo ven las cuentas nuevas y las existentes a las que les falten pasos; se puede ocultar y volver a mostrar.
-- Solo se agrega una columna a «profiles» y dos funciones; no se modifica ninguna función existente.

alter table public.profiles add column if not exists onboarding jsonb not null default '{}'::jsonb;  -- {"hidden_at": …, "tour_at": …, "seen": {"oportunidades": …}}

-- Pasos de la persona que llama. p_company: la empresa activa (empresas y asesores con espacio de trabajo).
create or replace function public.my_onboarding(p_company uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := auth.uid(); p profiles; c companies; cp candidate_profiles; ap advisor_profiles; steps jsonb := '[]'; adm boolean; push boolean; seen jsonb;
  add_step text;
begin
  if u is null then raise exception 'Inicia sesión'; end if;
  select * into p from profiles where id = u;
  seen := coalesce(p.onboarding->'seen', '{}'::jsonb);
  push := exists (select 1 from push_subscriptions where user_id = u);
  if p_company is not null then
    if not is_company_member(p_company) then raise exception 'Sin acceso'; end if;
    select * into c from companies where id = p_company;
    adm := is_company_admin(p_company);
  end if;

  if p.role = 'candidate' then
    select * into cp from candidate_profiles where user_id = u;
    steps := jsonb_build_array(
      jsonb_build_object('key', 'cv', 'done', exists (select 1 from cv_files where candidate_id = u)),
      jsonb_build_object('key', 'experiencia', 'done', coalesce(jsonb_array_length(cp.experiences), 0) > 0 and coalesce(array_length(cp.skills, 1), 0) >= 3),
      jsonb_build_object('key', 'preferencias', 'done', cp.salary_expectation is not null and coalesce(array_length(cp.modalities, 1), 0) > 0),
      jsonb_build_object('key', 'presentacion', 'done', coalesce(trim(cp.bio), '') <> '' or cp.video_path is not null),
      jsonb_build_object('key', 'interes', 'done', exists (select 1 from candidate_job_actions where candidate_id = u and action = 'interest')),
      jsonb_build_object('key', 'avisos', 'done', push));
  elsif p.role = 'advisor' then
    select * into ap from advisor_profiles where user_id = u;
    steps := jsonb_build_array(
      jsonb_build_object('key', 'perfil_asesor', 'done', ap.pub is not null, 'pending', ap.pub is null and ap.review_status = 'en_revision'),
      jsonb_build_object('key', 'foto', 'done', coalesce(ap.pub->>'photo', ap.draft->>'photo', '') <> ''),
      jsonb_build_object('key', 'oportunidades', 'done', seen ? 'oportunidades'),
      jsonb_build_object('key', 'comunidad', 'done', exists (select 1 from community_posts where author_id = u) or exists (select 1 from community_comments where author_id = u)),
      jsonb_build_object('key', 'avisos', 'done', push));
    if c.id is not null then
      steps := steps || jsonb_build_array(jsonb_build_object('key', 'vacante', 'done', exists (select 1 from jobs where company_id = c.id)));
    end if;
  elsif p.role = 'company' and c.id is not null then
    steps := jsonb_build_array(jsonb_build_object('key', 'verificacion', 'done', c.verification_status = 'verified', 'pending', c.verification_status <> 'verified', 'info', true));
    if adm then
      steps := steps || jsonb_build_array(
        jsonb_build_object('key', 'logo', 'done', c.logo_path is not null),
        jsonb_build_object('key', 'vitrina', 'done', coalesce(trim(c.description), '') <> '' and coalesce(trim(c.sector), '') <> ''));
    end if;
    steps := steps || jsonb_build_array(
      jsonb_build_object('key', 'vacante', 'done', exists (select 1 from jobs where company_id = c.id)),
      jsonb_build_object('key', 'agenda', 'done', exists (select 1 from interview_slots where company_id = c.id)));
    if adm then
      steps := steps || jsonb_build_array(jsonb_build_object('key', 'equipo', 'done',
        (select count(*) from company_members where company_id = c.id) > 1 or exists (select 1 from company_invites where company_id = c.id), 'optional', true));
    end if;
    steps := steps || jsonb_build_array(jsonb_build_object('key', 'avisos', 'done', push));
  end if;

  return jsonb_build_object('role', p.role, 'steps', steps,
    'done', (select count(*) from jsonb_array_elements(steps) s where (s->>'done')::boolean),
    'total', jsonb_array_length(steps),
    'hidden', p.onboarding ? 'hidden_at', 'tour', p.onboarding ? 'tour_at',
    'new', p.created_at > now() - interval '14 days');
end $$;

-- Ocultar o mostrar la lista, marcar el recorrido como visto y marcar pantallas conocidas
create or replace function public.onboarding_mark(p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Inicia sesión'; end if;
  if p_action = 'ocultar' then
    update profiles set onboarding = onboarding || jsonb_build_object('hidden_at', now()) where id = u;
  elsif p_action = 'mostrar' then
    update profiles set onboarding = onboarding - 'hidden_at' where id = u;
  elsif p_action = 'recorrido' then
    update profiles set onboarding = onboarding || jsonb_build_object('tour_at', now()) where id = u;
  elsif p_action = 'repetir_recorrido' then
    update profiles set onboarding = onboarding - 'tour_at' where id = u;
  elsif p_action in ('visto:oportunidades') then
    update profiles set onboarding = jsonb_set(onboarding, '{seen}', coalesce(onboarding->'seen', '{}'::jsonb) || jsonb_build_object(split_part(p_action, ':', 2), now())) where id = u;
  else raise exception 'Acción no válida'; end if;
end $$;

revoke execute on function public.my_onboarding(uuid) from public, anon;
revoke execute on function public.onboarding_mark(text) from public, anon;
grant execute on function public.my_onboarding(uuid) to authenticated;
grant execute on function public.onboarding_mark(text) to authenticated;
