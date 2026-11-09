-- Migración aplicada en Supabase (20261107040452). Exportada tal cual desde supabase_migrations.schema_migrations.

create table if not exists public.ai_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null default (now() at time zone 'America/Santiago')::date,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
create policy "ia: ver mi uso" on public.ai_usage for select to authenticated using (user_id = auth.uid());

-- Suma un uso y devuelve si quedan usos disponibles hoy (solo la función de IA la llama)
create or replace function public.ai_take(p_user uuid, p_limit int) returns int
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  insert into ai_usage (user_id, day, count) values (p_user, (now() at time zone 'America/Santiago')::date, 1)
  on conflict (user_id, day) do update set count = ai_usage.count + 1
  returning count into c;
  return c;
end $$;
revoke execute on function public.ai_take(uuid, int) from public, anon, authenticated;
grant execute on function public.ai_take(uuid, int) to service_role;

insert into private.config (key, value) values ('ai_daily_limit', '40'), ('ai_model', 'claude-haiku-5-5')
on conflict (key) do nothing;
