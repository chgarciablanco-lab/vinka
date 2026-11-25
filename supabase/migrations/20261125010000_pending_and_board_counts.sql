-- Pendientes y tablero coherentes con los avisos (auditoría 24-11):
-- 1) company_todo incluye «personas sin avanzar» con la misma regla del aviso, también en vacantes en pausa
--    (antes el Panel decía «Todo al día» mientras Avisos mostraba procesos detenidos).
-- 2) stale_digest cuenta también vacantes en pausa, para que aviso y Panel digan lo mismo.
-- 3) job_pipeline devuelve el desglose de postulaciones para explicar en el tablero por qué difiere del acceso.
-- No modifica datos. Guarda respaldo de las tres funciones.
create schema if not exists backup;
create table if not exists backup.fn_company_todo_20261125 as select now() saved_at, pg_get_functiondef('public.company_todo(uuid)'::regprocedure) def;
create table if not exists backup.fn_stale_digest_20261125 as select now() saved_at, pg_get_functiondef('public.stale_digest()'::regprocedure) def;
create table if not exists backup.fn_job_pipeline_20261125 as select now() saved_at, pg_get_functiondef('public.job_pipeline(uuid)'::regprocedure) def;
revoke all on backup.fn_company_todo_20261125, backup.fn_stale_digest_20261125, backup.fn_job_pipeline_20261125 from public, anon, authenticated;

