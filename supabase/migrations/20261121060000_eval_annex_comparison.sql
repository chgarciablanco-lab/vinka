-- Informes psicolaborales: (a) los reportes de test se conservan al cerrar la evaluación, para adjuntarlos como anexo del PDF;
-- (b) informe comparativo de las personas de una evaluación, redactado por la IA a partir de sus informes.
-- Respaldos de las dos funciones que cambian.
create schema if not exists backup;
create table if not exists backup.fn_eval_set_status_20261121 as select now() saved_at, pg_get_functiondef('public.eval_set_status(uuid,boolean)'::regprocedure) def;
create table if not exists backup.fn_eval_detail_20261121 as select now() saved_at, pg_get_functiondef('public.eval_detail(uuid)'::regprocedure) def;

-- ───────── (a) Al cerrar, se borran los archivos de respaldo salvo los reportes de test (quedan hasta la limpieza de 12 meses) ─────────
create or replace function public.eval_set_status(p_eval uuid, p_closed boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not eval_can_manage(p_eval) then raise exception 'Sin permiso'; end if;
  update assessments set status = case when p_closed then 'cerrada' else 'abierta' end, closed_at = case when p_closed then now() end where id = p_eval;
  if p_closed then delete from assessment_files where assessment_id = p_eval and kind <> 'test'; end if;
end $$;

-- ───────── (b) Comparativo ─────────
create table if not exists public.assessment_comparisons (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  version int not null,
  status text not null default 'borrador' check (status in ('borrador', 'final')),
  content jsonb not null default '{}'::jsonb,
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
  unique (assessment_id, version)
);
create index if not exists idx_assessment_comparisons_created_by on public.assessment_comparisons (created_by);
create index if not exists idx_assessment_comparisons_edited_by on public.assessment_comparisons (edited_by);
create index if not exists idx_assessment_comparisons_finalized_by on public.assessment_comparisons (finalized_by);
alter table public.assessment_comparisons enable row level security;
revoke all on public.assessment_comparisons from anon, authenticated;

create or replace function public.eval_latest_comparison(p_eval uuid, p_finals_only boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(x) from (
    select c.id, c.version, c.status, c.content, c.created_at, c.edited_at, c.finalized_at,
           short_name(c.edited_by) edited_by_name, short_name(c.finalized_by) finalized_by_name
    from assessment_comparisons c where c.assessment_id = p_eval and (not p_finals_only or c.status = 'final')
    order by c.version desc limit 1) x $$;

-- eval_detail: igual que antes + «comparison» (quien gestiona: el último; quien solo ve: el último cerrado)
create or replace function public.eval_detail(p_eval uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e assessments; mng boolean;
begin
  select * into e from assessments where id = p_eval;
  if e.id is null or not eval_can_view(p_eval) then raise exception 'Evaluación no encontrada'; end if;
  mng := can_manage(e.company_id);
  return jsonb_build_object(
    'id', e.id, 'title', e.title, 'client_name', e.client_name, 'job_id', e.job_id, 'status', e.status, 'company_id', e.company_id,
    'company', (select display_name from companies where id = e.company_id), 'company_logo', (select logo_path from companies where id = e.company_id),
    'job_profile', case when mng then e.job_profile else '' end,
    'can_manage', mng, 'created_at', e.created_at, 'usage', my_report_usage(e.company_id),
    'comparison', eval_latest_comparison(e.id, not mng),
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

-- Para la función de servidor: valida, reserva un informe del cupo y entrega los informes de cada persona (sin la nota interna «faltantes»)
create or replace function public.eval_compare_begin(p_user uuid, p_eval uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e assessments; v_plan plans; v_ok boolean; v_month date := report_month(); v_people jsonb;
begin
  select * into e from assessments where id = p_eval;
  if e.id is null then raise exception 'Evaluación no encontrada'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  if not can_manage(e.company_id) then raise exception 'Solo administradores o reclutadores de la empresa pueden generar el comparativo'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('nombre', c.full_name, 'estado', r.status, 'informe', r.sections - 'faltantes') order by c.created_at), '[]'::jsonb)
    into v_people
    from assessment_candidates c
    join lateral (select status, sections from assessment_reports where assessment_candidate_id = c.id order by version desc limit 1) r on true
   where c.assessment_id = p_eval;
  if jsonb_array_length(v_people) < 2 then raise exception 'Se necesitan al menos 2 personas con informe para comparar'; end if;
  if jsonb_array_length(v_people) > 15 then raise exception 'El comparativo admite hasta 15 personas'; end if;
  v_plan := plan_of(e.company_id);
  insert into report_usage (company_id, month) values (e.company_id, v_month) on conflict do nothing;
  update report_usage set reports = reports + 1 where company_id = e.company_id and month = v_month and reports < v_plan.report_monthly returning true into v_ok;
  if not coalesce(v_ok, false) then
    raise exception 'Tu plan % permite % informes al mes y ya se usaron todos. Podrás generar más el próximo mes.', v_plan.name, v_plan.report_monthly; end if;
  return jsonb_build_object('evaluation', jsonb_build_object('title', e.title, 'client_name', e.client_name, 'job_profile', e.job_profile,
      'company', (select display_name from companies where id = e.company_id)),
    'people', v_people, 'company_id', e.company_id, 'month', v_month);
end $$;

create or replace function public.eval_compare_store(p_user uuid, p_eval uuid, p_content jsonb, p_model text, p_in int, p_out int, p_cost numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_company uuid;
begin
  select company_id into v_company from assessments where id = p_eval;
  insert into assessment_comparisons (assessment_id, version, content, model, input_tokens, output_tokens, cost_usd, created_by)
  values (p_eval, coalesce((select max(version) from assessment_comparisons where assessment_id = p_eval), 0) + 1, p_content, left(p_model, 60), p_in, p_out, p_cost, p_user)
  returning id into v_id;
  update report_usage set input_tokens = input_tokens + p_in, output_tokens = output_tokens + p_out, cost_usd = cost_usd + p_cost
   where company_id = v_company and month = report_month();
  return v_id;
end $$;

create or replace function public.eval_compare_save(p_cmp uuid, p_content jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare c assessment_comparisons;
begin
  select * into c from assessment_comparisons where id = p_cmp;
  if c.id is null or not eval_can_manage(c.assessment_id) then raise exception 'Sin permiso'; end if;
  if c.status <> 'borrador' then raise exception 'El comparativo está cerrado. Reábrelo para editarlo.'; end if;
  if jsonb_typeof(p_content) <> 'object' or octet_length(p_content::text) > 120000 then raise exception 'Contenido no válido'; end if;
  update assessment_comparisons set content = p_content, edited_by = auth.uid(), edited_at = now() where id = p_cmp;
end $$;

create or replace function public.eval_compare_finalize(p_cmp uuid, p_final boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c assessment_comparisons;
begin
  select * into c from assessment_comparisons where id = p_cmp;
  if c.id is null or not eval_can_manage(c.assessment_id) then raise exception 'Sin permiso'; end if;
  update assessment_comparisons set status = case when p_final then 'final' else 'borrador' end,
         finalized_by = case when p_final then auth.uid() end, finalized_at = case when p_final then now() end where id = p_cmp;
  insert into audit_logs (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), case when p_final then 'comparison_finalized' else 'comparison_reopened' end, 'evaluation', c.assessment_id, jsonb_build_object('comparison', p_cmp));
end $$;

-- ───────── Permisos de ejecución ─────────
do $g$
declare f text;
begin
  foreach f in array array['eval_compare_begin(uuid, uuid)', 'eval_compare_store(uuid, uuid, jsonb, text, integer, integer, numeric)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  execute 'revoke execute on function public.eval_latest_comparison(uuid, boolean) from public, anon, authenticated';
  foreach f in array array['eval_compare_save(uuid, jsonb)', 'eval_compare_finalize(uuid, boolean)', 'eval_set_status(uuid, boolean)', 'eval_detail(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $g$;
