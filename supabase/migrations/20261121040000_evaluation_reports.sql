-- Informes psicolaborales con IA (etapa 1, sin audio). Aprobado por Christian el 20-11-2026.
-- Propuesta: «VINKA · Informes psicolaborales con IA — propuesta».
-- El asesor o la empresa sube el perfil del cargo, CV, transcripción, referencias y tests; la IA (función «evaluation-report»)
-- redacta un borrador con la estructura del informe psicolaboral de ejemplo; la persona lo edita, lo cierra y lo descarga.
-- El postulante y los asesores colaboradores nunca ven los informes. Tablas cerradas: solo se usan por funciones.
create schema if not exists backup;
create table if not exists backup.fn_orphan_storage_objects_20261121 as
  select now() saved_at, pg_get_functiondef('public.orphan_storage_objects(interval,integer)'::regprocedure) def;

-- ───────── Límites por plan ─────────
alter table public.plans add column if not exists report_monthly int not null default 0;
alter table public.plans add column if not exists audio_minutes_monthly int not null default 0;
update public.plans set report_monthly = v.r, audio_minutes_monthly = v.a
  from (values ('gratis', 2, 0), ('pyme', 10, 120), ('equipo', 30, 360), ('consultora', 80, 900), ('asesor', 30, 360), ('empresa', 200, 2000)) v(id, r, a)
 where plans.id = v.id and plans.report_monthly = 0;

