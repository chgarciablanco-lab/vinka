-- Agenda: el postulante solo ve horarios y agenda cuando la empresa lo invita («Invitar a agendar») o lo pasa a la etapa Entrevista.
alter table public.matches add column if not exists can_schedule boolean not null default false;
alter table public.matches add column if not exists schedule_invited_at timestamptz;
alter table public.matches add column if not exists schedule_invited_by uuid references auth.users(id) on delete set null;

-- Procesos existentes: quedan habilitados solo los que ya tienen entrevista o están en etapa de entrevista u oferta
update public.matches m set can_schedule = true, schedule_invited_at = coalesce(schedule_invited_at, now())
where not m.can_schedule and (m.stage in ('entrevista', 'oferta') or exists (select 1 from interviews i where i.match_id = m.id));

-- Pasar a «Entrevista» habilita la agenda
create or replace function public.match_enable_schedule() returns trigger language plpgsql as $$
begin
  if new.stage = 'entrevista' and old.stage is distinct from 'entrevista' and not new.can_schedule then
    new.can_schedule := true; new.schedule_invited_at := now(); new.schedule_invited_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists match_enable_schedule on public.matches;
create trigger match_enable_schedule before update of stage on public.matches for each row execute function public.match_enable_schedule();

-- La empresa invita a agendar: queda un mensaje suyo en el chat y un aviso a la persona
create or replace function public.invite_to_schedule(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m matches; v_open int;
begin
  select * into m from matches where id = p_match;
  if m.id is null or not can_manage(m.company_id) then raise exception 'No autorizado'; end if;
  if m.closed then raise exception 'Este proceso está cerrado'; end if;
  select count(*) into v_open from interview_slots s where s.company_id = m.company_id and s.status = 'open' and s.starts_at > now() + interval '30 minutes' and (s.job_id is null or s.job_id = m.job_id);
  if v_open = 0 then raise exception 'Primero publica horarios en tu Agenda para esta vacante; luego invita a agendar.'; end if;
  update matches set can_schedule = true, schedule_invited_at = now(), schedule_invited_by = auth.uid() where id = p_match;
  insert into messages (match_id, sender_id, body) values (m.id, auth.uid(), 'Te invito a agendar tu entrevista: elige el horario que más te acomode en «Agendar entrevista», aquí arriba en el chat.');
  perform notify_users(array[m.candidate_id], 'stage_entrevista', 'Puedes agendar tu entrevista',
    'La empresa te invitó a elegir un horario para tu entrevista de «' || (select title from jobs where id = m.job_id) || '».', '/chats/' || m.id || '/agendar', true);
end $$;
revoke execute on function public.invite_to_schedule(uuid) from public, anon;
grant execute on function public.invite_to_schedule(uuid) to authenticated;

-- Horarios y reserva: solo con la agenda habilitada
create or replace function public.available_slots(p_match uuid)
 returns table(slot_id uuid, starts_at timestamptz, ends_at timestamptz, mode text, address text, comuna text, notes text)
 language sql stable security definer set search_path = public as $function$
  select s.id, s.starts_at, s.ends_at, s.mode, s.address, s.comuna, s.notes
  from matches m join interview_slots s on s.company_id = m.company_id
  where m.id = p_match and m.candidate_id = auth.uid() and not m.closed and m.can_schedule
    and s.status = 'open' and s.starts_at > now() + interval '30 minutes'
    and (s.job_id is null or s.job_id = m.job_id)
  order by s.starts_at;
$function$;

do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.book_slot'::regproc);
  n := replace(d, 'if m.id is null or m.candidate_id <> auth.uid() or m.closed then raise exception ''No autorizado''; end if;',
    'if m.id is null or m.candidate_id <> auth.uid() or m.closed then raise exception ''No autorizado''; end if;
  if not m.can_schedule then raise exception ''La empresa aún no habilita la agenda para este proceso. Te avisaremos cuando puedas agendar.''; end if;');
  if n = d then raise exception 'book_slot'; end if; execute n;
end $mig$;

-- my_matches: agrega si la agenda está habilitada
drop function public.my_matches();
create function public.my_matches()
 returns table(match_id uuid, job_id uuid, job_title text, company_id uuid, company_name text, candidate_id uuid, candidate_name text, candidate_headline text, stage text,
   contact_shared boolean, contact_requested boolean, candidate_phone text, candidate_email text, closed boolean, created_at timestamptz, last_message text, last_at timestamptz, can_schedule boolean)
 language sql stable security definer set search_path = public as $function$
  select m.id, j.id, j.title, co.id,
    case when j.confidential and m.candidate_id = auth.uid() then 'Confidencial · vía ' || coalesce((select pc.display_name from companies pc where pc.id = co.parent_id), 'VINKA') else co.display_name end, m.candidate_id, trim(p.first_name||' '||p.last_name), cp.headline,
    m.stage, m.contact_shared, m.contact_requested,
    case when m.contact_shared or m.candidate_id = auth.uid() then p.phone end,
    case when m.contact_shared or m.candidate_id = auth.uid() then u.email::text end,
    m.closed, m.created_at,
    (select body from messages x where x.match_id = m.id order by created_at desc limit 1),
    (select created_at from messages x where x.match_id = m.id order by created_at desc limit 1),
    m.can_schedule
  from matches m join jobs j on j.id = m.job_id join companies co on co.id = m.company_id
  join profiles p on p.id = m.candidate_id join candidate_profiles cp on cp.user_id = m.candidate_id
  join auth.users u on u.id = m.candidate_id
  where m.candidate_id = auth.uid() or is_company_member(m.company_id)
  order by coalesce((select max(created_at) from messages x where x.match_id = m.id), m.created_at) desc;
$function$;
revoke execute on function public.my_matches() from public, anon;
grant execute on function public.my_matches() to authenticated;
