-- VINKA Comunidad · Etapa 1 (MVP, solo por invitación).
-- Asesores colaboran en búsquedas: el responsable publica desde una vacante de su espacio de reclutamiento,
-- invita a otros asesores y decide sobre las personas que le presentan. Toda presentación requiere el
-- consentimiento de la persona para esa vacante. Tablas cerradas: solo se usan mediante las funciones de abajo.

-- ===================== Tablas =====================
create table if not exists public.community_members (
  user_id uuid primary key references public.advisors(user_id) on delete cascade,
  specialties text[] not null default '{}',
  status text not null default 'activo' check (status in ('activo', 'suspendido')),
  rules_accepted_at timestamptz,
  enabled_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.community_searches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  collab_type text not null default 'candidatos' check (collab_type in ('candidatos', 'referidos', 'filtro')),
  experience text not null default '',
  skills text[] not null default '{}',
  close_estimate date,
  show_company boolean not null default false,
  note text not null default '',
  status text not null default 'abierta' check (status in ('abierta', 'pausada', 'cerrada')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index if not exists community_one_open_search on public.community_searches (job_id) where status <> 'cerrada';

create table if not exists public.community_participants (
  search_id uuid not null references public.community_searches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('responsable', 'colaborador')),
  status text not null check (status in ('invitado', 'aceptado', 'rechazado', 'retirado')),
  invited_by uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (search_id, user_id)
);

create table if not exists public.community_presentations (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.community_searches(id) on delete cascade,
  candidate_id uuid not null references auth.users(id) on delete cascade,
  presented_by uuid not null references auth.users(id) on delete cascade,
  presenter_kind text not null default 'asesor' check (presenter_kind in ('asesor', 'vinka')),
  relation text not null check (relation in ('asesorado', 'proceso_propio', 'vinka')),
  status text not null default 'esperando_consentimiento'
    check (status in ('esperando_consentimiento', 'presentado', 'aceptado', 'rechazado', 'mas_antecedentes', 'no_acepto')),
  note text not null default '',
  response_note text not null default '',
  consent_at timestamptz,
  decided_at timestamptz,
  decided_by uuid,
  created_at timestamptz not null default now()
);
-- Una persona solo puede ser presentada una vez por búsqueda (si no aceptó, se puede volver a presentar)
create unique index if not exists community_one_presentation on public.community_presentations (search_id, candidate_id) where status <> 'no_acepto';

alter table public.community_members enable row level security;
alter table public.community_searches enable row level security;
alter table public.community_participants enable row level security;
alter table public.community_presentations enable row level security;
revoke all on public.community_members, public.community_searches, public.community_participants, public.community_presentations from anon, authenticated;

-- ===================== Apoyo =====================
create or replace function public.community_is_member(p_user uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from community_members m join advisors a on a.user_id = m.user_id
                 where m.user_id = coalesce(p_user, auth.uid()) and m.status = 'activo' and m.rules_accepted_at is not null and a.active)
$$;

create or replace function public.community_role(p_search uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when s.owner_id = auth.uid() then 'responsable'
              when exists (select 1 from community_participants p where p.search_id = s.id and p.user_id = auth.uid() and p.status = 'aceptado') then 'colaborador'
              when exists (select 1 from community_participants p where p.search_id = s.id and p.user_id = auth.uid() and p.status = 'invitado') then 'invitado'
              when is_admin() then 'admin' end
  from community_searches s where s.id = p_search
$$;

-- ¿La persona ya está en el proceso de esa vacante (por cualquier vía)?
create or replace function public.community_in_job(p_job uuid, p_candidate uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from candidate_job_actions where job_id = p_job and candidate_id = p_candidate and action = 'interest')
      or exists (select 1 from matches where job_id = p_job and candidate_id = p_candidate)
      or exists (select 1 from company_candidate_actions where job_id = p_job and candidate_id = p_candidate)
$$;

create or replace function public.community_log(p_search uuid, p_action text, p_detail jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'community_' || p_action, 'community_search', p_search, coalesce(p_detail, '{}'))
$$;

-- ===================== Miembros =====================
create or replace function public.admin_community_set_member(p_user uuid, p_active boolean, p_specialties text[] default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo VINKA puede habilitar miembros de la comunidad'; end if;
  if not exists (select 1 from advisors where user_id = p_user) then raise exception 'Solo los asesores pueden ser miembros'; end if;
  insert into community_members (user_id, specialties, status, enabled_by)
  values (p_user, coalesce(p_specialties, '{}'), case when p_active then 'activo' else 'suspendido' end, auth.uid())
  on conflict (user_id) do update set status = excluded.status, specialties = coalesce(p_specialties, community_members.specialties);
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), case when p_active then 'community_member_enabled' else 'community_member_suspended' end, 'user', p_user, '{}');
  if p_active then
    perform notify_users(array[p_user], 'community', 'Te habilitaron en VINKA Comunidad', 'Ahora puedes colaborar con otros asesores en búsquedas de candidatos. Entra a «Comunidad» para aceptar las reglas.', '/comunidad', false);
  end if;
end $$;

create or replace function public.community_accept_rules()
returns void language plpgsql security definer set search_path = public as $$
begin
  update community_members set rules_accepted_at = coalesce(rules_accepted_at, now()) where user_id = auth.uid() and status = 'activo';
  if not found then raise exception 'Tu cuenta no está habilitada en la comunidad'; end if;
end $$;

-- ===================== Búsquedas =====================
create or replace function public.community_publish(p_job uuid, p jsonb default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare j jobs; v_id uuid;
begin
  if not community_is_member() then raise exception 'Debes ser miembro activo de la comunidad'; end if;
  select * into j from jobs where id = p_job;
  if j.id is null or not can_manage(j.company_id) then raise exception 'Solo quien gestiona la vacante puede pedir apoyo'; end if;
  if j.status not in ('published', 'paused', 'draft', 'pending') then raise exception 'La vacante está cerrada'; end if;
  if exists (select 1 from community_searches where job_id = p_job and status <> 'cerrada') then raise exception 'Esta vacante ya tiene una búsqueda abierta en la comunidad'; end if;
  insert into community_searches (job_id, owner_id, collab_type, experience, skills, close_estimate, show_company, note)
  values (p_job, auth.uid(),
          case when p->>'collab_type' in ('candidatos', 'referidos', 'filtro') then p->>'collab_type' else 'candidatos' end,
          left(coalesce(p->>'experience', ''), 500),
          coalesce((select array_agg(left(x, 60)) from (select jsonb_array_elements_text(coalesce(p->'skills', '[]')) x limit 15) s), '{}'),
          nullif(p->>'close_estimate', '')::date,
          coalesce((p->>'show_company')::boolean, false) and not coalesce(j.confidential, false),
          left(coalesce(p->>'note', ''), 1000))
  returning id into v_id;
  insert into community_participants (search_id, user_id, role, status, decided_at) values (v_id, auth.uid(), 'responsable', 'aceptado', now());
  perform community_log(v_id, 'published', jsonb_build_object('job', p_job));
  return v_id;
end $$;

create or replace function public.community_set_status(p_search uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('abierta', 'pausada', 'cerrada') then raise exception 'Estado no válido'; end if;
  if not exists (select 1 from community_searches where id = p_search and (owner_id = auth.uid() or is_admin())) then raise exception 'Solo el responsable puede cambiar el estado'; end if;
  update community_searches set status = p_status, closed_at = case when p_status = 'cerrada' then now() end where id = p_search;
  perform community_log(p_search, 'status', jsonb_build_object('status', p_status));
end $$;

-- ===================== Participación =====================
create or replace function public.community_invite(p_search uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s community_searches; jt text;
begin
  select * into s from community_searches where id = p_search;
  if s.id is null or s.owner_id <> auth.uid() then raise exception 'Solo el responsable puede invitar'; end if;
  if s.status <> 'abierta' then raise exception 'La búsqueda no está abierta'; end if;
  if p_user = auth.uid() then raise exception 'Ya eres el responsable'; end if;
  if not exists (select 1 from community_members m join advisors a on a.user_id = m.user_id where m.user_id = p_user and m.status = 'activo' and a.active) then
    raise exception 'Esa persona no es miembro activo de la comunidad'; end if;
  insert into community_participants (search_id, user_id, role, status, invited_by) values (p_search, p_user, 'colaborador', 'invitado', auth.uid())
  on conflict (search_id, user_id) do update set status = 'invitado', invited_by = auth.uid(), created_at = now(), decided_at = null
    where community_participants.status in ('rechazado', 'retirado');
  if not found then raise exception 'Ya está invitado o participa'; end if;
  select title into jt from jobs where id = s.job_id;
  perform notify_users(array[p_user], 'community', short_name(auth.uid()) || ' te invita a colaborar', 'Búsqueda: ' || jt || '. Revísala en Comunidad.', '/comunidad/' || p_search, false);
  perform community_log(p_search, 'invited', jsonb_build_object('user', p_user));
end $$;

create or replace function public.community_respond_invite(p_search uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare s community_searches;
begin
  if p_accept and not community_is_member() then raise exception 'Primero acepta las reglas de la comunidad'; end if;
  update community_participants set status = case when p_accept then 'aceptado' else 'rechazado' end, decided_at = now()
   where search_id = p_search and user_id = auth.uid() and status = 'invitado';
  if not found then raise exception 'No tienes una invitación pendiente en esta búsqueda'; end if;
  select * into s from community_searches where id = p_search;
  perform notify_users(array[s.owner_id], 'community', short_name(auth.uid()) || case when p_accept then ' aceptó colaborar' else ' no podrá colaborar' end,
    'Búsqueda: ' || (select title from jobs where id = s.job_id), '/comunidad/' || p_search, false);
  perform community_log(p_search, case when p_accept then 'joined' else 'declined' end);
end $$;

-- El responsable retira a un colaborador, o un colaborador se retira. Sus presentaciones quedan registradas a su nombre.
create or replace function public.community_remove(p_search uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from community_searches where id = p_search and (owner_id = auth.uid() or p_user = auth.uid() or is_admin())) then
    raise exception 'No puedes retirar a esa persona'; end if;
  if exists (select 1 from community_searches where id = p_search and owner_id = p_user) then raise exception 'El responsable no se puede retirar; cierra la búsqueda'; end if;
  update community_participants set status = 'retirado', decided_at = now() where search_id = p_search and user_id = p_user and status in ('invitado', 'aceptado');
  if not found then raise exception 'Esa persona no participa en la búsqueda'; end if;
  perform community_log(p_search, 'removed', jsonb_build_object('user', p_user));
end $$;

-- ===================== Presentaciones =====================
-- Personas que este asesor puede presentar: sus asesorados y personas de sus propios procesos (siempre con consentimiento)
create or replace function public.community_presentable(p_search uuid)
returns table (candidate_id uuid, name text, headline text, comuna text, relation text, already boolean)
language sql stable security definer set search_path = public as $$
  with s as (select * from community_searches where id = p_search and community_role(p_search) in ('responsable', 'colaborador')),
  pool as (
    select r.candidate_id, 'asesorado'::text rel from service_requests r where r.assigned_to = auth.uid() and r.status <> 'cancelada'
    union
    select m.candidate_id, 'proceso_propio' from matches m where is_company_member(m.company_id)
    union
    select a.candidate_id, 'proceso_propio' from candidate_job_actions a join jobs j on j.id = a.job_id where a.action = 'interest' and is_company_member(j.company_id)
  )
  select distinct on (p.candidate_id) p.candidate_id, short_name(p.candidate_id), coalesce(cp.headline, ''), coalesce(cp.comuna, ''), p.rel,
         community_in_job(s.job_id, p.candidate_id)
           or exists (select 1 from community_presentations x where x.search_id = s.id and x.candidate_id = p.candidate_id and x.status <> 'no_acepto')
  from pool p cross join s left join candidate_profiles cp on cp.user_id = p.candidate_id
  order by p.candidate_id, p.rel
$$;

create or replace function public.community_present(p_search uuid, p_candidate uuid, p_note text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare s community_searches; v_rel text; v_kind text := 'asesor'; v_id uuid; jt text;
begin
  select * into s from community_searches where id = p_search;
  if s.id is null then raise exception 'Búsqueda no encontrada'; end if;
  if s.status <> 'abierta' or (select status from jobs where id = s.job_id) = 'closed' then raise exception 'La búsqueda no está abierta'; end if;
  if community_role(p_search) in ('responsable', 'colaborador') and community_is_member() then
    select relation into v_rel from community_presentable(p_search) where candidate_id = p_candidate;
    if v_rel is null then raise exception 'Solo puedes presentar a tus asesorados o a personas de tus propios procesos'; end if;
  elsif is_admin() then
    v_rel := 'vinka'; v_kind := 'vinka';
    if not exists (select 1 from candidate_profiles where user_id = p_candidate) then raise exception 'Esa persona no tiene perfil de postulante'; end if;
  else
    raise exception 'No participas en esta búsqueda';
  end if;
  if community_in_job(s.job_id, p_candidate) then raise exception 'Esta persona ya está en el proceso de la vacante'; end if;
  if exists (select 1 from community_presentations where search_id = p_search and candidate_id = p_candidate and status <> 'no_acepto') then
    raise exception 'Esta persona ya fue presentada en esta búsqueda'; end if;
  insert into community_presentations (search_id, candidate_id, presented_by, presenter_kind, relation, note)
  values (p_search, p_candidate, auth.uid(), v_kind, v_rel, left(coalesce(p_note, ''), 500)) returning id into v_id;
  select title into jt from jobs where id = s.job_id;
  perform notify_users(array[p_candidate], 'community',
    case when v_kind = 'vinka' then 'VINKA te recomienda una vacante' else short_name(auth.uid()) || ', asesor/a de VINKA, te recomienda una vacante' end,
    jt || '. Revísala en Intereses y decide si quieres postular.', '/intereses', false);
  perform community_log(p_search, 'presented', jsonb_build_object('presentation', v_id, 'candidate', p_candidate, 'relation', v_rel));
  return v_id;
end $$;

-- Postulante: sus recomendaciones pendientes
create or replace function public.my_recommendations()
returns table (id uuid, job_id uuid, title text, company text, comuna text, modality text, recommended_by text, note text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select x.id, j.id, j.title,
         case when coalesce(j.confidential, false) then 'Empresa confidencial' else c.display_name end,
         j.comuna, j.modality,
         case when x.presenter_kind = 'vinka' then 'VINKA' else short_name(x.presented_by) || ' · asesor/a de VINKA' end,
         x.note, x.created_at
  from community_presentations x join community_searches s on s.id = x.search_id join jobs j on j.id = s.job_id join companies c on c.id = j.company_id
  where x.candidate_id = auth.uid() and x.status = 'esperando_consentimiento' and s.status = 'abierta' and j.status = 'published'
  order by x.created_at desc
$$;

-- Postulante: acepta (después de postular por el camino normal, con preguntas de filtro si las hay) o rechaza
create or replace function public.community_consent(p_presentation uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare x community_presentations; s community_searches;
begin
  select * into x from community_presentations where id = p_presentation and candidate_id = auth.uid() and status = 'esperando_consentimiento';
  if x.id is null then raise exception 'Esta recomendación ya no está disponible'; end if;
  select * into s from community_searches where id = x.search_id;
  if p_accept then
    if not exists (select 1 from candidate_job_actions where job_id = s.job_id and candidate_id = auth.uid() and action = 'interest') then
      raise exception 'Primero confirma tu interés en la vacante'; end if;
    update community_presentations set status = 'presentado', consent_at = now() where id = x.id;
    perform notify_users(array[s.owner_id], 'community', 'Te presentaron un candidato',
      short_name(auth.uid()) || ' aceptó ser presentado/a por ' || case when x.presenter_kind = 'vinka' then 'VINKA' else short_name(x.presented_by) end || ' para ' || (select title from jobs where id = s.job_id) || '.',
      '/comunidad/' || s.id, false);
    if x.presented_by <> s.owner_id then
      perform notify_users(array[x.presented_by], 'community', 'Tu recomendación fue aceptada', short_name(auth.uid()) || ' aceptó postular. Ya está en el proceso.', '/comunidad/' || s.id, false);
    end if;
  else
    update community_presentations set status = 'no_acepto', decided_at = now() where id = x.id;
    perform notify_users(array[x.presented_by], 'community', 'La persona prefirió no postular', 'Tu recomendación para ' || (select title from jobs where id = s.job_id) || ' no fue aceptada.', '/comunidad/' || s.id, false);
  end if;
  perform community_log(s.id, case when p_accept then 'consent' else 'consent_declined' end, jsonb_build_object('presentation', x.id));
end $$;

-- Responsable: acepta (pasa a match en el proceso), rechaza (se descarta) o pide más antecedentes
create or replace function public.community_decide(p_presentation uuid, p_decision text, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare x community_presentations; s community_searches; jt text;
begin
  if p_decision not in ('aceptado', 'rechazado', 'mas_antecedentes') then raise exception 'Decisión no válida'; end if;
  select * into x from community_presentations where id = p_presentation;
  select * into s from community_searches where id = x.search_id;
  if x.id is null or s.owner_id <> auth.uid() then raise exception 'Solo el responsable decide sobre los candidatos presentados'; end if;
  if x.status not in ('presentado', 'mas_antecedentes') then raise exception 'Esta presentación aún no tiene el consentimiento de la persona o ya fue decidida'; end if;
  if p_decision = 'aceptado' then perform pipeline_move('interesado', x.candidate_id, s.job_id, 'match');
  elsif p_decision = 'rechazado' then perform pipeline_move('interesado', x.candidate_id, s.job_id, 'descartado');
  end if;
  update community_presentations set status = p_decision, response_note = left(coalesce(p_note, ''), 500), decided_at = now(), decided_by = auth.uid() where id = x.id;
  select title into jt from jobs where id = s.job_id;
  if x.presented_by <> auth.uid() then
    perform notify_users(array[x.presented_by], 'community',
      case p_decision when 'aceptado' then 'Aceptaron a tu candidato/a' when 'rechazado' then 'No avanzaron con tu candidato/a' else 'Piden más antecedentes de tu candidato/a' end,
      short_name(x.candidate_id) || ' · ' || jt || case when coalesce(p_note, '') <> '' then ': ' || left(p_note, 140) else '' end, '/comunidad/' || s.id, false);
  end if;
  perform community_log(s.id, 'decided', jsonb_build_object('presentation', x.id, 'decision', p_decision));
end $$;

-- ===================== Vistas para las pantallas =====================
create or replace function public.community_home()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me community_members;
begin
  select * into me from community_members where user_id = auth.uid();
  return jsonb_build_object(
    'member', case when me.user_id is null then null else jsonb_build_object('status', me.status, 'rules_accepted', me.rules_accepted_at is not null, 'specialties', me.specialties) end,
    'has_workspace', exists (select 1 from company_members where user_id = auth.uid()),
    'searches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', j.title, 'comuna', j.comuna, 'modality', j.modality,
        'status', case when j.status = 'closed' then 'cerrada' else s.status end,
        'my_role', p.role, 'my_status', p.status,
        'owner', short_name(s.owner_id), 'created_at', s.created_at, 'close_estimate', s.close_estimate,
        'collaborators', (select count(*) from community_participants q where q.search_id = s.id and q.role = 'colaborador' and q.status = 'aceptado'),
        'presented', (select count(*) from community_presentations x where x.search_id = s.id and x.status <> 'no_acepto' and (p.role = 'responsable' or x.presented_by = auth.uid())),
        'to_review', case when p.role = 'responsable' then (select count(*) from community_presentations x where x.search_id = s.id and x.status = 'presentado') else 0 end
      ) order by (p.status = 'invitado') desc, s.created_at desc)
      from community_participants p join community_searches s on s.id = p.search_id join jobs j on j.id = s.job_id
      where p.user_id = auth.uid() and p.status in ('invitado', 'aceptado')), '[]'::jsonb)
  );
end $$;

create or replace function public.community_search(p_search uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s community_searches; j jobs; v_role text := community_role(p_search); show boolean;
begin
  if v_role is null then raise exception 'No tienes acceso a esta búsqueda'; end if;
  select * into s from community_searches where id = p_search;
  select * into j from jobs where id = s.job_id;
  show := v_role in ('responsable', 'admin') or (s.show_company and not coalesce(j.confidential, false));
  return jsonb_build_object(
    'id', s.id, 'my_role', v_role, 'job_id', case when v_role in ('responsable', 'admin') then j.id end,
    'status', case when j.status = 'closed' then 'cerrada' else s.status end,
    'title', j.title, 'area', j.area, 'level', j.level, 'modality', j.modality, 'schedule', j.schedule, 'contract', j.contract,
    'region', j.region, 'comuna', j.comuna, 'salary_min', j.salary_min, 'salary_max', j.salary_max, 'salary_type', j.salary_type,
    'requirements', coalesce(j.requirements, '[]'::jsonb), 'description', case when show then j.description else '' end,
    'company', case when show then (select display_name from companies where id = j.company_id) else 'Empresa confidencial' end,
    'collab_type', s.collab_type, 'experience', s.experience, 'skills', s.skills, 'close_estimate', s.close_estimate, 'note', s.note,
    'show_company', s.show_company, 'created_at', s.created_at, 'owner', short_name(s.owner_id), 'owner_id', s.owner_id,
    'participants', coalesce((select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'name', short_name(p.user_id), 'role', p.role, 'status', p.status) order by p.role desc, p.created_at)
      from community_participants p where p.search_id = s.id and (v_role in ('responsable', 'admin') or p.status = 'aceptado')), '[]'::jsonb),
    'presentations', case when v_role = 'invitado' then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'status', x.status, 'relation', x.relation, 'note', x.note, 'response_note', x.response_note, 'created_at', x.created_at,
        'presented_by', case when x.presenter_kind = 'vinka' then 'VINKA' else short_name(x.presented_by) end, 'mine', x.presented_by = auth.uid(),
        -- Antes del consentimiento, el responsable no ve quién es (solo quien lo presentó lo conoce)
        'candidate', case when x.status = 'esperando_consentimiento' and x.presented_by <> auth.uid() and v_role <> 'admin' then null else short_name(x.candidate_id) end,
        'headline', case when x.status = 'esperando_consentimiento' and x.presented_by <> auth.uid() and v_role <> 'admin' then null else (select headline from candidate_profiles where user_id = x.candidate_id) end,
        'stage', (select m.stage from matches m where m.job_id = s.job_id and m.candidate_id = x.candidate_id)
      ) order by x.created_at desc)
      from community_presentations x where x.search_id = s.id and (v_role in ('responsable', 'admin') or x.presented_by = auth.uid())), '[]'::jsonb) end
  );
