-- Migración aplicada en Supabase (20261106141243). Exportada tal cual desde supabase_migrations.schema_migrations.

alter table public.profiles add column if not exists email_notifications boolean not null default true;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  url text not null default '/',
  send_email boolean not null default false,
  email_status text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy "notificaciones: propias" on public.notifications for select to authenticated using (user_id = auth.uid());
alter publication supabase_realtime add table public.notifications;

create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns void
language sql security definer set search_path = public as $$
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
$$;
revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

create or replace function public.set_email_notifications(p_on boolean) returns void
language sql security definer set search_path = public as $$
  update profiles set email_notifications = p_on where id = auth.uid();
$$;
revoke execute on function public.set_email_notifications(boolean) from public, anon;
grant execute on function public.set_email_notifications(boolean) to authenticated;

-- Crear avisos (uso interno)
create or replace function public.notify_users(p_users uuid[], p_kind text, p_title text, p_body text, p_url text, p_email boolean) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, title, body, url, send_email)
  select u, p_kind, p_title, p_body, p_url, p_email from unnest(p_users) u where u is not null;
$$;
create or replace function public.company_user_ids(p_company uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(user_id), '{}') from company_members where company_id = p_company;
$$;
create or replace function public.short_name(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select trim(first_name || ' ' || case when last_name <> '' then left(last_name,1) || '.' else '' end) from profiles where id = p_user;
$$;
create or replace function public.fmt_cl(t timestamptz) returns text
language sql immutable as $$
  select (array['dom','lun','mar','mié','jue','vie','sáb'])[extract(dow from t at time zone 'America/Santiago')::int + 1] || ' ' ||
         to_char(t at time zone 'America/Santiago', 'DD/MM "a las" HH24:MI');
$$;

-- Cada aviso nuevo se despacha (push + correo) por la función de envío
create or replace function public.on_notification_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform notify_event('notification', new.id); return new; end $$;
create trigger on_notification_insert after insert on public.notifications for each row execute function public.on_notification_insert();

-- ===== Eventos =====
-- Match: avisar a quien NO lo completó
create or replace function public.notify_new_match() returns trigger
language plpgsql security definer set search_path = public as $$
declare job text := (select title from jobs where id = new.job_id);
        co text := (select display_name from companies where id = new.company_id);
begin
  if new.created_by_side = 'candidate' then
    perform notify_users(company_user_ids(new.company_id), 'match', '¡Nuevo match!',
      short_name(new.candidate_id) || ' también se interesó en «' || job || '». Ya pueden conversar.', '/chats/' || new.id, true);
  else
    perform notify_users(array[new.candidate_id], 'match', '¡Es match!',
      co || ' también se interesó en ti para «' || job || '». Ya pueden conversar y puedes agendar una entrevista.', '/chats/' || new.id, true);
  end if;
  return new;
end $$;

-- Cambios de etapa que hace la empresa: avisar a la persona candidata (push + correo)
create or replace function public.notify_stage_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare job text := (select title from jobs where id = new.job_id);
        co text := (select display_name from companies where id = new.company_id);
        t text; b text; u text := '/chats/' || new.id;
begin
  if new.stage is not distinct from old.stage then return new; end if;
  -- la etapa "entrevista" que se fija al reservar ya genera su propio aviso
  if new.stage = 'entrevista' and exists (select 1 from interviews where match_id = new.id and status = 'confirmada' and created_at > now() - interval '1 minute') then return new; end if;
  case new.stage
    when 'contacto' then t := 'Avanzaste en tu proceso'; b := co || ' quiere conversar contigo sobre «' || job || '». Revisa el chat.';
    when 'entrevista' then t := 'Te invitan a una entrevista'; b := co || ' quiere entrevistarte para «' || job || '». Elige un horario en el chat.'; u := '/chats/' || new.id || '/agendar';
    when 'oferta' then t := '¡Tienes una oferta!'; b := co || ' avanzó a la etapa de oferta para «' || job || '». Revisa el chat para conocer los detalles.';
    when 'contratado' then t := '¡Felicitaciones!'; b := co || ' te marcó como contratado/a para «' || job || '». ¡Mucho éxito en este nuevo desafío!';
    when 'descartado' then t := 'Actualización de tu proceso'; b := co || ' decidió avanzar con otras personas para «' || job || '». Gracias por tu interés: sigue explorando, hay más vacantes para ti.'; u := '/';
    else return new;
  end case;
  perform notify_users(array[new.candidate_id], 'stage_' || new.stage, t, b, u, true);
  return new;
end $$;
drop trigger if exists on_match_stage_change on public.matches;
create trigger on_match_stage_change after update of stage on public.matches for each row execute function public.notify_stage_change();

-- Entrevistas: reserva y cancelación
create or replace function public.on_interview_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare job text := (select title from jobs where id = new.job_id);
        co text := (select display_name from companies where id = new.company_id);
        modo text := case when new.mode = 'online' then 'videollamada' else 'presencial' end;
begin
  if tg_op = 'INSERT' then
    perform notify_users(company_user_ids(new.company_id), 'interview_booked', 'Nueva entrevista agendada',
      short_name(new.candidate_id) || ' reservó el ' || fmt_cl(new.starts_at) || ' para «' || job || '» (' || modo || ').', '/agenda', true);
    perform notify_users(array[new.candidate_id], 'interview_booked', 'Entrevista confirmada',
      'Tu entrevista con ' || co || ' es el ' || fmt_cl(new.starts_at) || ' (' || modo ||
      case when new.mode = 'online' then '). El enlace está en el chat.' else ' en ' || new.address || ').' end, '/chats/' || new.match_id, true);
  elsif new.status = 'cancelada' and old.status <> 'cancelada' then
    if new.cancelled_by = 'candidate' then
      perform notify_users(company_user_ids(new.company_id), 'interview_cancelled', 'Entrevista cancelada',
        short_name(new.candidate_id) || ' canceló la entrevista del ' || fmt_cl(new.starts_at) || '. El horario quedó libre.' ||
        case when new.cancel_reason <> '' then ' Motivo: ' || new.cancel_reason else '' end, '/agenda', true);
    else
      perform notify_users(array[new.candidate_id], 'interview_cancelled', 'Entrevista cancelada',
        co || ' canceló la entrevista del ' || fmt_cl(new.starts_at) || '.' ||
        case when new.cancel_reason <> '' then ' Motivo: ' || new.cancel_reason else '' end || ' Puedes elegir otro horario.', '/chats/' || new.match_id || '/agendar', true);
    end if;
  end if;
  return new;
end $$;

create or replace function public.send_interview_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in update interviews set reminder_sent = true
           where status = 'confirmada' and not reminder_sent and starts_at > now() and starts_at <= now() + interval '65 minutes'
           returning * loop
    perform notify_users(array[r.candidate_id], 'interview_reminder', 'Tu entrevista empieza pronto',
      'Hoy a las ' || to_char(r.starts_at at time zone 'America/Santiago', 'HH24:MI') || ' con ' || (select display_name from companies where id = r.company_id) ||
      case when r.mode = 'online' then '. Toca para ver el enlace.' else ' en ' || r.address || '.' end, '/chats/' || r.match_id, true);
    perform notify_users(company_user_ids(r.company_id), 'interview_reminder', 'Entrevista en 1 hora',
      short_name(r.candidate_id) || ' a las ' || to_char(r.starts_at at time zone 'America/Santiago', 'HH24:MI') || ' (' ||
      case when r.mode = 'online' then 'videollamada' else 'presencial' end || ').', '/chats/' || r.match_id, false);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Mensajes nuevos: solo push (sin campana ni correo), máximo uno cada 10 minutos por chat
create or replace function public.notify_new_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare m matches; recipients uuid[]; sender text; prev timestamptz;
begin
  select * into m from matches where id = new.match_id;
  select max(created_at) into prev from messages where match_id = new.match_id and sender_id = new.sender_id and id <> new.id;
  if prev is not null and prev > now() - interval '10 minutes' then return new; end if;
  if new.sender_id = m.candidate_id then
    recipients := company_user_ids(m.company_id); sender := short_name(m.candidate_id);
  else
    recipients := array[m.candidate_id]; sender := (select display_name from companies where id = m.company_id);
  end if;
  perform notify_users(recipients, 'message', 'Mensaje de ' || sender, left(new.body, 140), '/chats/' || m.id, false);
  return new;
end $$;
drop trigger if exists on_new_message on public.messages;
create trigger on_new_message after insert on public.messages for each row execute function public.notify_new_message();

-- Verificación de empresa
create or replace function public.notify_verification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.verification_status is distinct from old.verification_status then
    if new.verification_status = 'verified' then
      perform notify_users(company_user_ids(new.id), 'company_verified', '¡Tu empresa está verificada!',
        'Ya puedes publicar vacantes, revisar candidatos y abrir tu agenda de entrevistas.', '/', true);
    elsif new.verification_status in ('rejected','suspended') then
      perform notify_users(company_user_ids(new.id), 'company_' || new.verification_status, 'Revisión de tu empresa',
        case when new.verification_status = 'rejected' then 'No pudimos verificar tu empresa.' else 'Tu cuenta de empresa fue suspendida.' end ||
        case when new.verification_note <> '' then ' ' || new.verification_note else '' end, '/', true);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists on_company_verification on public.companies;
create trigger on_company_verification after update of verification_status on public.companies for each row execute function public.notify_verification();

do $$
declare f text;
begin
  foreach f in array array['notify_users(uuid[], text, text, text, text, boolean)','company_user_ids(uuid)','short_name(uuid)',
    'on_notification_insert()','notify_new_match()','notify_stage_change()','on_interview_change()','send_interview_reminders()',
    'notify_new_message()','notify_verification()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

insert into private.config (key, value) values ('email_from', 'VINKA <onboarding@resend.dev>') on conflict (key) do nothing;
