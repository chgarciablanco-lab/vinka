-- Colaboración entre asesores en un proceso: sugerencias con visto bueno del responsable y tareas con check.
-- Todo queda registrado: en el historial del postulante y como evento en el chat de la colaboración.

-- Eventos automáticos en el chat (sugerencias, decisiones, tareas)
alter table public.collab_messages add column if not exists kind text not null default 'msg' check (kind in ('msg', 'evento'));

create table public.collab_suggestions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  collaborator_id uuid not null references auth.users(id) on delete cascade,
  candidate_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('avanzar', 'descartar')),
  from_stage text not null,
  to_stage text not null,
  note text not null default '',
  status text not null default 'pendiente' check (status in ('pendiente', 'aprobada', 'rechazada')),
  response text not null default '',
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index collab_one_pending_suggestion on public.collab_suggestions (job_id, candidate_id) where status = 'pendiente';

create table public.collab_tasks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  collaborator_id uuid not null references auth.users(id) on delete cascade,  -- la conversación a la que pertenece
  title text not null check (length(trim(title)) between 1 and 300),
  assignee_id uuid not null references auth.users(id) on delete cascade,
  due_on date,
  created_by uuid not null references auth.users(id) on delete cascade,
  done_at timestamptz,
  done_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index collab_tasks_assignee on public.collab_tasks (assignee_id) where done_at is null;

alter table public.collab_suggestions enable row level security;
alter table public.collab_tasks enable row level security;
revoke all on public.collab_suggestions, public.collab_tasks from anon, authenticated;

-- Evento en el chat de la colaboración (uso interno)
create or replace function public.collab_event(p_job uuid, p_collab uuid, p_body text)
returns void language sql security definer set search_path = public as $$
  insert into collab_messages (job_id, collaborator_id, sender_id, body, kind) values (p_job, p_collab, auth.uid(), left(p_body, 2000), 'evento')
$$;

-- Etapa actual de un postulante VINKA en la vacante
create or replace function public.collab_stage(p_job uuid, p_candidate uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when m.closed then 'cerrado' else m.stage end from matches m where m.job_id = p_job and m.candidate_id = p_candidate),
    (select case when x.action = 'pass' then 'descartado' end from company_candidate_actions x where x.job_id = p_job and x.candidate_id = p_candidate),
    (select 'postulante' from candidate_job_actions a where a.job_id = p_job and a.candidate_id = p_candidate and a.action = 'interest'))
$$;

create or replace function public.collab_stage_label(p text)
returns text language sql immutable set search_path = public as $$
  select case p when 'postulante' then 'Postulantes' when 'match' then 'Match' when 'contacto' then 'Contacto' when 'entrevista' then 'Entrevista'
    when 'oferta' then 'Oferta' when 'contratado' then 'Contratado' when 'descartado' then 'Descartado' else p end
$$;