end $$;

-- Asesores que el responsable puede invitar
create or replace function public.community_invitable(p_search uuid)
returns table (user_id uuid, name text, specialties text[])
language sql stable security definer set search_path = public as $$
  select m.user_id, short_name(m.user_id), m.specialties
  from community_members m join advisors a on a.user_id = m.user_id
  where m.status = 'activo' and a.active and m.user_id <> auth.uid()
    and exists (select 1 from community_searches s where s.id = p_search and s.owner_id = auth.uid())
    and not exists (select 1 from community_participants p where p.search_id = p_search and p.user_id = m.user_id and p.status in ('invitado', 'aceptado'))
  order by 2
$$;

-- Etiqueta «Presentado por» en el proceso de una vacante (solo para quien gestiona la vacante)
create or replace function public.community_job_attributions(p_job uuid)
returns table (candidate_id uuid, presented_by text, status text)
language sql stable security definer set search_path = public as $$
  select x.candidate_id, case when x.presenter_kind = 'vinka' then 'VINKA' else short_name(x.presented_by) end, x.status
  from community_presentations x join community_searches s on s.id = x.search_id
  where s.job_id = p_job and x.status not in ('esperando_consentimiento', 'no_acepto')
    and exists (select 1 from jobs j where j.id = p_job and is_company_member(j.company_id))
