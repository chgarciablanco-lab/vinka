-- Migración aplicada en Supabase (20261109134232). Exportada tal cual desde supabase_migrations.schema_migrations.

alter table public.service_messages add column if not exists sender_kind text not null default 'candidate' check (sender_kind in ('candidate', 'advisor', 'admin'));
alter table public.service_requests add column if not exists assigned_name text not null default '';

create or replace function public.service_message_kind() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.sender_kind := case
    when exists (select 1 from service_requests r where r.id = new.request_id and r.candidate_id = new.sender_id) then 'candidate'
    when exists (select 1 from advisors a where a.user_id = new.sender_id) then 'advisor'
    else 'admin' end;
  return new;
end $$;
revoke execute on function public.service_message_kind() from public, anon, authenticated;
drop trigger if exists service_message_kind on public.service_messages;
create trigger service_message_kind before insert on public.service_messages for each row execute function public.service_message_kind();

do $$
declare d text;
begin
  d := replace(pg_get_functiondef('public.admin_assign_request(uuid,uuid)'::regprocedure),
    'update service_requests set assigned_to = p_advisor, updated_at = now() where id = p_id returning * into r;',
    'update service_requests set assigned_to = p_advisor, assigned_name = coalesce((select first_name from profiles where id = p_advisor), ''''), updated_at = now() where id = p_id returning * into r;');
  execute d;
end $$;
