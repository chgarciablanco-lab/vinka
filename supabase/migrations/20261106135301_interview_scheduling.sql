-- Migración aplicada en Supabase (20261106135301). Exportada tal cual desde supabase_migrations.schema_migrations.

alter table public.companies add column if not exists interview_link text not null default '';
alter table public.companies add column if not exists interview_address text not null default '';

create table public.interview_slots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  job_id uuid references public.jobs(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  mode text not null check (mode in ('online','presencial')),
  meeting_url text not null default '',
  address text not null default '',
  comuna text not null default '',
  notes text not null default '' check (char_length(notes) <= 500),
  status text not null default 'open' check (status in ('open','booked','cancelled')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on public.interview_slots (company_id, starts_at);

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid references public.interview_slots(id) on delete set null,
  match_id uuid not null references public.matches(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  candidate_id uuid not null references public.candidate_profiles(user_id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  mode text not null,
  meeting_url text not null default '',
  address text not null default '',
  comuna text not null default '',
  notes text not null default '',
  status text not null default 'confirmada' check (status in ('confirmada','cancelada','realizada')),
  cancelled_by text check (cancelled_by in ('candidate','company')),
  cancel_reason text not null default '',
  reminder_sent boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index interviews_one_active_per_match on public.interviews (match_id) where status = 'confirmada';
create index on public.interviews (starts_at);

alter table public.interview_slots enable row level security;
alter table public.interviews enable row level security;
-- Solo lectura directa para la empresa dueña; el resto pasa por funciones
create policy "slots: empresa lee" on public.interview_slots for select to authenticated using (is_company_member(company_id));
create policy "entrevistas: participantes leen" on public.interviews for select to authenticated
  using (candidate_id = auth.uid() or is_company_member(company_id));

-- ===== Empresa: publicar disponibilidad =====
create or replace function public.add_slots(p_company uuid, p_times jsonb, p_mode text, p_url text, p_address text, p_comuna text, p_notes text, p_job uuid)
returns int language plpgsql security definer set search_path = public as $$
declare t jsonb; s timestamptz; e timestamptz; n int := 0;
begin
  if not is_company_member(p_company) then raise exception 'No autorizado'; end if;
  if not exists (select 1 from companies where id = p_company and verification_status = 'verified') then raise exception 'Tu empresa debe estar verificada para publicar horarios'; end if;
  if p_mode not in ('online','presencial') then raise exception 'Modalidad inválida'; end if;
  if p_mode = 'online' and coalesce(p_url,'') !~* '^https://' then raise exception 'El enlace de videollamada debe empezar con https://'; end if;
  if p_mode = 'presencial' and coalesce(trim(p_address),'') = '' then raise exception 'Indica la dirección de la entrevista'; end if;
  if p_job is not null and not exists (select 1 from jobs where id = p_job and company_id = p_company) then raise exception 'Vacante inválida'; end if;
  if jsonb_array_length(p_times) > 300 then raise exception 'Demasiados horarios de una vez'; end if;
  for t in select * from jsonb_array_elements(p_times) loop
    s := (t->>'s')::timestamptz; e := (t->>'e')::timestamptz;
    continue when s <= now() or e <= s or e - s > interval '4 hours';
    -- no duplicar horarios que se cruzan con otros vigentes de la empresa
    continue when exists (select 1 from interview_slots x where x.company_id = p_company and x.status <> 'cancelled' and x.starts_at < e and x.ends_at > s);
    insert into interview_slots (company_id, created_by, job_id, starts_at, ends_at, mode, meeting_url, address, comuna, notes)
    values (p_company, auth.uid(), p_job, s, e, p_mode, case when p_mode='online' then trim(p_url) else '' end,
            case when p_mode='presencial' then trim(p_address) else '' end, coalesce(trim(p_comuna),''), coalesce(trim(p_notes),''));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.delete_slot(p_slot uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update interview_slots set status = 'cancelled' where id = p_slot and status = 'open' and is_company_member(company_id);
  if not found then raise exception 'Solo puedes borrar horarios libres'; end if;
end $$;

-- Agenda de la empresa: horarios con la reserva (si la hay)
create or replace function public.company_agenda(p_company uuid, p_from timestamptz, p_to timestamptz)
returns table (slot_id uuid, starts_at timestamptz, ends_at timestamptz, mode text, meeting_url text, address text, comuna text, notes text,
  slot_status text, job_title text, interview_id uuid, interview_status text, match_id uuid, candidate_name text, booked_job_title text)
language sql stable security definer set search_path = public as $$
  select s.id, s.starts_at, s.ends_at, s.mode, s.meeting_url, s.address, s.comuna, s.notes, s.status, js.title,
    i.id, i.status, i.match_id, trim(p.first_name || ' ' || left(p.last_name,1) || '.'), ji.title
  from interview_slots s
  left join jobs js on js.id = s.job_id
  left join lateral (select * from interviews x where x.slot_id = s.id and x.status <> 'cancelada' order by x.created_at desc limit 1) i on true
  left join profiles p on p.id = i.candidate_id
  left join jobs ji on ji.id = i.job_id
  where s.company_id = p_company and is_company_member(p_company) and s.status <> 'cancelled'
    and s.starts_at >= p_from and s.starts_at < p_to
  order by s.starts_at;
$$;

-- ===== Candidato: ver horarios y reservar =====
create or replace function public.available_slots(p_match uuid)
returns table (slot_id uuid, starts_at timestamptz, ends_at timestamptz, mode text, address text, comuna text, notes text)
language sql stable security definer set search_path = public as $$
  select s.id, s.starts_at, s.ends_at, s.mode, s.address, s.comuna, s.notes
  from matches m join interview_slots s on s.company_id = m.company_id
  where m.id = p_match and m.candidate_id = auth.uid() and not m.closed
    and s.status = 'open' and s.starts_at > now() + interval '30 minutes'
    and (s.job_id is null or s.job_id = m.job_id)
  order by s.starts_at;
$$;

create or replace function public.book_slot(p_slot uuid, p_match uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare m matches; s interview_slots; iid uuid;
begin
  select * into m from matches where id = p_match;
  if m.id is null or m.candidate_id <> auth.uid() or m.closed then raise exception 'No autorizado'; end if;
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
end $$;

create or replace function public.cancel_interview(p_interview uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare i interviews; side text;
begin
  select * into i from interviews where id = p_interview;
  if i.id is null or i.status <> 'confirmada' then raise exception 'Entrevista no disponible'; end if;
  if i.candidate_id = auth.uid() then side := 'candidate';
  elsif is_company_member(i.company_id) then side := 'company';
  else raise exception 'No autorizado'; end if;
  update interviews set status = 'cancelada', cancelled_by = side, cancel_reason = coalesce(trim(p_reason),'') where id = i.id;
  -- Si cancela la persona, el horario vuelve a quedar libre; si cancela la empresa, se retira
  update interview_slots set status = case when side = 'candidate' and starts_at > now() then 'open' else 'cancelled' end where id = i.slot_id;
  insert into messages (match_id, sender_id, body) values (i.match_id, auth.uid(),
    'Cancelé la entrevista del ' || to_char(i.starts_at at time zone 'America/Santiago', 'DD/MM/YYYY "a las" HH24:MI') ||
    case when coalesce(trim(p_reason),'') <> '' then '. Motivo: ' || trim(p_reason) else '.' end);
end $$;

create or replace function public.complete_interview(p_interview uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update interviews set status = 'realizada' where id = p_interview and status = 'confirmada' and is_company_member(company_id);
  if not found then raise exception 'No autorizado'; end if;
end $$;

create or replace function public.my_interviews()
returns table (interview_id uuid, match_id uuid, starts_at timestamptz, ends_at timestamptz, mode text, meeting_url text, address text, comuna text,
  notes text, status text, cancelled_by text, cancel_reason text, job_title text, company_name text, candidate_name text)
language sql stable security definer set search_path = public as $$
  select i.id, i.match_id, i.starts_at, i.ends_at, i.mode, i.meeting_url, i.address, i.comuna, i.notes, i.status, i.cancelled_by, i.cancel_reason,
    j.title, c.display_name, trim(p.first_name || ' ' || left(p.last_name,1) || '.')
  from interviews i join companies c on c.id = i.company_id left join jobs j on j.id = i.job_id join profiles p on p.id = i.candidate_id
  where (i.candidate_id = auth.uid() or is_company_member(i.company_id)) and i.starts_at > now() - interval '30 days'
  order by i.starts_at;
$$;

do $$
declare f text;
begin
  foreach f in array array['add_slots(uuid, jsonb, text, text, text, text, text, uuid)','delete_slot(uuid)','company_agenda(uuid, timestamptz, timestamptz)',
    'available_slots(uuid)','book_slot(uuid, uuid)','cancel_interview(uuid, text)','complete_interview(uuid)','my_interviews()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ===== Avisos: reserva, cancelación y recordatorio =====
create or replace function public.notify_event(p_kind text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare cfg jsonb := (select jsonb_object_agg(key, value) from private.config);
begin
  perform net.http_post(url := cfg->>'notify_url', body := jsonb_build_object('kind', p_kind, 'id', p_id),
    headers := jsonb_build_object('Content-Type','application/json','x-notify-secret', cfg->>'notify_secret'));
exception when others then null;
end $$;
revoke execute on function public.notify_event(text, uuid) from public, anon, authenticated;

create or replace function public.on_interview_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then perform notify_event('interview_booked', new.id);
  elsif new.status = 'cancelada' and old.status <> 'cancelada' then perform notify_event('interview_cancelled', new.id);
  end if;
  return new;
end $$;
revoke execute on function public.on_interview_change() from public, anon, authenticated;
create trigger on_interview_change after insert or update on public.interviews for each row execute function public.on_interview_change();

create or replace function public.send_interview_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in update interviews set reminder_sent = true
           where status = 'confirmada' and not reminder_sent and starts_at > now() and starts_at <= now() + interval '65 minutes'
           returning id loop
    perform notify_event('interview_reminder', r.id); n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.send_interview_reminders() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('vinka-recordatorios-entrevista', '*/10 * * * *', 'select public.send_interview_reminders()');

alter publication supabase_realtime add table public.interviews;
