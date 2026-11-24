-- Agendar entrevista solo en procesos abiertos.
-- Antes: la invitación a agendar (matches.can_schedule) seguía activa después de contratar, descartar o cerrar la vacante,
-- y la persona veía «Puedes agendar tu entrevista» con la oferta ya aceptada. Ahora se puede agendar solo si el proceso
-- está en match, contacto o entrevista y la vacante sigue publicada o en pausa. El historial no se toca.
-- No modifica datos: solo cambia lo que informan my_matches y available_slots, y lo que permite book_slot.
create schema if not exists backup;
create table if not exists backup.fn_my_matches_20261124 as select now() saved_at, pg_get_functiondef('public.my_matches()'::regprocedure) def;
create table if not exists backup.fn_book_slot_20261124 as select now() saved_at, pg_get_functiondef('public.book_slot(uuid,uuid)'::regprocedure) def;
create table if not exists backup.fn_available_slots_20261124 as select now() saved_at, pg_get_functiondef('public.available_slots(uuid)'::regprocedure) def;
revoke all on backup.fn_my_matches_20261124, backup.fn_book_slot_20261124, backup.fn_available_slots_20261124 from public, anon, authenticated;

-- Regla única: ¿este proceso admite agendar una entrevista ahora?
create or replace function public.match_can_book(p_match uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select m.can_schedule and not m.closed and m.stage in ('match', 'contacto', 'entrevista') and j.status in ('published', 'paused')
    from matches m join jobs j on j.id = m.job_id where m.id = p_match), false)
$$;
revoke all on function public.match_can_book(uuid) from public, anon, authenticated; -- solo la usan otras funciones

create or replace function public.my_matches()
 returns table(match_id uuid, job_id uuid, job_title text, company_id uuid, company_name text, candidate_id uuid, candidate_name text, candidate_headline text, stage text, contact_shared boolean, contact_requested boolean, candidate_phone text, candidate_email text, closed boolean, created_at timestamp with time zone, last_message text, last_at timestamp with time zone, can_schedule boolean)
 language sql stable security definer set search_path = public
as $function$
  select m.id, j.id, j.title, co.id,
    case when j.confidential and m.candidate_id = auth.uid() then 'Confidencial · vía ' || coalesce((select pc.display_name from companies pc where pc.id = co.parent_id), 'VINKA') else co.display_name end, m.candidate_id, trim(p.first_name||' '||p.last_name), cp.headline,
    m.stage, m.contact_shared, m.contact_requested,
    case when m.contact_shared or m.candidate_id = auth.uid() then p.phone end,
    case when m.contact_shared or m.candidate_id = auth.uid() then u.email::text end,
    m.closed, m.created_at,
    (select body from messages x where x.match_id = m.id order by created_at desc limit 1),
    (select created_at from messages x where x.match_id = m.id order by created_at desc limit 1),
    (m.can_schedule and not m.closed and m.stage in ('match', 'contacto', 'entrevista') and j.status in ('published', 'paused'))
  from matches m join jobs j on j.id = m.job_id join companies co on co.id = m.company_id
  join profiles p on p.id = m.candidate_id join candidate_profiles cp on cp.user_id = m.candidate_id
  join auth.users u on u.id = m.candidate_id
  where m.candidate_id = auth.uid() or m.company_id in (select cm.company_id from company_members cm where cm.user_id = auth.uid() union select c.id from companies c join company_members cm on cm.company_id = c.parent_id where cm.user_id = auth.uid())
  order by coalesce((select max(created_at) from messages x where x.match_id = m.id), m.created_at) desc;
$function$;

create or replace function public.available_slots(p_match uuid)
 returns table(slot_id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, mode text, address text, comuna text, notes text)
 language sql stable security definer set search_path = public
as $function$
  select s.id, s.starts_at, s.ends_at, s.mode, s.address, s.comuna, s.notes
  from matches m join interview_slots s on s.company_id = m.company_id
  where m.id = p_match and m.candidate_id = auth.uid() and match_can_book(m.id)
    and s.status = 'open' and s.starts_at > now() + interval '30 minutes'
    and (s.job_id is null or s.job_id = m.job_id)
  order by s.starts_at;
$function$;

create or replace function public.book_slot(p_slot uuid, p_match uuid)
 returns uuid language plpgsql security definer set search_path = public
as $function$
declare m matches; s interview_slots; iid uuid;
begin
  select * into m from matches where id = p_match;
  if m.id is null or m.candidate_id <> auth.uid() or m.closed then raise exception 'No autorizado'; end if;
  if not m.can_schedule then raise exception 'La empresa aún no habilita la agenda para este proceso. Te avisaremos cuando puedas agendar.'; end if;
  if not match_can_book(m.id) then raise exception 'Este proceso ya terminó, por eso no se pueden agendar entrevistas. El historial sigue disponible en el chat.'; end if;
  if exists (select 1 from interviews where match_id = p_match and status = 'confirmada' and ends_at > now()) then
    raise exception 'Ya tienes una entrevista agendada para esta vacante. Cancélala si quieres cambiar el horario.';
  end if;
  update interview_slots set status = 'booked'
   where id = p_slot and status = 'open' and company_id = m.company_id and starts_at > now() and (job_id is null or job_id = m.job_id)
   returning * into s;
  if s.id is null then raise exception 'Ese horario ya no está disponible. Elige otro.'; end if;
  insert into interviews (slot_id, match_id, company_id, candidate_id, job_id, starts_at, ends_at, mode, meeting_url, address, comuna, notes)
  values (s.id, m.id, m.company_id, m.candidate_id, m.job_id, s.starts_at, s.ends_at, s.mode, s.meeting_url, s.address, s.comuna, s.notes)
  returning id into iid;
  update matches set stage = 'entrevista' where id = m.id and stage in ('match','contacto');
  insert into messages (match_id, sender_id, body) values (m.id, auth.uid(),
    'Agendé una entrevista para el ' || to_char(s.starts_at at time zone 'America/Santiago', 'DD/MM/YYYY "a las" HH24:MI') ||
    case when s.mode = 'online' then ' (videollamada).' else ' (presencial).' end);
  return iid;
end $function$;
