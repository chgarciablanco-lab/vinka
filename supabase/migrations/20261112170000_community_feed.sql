-- VINKA Comunidad, versión simple (reemplaza la etapa 1 de búsquedas y presentaciones).
-- Muro abierto solo para asesores: publican lo que necesitan cerrar («necesito un jefe de tienda, ¿alguna recomendación?»),
-- todos los asesores ven y comentan. Quien publicó puede invitar al proceso de su vacante a quien comentó:
-- el invitado ve el proceso (solo lectura) y ambos conversan en un chat interno.

-- ===================== 1) Respaldo y retiro de la versión anterior =====================
create schema if not exists backup;
create table if not exists backup.community_members_20261112 as select now() as saved_at, * from public.community_members;
create table if not exists backup.community_searches_20261112 as select now() as saved_at, * from public.community_searches;
create table if not exists backup.community_participants_20261112 as select now() as saved_at, * from public.community_participants;
create table if not exists backup.community_presentations_20261112 as select now() as saved_at, * from public.community_presentations;
create table if not exists backup.notifications_community_20261112 as select now() as saved_at, * from public.notifications where kind = 'community';
create table if not exists backup.fn_job_pipeline_20261112 as select now() as saved_at, pg_get_functiondef('public.job_pipeline(uuid)'::regprocedure) as def;
create table if not exists backup.fn_subject_detail_20261112 as select now() as saved_at, pg_get_functiondef('public.subject_detail(uuid, uuid)'::regprocedure) as def;

-- Avisos de la versión anterior (sus enlaces ya no existen)
delete from public.notifications where kind = 'community';

drop function if exists public.community_is_member(uuid), public.community_role(uuid), public.community_in_job(uuid, uuid),
  public.community_log(uuid, text, jsonb), public.admin_community_set_member(uuid, boolean, text[]), public.community_accept_rules(),
  public.community_publish(uuid, jsonb), public.community_set_status(uuid, text), public.community_invite(uuid, uuid),
  public.community_respond_invite(uuid, boolean), public.community_remove(uuid, uuid), public.community_presentable(uuid),
  public.community_present(uuid, uuid, text), public.my_recommendations(), public.community_consent(uuid, boolean),
  public.community_decide(uuid, text, text), public.community_home(), public.community_search(uuid), public.community_invitable(uuid),
  public.community_job_attributions(uuid), public.community_search_for_job(uuid), public.admin_community_overview();
drop table if exists public.community_presentations, public.community_participants, public.community_searches, public.community_members;

-- ===================== 2) Tablas nuevas (cerradas: solo mediante las funciones) =====================
create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 2000),
  hidden boolean not null default false,
  hidden_by uuid,
  created_at timestamptz not null default now()
);
create index community_posts_recent on public.community_posts (created_at desc);

create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 1000),
  hidden boolean not null default false,
  hidden_by uuid,
  created_at timestamptz not null default now()
);
create index community_comments_post on public.community_comments (post_id, created_at);

-- Asesores invitados al proceso de una vacante (solo lectura)
create table public.job_collaborators (
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.community_posts(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (job_id, user_id)
);

-- Chat interno entre quien gestiona la vacante y cada asesor invitado (una conversación por invitado)
create table public.collab_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  collaborator_id uuid not null references auth.users(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index collab_messages_thread on public.collab_messages (job_id, collaborator_id, created_at);

alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.job_collaborators enable row level security;
alter table public.collab_messages enable row level security;
revoke all on public.community_posts, public.community_comments, public.job_collaborators, public.collab_messages from anon, authenticated;

-- ===================== 3) Funciones =====================
create or replace function public.is_job_collaborator(p_job uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from job_collaborators c join advisors a on a.user_id = c.user_id and a.active
                 where c.job_id = p_job and c.user_id = auth.uid())
$$;

-- Muro: todos los asesores activos (y la administración) ven todo
create or replace function public.community_feed(p_before timestamptz default null, p_limit int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare adm boolean := is_admin();
begin
  if not (is_advisor() or adm) then raise exception 'La comunidad es solo para asesores de VINKA'; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object(
        'id', p.id, 'body', p.body, 'created_at', p.created_at, 'hidden', p.hidden,
        'author_id', p.author_id, 'author', short_name(p.author_id), 'specialty', (select specialty from advisors where user_id = p.author_id),
        'mine', p.author_id = auth.uid(),
        'job', case when j.id is not null then jsonb_build_object('id', j.id, 'title', j.title, 'comuna', j.comuna, 'modality', j.modality, 'closed', j.status = 'closed') end,
        -- ¿Puedo invitar a quienes comentan? (solo quien publicó y gestiona la vacante)
        'can_invite', p.author_id = auth.uid() and j.id is not null and j.status <> 'closed' and can_manage(j.company_id),
        'comments', coalesce((select jsonb_agg(jsonb_build_object(
            'id', c.id, 'body', c.body, 'created_at', c.created_at, 'hidden', c.hidden,
            'author_id', c.author_id, 'author', short_name(c.author_id), 'mine', c.author_id = auth.uid(),
            'invited', j.id is not null and exists (select 1 from job_collaborators jc where jc.job_id = j.id and jc.user_id = c.author_id)
          ) order by c.created_at)
          from community_comments c where c.post_id = p.id and (not c.hidden or adm)), '[]'::jsonb)
      ) x
      from community_posts p left join jobs j on j.id = p.job_id
      where (not p.hidden or adm) and (p_before is null or p.created_at < p_before)
      order by p.created_at desc limit least(greatest(coalesce(p_limit, 30), 1), 50)
    ) s), '[]'::jsonb);
