-- Revisión 25-11 (3): guardadas como pendiente, «procesos» en vez de «personas», ficha directa y último cupo sin carreras.
-- 1) company_todo: pendiente «postulaciones guardadas por decidir»; «procesos sin avanzar».
-- 2) company_stale_list devuelve la persona (para abrir su ficha); company_saved_list nueva.
-- 3) job_guard: bloqueo por grupo al publicar, para que dos publicaciones simultáneas no superen el límite del plan.
-- No modifica datos. Respaldo de las funciones que cambian.
create schema if not exists backup;
create table if not exists backup.fn_company_todo_20261125c as select now() saved_at, pg_get_functiondef('public.company_todo(uuid)'::regprocedure) def;
create table if not exists backup.fn_job_guard_20261125c as select now() saved_at, pg_get_functiondef('public.job_guard()'::regprocedure) def;
create table if not exists backup.fn_company_stale_list_20261125c as select now() saved_at, pg_get_functiondef('public.company_stale_list(uuid)'::regprocedure) def;
revoke all on backup.fn_company_todo_20261125c, backup.fn_job_guard_20261125c, backup.fn_company_stale_list_20261125c from public, anon, authenticated;

create or replace function public.job_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_plan plans; v_active int;
begin
  new.updated_at := now();
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if char_length(btrim(coalesce(new.title, ''))) < 4 then raise exception 'Para publicar, escribe el nombre del cargo (al menos 4 caracteres).'; end if;
    if char_length(btrim(coalesce(new.description, ''))) < 30 then raise exception 'Para publicar, describe el cargo: funciones, horario o beneficios (al menos 30 caracteres).'; end if;
    if not exists (select 1 from companies where id = new.company_id and verification_status = 'verified') then
      new.status := 'pending';
      return new;
    end if;
    if auth.uid() is not null and not is_admin() then
      -- Un bloqueo por grupo (matriz y sus clientes) evita que dos publicaciones simultáneas ocupen el mismo último cupo
      perform pg_advisory_xact_lock(hashtext('vinka_publicar:' || coalesce((select parent_id from companies where id = new.company_id), new.company_id)::text));
      v_plan := plan_of(new.company_id);
      select count(*) into v_active from jobs where company_id in (select company_group(new.company_id)) and status = 'published' and id <> new.id;
      if v_plan.max_active_jobs is not null and v_active >= v_plan.max_active_jobs then
        raise exception 'Tu plan % permite % a la vez. Pausa o cierra otra, o cambia de plan.', v_plan.name, pl(v_plan.max_active_jobs, 'vacante publicada', 'vacantes publicadas');
      end if;
    end if;
    if auth.uid() is not null and not is_company_admin(new.company_id)
       and exists (select 1 from companies where id = new.company_id and require_approval) then
      new.status := 'review';
      perform notify_users(array(select unnest(company_staff(new.company_id, array['owner', 'admin']))),
        'approval', 'Vacante por aprobar: «' || new.title || '»', 'Un reclutador pidió publicarla. Revísala y apruébala desde el panel.', '/', false);
    end if;
  end if;
  return new;
end $function$;

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
    if n > 0 then out := out || jsonb_build_object('key', 'estancados', 'n', n, 'label', case when n = 1 then 'proceso sin avanzar hace más de ' else 'procesos sin avanzar hace más de ' end
      || (select stale_days from companies where id = p_company) || ' días', 'url', '/pendientes/sin-avanzar'); end if;
  end if;

  -- Postulaciones guardadas para decidir después: siguen siendo un pendiente hasta que alguien decida
  if manage then
    select count(*) into n from candidate_job_actions a join jobs j on j.id = a.job_id
    where j.company_id = p_company and j.status in ('published', 'paused') and a.action = 'interest'
      and exists (select 1 from company_candidate_actions x where x.job_id = a.job_id and x.candidate_id = a.candidate_id and x.action = 'save')
      and not exists (select 1 from matches m where m.job_id = a.job_id and m.candidate_id = a.candidate_id);
    if n > 0 then out := out || jsonb_build_object('key', 'guardadas', 'n', n, 'label', case when n = 1 then 'postulación guardada por decidir' else 'postulaciones guardadas por decidir' end, 'url', '/pendientes/guardadas'); end if;
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

-- Lista de procesos sin avanzar: ahora incluye a la persona para abrir su ficha directamente
drop function if exists public.company_stale_list(uuid);
create function public.company_stale_list(p_company uuid)
returns table(match_id uuid, job_id uuid, job_title text, job_status text, candidate_id uuid, candidate_name text, stage text, days int, last_message_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_manage(p_company) then raise exception 'No tienes acceso a esta empresa'; end if;
  return query
  select m.id, j.id, j.title, j.status, m.candidate_id, trim(p.first_name || ' ' || p.last_name), m.stage,
         (extract(epoch from now() - coalesce(m.stage_changed_at, m.created_at)) / 86400)::int,
         (select max(g.created_at) from messages g where g.match_id = m.id)
  from matches m join jobs j on j.id = m.job_id join companies c on c.id = p_company join profiles p on p.id = m.candidate_id
  where m.company_id = p_company and not m.closed and j.status in ('published', 'paused') and coalesce(c.stale_days, 0) > 0
    and m.stage in ('match', 'contacto', 'entrevista', 'oferta')
    and coalesce(m.stage_changed_at, m.created_at) < now() - make_interval(days => c.stale_days)
  order by coalesce(m.stage_changed_at, m.created_at);
end $$;
revoke all on function public.company_stale_list(uuid) from public, anon;
grant execute on function public.company_stale_list(uuid) to authenticated;

-- Postulaciones guardadas por decidir (misma regla que el pendiente del Panel y la marca «Guardada» del tablero)
create or replace function public.company_saved_list(p_company uuid)
returns table(job_id uuid, job_title text, job_status text, candidate_id uuid, candidate_name text, headline text, applied_at timestamptz, saved_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_manage(p_company) then raise exception 'No tienes acceso a esta empresa'; end if;
  return query
  select j.id, j.title, j.status, a.candidate_id,
         trim(p.first_name || ' ' || left(p.last_name, 1) || case when p.last_name <> '' then '.' else '' end), cp.headline, a.created_at, x.created_at
  from candidate_job_actions a join jobs j on j.id = a.job_id
  join company_candidate_actions x on x.job_id = a.job_id and x.candidate_id = a.candidate_id and x.action = 'save'
  join profiles p on p.id = a.candidate_id join candidate_profiles cp on cp.user_id = a.candidate_id
  where j.company_id = p_company and j.status in ('published', 'paused') and a.action = 'interest'
    and not exists (select 1 from matches m where m.job_id = a.job_id and m.candidate_id = a.candidate_id)
  order by x.created_at;
end $$;
revoke all on function public.company_saved_list(uuid) from public, anon;
grant execute on function public.company_saved_list(uuid) to authenticated;
