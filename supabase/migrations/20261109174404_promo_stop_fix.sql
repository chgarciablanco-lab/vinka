-- Migración aplicada en Supabase (20261109174404). Exportada tal cual desde supabase_migrations.schema_migrations.

create or replace function public.stop_promotion(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p promotions;
begin
  select * into p from promotions where id = p_id;
  if p.id is null or not coalesce(p.candidate_id = auth.uid() or (p.company_id is not null and can_manage(p.company_id)) or is_admin(), false) then
    raise exception 'Destacado no encontrado'; end if;
  if p.status = 'solicitada' then update promotions set status = 'cancelada', updated_at = now() where id = p_id;
  elsif p.status in ('activa', 'pausada') then update promotions set status = 'finalizada', ends_at = least(coalesce(ends_at, now()), now()), updated_at = now() where id = p_id;
  else raise exception 'Este destacado ya terminó'; end if;
end $$;
revoke execute on function public.stop_promotion(uuid) from public, anon;
grant execute on function public.stop_promotion(uuid) to authenticated;
