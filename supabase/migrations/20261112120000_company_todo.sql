-- Pendientes del panel de empresa: solo lo que requiere una acción, con cifras reales y un enlace para resolverlo.
-- Solo lectura. Cada persona ve únicamente lo que su rol le permite hacer. No repite avisos que ya existen
-- (cobro, verificación, destacados por terminar).
create or replace function public.company_todo(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb := '[]'::jsonb; n int; top uuid; manage boolean; adm boolean; cl_today date := (now() at time zone 'America/Santiago')::date;
begin
  if not is_company_member(p_company) then raise exception 'No tienes acceso a esta empresa'; end if;
  manage := can_manage(p_company);
  adm := is_company_admin(p_company) or member_role(p_company) = 'client';

  -- Personas que dijeron «Me interesa» y la empresa aún no decide (misma regla que la columna «Postulantes» del proceso)
  if manage then
    select count(*), (array_agg(j.id order by cnt desc))[1] into n, top from (
      select j.id, count(*) cnt from jobs j join candidate_job_actions a on a.job_id = j.id and a.action = 'interest'
      where j.company_id = p_company and j.status = 'published'
        and not exists (select 1 from company_candidate_actions x where x.job_id = j.id and x.candidate_id = a.candidate_id)
        and not exists (select 1 from matches m where m.job_id = j.id and m.candidate_id = a.candidate_id)
      group by j.id) j;
    select coalesce(sum(cnt), 0) into n from (
      select count(*) cnt from jobs j join candidate_job_actions a on a.job_id = j.id and a.action = 'interest'
      where j.company_id = p_company and j.status = 'published'
        and not exists (select 1 from company_candidate_actions x where x.job_id = j.id and x.candidate_id = a.candidate_id)
        and not exists (select 1 from matches m where m.job_id = j.id and m.candidate_id = a.candidate_id)) s;
    if n > 0 then out := out || jsonb_build_object('key', 'interesados', 'n', n, 'label', case when n = 1 then 'persona interesada sin revisar' else 'personas interesadas sin revisar' end, 'url', '/vacantes/' || top || '/proceso'); end if;
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
    where company_id = p_company and status = 'enviada' and expires_on is not null and expires_on <= cl_today + 2;
    if n > 0 then out := out || jsonb_build_object('key', 'ofertas_vencen', 'n', n, 'label', case when n = 1 then 'carta oferta vence sin respuesta' else 'cartas oferta vencen sin respuesta' end, 'url', '/ofertas/' || top); end if;
  end if;

  -- Vacantes esperando aprobación interna (solo administradores)
  if is_company_admin(p_company) then
    select count(*) into n from jobs where company_id = p_company and status = 'review';
    if n > 0 then out := out || jsonb_build_object('key', 'vacantes_aprobar', 'n', n, 'label', case when n = 1 then 'vacante esperando tu aprobación' else 'vacantes esperando tu aprobación' end, 'url', '#vacantes'); end if;
  end if;

  return out;
end $$;
revoke execute on function public.company_todo(uuid) from public, anon;
grant execute on function public.company_todo(uuid) to authenticated;