create or replace function public.company_todo(p_company uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare out jsonb := '[]'::jsonb; n int; top uuid; manage boolean; adm boolean; cl_today date := (now() at time zone 'America/Santiago')::date;
begin
  if not is_company_member(p_company) then raise exception 'No tienes acceso a esta empresa'; end if;
  manage := can_manage(p_company);
  adm := is_company_admin(p_company) or member_role(p_company) = 'client';

  -- Personas que dijeron «Me interesa» y la empresa aún no decide (misma regla que la columna «Postulantes» del proceso)
  if manage then
    select count(*), (array_agg(j.id order by cnt desc))[1] into n, top from (
      select j.id, count(*) cnt from jobs j join candidate_job_actions a on a.job_id = j.id and a.action = 'interest'
      where j.company_id = p_company and j.status = 'published' and a.created_at >= now() - interval '30 days'
        and not exists (select 1 from company_candidate_actions x where x.job_id = j.id and x.candidate_id = a.candidate_id)
        and not exists (select 1 from matches m where m.job_id = j.id and m.candidate_id = a.candidate_id)
      group by j.id) j;
    select coalesce(sum(cnt), 0) into n from (
      select count(*) cnt from jobs j join candidate_job_actions a on a.job_id = j.id and a.action = 'interest'
      where j.company_id = p_company and j.status = 'published' and a.created_at >= now() - interval '30 days'
        and not exists (select 1 from company_candidate_actions x where x.job_id = j.id and x.candidate_id = a.candidate_id)
        and not exists (select 1 from matches m where m.job_id = j.id and m.candidate_id = a.candidate_id)) s;
    if n > 0 then out := out || jsonb_build_object('key', 'interesados', 'n', n, 'label', case when n = 1 then 'persona interesada sin revisar (últimos 30 días)' else 'personas interesadas sin revisar (últimos 30 días)' end, 'url', '/vacantes/' || top || '/proceso'); end if;
  end if;

  -- Procesos detenidos: misma regla que el aviso «sin avanzar», en vacantes publicadas o en pausa (los procesos en pausa siguen)
  if manage then
    select count(*) into n from matches m join jobs j on j.id = m.job_id join companies c on c.id = p_company
    where m.company_id = p_company and not m.closed and j.status in ('published', 'paused') and coalesce(c.stale_days, 0) > 0
      and m.stage in ('match', 'contacto', 'entrevista', 'oferta')
      and coalesce(m.stage_changed_at, m.created_at) < now() - make_interval(days => c.stale_days);
    if n > 0 then out := out || jsonb_build_object('key', 'estancados', 'n', n, 'label', case when n = 1 then 'persona sin avanzar hace más de ' else 'personas sin avanzar hace más de ' end
      || (select stale_days from companies where id = p_company) || ' días', 'url', '#vacantes'); end if;
  end if;

  -- Conversaciones de esta empresa con mensajes de la persona que tú no has leído
  select count(distinct m.id) into n from matches m
  left join chat_reads cr on cr.match_id = m.id and cr.user_id = auth.uid()
  where m.company_id = p_company and not m.closed
    and exists (select 1 from messages g where g.match_id = m.id and g.sender_id = m.candidate_id
                and g.created_at > greatest(coalesce(cr.read_at, '-infinity'::timestamptz), chat_unread_since()));
  if n > 0 then out := out || jsonb_build_object('key', 'chats', 'n', n, 'label', case when n = 1 then 'chat con mensajes sin leer' else 'chats con mensajes sin leer' end, 'url', '/chats'); end if;

  -- Entrevistas confirmadas de hoy y mañana (hora de Chile)
  select count(*) into n from interviews
  where company_id = p_company and status = 'confirmada' and ends_at > now()
    and starts_at < ((cl_today + 2)::timestamp at time zone 'America/Santiago');
  if n > 0 then out := out || jsonb_build_object('key', 'entrevistas', 'n', n, 'label', case when n = 1 then 'entrevista hoy o mañana' else 'entrevistas hoy y mañana' end, 'url', '/agenda'); end if;

  -- Cartas oferta esperando aprobación interna (solo quien puede aprobarlas)
  if adm then
    select count(*), (array_agg(id order by created_at))[1] into n, top from offers where company_id = p_company and status = 'por_aprobar';
    if n > 0 then out := out || jsonb_build_object('key', 'ofertas_aprobar', 'n', n, 'label', case when n = 1 then 'carta oferta por aprobar' else 'cartas oferta por aprobar' end, 'url', '/ofertas/' || top); end if;
  end if;

  -- Cartas oferta enviadas que vencen en 2 días o menos sin respuesta
  if manage then
    select count(*), (array_agg(id order by expires_on))[1] into n, top from offers
    where company_id = p_company and status = 'enviada' and expires_on is not null and expires_on between cl_today and cl_today + 2;
    if n > 0 then out := out || jsonb_build_object('key', 'ofertas_vencen', 'n', n, 'label', case when n = 1 then 'carta oferta vence sin respuesta' else 'cartas oferta vencen sin respuesta' end, 'url', '/ofertas/' || top); end if;
  end if;

  -- Vacantes esperando aprobación interna (solo administradores)
  if is_company_admin(p_company) then
    select count(*) into n from jobs where company_id = p_company and status = 'review';
    if n > 0 then out := out || jsonb_build_object('key', 'vacantes_aprobar', 'n', n, 'label', case when n = 1 then 'vacante esperando tu aprobación' else 'vacantes esperando tu aprobación' end, 'url', '#vacantes'); end if;
  end if;

  return out;
end $function$;

create or replace function public.stale_digest()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c record; n int;
begin
  for c in select id, stale_days from companies where verification_status = 'verified' and stale_days > 0 loop
    select (select count(*) from matches m join jobs j on j.id = m.job_id
              where m.company_id = c.id and not m.closed and j.status in ('published', 'paused')
                and m.stage in ('match', 'contacto', 'entrevista', 'oferta')
                and coalesce(m.stage_changed_at, m.created_at) < now() - make_interval(days => c.stale_days))
         + (select count(*) from candidate_job_actions a join jobs j on j.id = a.job_id
              where j.company_id = c.id and j.status = 'published' and a.action = 'interest'
                and a.created_at < now() - make_interval(days => c.stale_days)
                and not exists (select 1 from matches m where m.job_id = a.job_id and m.candidate_id = a.candidate_id)
                and not exists (select 1 from company_candidate_actions x where x.job_id = a.job_id and x.candidate_id = a.candidate_id))
      into n;
    if n > 0 then
      perform notify_users(array(select unnest(company_staff(c.id, array['owner', 'admin', 'recruiter']))),
        'stale', n || (case when n = 1 then ' persona lleva' else ' personas llevan' end) || ' más de ' || c.stale_days || ' días sin avanzar',
        'Revisa tus procesos de selección para responderles a tiempo.', '/', false);
    end if;
  end loop;
end $function$;

create or replace function public.job_pipeline(p_job uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare j jobs; res jsonb;
begin
  select * into j from jobs where id = p_job;
  if j.id is null or not (is_company_member(j.company_id) or is_job_collaborator(j.id)) then raise exception 'Vacante no encontrada'; end if;
  with ev as (
    select job_id, candidate_id, external_id, round(avg(overall)::numeric, 1) avg, count(*) n,
           count(*) filter (where recommendation = 'si') yes from evaluations where job_id = p_job group by 1,2,3
  ), cards as (
    -- Postularon (dijeron "Me interesa") y la empresa aún no decide
    select 'interesado' kind, a.candidate_id id, a.candidate_id, 'postulante' stage, a.created_at since,
      trim(p.first_name || ' ' || left(p.last_name,1) || case when p.last_name <> '' then '.' else '' end) name,
      cp.headline, cp.comuna, knocked_out(j.questions, a.answers) ko, a.answers is not null answered, null::uuid match_id, 'vinka' source
    from candidate_job_actions a join profiles p on p.id = a.candidate_id join candidate_profiles cp on cp.user_id = a.candidate_id
    where a.job_id = p_job and a.action = 'interest'
      and not exists (select 1 from company_candidate_actions x where x.job_id = p_job and x.candidate_id = a.candidate_id)
      and not exists (select 1 from matches m where m.job_id = p_job and m.candidate_id = a.candidate_id)
    union all
    select 'match', m.candidate_id, m.candidate_id, m.stage, m.stage_changed_at,
      trim(p.first_name || ' ' || p.last_name), cp.headline, cp.comuna,
      knocked_out(j.questions, a.answers), a.answers is not null, m.id, 'vinka'
    from matches m join profiles p on p.id = m.candidate_id join candidate_profiles cp on cp.user_id = m.candidate_id
    left join candidate_job_actions a on a.job_id = m.job_id and a.candidate_id = m.candidate_id
    where m.job_id = p_job and not m.closed
    union all
    select 'externo', e.id, null, ext_to_col(e.stage), e.stage_changed_at, e.full_name, e.headline, '', false, false, null, coalesce(nullif(e.source,''), 'externo')
    from external_applicants e where e.job_id = p_job
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'kind', c.kind, 'id', c.id, 'candidate_id', c.candidate_id, 'match_id', c.match_id, 'stage', c.stage, 'since', c.since,
      'name', c.name, 'headline', c.headline, 'comuna', c.comuna, 'knocked_out', c.ko, 'answered', c.answered, 'source', c.source,
      'eval_avg', ev.avg, 'eval_n', coalesce(ev.n, 0), 'eval_yes', coalesce(ev.yes, 0),
      'fit', (select (data->>'score')::int from ai_insights ai where ai.job_id = p_job and ai.candidate_id = c.candidate_id and ai.kind = 'fit'),
      'tags', coalesce((select jsonb_agg(t.tag order by t.tag) from candidate_tags t where t.company_id = j.company_id and t.subject_id = c.id), '[]'::jsonb),
      'next_interview', (select min(i.starts_at) from interviews i where i.match_id = c.match_id and i.status = 'confirmada' and i.starts_at > now())
    ) order by c.since desc), '[]'::jsonb) into res
  from cards c left join ev on (c.candidate_id is not null and ev.candidate_id = c.candidate_id) or (c.kind = 'externo' and ev.external_id = c.id);
  return jsonb_build_object('job', jsonb_build_object('id', j.id, 'title', j.title, 'status', j.status, 'questions', j.questions, 'company_id', j.company_id),
    'can_manage', can_manage(j.company_id), 'cards', res,
    -- Desglose para explicar la diferencia entre «postulaciones» (acceso) y «personas en el tablero»
    'counts', jsonb_build_object(
      'con_cuenta', (select count(*) from candidate_job_actions a where a.job_id = j.id and a.action = 'interest'),
      'externas', (select count(*) from external_applicants e where e.job_id = j.id),
      'descartadas_antes', (select count(*) from candidate_job_actions a where a.job_id = j.id and a.action = 'interest'
          and exists (select 1 from company_candidate_actions x where x.job_id = j.id and x.candidate_id = a.candidate_id and x.action = 'pass')
          and not exists (select 1 from matches m where m.job_id = j.id and m.candidate_id = a.candidate_id)),
      'invitadas', (select count(*) from matches m where m.job_id = j.id and not m.closed
          and not exists (select 1 from candidate_job_actions a where a.job_id = j.id and a.candidate_id = m.candidate_id and a.action = 'interest'))));
end $function$;

