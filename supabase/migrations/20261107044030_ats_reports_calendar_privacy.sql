-- Migración aplicada en Supabase (20261107044030). Exportada tal cual desde supabase_migrations.schema_migrations.

-- ===== Reportes =====
create or replace function stage_rank(s text) returns int language sql immutable as $$
  select case s when 'match' then 0 when 'nuevo' then 0 when 'contacto' then 1 when 'contactado' then 1 when 'entrevista' then 2 when 'oferta' then 3 when 'contratado' then 4 else -1 end $$;

create or replace function company_report(p_company uuid, p_days int default 90) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := case when p_days is null or p_days <= 0 then '-infinity'::timestamptz else now() - make_interval(days => p_days) end;
        res jsonb;
begin
  if not is_company_member(p_company) then raise exception 'Sin acceso'; end if;
  with mx as (
    select m.*, greatest(case when m.stage = 'descartado' then -1 else stage_rank(m.stage) end,
      coalesce((select max(stage_rank(e.detail->>'to')) from pipeline_events e where e.job_id = m.job_id and e.candidate_id = m.candidate_id and e.kind = 'stage'), 0)) mr
    from matches m where m.company_id = p_company and m.created_at >= since
  ), ex as (
    select e.*, greatest(case when e.stage = 'descartado' then -1 else stage_rank(e.stage) end,
      coalesce((select max(stage_rank(pe.detail->>'to')) from pipeline_events pe where pe.external_id = e.id and pe.kind = 'stage'), 0)) mr
    from external_applicants e where e.company_id = p_company and e.created_at >= since
  ), per_job as (
    select j.id, j.title, j.status, j.created_at,
      (select count(*) from job_views v where v.job_id = j.id and v.created_at >= since) views,
      (select count(*) from candidate_job_actions a where a.job_id = j.id and a.action = 'interest' and a.created_at >= since) applied,
      (select count(*) from mx where mx.job_id = j.id) matches,
      (select count(*) from mx where mx.job_id = j.id and mx.mr >= 1) + (select count(*) from ex where ex.job_id = j.id and ex.mr >= 1) contacted,
      (select count(*) from mx where mx.job_id = j.id and mx.mr >= 2) + (select count(*) from ex where ex.job_id = j.id and ex.mr >= 2) interviewed,
      (select count(*) from mx where mx.job_id = j.id and mx.mr >= 3) + (select count(*) from ex where ex.job_id = j.id and ex.mr >= 3) offered,
      (select count(*) from mx where mx.job_id = j.id and mx.stage = 'contratado') + (select count(*) from ex where ex.job_id = j.id and ex.stage = 'contratado') hired,
      (select count(*) from mx where mx.job_id = j.id and mx.stage = 'descartado') + (select count(*) from ex where ex.job_id = j.id and ex.stage = 'descartado') rejected,
      (select count(*) from ex where ex.job_id = j.id) externals,
      (select round(avg(extract(epoch from (mx.hired_at - mx.created_at)) / 86400)::numeric, 1) from mx where mx.job_id = j.id and mx.hired_at is not null) days_to_hire,
      (select count(*) from offers o where o.job_id = j.id and o.created_at >= since) offers_sent,
      (select count(*) from offers o where o.job_id = j.id and o.status = 'aceptada' and o.created_at >= since) offers_accepted
    from jobs j where j.company_id = p_company and j.status <> 'draft'
  ), src as (
    select 'VINKA' source, count(*) total, count(*) filter (where stage = 'contratado') hired from mx
    union all
    select coalesce(nullif(source, ''), 'Otro portal'), count(*), count(*) filter (where stage = 'contratado') from ex group by 1
  )
  select jsonb_build_object(
    'days', p_days,
    'jobs', coalesce((select jsonb_agg(to_jsonb(pj) order by pj.created_at desc) from per_job pj), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(to_jsonb(s) order by s.total desc) from src s where s.total > 0), '[]'::jsonb),
    'days_to_hire', (select round(avg(extract(epoch from (hired_at - created_at)) / 86400)::numeric, 1) from mx where hired_at is not null),
    'days_to_first_step', (select round(avg(extract(epoch from (e.created_at - mx.created_at)) / 86400)::numeric, 1) from mx
        join lateral (select created_at from pipeline_events pe where pe.job_id = mx.job_id and pe.candidate_id = mx.candidate_id and pe.kind = 'stage' order by created_at limit 1) e on true)
  ) into res;
  return res;
