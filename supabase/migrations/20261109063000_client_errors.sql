-- Registro de errores de pantalla (reemplaza un servicio externo de monitoreo mientras no se contrate uno).
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  message text not null,
  stack text,
  path text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_client_errors_created_at on public.client_errors (created_at desc);
create index if not exists idx_client_errors_user_id on public.client_errors (user_id);
alter table public.client_errors enable row level security;
create policy "errores: admin lee" on public.client_errors for select to authenticated using (is_admin());

create or replace function public.log_client_error(p_message text, p_stack text, p_path text, p_ua text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  -- máximo 20 registros por usuario (o anónimos en total) por hora, para que no sirva como vector de abuso
  if (select count(*) from client_errors where created_at > now() - interval '1 hour'
        and user_id is not distinct from uid) >= 20 then return; end if;
  insert into client_errors (user_id, message, stack, path, user_agent)
  values (uid, left(coalesce(p_message, ''), 500), left(p_stack, 4000), left(p_path, 300), left(p_ua, 300));
end $$;
revoke all on function public.log_client_error(text, text, text, text) from public;
grant execute on function public.log_client_error(text, text, text, text) to anon, authenticated;

-- se conservan 90 días
select cron.schedule('purge-client-errors', '23 7 * * *', $$delete from public.client_errors where created_at < now() - interval '90 days'$$);
