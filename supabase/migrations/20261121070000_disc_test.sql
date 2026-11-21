-- Test DISC propio de VINKA (sin cámara). Cuestionario original de 24 bloques de 4 palabras: la persona elige la que «más» y la que
-- «menos» la describe. Se responde con un enlace de un solo uso, sin cuenta. El puntaje y los indicadores de integridad se calculan aquí,
-- en la base; la persona no ve resultados. El reporte lo redacta la IA (función «evaluation-report», modo «disc»).
-- Mide estilo de comportamiento, no capacidad: el reporte lo dice y el informe psicolaboral lo usa solo como apoyo.
create schema if not exists backup;
create table if not exists backup.fn_eval_ai_begin_20261121 as select now() saved_at, pg_get_functiondef('public.eval_ai_begin(uuid,uuid,text)'::regprocedure) def;
create table if not exists backup.fn_eval_detail_20261121b as select now() saved_at, pg_get_functiondef('public.eval_detail(uuid)'::regprocedure) def;

-- ───────── Límite mensual de reportes DISC por plan ─────────
alter table public.plans add column if not exists disc_monthly int not null default 0;
update public.plans set disc_monthly = v.n from (values ('gratis', 5), ('pyme', 30), ('equipo', 90), ('consultora', 240), ('asesor', 90), ('empresa', 600)) v(id, n)
 where plans.id = v.id and plans.disc_monthly = 0;
alter table public.report_usage add column if not exists disc_reports int not null default 0;

-- ───────── Cuestionario (texto propio de VINKA) ─────────
create table if not exists public.disc_items (
  block int primary key check (block between 1 and 24),
  words text[] not null check (array_length(words, 1) = 4),
  factors text[] not null check (array_length(factors, 1) = 4)
);
insert into public.disc_items (block, words, factors) values
 (1,  array['Paciente','Decidido','Preciso','Entusiasta'],        array['S','D','C','I']),
 (2,  array['Sociable','Ordenado','Directo','Tranquilo'],         array['I','C','D','S']),
 (3,  array['Cuidadoso','Leal','Persuasivo','Competitivo'],       array['C','S','I','D']),
 (4,  array['Arriesgado','Analítico','Constante','Optimista'],    array['D','C','S','I']),
 (5,  array['Expresivo','Firme','Metódico','Colaborador'],        array['I','D','C','S']),
 (6,  array['Comprensivo','Detallista','Conversador','Exigente'], array['S','C','I','D']),
 (7,  array['Riguroso','Audaz','Sereno','Encantador'],            array['C','D','S','I']),
 (8,  array['Animado','Amable','Resuelto','Perfeccionista'],      array['I','S','D','C']),
 (9,  array['Prudente','Espontáneo','Independiente','Confiable'], array['C','I','D','S']),
 (10, array['Considerado','Enérgico','Inspirador','Exacto'],      array['S','D','I','C']),
 (11, array['Sistemático','Carismático','Servicial','Insistente'],array['C','I','S','D']),
 (12, array['Ambicioso','Estable','Lógico','Alegre'],             array['D','S','C','I']),
 (13, array['Popular','Reservado','Dominante','Tolerante'],       array['I','C','D','S']),
 (14, array['Calmado','Emprendedor','Cauteloso','Extrovertido'],  array['S','D','C','I']),
 (15, array['Diplomático','Amistoso','Valiente','Predecible'],    array['C','I','D','S']),
 (16, array['Atento','Tenaz','Divertido','Correcto'],             array['S','D','I','C']),
 (17, array['Objetivo','Moderado','Abierto','Seguro'],            array['C','S','I','D']),
 (18, array['Rápido','Minucioso','Armonioso','Convincente'],      array['D','C','S','I']),
 (19, array['Positivo','Generoso','Disciplinado','Desafiante'],   array['I','S','C','D']),
 (20, array['Formal','Determinado','Bondadoso','Influyente'],     array['C','D','S','I']),
 (21, array['Comunicativo','Pacífico','Pionero','Racional'],      array['I','S','D','C']),
 (22, array['Cumplidor','Cooperador','Motivador','Autónomo'],     array['C','S','I','D']),
 (23, array['Simpático','Franco','Estructurado','Sensato'],       array['I','D','C','S']),
 (24, array['Apacible','Concienzudo','Líder','Elocuente'],        array['S','C','D','I'])