-- El invitado sugiere avanzar o descartar a un postulante
create or replace function public.collab_suggest(p_job uuid, p_candidate uuid, p_action text, p_note text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare j jobs; v_from text; v_to text; v_id uuid; v_owner uuid; v_name text;
begin
  if not is_job_collaborator(p_job) then raise exception 'Solo un asesor invitado al proceso puede sugerir'; end if;
  if p_action not in ('avanzar', 'descartar') then raise exception 'Sugerencia no válida'; end if;
  select * into j from jobs where id = p_job;
  v_from := collab_stage(p_job, p_candidate);
  if v_from is null then raise exception 'Este postulante no está en el proceso'; end if;
  if v_from in ('contratado', 'descartado', 'cerrado') then raise exception 'Este postulante ya terminó su proceso'; end if;
  v_to := case when p_action = 'descartar' then 'descartado'
               else case v_from when 'postulante' then 'match' when 'match' then 'contacto' when 'contacto' then 'entrevista' when 'entrevista' then 'oferta' when 'oferta' then 'contratado' end end;
  if exists (select 1 from collab_suggestions where job_id = p_job and candidate_id = p_candidate and status = 'pendiente') then
    raise exception 'Ya hay una sugerencia pendiente para este postulante'; end if;
  insert into collab_suggestions (job_id, collaborator_id, candidate_id, action, from_stage, to_stage, note)
  values (p_job, auth.uid(), p_candidate, p_action, v_from, v_to, left(coalesce(trim(p_note), ''), 500)) returning id into v_id;
  v_name := short_name(p_candidate);
  perform log_event(j.company_id, p_job, p_candidate, null, 'collab_suggest', jsonb_build_object('action', p_action, 'from', v_from, 'to', v_to, 'note', left(coalesce(trim(p_note), ''), 200)));
  perform collab_event(p_job, auth.uid(), 'Sugirió ' || case when p_action = 'avanzar' then 'avanzar a ' || v_name || ' a ' || collab_stage_label(v_to) else 'descartar a ' || v_name end
    || case when coalesce(trim(p_note), '') <> '' then ': «' || left(trim(p_note), 200) || '»' else '' end);
  select invited_by into v_owner from job_collaborators where job_id = p_job and user_id = auth.uid();
  perform notify_users(array[v_owner], 'community', short_name(auth.uid()) || ' sugiere ' || case when p_action = 'avanzar' then 'avanzar' else 'descartar' end || ' a ' || v_name,
    j.title || '. Revisa y aprueba en el proceso.', '/vacantes/' || p_job || '/proceso', false);
  return v_id;
end $$;

-- El responsable (quien gestiona la vacante) aprueba o no la sugerencia
create or replace function public.collab_decide(p_suggestion uuid, p_approve boolean, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare s collab_suggestions; j jobs; v_now text; v_name text;
begin
  select * into s from collab_suggestions where id = p_suggestion;
  select * into j from jobs where id = s.job_id;
  if s.id is null or not can_manage(j.company_id) then raise exception 'Solo quien gestiona la vacante puede decidir'; end if;
  if s.status <> 'pendiente' then raise exception 'Esta sugerencia ya fue decidida'; end if;
  v_name := short_name(s.candidate_id);
  if p_approve then
    v_now := collab_stage(s.job_id, s.candidate_id);
    if v_now is distinct from s.from_stage then raise exception 'El postulante cambió de etapa desde la sugerencia. Márcala como no aprobada y muévelo tú si corresponde.'; end if;
    perform pipeline_move(case when s.from_stage = 'postulante' then 'interesado' else 'match' end, s.candidate_id, s.job_id, s.to_stage);
  end if;
  update collab_suggestions set status = case when p_approve then 'aprobada' else 'rechazada' end, response = left(coalesce(trim(p_note), ''), 500),
         decided_by = auth.uid(), decided_at = now() where id = s.id;
  perform log_event(j.company_id, s.job_id, s.candidate_id, null, 'collab_decided',
    jsonb_build_object('approved', p_approve, 'by', short_name(s.collaborator_id), 'action', s.action, 'to', s.to_stage, 'note', left(coalesce(trim(p_note), ''), 200)));
  perform collab_event(s.job_id, s.collaborator_id, case when p_approve then '✓ Aprobó' else '✗ No aprobó' end || ' la sugerencia de '
    || case when s.action = 'avanzar' then 'avanzar a ' || v_name || ' a ' || collab_stage_label(s.to_stage) else 'descartar a ' || v_name end
    || case when coalesce(trim(p_note), '') <> '' then ': «' || left(trim(p_note), 200) || '»' else '' end);
  perform notify_users(array[s.collaborator_id], 'community', short_name(auth.uid()) || case when p_approve then ' aprobó tu sugerencia' else ' no aprobó tu sugerencia' end,
    v_name || ' · ' || j.title, '/vacantes/' || s.job_id || '/proceso', false);
end $$;

-- Sugerencias de un proceso (el equipo ve todas; el invitado, las suyas)
create or replace function public.collab_suggestions_for_job(p_job uuid)
returns table (id uuid, candidate_id uuid, candidate text, action text, from_stage text, to_stage text, note text, status text, response text,
               by_name text, mine boolean, created_at timestamptz, decided_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_team boolean;
begin
  select is_company_member(jj.company_id) into v_team from jobs jj where jj.id = p_job;
  if not (coalesce(v_team, false) or is_job_collaborator(p_job)) then raise exception 'Vacante no encontrada'; end if;
  return query select s.id, s.candidate_id, short_name(s.candidate_id), s.action, s.from_stage, s.to_stage, s.note, s.status, s.response,
      short_name(s.collaborator_id), s.collaborator_id = auth.uid(), s.created_at, s.decided_at
    from collab_suggestions s where s.job_id = p_job and (v_team or s.collaborator_id = auth.uid())
      and (s.status = 'pendiente' or s.decided_at > now() - interval '30 days')
    order by (s.status = 'pendiente') desc, s.created_at desc;
end $$;

-- Tareas de una conversación
create or replace function public.collab_task_create(p_job uuid, p_collab uuid, p_title text, p_assignee uuid, p_due date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_owner uuid;
begin
  if not collab_can_chat(p_job, p_collab) then raise exception 'No tienes acceso a esta conversación'; end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Escribe la tarea'; end if;
  select invited_by into v_owner from job_collaborators where job_id = p_job and user_id = p_collab;
  if p_assignee is distinct from p_collab and p_assignee is distinct from v_owner and p_assignee is distinct from auth.uid() then
    raise exception 'La tarea debe quedar a cargo de uno de los dos'; end if;
  insert into collab_tasks (job_id, collaborator_id, title, assignee_id, due_on, created_by)
  values (p_job, p_collab, left(trim(p_title), 300), p_assignee, p_due, auth.uid()) returning id into v_id;
  perform collab_event(p_job, p_collab, 'Nueva tarea para ' || short_name(p_assignee) || ': «' || left(trim(p_title), 200) || '»'
    || case when p_due is not null then ' (para el ' || to_char(p_due, 'DD-MM') || ')' else '' end);
  if p_assignee <> auth.uid() then
    perform notify_users(array[p_assignee], 'community', short_name(auth.uid()) || ' te asignó una tarea', left(trim(p_title), 140),
      '/vacantes/' || p_job || '/proceso?chat=' || p_collab, false);
  end if;
  return v_id;
end $$;

create or replace function public.collab_task_done(p_task uuid, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
declare t collab_tasks;
begin
  select * into t from collab_tasks where id = p_task;
  if t.id is null or not collab_can_chat(t.job_id, t.collaborator_id) then raise exception 'No tienes acceso a esta tarea'; end if;
  update collab_tasks set done_at = case when p_done then now() end, done_by = case when p_done then auth.uid() end where id = p_task;
  perform collab_event(t.job_id, t.collaborator_id, case when p_done then '✓ Tarea hecha: «' else 'Tarea reabierta: «' end || left(t.title, 200) || '»');
end $$;

create or replace function public.collab_task_list(p_job uuid, p_collab uuid)
returns table (id uuid, title text, assignee_id uuid, assignee text, mine boolean, due_on date, done boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not collab_can_chat(p_job, p_collab) then raise exception 'No tienes acceso a esta conversación'; end if;
  return query select t.id, t.title, t.assignee_id, short_name(t.assignee_id), t.assignee_id = auth.uid(), t.due_on, t.done_at is not null, t.created_at
    from collab_tasks t where t.job_id = p_job and t.collaborator_id = p_collab order by (t.done_at is not null), t.due_on nulls last, t.created_at;
end $$;

-- Para el Inicio: mis tareas pendientes y las sugerencias que debo revisar
create or replace function public.collab_inbox()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'due_on', t.due_on, 'job_id', t.job_id, 'job', j.title,
        'url', '/vacantes/' || t.job_id || '/proceso?chat=' || t.collaborator_id) order by t.due_on nulls last, t.created_at)
      from collab_tasks t join jobs j on j.id = t.job_id
      where t.assignee_id = auth.uid() and t.done_at is null and collab_can_chat(t.job_id, t.collaborator_id)), '[]'::jsonb),
    'suggestions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'job_id', s.job_id, 'job', j.title, 'candidate', short_name(s.candidate_id),
        'action', s.action, 'to_stage', s.to_stage, 'by', short_name(s.collaborator_id)) order by s.created_at)
      from collab_suggestions s join jobs j on j.id = s.job_id
      where s.status = 'pendiente' and can_manage(j.company_id)), '[]'::jsonb))
