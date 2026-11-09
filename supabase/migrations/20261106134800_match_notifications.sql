-- Migración aplicada en Supabase (20261106134800). Exportada tal cual desde supabase_migrations.schema_migrations.

create extension if not exists pg_net with schema extensions;

-- Configuración privada (no expuesta a la API)
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.config (key text primary key, value text not null);
revoke all on private.config from public, anon, authenticated;
insert into private.config (key, value) values
  ('vapid_public', 'BOxLHigiOPa_dmBL-gQXnKllUTDi-oDuTJIvY4Qf42X1_r7jAoqfN0GE8MOKAck7ovSAvzaLscHfOeE1Pb-Yhao'),
  ('vapid_private', '<SECRETO: no se publica; está solo en la base>'),
  ('notify_secret', '<SECRETO: no se publica; está solo en la base>'),
  ('notify_url', 'https://jifhlhbntcfnvmcpbexo.supabase.co/functions/v1/notify-match'),
  ('app_url', 'https://vinka-alpha.vercel.app')
on conflict (key) do update set value = excluded.value;

create or replace function public.get_push_config() returns jsonb
language sql stable security definer set search_path = private as $$
  select jsonb_object_agg(key, value) from private.config;
$$;
revoke execute on function public.get_push_config() from public, anon, authenticated;
grant execute on function public.get_push_config() to service_role;

-- Quién completó el match y quién ya lo vio
alter table public.matches add column if not exists created_by_side text check (created_by_side in ('candidate','company'));
alter table public.matches add column if not exists candidate_seen boolean not null default false;
alter table public.matches add column if not exists company_seen boolean not null default false;
update public.matches set candidate_seen = true, company_seen = true;

drop function if exists public.try_match(uuid, uuid);
create or replace function public.try_match(p_job uuid, p_candidate uuid, p_side text) returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if exists (select 1 from candidate_job_actions where job_id = p_job and candidate_id = p_candidate and action = 'interest')
     and exists (select 1 from company_candidate_actions where job_id = p_job and candidate_id = p_candidate and action = 'interest') then
    select company_id into cid from jobs where id = p_job;
    insert into matches (job_id, candidate_id, company_id, created_by_side, candidate_seen, company_seen)
    values (p_job, p_candidate, cid, p_side, p_side = 'candidate', p_side = 'company')
    on conflict do nothing;
  end if;
end $$;
revoke execute on function public.try_match(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.after_candidate_action() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform try_match(new.job_id, new.candidate_id, 'candidate'); return new; end $$;
create or replace function public.after_company_action() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform try_match(new.job_id, new.candidate_id, 'company'); return new; end $$;
revoke execute on function public.after_candidate_action() from public, anon, authenticated;
revoke execute on function public.after_company_action() from public, anon, authenticated;

-- Marcar un match como visto (por mi lado)
create or replace function public.mark_match_seen(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update matches set candidate_seen = true where id = p_match and candidate_id = auth.uid();
  update matches set company_seen = true where id = p_match and is_company_member(company_id);
end $$;
revoke execute on function public.mark_match_seen(uuid) from public, anon;
grant execute on function public.mark_match_seen(uuid) to authenticated;

-- Suscripciones a notificaciones push (una por dispositivo)
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "push: propias" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Al crearse un match, avisar a la función que envía la notificación
create or replace function public.notify_new_match() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare cfg jsonb := (select jsonb_object_agg(key, value) from private.config);
begin
  perform net.http_post(
    url := cfg->>'notify_url',
    body := jsonb_build_object('match_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', cfg->>'notify_secret')
  );
  return new;
exception when others then
  return new; -- nunca bloquear el match por un fallo de notificación
end $$;
revoke execute on function public.notify_new_match() from public, anon, authenticated;
drop trigger if exists on_match_created on public.matches;
create trigger on_match_created after insert on public.matches for each row execute function public.notify_new_match();

-- Tiempo real para que la otra persona vea el match en la app abierta
alter publication supabase_realtime add table public.matches;