end $$;

create or replace function public.community_post(p_body text, p_job uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_advisor() then raise exception 'Solo los asesores de VINKA pueden publicar'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Escribe tu publicación'; end if;
  if p_job is not null and not exists (select 1 from jobs where id = p_job and status <> 'closed' and can_manage(company_id)) then
    raise exception 'Solo puedes ligar una vacante abierta que gestionas'; end if;
  insert into community_posts (author_id, job_id, body) values (auth.uid(), p_job, left(trim(p_body), 2000)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.community_comment(p_post uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_author uuid;
begin
  if not is_advisor() then raise exception 'Solo los asesores de VINKA pueden comentar'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Escribe tu comentario'; end if;
  select author_id into v_author from community_posts where id = p_post and not hidden;
  if v_author is null then raise exception 'La publicación ya no está disponible'; end if;
  insert into community_comments (post_id, author_id, body) values (p_post, auth.uid(), left(trim(p_body), 1000)) returning id into v_id;
  if v_author <> auth.uid() then
    perform notify_users(array[v_author], 'community', short_name(auth.uid()) || ' comentó tu publicación', left(trim(p_body), 140), '/comunidad#' || p_post, false);
  end if;
  return v_id;
end $$;

-- Quitar: el autor borra lo suyo; la administración oculta cualquier cosa
create or replace function public.community_hide(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind = 'post' then
    update community_posts set hidden = true, hidden_by = auth.uid() where id = p_id and (author_id = auth.uid() or is_admin());
  elsif p_kind = 'comment' then
    update community_comments set hidden = true, hidden_by = auth.uid() where id = p_id and (author_id = auth.uid() or is_admin());
  else raise exception 'Tipo no válido'; end if;
  if not found then raise exception 'No puedes quitar esto'; end if;
  if is_admin() then
    insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'community_hidden', p_kind, p_id, '{}');
  end if;
end $$;

-- Quien publicó invita al proceso a quien comentó
create or replace function public.community_invite_to_process(p_comment uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare c community_comments; p community_posts; j jobs;
begin
  select * into c from community_comments where id = p_comment and not hidden;
  select * into p from community_posts where id = c.post_id;
  select * into j from jobs where id = p.job_id;
  if c.id is null or p.author_id <> auth.uid() then raise exception 'Solo quien publicó puede invitar al proceso'; end if;
  if j.id is null or j.status = 'closed' or not can_manage(j.company_id) then raise exception 'La publicación no tiene una vacante abierta que gestiones'; end if;
  if c.author_id = auth.uid() then raise exception 'No puedes invitarte a ti mismo'; end if;
  if not exists (select 1 from advisors where user_id = c.author_id and active) then raise exception 'Esa persona ya no es asesora activa'; end if;
  if exists (select 1 from company_members where user_id = c.author_id and (company_id = j.company_id or company_id = (select parent_id from companies where id = j.company_id))) then
    raise exception 'Esa persona ya es parte del equipo de la vacante'; end if;
  insert into job_collaborators (job_id, user_id, invited_by, post_id) values (j.id, c.author_id, auth.uid(), p.id)
  on conflict (job_id, user_id) do nothing;
  if not found then raise exception 'Ya está invitado al proceso'; end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'job_collaborator_added', 'job', j.id, jsonb_build_object('user', c.author_id, 'post', p.id));
  perform notify_users(array[c.author_id], 'community', short_name(auth.uid()) || ' te invitó a su proceso',
    j.title || '. Ya puedes ver el proceso y conversar en el chat.', '/vacantes/' || j.id || '/proceso', false);
  return j.id;
end $$;

-- Quien gestiona la vacante saca a un invitado, o el invitado se retira
create or replace function public.collab_remove(p_job uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (p_user = auth.uid() or exists (select 1 from jobs where id = p_job and can_manage(company_id))) then raise exception 'No puedes hacer esto'; end if;
  delete from job_collaborators where job_id = p_job and user_id = p_user;
  if not found then raise exception 'Esa persona no está invitada al proceso'; end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'job_collaborator_removed', 'job', p_job, jsonb_build_object('user', p_user));
end $$;

-- Para la pantalla del proceso: quién colabora y con quién converso
create or replace function public.job_collab_info(p_job uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare j jobs; v_mgr boolean;
begin
  select * into j from jobs where id = p_job;
  if j.id is null then raise exception 'Vacante no encontrada'; end if;
  v_mgr := is_company_member(j.company_id);
  if v_mgr then
    return jsonb_build_object('role', 'equipo', 'collaborators', coalesce((select jsonb_agg(jsonb_build_object('user_id', c.user_id, 'name', short_name(c.user_id),
        'last_at', (select max(m.created_at) from collab_messages m where m.job_id = p_job and m.collaborator_id = c.user_id)) order by c.created_at)
      from job_collaborators c where c.job_id = p_job), '[]'::jsonb));
  elsif is_job_collaborator(p_job) then
    return (select jsonb_build_object('role', 'invitado', 'owner', short_name(c.invited_by), 'collaborators', '[]'::jsonb)
            from job_collaborators c where c.job_id = p_job and c.user_id = auth.uid());
  end if;
  raise exception 'Vacante no encontrada';
end $$;

-- Procesos a los que me invitaron
create or replace function public.my_collaborations()
returns table (job_id uuid, title text, comuna text, owner text, created_at timestamptz, closed boolean)
language sql stable security definer set search_path = public as $$
  select j.id, j.title, j.comuna, short_name(c.invited_by), c.created_at, j.status = 'closed'
  from job_collaborators c join jobs j on j.id = c.job_id
  where c.user_id = auth.uid() and is_advisor()
  order by c.created_at desc
$$;

create or replace function public.collab_can_chat(p_job uuid, p_collab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from job_collaborators c join jobs j on j.id = c.job_id
                 where c.job_id = p_job and c.user_id = p_collab
                   and ((auth.uid() = p_collab and is_advisor()) or is_company_member(j.company_id)))
$$;

create or replace function public.collab_thread(p_job uuid, p_collab uuid)
returns table (id uuid, sender_id uuid, sender text, mine boolean, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not collab_can_chat(p_job, p_collab) then raise exception 'No tienes acceso a esta conversación'; end if;
  return query select m.id, m.sender_id, short_name(m.sender_id), m.sender_id = auth.uid(), m.body, m.created_at
    from collab_messages m where m.job_id = p_job and m.collaborator_id = p_collab order by m.created_at limit 500;
end $$;

create or replace function public.collab_send(p_job uuid, p_collab uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_to uuid[]; v_prev timestamptz; jt text;
begin
  if not collab_can_chat(p_job, p_collab) then raise exception 'No tienes acceso a esta conversación'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Escribe un mensaje'; end if;
  select max(created_at) into v_prev from collab_messages where job_id = p_job and collaborator_id = p_collab and sender_id = auth.uid();
  insert into collab_messages (job_id, collaborator_id, sender_id, body) values (p_job, p_collab, auth.uid(), left(trim(p_body), 2000)) returning id into v_id;
  -- Aviso al otro lado (como mucho uno cada 10 minutos por conversación)
  if v_prev is null or v_prev < now() - interval '10 minutes' then
    select title into jt from jobs where id = p_job;
    if auth.uid() = p_collab then
      select array[invited_by] into v_to from job_collaborators where job_id = p_job and user_id = p_collab;
    else
      v_to := array[p_collab];
    end if;
    perform notify_users(v_to, 'community', short_name(auth.uid()) || ' te escribió', jt || ': ' || left(trim(p_body), 120),
      '/vacantes/' || p_job || '/proceso?chat=' || p_collab, false);
  end if;
  return v_id;
end $$;

-- ===================== 4) El invitado ve el proceso (solo lectura) =====================
do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.job_pipeline(uuid)'::regprocedure);
  n := replace(d, 'if j.id is null or not is_company_member(j.company_id) then', 'if j.id is null or not (is_company_member(j.company_id) or is_job_collaborator(j.id)) then');
  if n = d then raise exception 'job_pipeline: no se encontró la verificación de acceso'; end if;
  execute n;
  d := pg_get_functiondef('public.subject_detail(uuid, uuid)'::regprocedure);
  n := replace(d, 'if j.id is null or not is_company_member(j.company_id) then', 'if j.id is null or not (is_company_member(j.company_id) or is_job_collaborator(j.id)) then');
  if n = d then raise exception 'subject_detail: no se encontró la verificación de acceso'; end if;
  execute n;
end $m$;

-- ===================== 5) Permisos =====================
do $g$
declare f text;
begin
  foreach f in array array['is_job_collaborator(uuid)', 'community_feed(timestamptz, int)', 'community_post(text, uuid)', 'community_comment(uuid, text)',
    'community_hide(text, uuid)', 'community_invite_to_process(uuid)', 'collab_remove(uuid, uuid)', 'job_collab_info(uuid)', 'my_collaborations()',
    'collab_can_chat(uuid, uuid)', 'collab_thread(uuid, uuid)', 'collab_send(uuid, uuid, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $g$;