$$;

-- El chat ahora indica qué mensajes son eventos automáticos
drop function if exists public.collab_thread(uuid, uuid);
create function public.collab_thread(p_job uuid, p_collab uuid)
returns table (id uuid, sender_id uuid, sender text, mine boolean, body text, created_at timestamptz, kind text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not collab_can_chat(p_job, p_collab) then raise exception 'No tienes acceso a esta conversación'; end if;
  return query select m.id, m.sender_id, short_name(m.sender_id), m.sender_id = auth.uid(), m.body, m.created_at, m.kind
    from collab_messages m where m.job_id = p_job and m.collaborator_id = p_collab order by m.created_at limit 500;
end $$;

-- La conversación necesita saber quién invitó (para asignarle tareas)
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
    return (select jsonb_build_object('role', 'invitado', 'owner', short_name(c.invited_by), 'owner_id', c.invited_by, 'collaborators', '[]'::jsonb)
            from job_collaborators c where c.job_id = p_job and c.user_id = auth.uid());
  end if;
  raise exception 'Vacante no encontrada';
end $$;

do $g$
declare f text;
begin
  foreach f in array array['collab_suggest(uuid, uuid, text, text)', 'collab_decide(uuid, boolean, text)', 'collab_suggestions_for_job(uuid)',
    'collab_task_create(uuid, uuid, text, uuid, date)', 'collab_task_done(uuid, boolean)', 'collab_task_list(uuid, uuid)', 'collab_inbox()', 'collab_thread(uuid, uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- De uso interno
  foreach f in array array['collab_event(uuid, uuid, text)', 'collab_stage(uuid, uuid)', 'collab_stage_label(text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $g$;
