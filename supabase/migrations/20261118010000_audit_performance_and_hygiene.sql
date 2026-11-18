-- Auditoría integral 18-11-2026
-- R1: «Mis procesos» y «Avisos sin leer» revisaban todos los matches del sistema uno por uno (lento con muchas personas a la vez).
--     Ahora buscan primero las empresas de la persona. Mismos resultados, unas 10 veces más rápido (probado en copia aislada).
-- T1: el movimiento masivo de etapa contaba como «movidos» a postulantes que ya no estaban en el proceso.
-- T2: índices para relaciones sin índice (recomendación de Supabase).
-- Refuerzo: reglas de acceso activadas en el esquema seed (no estaba expuesto; esto lo deja cerrado igual si algún día se expone).
create schema if not exists backup;
create table if not exists backup.fn_perf_20261118 as
  select now() saved_at, p.oid::regprocedure::text fn, pg_get_functiondef(p.oid) def from pg_proc p
  where p.oid in ('public.my_unread()'::regprocedure, 'public.my_matches()'::regprocedure, 'public.bulk_pipeline(uuid, jsonb, text, text)'::regprocedure);

-- R1
do $m$
declare f text; d text; n text;
begin
  foreach f in array array['public.my_unread()', 'public.my_matches()'] loop
    d := pg_get_functiondef(f::regprocedure);
    n := replace(d, 'or is_company_member(m.company_id)',
      'or m.company_id in (select cm.company_id from company_members cm where cm.user_id = auth.uid()'
      || ' union select c.id from companies c join company_members cm on cm.company_id = c.parent_id where cm.user_id = auth.uid())');
    if n = d then
      if strpos(d, 'cm.user_id = auth.uid()') > 0 then continue; end if; -- ya aplicado
      raise exception '%: no se encontró el filtro a reemplazar', f;
    end if;
    execute n;
  end loop;
end $m$;

-- T1
do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.bulk_pipeline(uuid, jsonb, text, text)'::regprocedure);
  n := replace(d, 'mid := pipeline_move(it->>''kind'', (it->>''id'')::uuid, p_job, p_stage); moved := moved + 1;',
    'mid := pipeline_move(it->>''kind'', (it->>''id'')::uuid, p_job, p_stage); if mid is not null or it->>''kind'' <> ''match'' then moved := moved + 1; end if;');
  if n = d then
    if strpos(d, 'if mid is not null or it->>''kind'' <> ''match'' then moved') > 0 then return; end if; -- ya aplicado
    raise exception 'bulk_pipeline: no se encontró el conteo';
  end if;
  execute n;
end $m$;

-- T2
create index if not exists idx_admins_created_by on public.admins (created_by);
create index if not exists idx_advisor_reviews_candidate on public.advisor_reviews (candidate_id);
create index if not exists idx_collab_messages_collaborator on public.collab_messages (collaborator_id);
create index if not exists idx_collab_messages_sender on public.collab_messages (sender_id);
create index if not exists idx_collab_suggestions_candidate on public.collab_suggestions (candidate_id);
create index if not exists idx_collab_suggestions_collaborator on public.collab_suggestions (collaborator_id);
create index if not exists idx_collab_suggestions_decided_by on public.collab_suggestions (decided_by);
create index if not exists idx_collab_tasks_collaborator on public.collab_tasks (collaborator_id);
create index if not exists idx_collab_tasks_created_by on public.collab_tasks (created_by);
create index if not exists idx_collab_tasks_done_by on public.collab_tasks (done_by);
create index if not exists idx_collab_tasks_job on public.collab_tasks (job_id);
create index if not exists idx_community_comments_author on public.community_comments (author_id);
create index if not exists idx_community_posts_author on public.community_posts (author_id);
create index if not exists idx_community_posts_job on public.community_posts (job_id);
create index if not exists idx_companies_rut_duplicate_of on public.companies (rut_duplicate_of);
create index if not exists idx_feedback_user on public.feedback (user_id);
create index if not exists idx_job_collaborators_invited_by on public.job_collaborators (invited_by);
create index if not exists idx_job_collaborators_post on public.job_collaborators (post_id);
create index if not exists idx_job_collaborators_user on public.job_collaborators (user_id);
create index if not exists idx_matches_schedule_invited_by on public.matches (schedule_invited_by);
create index if not exists idx_payment_attempts_payment on public.payment_attempts (payment_id);
create index if not exists idx_quote_requests_replied_by on public.quote_requests (replied_by);
create index if not exists idx_service_requests_preferred on public.service_requests (preferred_advisor);
create index if not exists idx_service_requests_proposed on public.service_requests (proposed_advisor);

-- Refuerzo seed (las funciones de la app son del dueño de las tablas y no se ven afectadas)
do $m$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'seed' loop
    execute format('alter table seed.%I enable row level security', t);
  end loop;
end $m$;