on conflict (block) do nothing;

-- ───────── Tests ─────────
create table if not exists public.disc_tests (
  id uuid primary key default gen_random_uuid(),
  assessment_candidate_id uuid not null references public.assessment_candidates(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'enviado' check (status in ('enviado', 'en_curso', 'completado', 'anulado')),
  expires_at timestamptz not null default now() + interval '7 days',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  consent_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  session_id uuid,
  other_sessions int not null default 0,
  answers jsonb not null default '{}'::jsonb,   -- {"1": {"m": 0, "l": 2, "t": "2026-…"}, …} (índices de la palabra elegida)
  scores jsonb,                                 -- natural, adaptado, compuesto (0–100, 50 = promedio), factor principal y perfil
  integrity jsonb,
  report jsonb,
  report_model text not null default '',
  report_cost numeric(10, 4) not null default 0,
  report_at timestamptz
);
create unique index if not exists disc_tests_one_active on public.disc_tests (assessment_candidate_id) where status <> 'anulado';
create index if not exists idx_disc_tests_created_by on public.disc_tests (created_by);
alter table public.disc_items enable row level security;
alter table public.disc_tests enable row level security;
revoke all on public.disc_items, public.disc_tests from anon, authenticated;

create or replace function public.disc_hash(p_token text) returns text language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') $$;

-- Crea (o renueva) el enlace del test de una persona. Devuelve el enlace secreto: solo se muestra en ese momento.
create or replace function public.disc_create(p_cand uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c assessment_candidates; t disc_tests; v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  select * into c from assessment_candidates where id = p_cand;
  if c.id is null or not eval_can_manage(c.assessment_id) then raise exception 'Sin permiso'; end if;
  if (select status from assessments where id = c.assessment_id) = 'cerrada' then raise exception 'La evaluación está cerrada'; end if;
  if c.consent_at is null then raise exception 'Primero confirma que la persona autorizó la evaluación'; end if;
  select * into t from disc_tests where assessment_candidate_id = p_cand and status <> 'anulado';
  if t.status = 'completado' then raise exception 'Esta persona ya respondió el test'; end if;
  if t.id is null then
    insert into disc_tests (assessment_candidate_id, token_hash, created_by) values (p_cand, disc_hash(v_token), auth.uid()) returning * into t;
  else
    update disc_tests set token_hash = disc_hash(v_token), expires_at = now() + interval '7 days' where id = t.id returning * into t;
  end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'disc_link', 'evaluation', c.assessment_id, jsonb_build_object('test', t.id));
  return jsonb_build_object('id', t.id, 'token', v_token, 'expires_at', t.expires_at);
end $$;

create or replace function public.disc_cancel(p_test uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_eval uuid;
begin
  select c.assessment_id into v_eval from disc_tests t join assessment_candidates c on c.id = t.assessment_candidate_id where t.id = p_test;
  if v_eval is null or not eval_can_manage(v_eval) then raise exception 'Sin permiso'; end if;
  update disc_tests set status = 'anulado' where id = p_test;
end $$;

-- ───────── Para quien responde (con el enlace, sin cuenta) ─────────
create or replace function public.disc_open(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t disc_tests; c assessment_candidates; e assessments;
begin
  select * into t from disc_tests where token_hash = disc_hash(p_token) and status <> 'anulado';
  if t.id is null then return jsonb_build_object('status', 'no_existe'); end if;
  if t.status = 'completado' then return jsonb_build_object('status', 'completado'); end if;
  if t.expires_at < now() then return jsonb_build_object('status', 'vencido'); end if;
  select * into c from assessment_candidates where id = t.assessment_candidate_id;
  select * into e from assessments where id = c.assessment_id;
  return jsonb_build_object('status', t.status, 'name', split_part(c.full_name, ' ', 1), 'title', e.title,
    'company', (select display_name from companies where id = e.company_id), 'consent', t.consent_at is not null,
    'answered', (select coalesce(jsonb_agg(k::int), '[]'::jsonb) from jsonb_object_keys(t.answers) k),
    'blocks', (select jsonb_agg(jsonb_build_object('block', block, 'words', words) order by block) from disc_items));
end $$;

create or replace function public.disc_begin(p_token text, p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t disc_tests;
begin
  select * into t from disc_tests where token_hash = disc_hash(p_token) and status in ('enviado', 'en_curso') and expires_at > now() for update;
  if t.id is null then raise exception 'El enlace ya no es válido'; end if;
  if p_session is null then raise exception 'Sesión no válida'; end if;
  if t.session_id is null then
    update disc_tests set status = 'en_curso', consent_at = now(), started_at = now(), session_id = p_session where id = t.id;
  elsif t.session_id <> p_session then
    update disc_tests set other_sessions = other_sessions + 1, session_id = p_session where id = t.id;
  end if;
end $$;

create or replace function public.disc_answer(p_token text, p_session uuid, p_block int, p_most int, p_least int) returns void
language plpgsql security definer set search_path = public as $$
declare t disc_tests;
begin
  select * into t from disc_tests where token_hash = disc_hash(p_token) and status = 'en_curso' and expires_at > now() for update;
  if t.id is null then raise exception 'El enlace ya no es válido'; end if;
  if t.session_id is distinct from p_session then raise exception 'El test se abrió en otro dispositivo. Vuelve a abrir el enlace.'; end if;
  if p_block not between 1 and 24 or p_most not between 0 and 3 or p_least not between 0 and 3 or p_most = p_least then raise exception 'Respuesta no válida'; end if;
  update disc_tests set answers = answers || jsonb_build_object(p_block::text, jsonb_build_object('m', p_most, 'l', p_least, 't', now())) where id = t.id;
end $$;

-- Calcula el puntaje: «más» = estilo adaptado; «menos» (invertido) = estilo natural. Escala 0–100 donde 50 es el promedio esperado.
create or replace function public.disc_score(p_answers jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare f text; m int; l int; nat jsonb := '{}'; ada jsonb := '{}'; comp jsonb := '{}'; top text; topn text; v int; best int := -1; bestn int := -1; sec text := '';
begin
  foreach f in array array['D', 'I', 'S', 'C'] loop
    select count(*) filter (where i.factors[(a.value->>'m')::int + 1] = f), count(*) filter (where i.factors[(a.value->>'l')::int + 1] = f)
      into m, l from jsonb_each(p_answers) a join disc_items i on i.block = a.key::int;
    ada := ada || jsonb_build_object(f, least(100, round(m * 100.0 / 12)));
    nat := nat || jsonb_build_object(f, greatest(0, least(100, round((12 - l) * 100.0 / 12))));
    v := round(((least(100, m * 100.0 / 12)) + greatest(0, least(100, (12 - l) * 100.0 / 12))) / 2);
    comp := comp || jsonb_build_object(f, v);
    if v > best then best := v; top := f; end if;
    if (nat->>f)::int > bestn then bestn := (nat->>f)::int; topn := f; end if;
  end loop;
  foreach f in array array['D', 'I', 'S', 'C'] loop
    if f <> top and (comp->>f)::int >= 55 and (comp->>f)::int >= best - 15 then sec := f; exit; end if;
  end loop;
  return jsonb_build_object('natural', nat, 'adaptado', ada, 'compuesto', comp, 'principal', top, 'secundario', nullif(sec, ''), 'bajo_presion', topn,
    'perfil', top || coalesce(nullif(sec, ''), ''));
end $$;

create or replace function public.disc_submit(p_token text, p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t disc_tests; v_n int; v_min numeric; v_gap numeric; v_pos int; v_int jsonb;
begin
  select * into t from disc_tests where token_hash = disc_hash(p_token) and status = 'en_curso' and expires_at > now() for update;
  if t.id is null then raise exception 'El enlace ya no es válido'; end if;
  if t.session_id is distinct from p_session then raise exception 'El test se abrió en otro dispositivo. Vuelve a abrir el enlace.'; end if;
  select count(*) into v_n from jsonb_object_keys(t.answers);
  if v_n < 24 then raise exception 'Faltan % bloques por responder', 24 - v_n; end if;
  v_min := extract(epoch from now() - t.started_at) / 60;
  select coalesce(max(extract(epoch from d) / 60), 0) into v_gap from (
    select (x.value->>'t')::timestamptz - lag((x.value->>'t')::timestamptz) over (order by (x.value->>'t')::timestamptz) d from jsonb_each(t.answers) x) g;
  select coalesce(max(n), 0) into v_pos from (select count(*) n from jsonb_each(t.answers) x group by x.value->>'m') p;
  v_int := jsonb_build_object(
    'minutos', round(v_min, 1),
    'tiempo_valido', v_min >= 4 and v_min <= 60,
    'sin_interrupciones', v_gap <= 10,
    'pausa_mas_larga_min', round(v_gap, 1),
    'un_dispositivo', t.other_sessions = 0,
    'otros_dispositivos', t.other_sessions,
    'sin_patron_repetitivo', v_pos <= 14);
  update disc_tests set status = 'completado', completed_at = now(), scores = disc_score(t.answers), integrity = v_int where id = t.id;
end $$;

-- ───────── Reporte con IA (servidor) ─────────
create or replace function public.disc_ai_begin(p_user uuid, p_test uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t disc_tests; c assessment_candidates; e assessments; v_plan plans; v_ok boolean; v_month date := report_month();
begin
  select * into t from disc_tests where id = p_test;
  select * into c from assessment_candidates where id = t.assessment_candidate_id;
  select * into e from assessments where id = c.assessment_id;
  if t.id is null then raise exception 'Test no encontrado'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  if not can_manage(e.company_id) then raise exception 'Solo administradores o reclutadores de la empresa pueden generar el reporte'; end if;
  if t.status <> 'completado' then raise exception 'La persona aún no termina el test'; end if;
  v_plan := plan_of(e.company_id);
  insert into report_usage (company_id, month) values (e.company_id, v_month) on conflict do nothing;
  update report_usage set disc_reports = disc_reports + 1 where company_id = e.company_id and month = v_month and disc_reports < v_plan.disc_monthly returning true into v_ok;
  if not coalesce(v_ok, false) then
    raise exception 'Tu plan % permite % reportes DISC al mes y ya se usaron todos.', v_plan.name, v_plan.disc_monthly; end if;
  return jsonb_build_object('title', e.title, 'job_profile', e.job_profile, 'name', c.full_name, 'scores', t.scores, 'integrity', t.integrity,
    'company_id', e.company_id, 'month', v_month);
end $$;

create or replace function public.disc_ai_release(p_company uuid, p_month date) returns void
language sql security definer set search_path = public as $$
  update report_usage set disc_reports = greatest(disc_reports - 1, 0) where company_id = p_company and month = p_month $$;

create or replace function public.disc_ai_store(p_test uuid, p_report jsonb, p_model text, p_in int, p_out int, p_cost numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v_company uuid;
begin
  select e.company_id into v_company from disc_tests t join assessment_candidates c on c.id = t.assessment_candidate_id join assessments e on e.id = c.assessment_id where t.id = p_test;
  update disc_tests set report = p_report, report_model = left(p_model, 60), report_cost = p_cost, report_at = now() where id = p_test;
  update report_usage set input_tokens = input_tokens + p_in, output_tokens = output_tokens + p_out, cost_usd = cost_usd + p_cost
   where company_id = v_company and month = report_month();
end $$;

-- Resumen del test para la ficha de la persona (quien gestiona: todo; quien solo ve: si el informe de la persona está cerrado)
create or replace function public.disc_summary(p_cand uuid, p_mng boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when t.id is null then null
    when not p_mng and not exists (select 1 from assessment_reports r where r.assessment_candidate_id = p_cand and r.status = 'final') then null
    when not p_mng and t.status <> 'completado' then null
    else jsonb_build_object('id', t.id, 'status', case when t.status in ('enviado', 'en_curso') and t.expires_at < now() then 'vencido' else t.status end,
      'created_at', t.created_at, 'expires_at', t.expires_at, 'started_at', t.started_at, 'completed_at', t.completed_at,
      'progress', (select count(*) from jsonb_object_keys(t.answers)), 'scores', t.scores, 'integrity', t.integrity, 'report', t.report, 'report_at', t.report_at) end
  from (select 1) one left join lateral (select * from disc_tests where assessment_candidate_id = p_cand and status <> 'anulado' order by created_at desc limit 1) t on true $$;

-- eval_detail: igual que antes + «disc» por persona
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
        'disc', disc_summary(c.id, mng),
        'report', eval_latest_report(c.id, not mng)) order by c.created_at)
      from assessment_candidates c where c.assessment_id = e.id), '[]'::jsonb));
end $$;

-- eval_ai_begin: además de los archivos, entrega el resultado del test DISC (si está completo) como un documento más para el informe
do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.eval_ai_begin(uuid,uuid,text)'::regprocedure);
  if strpos(d, 'disc_tests') > 0 then return; end if;
  n := replace(d,
    'from assessment_files f where f.assessment_id = e.id and (f.assessment_candidate_id = c.id or f.assessment_candidate_id is null)), ''[]''::jsonb),',
    'from assessment_files f where f.assessment_id = e.id and (f.assessment_candidate_id = c.id or f.assessment_candidate_id is null)), ''[]''::jsonb)' || chr(10) ||
    '      || coalesce((select jsonb_build_array(jsonb_build_object(''id'', t.id, ''kind'', ''test'', ''name'', ''Test DISC VINKA'', ''path'', null, ''mime'', ''text/plain'',' || chr(10) ||
    '           ''text'', ''Resultado del test DISC VINKA (escala 0 a 100, 50 = promedio). Puntajes: '' || t.scores::text || ''. Integridad: '' || t.integrity::text ||' || chr(10) ||
    '           coalesce(''. Reporte: '' || (t.report - ''preguntas'')::text, ''''))) from disc_tests t where t.assessment_candidate_id = c.id and t.status = ''completado''), ''[]''::jsonb),');
  if n = d then raise exception 'eval_ai_begin: no se encontró el punto a modificar'; end if;
  -- un test DISC completo cuenta como documento de la persona
  n := replace(n, 'if not exists (select 1 from assessment_files where assessment_candidate_id = c.id) then',
    'if not exists (select 1 from assessment_files where assessment_candidate_id = c.id) and not exists (select 1 from disc_tests where assessment_candidate_id = c.id and status = ''completado'') then');
  execute n;
end $m$;

-- Conservación: los tests sin responder vencen solos (7 días); se borran con la persona o la evaluación.

-- ───────── Permisos de ejecución ─────────
do $g$
declare f text;
begin
  foreach f in array array['disc_ai_begin(uuid, uuid)', 'disc_ai_release(uuid, date)', 'disc_ai_store(uuid, jsonb, text, integer, integer, numeric)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array['disc_summary(uuid, boolean)', 'disc_score(jsonb)', 'disc_hash(text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['disc_open(text)', 'disc_begin(text, uuid)', 'disc_answer(text, uuid, integer, integer, integer)', 'disc_submit(text, uuid)'] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
  foreach f in array array['disc_create(uuid)', 'disc_cancel(uuid)', 'eval_detail(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $g$;
