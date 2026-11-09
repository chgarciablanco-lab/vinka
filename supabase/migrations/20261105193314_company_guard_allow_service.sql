-- Migración aplicada en Supabase (20261105193314). Exportada tal cual desde supabase_migrations.schema_migrations.

create or replace function public.company_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare api boolean := coalesce(auth.role(), '') in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    if api and not is_admin() then new.verification_status := 'pending'; new.verification_note := ''; end if;
    return new;
  end if;
  if (new.verification_status is distinct from old.verification_status or new.verification_note is distinct from old.verification_note) then
    if api and not is_admin() then raise exception 'Solo administración puede cambiar la verificación'; end if;
    insert into audit_logs (actor_id, action, entity, entity_id, detail)
    values (auth.uid(), 'verification_change', 'company', new.id, jsonb_build_object('from', old.verification_status, 'to', new.verification_status, 'note', new.verification_note));
  end if;
  new.owner_id := old.owner_id;
  return new;
end $$;
revoke execute on function public.company_guard() from public, anon, authenticated;