-- ───────── Tablas ─────────
create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  title text not null check (char_length(title) between 2 and 160),
  client_name text not null default '' check (char_length(client_name) <= 160),
  job_profile text not null default '' check (char_length(job_profile) <= 20000),
  status text not null default 'abierta' check (status in ('abierta', 'cerrada')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index if not exists assessments_one_per_job on public.assessments (job_id) where job_id is not null;
create index if not exists idx_assessments_company on public.assessments (company_id, created_at desc);
create index if not exists idx_assessments_created_by on public.assessments (created_by);

create table if not exists public.assessment_candidates (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  candidate_id uuid references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  email text not null default '' check (char_length(email) <= 200),
  consent_by uuid references auth.users(id) on delete set null,
  consent_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists assessment_candidates_one_vinka on public.assessment_candidates (assessment_id, candidate_id) where candidate_id is not null;
create index if not exists idx_assessment_candidates_eval on public.assessment_candidates (assessment_id);
create index if not exists idx_assessment_candidates_candidate on public.assessment_candidates (candidate_id);
create index if not exists idx_assessment_candidates_consent_by on public.assessment_candidates (consent_by);
create index if not exists idx_assessment_candidates_created_by on public.assessment_candidates (created_by);

create table if not exists public.assessment_files (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  assessment_candidate_id uuid references public.assessment_candidates(id) on delete cascade,
  kind text not null check (kind in ('perfil', 'cv', 'transcripcion', 'referencias', 'test', 'otro')),
  name text not null check (char_length(name) between 1 and 200),
  path text,
  mime text not null default '',
  size_bytes bigint not null default 0,
  text_content text check (char_length(text_content) <= 200000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (path is not null or coalesce(text_content, '') <> '')
);
create index if not exists idx_assessment_files_eval on public.assessment_files (assessment_id);
create index if not exists idx_assessment_files_cand on public.assessment_files (assessment_candidate_id);
create index if not exists idx_assessment_files_created_by on public.assessment_files (created_by);

create table if not exists public.assessment_reports (
  id uuid primary key default gen_random_uuid(),
  assessment_candidate_id uuid not null references public.assessment_candidates(id) on delete cascade,
  version int not null,
  status text not null default 'borrador' check (status in ('borrador', 'final')),
  sections jsonb not null default '{}'::jsonb,
  model text not null default '',
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10, 4) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  edited_by uuid references auth.users(id) on delete set null,
  edited_at timestamptz,
  finalized_by uuid references auth.users(id) on delete set null,
  finalized_at timestamptz,
  unique (assessment_candidate_id, version)
);
create index if not exists idx_assessment_reports_created_by on public.assessment_reports (created_by);
create index if not exists idx_assessment_reports_edited_by on public.assessment_reports (edited_by);
create index if not exists idx_assessment_reports_finalized_by on public.assessment_reports (finalized_by);

create table if not exists public.report_usage (
  company_id uuid not null references public.companies(id) on delete cascade,
  month date not null,
  reports int not null default 0,
  sections int not null default 0,
  audio_minutes numeric(10, 2) not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric(10, 4) not null default 0,
  primary key (company_id, month)
);

do $t$
declare t text;
begin
  foreach t in array array['assessments', 'assessment_candidates', 'assessment_files', 'assessment_reports', 'report_usage'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $t$;

-- ───────── Archivos privados ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evaluaciones', 'evaluaciones', false, 20971520,
        array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'])
on conflict (id) do nothing;

-- ───────── Permisos ─────────
-- Gestiona: administrador o reclutador de la empresa (o de su consultora). Ve: cualquier miembro, incluidos evaluadores y clientes.
create or replace function public.eval_can_manage(p_eval uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select can_manage(company_id) from assessments where id = p_eval), false) $$;
create or replace function public.eval_can_view(p_eval uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_company_member(company_id) from assessments where id = p_eval), false) $$;
create or replace function public.eval_folder(p_name text) returns uuid language plpgsql immutable as $$
begin return (split_part(p_name, '/', 1))::uuid; exception when others then return null; end $$;

drop policy if exists "evaluaciones: subir" on storage.objects;
drop policy if exists "evaluaciones: leer" on storage.objects;
drop policy if exists "evaluaciones: borrar" on storage.objects;
create policy "evaluaciones: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'evaluaciones' and public.eval_can_manage(public.eval_folder(name)));
create policy "evaluaciones: leer" on storage.objects for select to authenticated
  using (bucket_id = 'evaluaciones' and public.eval_can_manage(public.eval_folder(name)));
create policy "evaluaciones: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'evaluaciones' and public.eval_can_manage(public.eval_folder(name)));

-- Uso del mes y límite del plan (hora de Chile)
create or replace function public.report_month() returns date language sql stable as $$ select date_trunc('month', now() at time zone 'America/Santiago')::date $$;

create or replace function public.my_report_usage(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_plan plans;
begin
  if not (is_company_member(p_company) or is_admin()) then raise exception 'Sin acceso'; end if;
  v_plan := plan_of(p_company);
  return jsonb_build_object('plan', v_plan.name, 'limit', v_plan.report_monthly,
    'used', coalesce((select reports from report_usage where company_id = p_company and month = report_month()), 0));
end $$;

-- ───────── Evaluaciones ─────────
create or replace function public.eval_create(p_company uuid, p_title text, p_client text default '', p_profile text default '', p_job uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; j jobs;
begin
  if p_job is not null then
    select * into j from jobs where id = p_job;
    if j.id is null then raise exception 'Vacante no encontrada'; end if;
    select id into v_id from assessments where job_id = p_job;
    if v_id is not null then
      if not can_manage(j.company_id) then raise exception 'Solo quien gestiona la vacante'; end if;
      return v_id;
    end if;
    p_company := j.company_id;
    p_title := coalesce(nullif(trim(p_title), ''), j.title);
    p_client := coalesce(nullif(trim(p_client), ''), (select display_name from companies where id = j.company_id));
    p_profile := coalesce(nullif(trim(p_profile), ''), left(coalesce(j.description, '') || E'\n\nRequisitos:\n' ||
      coalesce((select string_agg('- ' || (r->>'text') || case when (r->>'essential')::boolean then ' (esencial)' else '' end, E'\n') from jsonb_array_elements(coalesce(j.requirements, '[]'::jsonb)) r), ''), 20000));
  end if;
  if not can_manage(p_company) then raise exception 'Solo administradores o reclutadores de la empresa pueden crear evaluaciones'; end if;
  if char_length(trim(coalesce(p_title, ''))) < 2 then raise exception 'Indica el cargo'; end if;
  insert into assessments (company_id, job_id, title, client_name, job_profile, created_by)
  values (p_company, p_job, left(trim(p_title), 160), left(trim(coalesce(p_client, '')), 160), left(coalesce(p_profile, ''), 20000), auth.uid())
  returning id into v_id;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'evaluation_created', 'evaluation', v_id, jsonb_build_object('job', p_job));
  return v_id;
end $$;

create or replace function public.eval_update(p_eval uuid, p_title text, p_client text, p_profile text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not eval_can_manage(p_eval) then raise exception 'Sin permiso'; end if;
  if char_length(trim(coalesce(p_title, ''))) < 2 then raise exception 'Indica el cargo'; end if;
  update assessments set title = left(trim(p_title), 160), client_name = left(trim(coalesce(p_client, '')), 160), job_profile = left(coalesce(p_profile, ''), 20000) where id = p_eval;
end $$;

create or replace function public.eval_set_status(p_eval uuid, p_closed boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not eval_can_manage(p_eval) then raise exception 'Sin permiso'; end if;
  update assessments set status = case when p_closed then 'cerrada' else 'abierta' end, closed_at = case when p_closed then now() end where id = p_eval;
  -- al cerrar, los archivos de respaldo se eliminan (los informes finales quedan)
  if p_closed then delete from assessment_files where assessment_id = p_eval; end if;
end $$;

create or replace function public.eval_delete(p_eval uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not eval_can_manage(p_eval) then raise exception 'Sin permiso'; end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'evaluation_deleted', 'evaluation', p_eval, '{}'::jsonb);
  delete from assessments where id = p_eval;
end $$;

create or replace function public.eval_list(p_company uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'client_name', e.client_name, 'job_id', e.job_id, 'status', e.status,
      'company_id', e.company_id, 'company', co.display_name, 'created_at', e.created_at, 'can_manage', can_manage(e.company_id),
      'candidates', (select count(*) from assessment_candidates c where c.assessment_id = e.id),
      'finals', (select count(*) from assessment_candidates c where c.assessment_id = e.id
                 and exists (select 1 from assessment_reports r where r.assessment_candidate_id = c.id and r.status = 'final'))) order by e.created_at desc)
    from assessments e join companies co on co.id = e.company_id
    where is_company_member(e.company_id) and (p_company is null or e.company_id = p_company or co.parent_id = p_company)), '[]'::jsonb);
end $$;

-- Último informe de un candidato (para quien solo ve: el último cerrado)
create or replace function public.eval_latest_report(p_cand uuid, p_finals_only boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(x) - 'input_tokens' - 'output_tokens' from (
    select r.id, r.version, r.status, r.sections, r.model, r.cost_usd, r.created_at, r.edited_at, r.finalized_at,
           short_name(r.edited_by) edited_by_name, short_name(r.finalized_by) finalized_by_name, r.input_tokens, r.output_tokens
    from assessment_reports r where r.assessment_candidate_id = p_cand and (not p_finals_only or r.status = 'final')
    order by r.version desc limit 1) x $$;

create or replace function public.eval_detail(p_eval uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e assessments; mng boolean;
begin
  select * into e from assessments where id = p_eval;
  if e.id is null or not eval_can_view(p_eval) then raise exception 'Evaluación no encontrada'; end if;
  mng := can_manage(e.company_id);
  return jsonb_build_object(
    'id', e.id, 'title', e.title, 'client_name', e.client_name, 'job_id', e.job_id, 'status', e.status, 'company_id', e.company_id,
    'company', (select display_name from companies where id = e.company_id), 'job_profile', case when mng then e.job_profile else '' end,
    'can_manage', mng, 'created_at', e.created_at, 'usage', my_report_usage(e.company_id),
    'shared_files', case when mng then coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'name', f.name, 'path', f.path, 'size', f.size_bytes,
        'has_text', coalesce(f.text_content, '') <> '', 'created_at', f.created_at) order by f.created_at)
      from assessment_files f where f.assessment_id = e.id and f.assessment_candidate_id is null), '[]'::jsonb) else '[]'::jsonb end,
    'candidates', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'full_name', c.full_name, 'email', case when mng then c.email else '' end,
        'candidate_id', c.candidate_id, 'consent_at', c.consent_at, 'consent_by', short_name(c.consent_by),
        'files', case when mng then coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'name', f.name, 'path', f.path, 'size', f.size_bytes,
            'has_text', coalesce(f.text_content, '') <> '', 'created_at', f.created_at) order by f.created_at)
          from assessment_files f where f.assessment_candidate_id = c.id), '[]'::jsonb) else '[]'::jsonb end,
        'report', eval_latest_report(c.id, not mng)) order by c.created_at)
      from assessment_candidates c where c.assessment_id = e.id), '[]'::jsonb));
