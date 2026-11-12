-- Mensajes no leídos del asesor fuera de los chats con candidatos: sus asesorías, el chat con el equipo VINKA
-- y los chats de colaboración con otros asesores. Se cuenta solo lo que llegó desde que existe este registro.
create table public.advisor_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  thread text not null check (thread ~ '^(team|req:[0-9a-f-]{36}|collab:[0-9a-f-]{36}:[0-9a-f-]{36})$'),
  read_at timestamptz not null default now(),
  primary key (user_id, thread)
);
alter table public.advisor_reads enable row level security;
revoke all on public.advisor_reads from anon, authenticated;

-- Desde cuándo se cuentan los no leídos (antes de esto, todo se considera leído)
create or replace function public.advisor_unread_since()
returns timestamptz language sql immutable set search_path = public as $$ select '2026-11-12 14:30:00+00'::timestamptz $$;

create or replace function public.advisor_unread()
returns jsonb language sql stable security definer set search_path = public as $$
  with r as (select thread, read_at from advisor_reads where user_id = auth.uid()),
  req as (
    select q.id::text k, count(*)::int n from service_requests q
    join service_messages m on m.request_id = q.id and m.sender_id is distinct from auth.uid()
    left join r on r.thread = 'req:' || q.id
    where q.assigned_to = auth.uid() and m.created_at > greatest(coalesce(r.read_at, '-infinity'), advisor_unread_since())
    group by q.id),
  team as (
    select count(*)::int n from team_notes t left join r on r.thread = 'team'
    where t.advisor_id = auth.uid() and t.sender_id is distinct from auth.uid() and t.created_at > greatest(coalesce(r.read_at, '-infinity'), advisor_unread_since())),
  col as (
    select c.job_id || ':' || c.user_id k, count(*)::int n from job_collaborators c join jobs j on j.id = c.job_id
    join collab_messages m on m.job_id = c.job_id and m.collaborator_id = c.user_id and m.sender_id is distinct from auth.uid()
    left join r on r.thread = 'collab:' || c.job_id || ':' || c.user_id
    where (c.user_id = auth.uid() or is_company_member(j.company_id))
      and m.created_at > greatest(coalesce(r.read_at, '-infinity'), advisor_unread_since())
    group by c.job_id, c.user_id)
  select case when not is_advisor() then '{}'::jsonb else jsonb_build_object(
    'asesorias', coalesce((select sum(n) from req), 0),
    'equipo', coalesce((select n from team), 0),
    'asesores', coalesce((select sum(n) from col), 0),
    'by_request', coalesce((select jsonb_object_agg(k, n) from req), '{}'::jsonb),
    'by_collab', coalesce((select jsonb_object_agg(k, n) from col), '{}'::jsonb)) end
$$;

create or replace function public.advisor_mark_read(p_thread text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_advisor() then return; end if;
  insert into advisor_reads (user_id, thread, read_at) values (auth.uid(), p_thread, now())
  on conflict (user_id, thread) do update set read_at = now();
end $$;

revoke execute on function public.advisor_unread(), public.advisor_mark_read(text) from public, anon;
grant execute on function public.advisor_unread(), public.advisor_mark_read(text) to authenticated;
revoke execute on function public.advisor_unread_since() from public, anon, authenticated;
