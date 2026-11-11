-- Administración de VINKA: registro de usuarios de empresas y gestión del equipo de cualquier empresa
-- (invitar, cambiar rol, quitar, cancelar invitaciones). Cada acción de VINKA queda en audit_logs.
create table if not exists backup.company_members_20261111 as select * from public.company_members;

do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.invite_member'::regproc);
  n := replace(d, 'if not is_company_admin(p_company) then raise exception ''Solo quien administra la empresa puede invitar''; end if;',
                  'if not (is_company_admin(p_company) or is_admin()) then raise exception ''Solo quien administra la empresa puede invitar''; end if;');
  if n = d then raise exception 'invite_member'; end if; execute n;

  d := pg_get_functiondef('public.set_member_role'::regproc);
  n := replace(d, 'if not is_company_admin(p_company) then raise exception', 'if not (is_company_admin(p_company) or is_admin()) then raise exception');
  if n = d then raise exception 'set_member_role'; end if; execute n;

  d := pg_get_functiondef('public.remove_member'::regproc);
  n := replace(d, 'if p_user <> auth.uid() and not is_company_admin(p_company) then', 'if p_user <> auth.uid() and not (is_company_admin(p_company) or is_admin()) then');
  if n = d then raise exception 'remove_member'; end if; execute n;

  d := pg_get_functiondef('public.cancel_member_invite'::regproc);
  n := replace(d, 'and is_company_admin(company_id);', 'and (is_company_admin(company_id) or is_admin());');
  if n = d then raise exception 'cancel_member_invite'; end if; execute n;

  d := pg_get_functiondef('public.team_members'::regproc);
  n := replace(d, 'where cm.company_id = p_company and is_company_member(p_company)', 'where cm.company_id = p_company and (is_company_member(p_company) or is_admin())');
  if n = d then raise exception 'team_members'; end if; execute n;
end $mig$;

-- Registro de acciones de VINKA sobre equipos de empresas
create or replace function public.audit_admin_team() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() and not exists (select 1 from company_members m where m.user_id = auth.uid() and m.company_id = coalesce(new.company_id, old.company_id)) then
    insert into audit_logs (actor_id, action, entity, entity_id, detail)
    values (auth.uid(), 'admin_team_' || lower(tg_op), 'company', coalesce(new.company_id, old.company_id),
      jsonb_build_object('user', coalesce(new.user_id, old.user_id), 'from', case when tg_op <> 'INSERT' then old.role end, 'to', case when tg_op <> 'DELETE' then new.role end));
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists audit_admin_team on public.company_members;
create trigger audit_admin_team after update or delete on public.company_members for each row execute function public.audit_admin_team();

create or replace function public.admin_company_team(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  return jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', cm.user_id, 'name', trim(p.first_name || ' ' || p.last_name), 'email', u.email, 'phone', p.phone,
        'role', cm.role, 'since', cm.created_at, 'last_seen_at', p.last_seen_at, 'suspended', p.suspended_at is not null, 'confirmed', u.email_confirmed_at is not null)
        order by case cm.role when 'owner' then 0 when 'admin' then 1 when 'recruiter' then 2 when 'client' then 3 else 4 end, p.first_name)
      from company_members cm join profiles p on p.id = cm.user_id join auth.users u on u.id = cm.user_id where cm.company_id = p_company), '[]'::jsonb),
    'invites', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'role', i.role, 'created_at', i.created_at) order by i.created_at desc)
      from company_invites i where i.company_id = p_company and i.accepted_at is null and i.created_at > now() - interval '30 days'), '[]'::jsonb),
    'inherited', coalesce((select jsonb_agg(jsonb_build_object('name', trim(p.first_name || ' ' || p.last_name), 'email', u.email, 'role', cm.role))
      from company_members cm join profiles p on p.id = cm.user_id join auth.users u on u.id = cm.user_id
      where cm.company_id = (select parent_id from companies where id = p_company) and cm.role <> 'client'), '[]'::jsonb));
end $$;

create or replace function public.admin_company_users(p_q text default '', p_limit int default 50, p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare q text := lower(trim(coalesce(p_q, '')));
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  return jsonb_build_object(
    'total', (select count(*) from company_members cm join profiles p on p.id = cm.user_id join auth.users u on u.id = cm.user_id join companies c on c.id = cm.company_id
      where not exists (select 1 from seed.users s where s.id = cm.user_id)
        and (q = '' or lower(p.first_name || ' ' || p.last_name || ' ' || u.email || ' ' || c.display_name) like '%' || q || '%')),
    'users', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('user_id', cm.user_id, 'name', trim(p.first_name || ' ' || p.last_name), 'email', u.email, 'role', cm.role, 'company_id', c.id, 'company', c.display_name,
        'managed_by', (select pc.display_name from companies pc where pc.id = c.parent_id), 'since', cm.created_at, 'last_seen_at', p.last_seen_at,
        'suspended', p.suspended_at is not null, 'confirmed', u.email_confirmed_at is not null) x
      from company_members cm join profiles p on p.id = cm.user_id join auth.users u on u.id = cm.user_id join companies c on c.id = cm.company_id
      where not exists (select 1 from seed.users s where s.id = cm.user_id)
        and (q = '' or lower(p.first_name || ' ' || p.last_name || ' ' || u.email || ' ' || c.display_name) like '%' || q || '%')
      order by c.display_name, case cm.role when 'owner' then 0 when 'admin' then 1 when 'recruiter' then 2 when 'client' then 3 else 4 end
      limit least(coalesce(p_limit, 50), 200) offset greatest(coalesce(p_offset, 0), 0)) t), '[]'::jsonb));
end $$;
revoke execute on function public.admin_company_team(uuid), public.admin_company_users(text, int, int) from public, anon;
grant execute on function public.admin_company_team(uuid), public.admin_company_users(text, int, int) to authenticated;