end $$;

-- Evaluación de un postulante de una vacante (la crea si no existe) → devuelve el id del candidato en la evaluación
create or replace function public.eval_for_applicant(p_job uuid, p_candidate uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_eval uuid; v_cand uuid; j jobs; v_name text;
begin
  select * into j from jobs where id = p_job;
  if j.id is null or not is_company_member(j.company_id) then raise exception 'Vacante no encontrada'; end if;
  select id into v_eval from assessments where job_id = p_job;
  if v_eval is not null then select id into v_cand from assessment_candidates where assessment_id = v_eval and candidate_id = p_candidate; end if;
  if v_cand is not null or not can_manage(j.company_id) then return jsonb_build_object('assessment_id', v_eval, 'assessment_candidate_id', v_cand); end if;
  if not (exists (select 1 from matches where job_id = p_job and candidate_id = p_candidate)
          or exists (select 1 from candidate_job_actions where job_id = p_job and candidate_id = p_candidate and action = 'interest')) then
    raise exception 'Esta persona no participa en la vacante'; end if;
  if v_eval is null then v_eval := eval_create(j.company_id, j.title, '', '', p_job); end if;
  select trim(first_name || ' ' || last_name) into v_name from profiles where id = p_candidate;
  insert into assessment_candidates (assessment_id, candidate_id, full_name, created_by)
  values (v_eval, p_candidate, left(coalesce(nullif(v_name, ''), 'Postulante'), 120), auth.uid()) returning id into v_cand;
  return jsonb_build_object('assessment_id', v_eval, 'assessment_candidate_id', v_cand);
end $$;

create or replace function public.eval_add_candidate(p_eval uuid, p_name text, p_email text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not eval_can_manage(p_eval) then raise exception 'Sin permiso'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Indica el nombre de la persona'; end if;
  if (select count(*) from assessment_candidates where assessment_id = p_eval) >= 50 then raise exception 'Máximo 50 personas por evaluación'; end if;
  insert into assessment_candidates (assessment_id, full_name, email, created_by)
  values (p_eval, left(trim(p_name), 120), left(lower(trim(coalesce(p_email, ''))), 200), auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.eval_remove_candidate(p_cand uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_eval uuid;
begin
  select assessment_id into v_eval from assessment_candidates where id = p_cand;
  if v_eval is null or not eval_can_manage(v_eval) then raise exception 'Sin permiso'; end if;
  delete from assessment_candidates where id = p_cand;
end $$;

create or replace function public.eval_set_consent(p_cand uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_eval uuid;
begin
  select assessment_id into v_eval from assessment_candidates where id = p_cand;
  if v_eval is null or not eval_can_manage(v_eval) then raise exception 'Sin permiso'; end if;
  update assessment_candidates set consent_by = auth.uid(), consent_at = now() where id = p_cand and consent_at is null;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'evaluation_consent', 'evaluation', v_eval, jsonb_build_object('candidate', p_cand));
end $$;

-- Registra un archivo ya subido a «evaluaciones/<evaluación>/…» o un texto pegado
create or replace function public.eval_add_file(p_eval uuid, p_cand uuid, p_kind text, p_name text, p_path text default null, p_mime text default '',
  p_size bigint default 0, p_text text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not eval_can_manage(p_eval) then raise exception 'Sin permiso'; end if;
  if (select status from assessments where id = p_eval) = 'cerrada' then raise exception 'La evaluación está cerrada'; end if;
  if p_cand is not null and not exists (select 1 from assessment_candidates where id = p_cand and assessment_id = p_eval) then raise exception 'Persona no encontrada'; end if;
  if p_path is not null then
    if eval_folder(p_path) is distinct from p_eval then raise exception 'Ruta de archivo no válida'; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'evaluaciones' and name = p_path) then raise exception 'Primero sube el archivo'; end if;
  elsif char_length(trim(coalesce(p_text, ''))) < 20 then raise exception 'Pega el texto (al menos un par de frases)'; end if;
  if (select count(*) from assessment_files where assessment_id = p_eval and assessment_candidate_id is not distinct from p_cand) >= 15 then
    raise exception 'Máximo 15 archivos por persona'; end if;
  insert into assessment_files (assessment_id, assessment_candidate_id, kind, name, path, mime, size_bytes, text_content, created_by)
  values (p_eval, p_cand, p_kind, left(trim(coalesce(nullif(p_name, ''), 'Texto')), 200), p_path, left(coalesce(p_mime, ''), 120), greatest(coalesce(p_size, 0), 0),
          nullif(left(coalesce(p_text, ''), 200000), ''), auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.eval_delete_file(p_file uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_eval uuid;
begin
  select assessment_id into v_eval from assessment_files where id = p_file;
  if v_eval is null or not eval_can_manage(v_eval) then raise exception 'Sin permiso'; end if;
  delete from assessment_files where id = p_file;
end $$;

-- ───────── Informes: edición y cierre ─────────
create or replace function public.eval_report_save(p_report uuid, p_sections jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare r assessment_reports; v_eval uuid;
begin
  select * into r from assessment_reports where id = p_report;
  select assessment_id into v_eval from assessment_candidates where id = r.assessment_candidate_id;
  if r.id is null or not eval_can_manage(v_eval) then raise exception 'Sin permiso'; end if;
  if r.status <> 'borrador' then raise exception 'El informe está cerrado. Reábrelo para editarlo.'; end if;
  if jsonb_typeof(p_sections) <> 'object' or octet_length(p_sections::text) > 120000 then raise exception 'Contenido no válido'; end if;
  update assessment_reports set sections = p_sections, edited_by = auth.uid(), edited_at = now() where id = p_report;
end $$;

create or replace function public.eval_report_finalize(p_report uuid, p_final boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r assessment_reports; v_eval uuid;
begin
  select * into r from assessment_reports where id = p_report;
  select assessment_id into v_eval from assessment_candidates where id = r.assessment_candidate_id;
  if r.id is null or not eval_can_manage(v_eval) then raise exception 'Sin permiso'; end if;
  if p_final and coalesce(r.sections->>'veredicto', '') not in ('recomendado', 'con_observaciones', 'no_recomendado') then
    raise exception 'Elige la recomendación final antes de cerrar el informe'; end if;
  update assessment_reports set status = case when p_final then 'final' else 'borrador' end,
         finalized_by = case when p_final then auth.uid() end, finalized_at = case when p_final then now() end where id = p_report;
  insert into audit_logs (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), case when p_final then 'report_finalized' else 'report_reopened' end, 'evaluation', v_eval, jsonb_build_object('report', p_report));
end $$;

-- ───────── Para la función de servidor (service_role) ─────────
-- Reserva un cupo (informe completo) o registra una sección, y entrega lo necesario para redactar. Atómico.
create or replace function public.eval_ai_begin(p_user uuid, p_cand uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c assessment_candidates; e assessments; v_plan plans; v_used int; v_ok boolean; v_month date := report_month();
begin
  select * into c from assessment_candidates where id = p_cand;
  select * into e from assessments where id = c.assessment_id;
  if c.id is null then raise exception 'Persona no encontrada'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  if not can_manage(e.company_id) then raise exception 'Solo administradores o reclutadores de la empresa pueden generar informes'; end if;
  if e.status = 'cerrada' then raise exception 'La evaluación está cerrada'; end if;
  if c.consent_at is null then raise exception 'Confirma que la persona autorizó la evaluación y el uso de IA'; end if;
  if not exists (select 1 from assessment_files where assessment_candidate_id = c.id) then raise exception 'Sube al menos un archivo de la persona (CV o entrevista)'; end if;
  if p_kind = 'informe' then
    v_plan := plan_of(e.company_id);
    insert into report_usage (company_id, month) values (e.company_id, v_month) on conflict do nothing;
    update report_usage set reports = reports + 1 where company_id = e.company_id and month = v_month and reports < v_plan.report_monthly returning true into v_ok;
    if not coalesce(v_ok, false) then
      raise exception 'Tu plan % permite % informes al mes y ya se usaron todos. Podrás generar más el próximo mes.', v_plan.name, v_plan.report_monthly; end if;
  elsif p_kind = 'seccion' then
    if not exists (select 1 from assessment_reports where assessment_candidate_id = c.id and status = 'borrador') then raise exception 'Primero genera el informe'; end if;
    insert into report_usage (company_id, month, sections) values (e.company_id, v_month, 1)
    on conflict (company_id, month) do update set sections = report_usage.sections + 1;
  else raise exception 'Tipo no válido'; end if;
  return jsonb_build_object('evaluation', jsonb_build_object('id', e.id, 'title', e.title, 'client_name', e.client_name, 'job_profile', e.job_profile,
      'company', (select display_name from companies where id = e.company_id)),
    'candidate', jsonb_build_object('id', c.id, 'full_name', c.full_name),
    'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'name', f.name, 'path', f.path, 'mime', f.mime, 'text', f.text_content) order by f.created_at)
      from assessment_files f where f.assessment_id = e.id and (f.assessment_candidate_id = c.id or f.assessment_candidate_id is null)), '[]'::jsonb),
    'company_id', e.company_id, 'month', v_month);
end $$;

-- Si la IA falla, se devuelve el cupo
create or replace function public.eval_ai_release(p_company uuid, p_month date) returns void
language sql security definer set search_path = public as $$
  update report_usage set reports = greatest(reports - 1, 0) where company_id = p_company and month = p_month $$;

create or replace function public.eval_ai_store(p_user uuid, p_cand uuid, p_sections jsonb, p_model text, p_in int, p_out int, p_cost numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_company uuid;
begin
  select e.company_id into v_company from assessment_candidates c join assessments e on e.id = c.assessment_id where c.id = p_cand;
  insert into assessment_reports (assessment_candidate_id, version, sections, model, input_tokens, output_tokens, cost_usd, created_by)
  values (p_cand, coalesce((select max(version) from assessment_reports where assessment_candidate_id = p_cand), 0) + 1, p_sections, left(p_model, 60), p_in, p_out, p_cost, p_user)
  returning id into v_id;
  update report_usage set input_tokens = input_tokens + p_in, output_tokens = output_tokens + p_out, cost_usd = cost_usd + p_cost
   where company_id = v_company and month = report_month();
  return v_id;
end $$;

create or replace function public.eval_ai_store_section(p_user uuid, p_cand uuid, p_key text, p_value jsonb, p_in int, p_out int, p_cost numeric) returns void
language plpgsql security definer set search_path = public as $$
declare r assessment_reports; v_company uuid;
begin
  select * into r from assessment_reports where assessment_candidate_id = p_cand and status = 'borrador' order by version desc limit 1 for update;
  if r.id is null then raise exception 'Primero genera el informe'; end if;
  select e.company_id into v_company from assessment_candidates c join assessments e on e.id = c.assessment_id where c.id = p_cand;
  update assessment_reports set sections = jsonb_set(sections, array[p_key], p_value, true), edited_by = p_user, edited_at = now(),
         input_tokens = input_tokens + p_in, output_tokens = output_tokens + p_out, cost_usd = cost_usd + p_cost where id = r.id;
  update report_usage set input_tokens = input_tokens + p_in, output_tokens = output_tokens + p_out, cost_usd = cost_usd + p_cost
   where company_id = v_company and month = report_month();
end $$;

-- ───────── Administración: consumo y límites (sin contenido de informes) ─────────
create or replace function public.admin_report_usage(p_months int default 3) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  return jsonb_build_object(
    'plans', (select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'report_monthly', report_monthly, 'audio_minutes_monthly', audio_minutes_monthly) order by sort) from plans),
    'usage', coalesce((select jsonb_agg(jsonb_build_object('company', co.display_name, 'month', u.month, 'reports', u.reports, 'sections', u.sections,
        'cost_usd', u.cost_usd, 'plan', (plan_of(u.company_id)).name) order by u.month desc, u.cost_usd desc)
      from report_usage u join companies co on co.id = u.company_id where u.month >= (report_month() - make_interval(months => greatest(p_months, 1) - 1))::date), '[]'::jsonb),
    'totals', (select jsonb_build_object('reports', coalesce(sum(reports), 0), 'cost_usd', coalesce(sum(cost_usd), 0)) from report_usage where month = report_month()));
end $$;

create or replace function public.admin_set_report_limit(p_plan text, p_reports int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  if p_reports < 0 or p_reports > 10000 then raise exception 'Valor no válido'; end if;
  update plans set report_monthly = p_reports where id = p_plan;
  if not found then raise exception 'Plan no encontrado'; end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'report_limit_set', 'plan', null, jsonb_build_object('plan', p_plan, 'reports', p_reports));
end $$;

-- ───────── Conservación ─────────
-- Los archivos físicos sin registro los borra «cleanup-files» (se agrega el espacio «evaluaciones»).
do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.orphan_storage_objects(interval,integer)'::regprocedure);
  if strpos(d, '''evaluaciones''') > 0 then return; end if;
  n := replace(d, 'union all select ''asesorias'', file_path from public.service_messages where file_path is not null)',
                  'union all select ''asesorias'', file_path from public.service_messages where file_path is not null' || chr(10) ||
                  '    union all select ''evaluaciones'', path from public.assessment_files where path is not null)');
  n := replace(n, 'where o.bucket_id in (''videos'', ''cvs'', ''logos'', ''company-photos'', ''asesorias'')',
                  'where o.bucket_id in (''videos'', ''cvs'', ''logos'', ''company-photos'', ''asesorias'', ''evaluaciones'')');
  if (length(n) - length(replace(n, '''evaluaciones''', ''))) / length('''evaluaciones''') <> 2 then
    raise exception 'orphan_storage_objects: no se encontraron los puntos a modificar'; end if;
  execute n;
end $m$;

-- Archivos de respaldo: 12 meses desde la creación de la evaluación. Evaluaciones cerradas: 12 meses desde el cierre.
create or replace function public.eval_purge() returns jsonb
language plpgsql security definer set search_path = public as $$
declare a int; b int;
begin
  delete from assessment_files f using assessments e where e.id = f.assessment_id and e.created_at < now() - interval '12 months';
  get diagnostics a = row_count;
  delete from assessments where status = 'cerrada' and closed_at < now() - interval '12 months';
  get diagnostics b = row_count;
  return jsonb_build_object('files', a, 'assessments', b);
end $$;
do $cron$ begin perform cron.unschedule('vinka-informes-conservacion'); exception when others then null; end $cron$;
select cron.schedule('vinka-informes-conservacion', '29 7 * * *', $$select public.eval_purge()$$);

-- ───────── Permisos de ejecución ─────────
do $g$
declare f text;
begin
  foreach f in array array['eval_ai_begin(uuid, uuid, text)', 'eval_ai_release(uuid, date)', 'eval_ai_store(uuid, uuid, jsonb, text, integer, integer, numeric)',
    'eval_ai_store_section(uuid, uuid, text, jsonb, integer, integer, numeric)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array['eval_purge()', 'eval_latest_report(uuid, boolean)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['eval_can_manage(uuid)', 'eval_can_view(uuid)', 'my_report_usage(uuid)', 'eval_create(uuid, text, text, text, uuid)', 'eval_update(uuid, text, text, text)',
    'eval_set_status(uuid, boolean)', 'eval_delete(uuid)', 'eval_list(uuid)', 'eval_detail(uuid)', 'eval_for_applicant(uuid, uuid)', 'eval_add_candidate(uuid, text, text)',
    'eval_remove_candidate(uuid)', 'eval_set_consent(uuid)', 'eval_add_file(uuid, uuid, text, text, text, text, bigint, text)', 'eval_delete_file(uuid)',
    'eval_report_save(uuid, jsonb)', 'eval_report_finalize(uuid, boolean)', 'admin_report_usage(integer)', 'admin_set_report_limit(text, integer)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $g$;