end $$;

-- ===== Calendario suscribible (Google, Outlook, iPhone) =====
alter table profiles add column if not exists calendar_token uuid not null default gen_random_uuid();
create unique index if not exists profiles_calendar_token on profiles (calendar_token);

create or replace function my_calendar_token() returns uuid language sql stable security definer set search_path = public as
$$ select calendar_token from profiles where id = auth.uid() $$;
create or replace function reset_calendar_token() returns uuid language sql security definer set search_path = public as
$$ update profiles set calendar_token = gen_random_uuid() where id = auth.uid() returning calendar_token $$;

create or replace function calendar_feed(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid; r text;
begin
  select id, role into uid, r from profiles where calendar_token = p_token;
  if uid is null then return null; end if;
  return jsonb_build_object('role', r, 'events', coalesce((
    select jsonb_agg(jsonb_build_object('id', i.id, 'starts_at', i.starts_at, 'ends_at', i.ends_at, 'mode', i.mode, 'status', i.status,
      'meeting_url', i.meeting_url, 'address', trim(concat_ws(', ', nullif(i.address,''), nullif(i.comuna,''))), 'notes', i.notes,
      'job', j.title, 'company', co.display_name, 'candidate', trim(p.first_name || ' ' || p.last_name), 'match_id', i.match_id, 'created_at', i.created_at))
    from interviews i join jobs j on j.id = i.job_id join companies co on co.id = i.company_id join profiles p on p.id = i.candidate_id
    where i.starts_at > now() - interval '60 days'
      and (i.candidate_id = uid or exists (select 1 from company_members cm where cm.company_id = i.company_id and cm.user_id = uid))), '[]'::jsonb));
end $$;

-- ===== Ley 21.719: descarga de datos personales =====
create or replace function export_my_data() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
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
    'uso_asistente_ia', coalesce((select jsonb_agg(to_jsonb(u) - 'user_id') from ai_usage u where user_id = uid), '[]'::jsonb)
  );
end $$;

-- ===== Conservación de datos: se eliminan procesos cerrados hace más de 12 meses =====
create or replace function purge_old_data() returns jsonb
language plpgsql security definer set search_path = public as $$
declare cutoff timestamptz := now() - interval '12 months'; n1 int; n2 int; n3 int;
begin
  delete from external_applicants where linked_user_id is null and stage_changed_at < cutoff and created_at < cutoff;
  get diagnostics n1 = row_count;
  with old as (select job_id, candidate_id from matches where stage in ('descartado','contratado') and stage_changed_at < cutoff
               union select a.job_id, a.candidate_id from candidate_job_actions a join jobs j on j.id = a.job_id where j.status = 'closed' and j.updated_at < cutoff)
  delete from candidate_notes n using old where n.job_id = old.job_id and n.candidate_id = old.candidate_id;
  get diagnostics n2 = row_count;
  with old as (select job_id, candidate_id from matches where stage in ('descartado','contratado') and stage_changed_at < cutoff
               union select a.job_id, a.candidate_id from candidate_job_actions a join jobs j on j.id = a.job_id where j.status = 'closed' and j.updated_at < cutoff)
  delete from evaluations v using old where v.job_id = old.job_id and v.candidate_id = old.candidate_id;
  get diagnostics n3 = row_count;
  delete from ai_insights where created_at < cutoff;
  delete from job_views where created_at < now() - interval '24 months';
  delete from ai_usage where day < (now() - interval '90 days')::date;
  delete from notifications where created_at < cutoff and read_at is not null;
  return jsonb_build_object('externos', n1, 'notas', n2, 'evaluaciones', n3);
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'vinka-conservacion-datos';
select cron.schedule('vinka-conservacion-datos', '17 7 * * *', $$select public.purge_old_data()$$);

revoke execute on function stage_rank(text), company_report(uuid,int), my_calendar_token(), reset_calendar_token(), calendar_feed(uuid), export_my_data(), purge_old_data() from public, anon;
grant execute on function stage_rank(text), company_report(uuid,int), my_calendar_token(), reset_calendar_token(), export_my_data() to authenticated;
revoke execute on function calendar_feed(uuid), purge_old_data() from authenticated;
grant execute on function calendar_feed(uuid) to service_role;