$$;

-- Búsqueda abierta de una vacante (para el botón del proceso)
create or replace function public.community_search_for_job(p_job uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select s.id from community_searches s join jobs j on j.id = s.job_id
  where s.job_id = p_job and s.status <> 'cerrada' and is_company_member(j.company_id) limit 1
$$;

-- Administración
create or replace function public.admin_community_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo administración'; end if;
  return jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'name', trim(p.first_name || ' ' || p.last_name), 'specialty', a.specialty,
        'advisor_active', a.active, 'status', m.status, 'rules_accepted', m.rules_accepted_at is not null,
        'workspace', exists (select 1 from company_members cm where cm.user_id = a.user_id)) order by p.first_name)
      from advisors a join profiles p on p.id = a.user_id left join community_members m on m.user_id = a.user_id), '[]'::jsonb),
    'searches', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', j.title, 'owner', short_name(s.owner_id), 'company', c.display_name,
        'status', case when j.status = 'closed' then 'cerrada' else s.status end, 'created_at', s.created_at,
        'collaborators', (select count(*) from community_participants q where q.search_id = s.id and q.role = 'colaborador' and q.status = 'aceptado'),
        'presented', (select count(*) from community_presentations x where x.search_id = s.id and x.status <> 'no_acepto'),
        'accepted', (select count(*) from community_presentations x where x.search_id = s.id and x.status = 'aceptado'),
        'hired', (select count(*) from community_presentations x join matches mt on mt.job_id = s.job_id and mt.candidate_id = x.candidate_id where x.search_id = s.id and mt.stage = 'contratado'))
      order by s.created_at desc)
      from community_searches s join jobs j on j.id = s.job_id join companies c on c.id = j.company_id), '[]'::jsonb)
  );
end $$;

-- ===================== Permisos de ejecución =====================
do $g$
declare f text;
begin
  foreach f in array array[
    'community_is_member(uuid)', 'community_role(uuid)', 'community_in_job(uuid, uuid)', 'community_log(uuid, text, jsonb)',
    'admin_community_set_member(uuid, boolean, text[])', 'community_accept_rules()', 'community_publish(uuid, jsonb)', 'community_set_status(uuid, text)',
    'community_invite(uuid, uuid)', 'community_respond_invite(uuid, boolean)', 'community_remove(uuid, uuid)', 'community_presentable(uuid)',
    'community_present(uuid, uuid, text)', 'my_recommendations()', 'community_consent(uuid, boolean)', 'community_decide(uuid, text, text)',
    'community_home()', 'community_search(uuid)', 'community_invitable(uuid)', 'community_job_attributions(uuid)', 'community_search_for_job(uuid)',
    'admin_community_overview()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- De uso interno: no se llaman desde la app
  revoke execute on function public.community_in_job(uuid, uuid) from authenticated;
  revoke execute on function public.community_log(uuid, text, jsonb) from authenticated;
end $g$;
