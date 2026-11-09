-- Migración aplicada en Supabase (20261107043642). Exportada tal cual desde supabase_migrations.schema_migrations.

-- ===== Roles de equipo =====
alter table company_members drop constraint if exists company_members_role_chk;
alter table company_members add constraint company_members_role_chk check (role in ('owner','admin','recruiter','viewer'));

create or replace function member_role(cid uuid) returns text language sql stable security definer set search_path = public as
$$ select role from company_members where company_id = cid and user_id = auth.uid() $$;
create or replace function can_manage(cid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select role in ('owner','admin','recruiter') from company_members where company_id = cid and user_id = auth.uid()), false) $$;
create or replace function is_company_admin(cid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select role in ('owner','admin') from company_members where company_id = cid and user_id = auth.uid()), false) $$;

-- Políticas: quien solo "ve" (viewer) no edita
drop policy if exists "vacantes: crear" on jobs;
drop policy if exists "vacantes: editar" on jobs;
drop policy if exists "vacantes: borrar" on jobs;
create policy "vacantes: crear" on jobs for insert to authenticated with check (can_manage(company_id));
create policy "vacantes: editar" on jobs for update to authenticated using (can_manage(company_id)) with check (can_manage(company_id));
create policy "vacantes: borrar" on jobs for delete to authenticated using (can_manage(company_id) and status in ('draft','pending'));

drop policy if exists "empresa: editar" on companies;
create policy "empresa: editar" on companies for update to authenticated using (is_company_admin(id) or is_admin()) with check (is_company_admin(id) or is_admin());

drop policy if exists "acciones empresa: propias" on company_candidate_actions;
create policy "acciones empresa: leer" on company_candidate_actions for select to authenticated
  using (exists (select 1 from jobs j where j.id = job_id and is_company_member(j.company_id)));
create policy "acciones empresa: escribir" on company_candidate_actions for all to authenticated
  using (exists (select 1 from jobs j where j.id = job_id and can_manage(j.company_id)))
  with check (created_by = auth.uid() and exists (select 1 from jobs j join companies c on c.id = j.company_id
    where j.id = job_id and can_manage(j.company_id) and c.verification_status = 'verified' and j.status = 'published'));

drop policy if exists "externos: empresa" on external_applicants;
create policy "externos: leer" on external_applicants for select to authenticated using (is_company_member(company_id));
create policy "externos: escribir" on external_applicants for all to authenticated
  using (can_manage(company_id))
  with check (can_manage(company_id) and exists (select 1 from jobs j where j.id = job_id and j.company_id = external_applicants.company_id));

drop policy if exists "mensajes: enviar" on messages;
create policy "mensajes: enviar" on messages for insert to authenticated with check (
  sender_id = auth.uid() and is_match_participant(match_id)
  and exists (select 1 from matches m where m.id = match_id and (m.candidate_id = auth.uid() or can_manage(m.company_id))));

create or replace function public.match_update(p_match uuid, p_action text, p_stage text DEFAULT NULL::text)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare m matches; is_cand boolean; is_comp boolean;
begin
  select * into m from matches where id = p_match;
  if m.id is null then raise exception 'Match no encontrado'; end if;
  is_cand := m.candidate_id = auth.uid();
  is_comp := can_manage(m.company_id);
  if p_action = 'share_contact' and is_cand then update matches set contact_shared = true where id = p_match;
  elsif p_action = 'decline_contact' and is_cand then update matches set contact_requested = false where id = p_match;
  elsif p_action = 'request_contact' and is_comp then update matches set contact_requested = true where id = p_match;
  elsif p_action = 'stage' and is_comp and p_stage in ('match','contacto','entrevista','oferta','contratado','descartado') then
    update matches set stage = p_stage where id = p_match;
  elsif p_action = 'block' and (is_cand or is_company_member(m.company_id)) then
    update matches set closed = true where id = p_match;
    insert into audit_logs (actor_id, action, entity, entity_id) values (auth.uid(), 'block', 'match', p_match);
  else raise exception 'Acción no permitida';
  end if;
end $function$;

-- ===== Invitaciones al equipo =====
create table if not exists company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('admin','recruiter','viewer')),
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz, accepted_by uuid references auth.users(id) on delete set null
);
alter table company_invites enable row level security;
create policy "invitaciones equipo: leer" on company_invites for select to authenticated using (is_company_member(company_id));

create or replace function team_members(p_company uuid)
returns table(user_id uuid, name text, email text, role text, is_me boolean)
language sql stable security definer set search_path = public, auth as $$
  select cm.user_id, trim(p.first_name || ' ' || p.last_name), u.email::text, cm.role, cm.user_id = auth.uid()
  from company_members cm join profiles p on p.id = cm.user_id join auth.users u on u.id = cm.user_id
  where cm.company_id = p_company and is_company_member(p_company)
  order by case cm.role when 'owner' then 0 when 'admin' then 1 when 'recruiter' then 2 else 3 end, p.first_name;
$$;

create or replace function invite_member(p_company uuid, p_email text, p_role text) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid; e text := lower(trim(p_email));
begin
  if not is_company_admin(p_company) then raise exception 'Solo quien administra la empresa puede invitar'; end if;
  if p_role not in ('admin','recruiter','viewer') then raise exception 'Rol no válido'; end if;
  if exists (select 1 from company_members cm join auth.users u on u.id = cm.user_id where cm.company_id = p_company and lower(u.email) = e) then
    raise exception 'Esa persona ya es parte del equipo'; end if;
  if (select count(*) from company_members where company_id = p_company) >= 25 then raise exception 'El equipo llegó al máximo de 25 personas'; end if;
  delete from company_invites where company_id = p_company and lower(email) = e and accepted_at is null;
  insert into company_invites (company_id, email, role, invited_by) values (p_company, e, p_role, auth.uid()) returning id into v_id;
  perform notify_event('member_invite', v_id);
  return v_id;
end $$;

create or replace function cancel_member_invite(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from company_invites where id = p_id and accepted_at is null and is_company_admin(company_id);
end $$;

create or replace function set_member_role(p_company uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_company_admin(p_company) then raise exception 'Solo quien administra la empresa puede cambiar roles'; end if;
  if p_role not in ('admin','recruiter','viewer') then raise exception 'Rol no válido'; end if;
  if (select role from company_members where company_id = p_company and user_id = p_user) = 'owner' then raise exception 'No se puede cambiar el rol de quien creó la empresa'; end if;
  update company_members set role = p_role where company_id = p_company and user_id = p_user;
end $$;

create or replace function remove_member(p_company uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user <> auth.uid() and not is_company_admin(p_company) then raise exception 'No tienes permiso'; end if;
  if (select role from company_members where company_id = p_company and user_id = p_user) = 'owner' then raise exception 'No se puede quitar a quien creó la empresa'; end if;
  delete from company_members where company_id = p_company and user_id = p_user;
end $$;

-- Datos públicos mínimos de una invitación (para la página de aceptar)
create or replace function get_member_invite(p_token uuid)
returns table(company_name text, email text, role text, accepted boolean)
language sql stable security definer set search_path = public as $$
  select c.display_name, i.email, i.role, i.accepted_at is not null
  from company_invites i join companies c on c.id = i.company_id
  where i.token = p_token and i.created_at > now() - interval '30 days';
$$;

create or replace function join_company(p_user uuid, p_email text, p_token uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare i company_invites;
begin
  select * into i from company_invites where token = p_token and accepted_at is null and created_at > now() - interval '30 days';
  if i.id is null then raise exception 'La invitación no es válida o ya fue usada'; end if;
  if lower(i.email) <> lower(p_email) then raise exception 'Esta invitación es para %. Ingresa con ese correo.', i.email; end if;
  if exists (select 1 from company_members where user_id = p_user and company_id <> i.company_id) then
    raise exception 'Tu cuenta ya pertenece a otra empresa en VINKA. Usa otro correo.'; end if;
  insert into company_members (company_id, user_id, role) values (i.company_id, p_user, i.role) on conflict (company_id, user_id) do update set role = excluded.role;
  update company_invites set accepted_at = now(), accepted_by = p_user where id = i.id;
  perform notify_users(array[i.invited_by], 'team_joined', 'Se unió alguien a tu equipo',
    coalesce((select trim(first_name||' '||last_name) from profiles where id = p_user), i.email) || ' aceptó tu invitación a VINKA.', '/equipo', false);
  return i.company_id;
end $$;

create or replace function accept_member_invite(p_token uuid) returns uuid
language plpgsql security definer set search_path = public, auth as $$
begin
  if (select role from profiles where id = auth.uid()) <> 'company' then
    raise exception 'Esta cuenta es de candidato/a. Crea una cuenta de empresa con el correo invitado.'; end if;
  return join_company(auth.uid(), (select email from auth.users where id = auth.uid()), p_token);
end $$;

-- Registro de una persona invitada: se une al equipo automáticamente
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare r text := coalesce(new.raw_user_meta_data->>'role','candidate');
        t text := new.raw_user_meta_data->>'team_invite';
begin
  if r not in ('candidate','company') then r := 'candidate'; end if;
  insert into profiles (id, role, first_name, last_name, phone, marketing_opt_in, terms_accepted_at)
  values (new.id, r,
    coalesce(new.raw_user_meta_data->>'first_name',''),
    coalesce(new.raw_user_meta_data->>'last_name',''),
    nullif(new.raw_user_meta_data->>'phone',''),
    coalesce((new.raw_user_meta_data->>'marketing_opt_in')::boolean, false),
    case when (new.raw_user_meta_data->>'terms_accepted')::boolean then now() end);
  if r = 'candidate' then insert into candidate_profiles (user_id) values (new.id); end if;
  if r = 'company' and t ~ '^[0-9a-f-]{36}$' then
    begin perform join_company(new.id, new.email, t::uuid); exception when others then null; end;
  end if;
  if lower(new.email) = 'chgarciablanco@gmail.com' then insert into admins (user_id) values (new.id) on conflict do nothing; end if;
  return new;
end $function$;

revoke execute on function member_role(uuid), can_manage(uuid), is_company_admin(uuid), team_members(uuid), invite_member(uuid,text,text),
  cancel_member_invite(uuid), set_member_role(uuid,uuid,text), remove_member(uuid,uuid), accept_member_invite(uuid), join_company(uuid,text,uuid) from public, anon;
grant execute on function member_role(uuid), can_manage(uuid), is_company_admin(uuid), team_members(uuid), invite_member(uuid,text,text),
  cancel_member_invite(uuid), set_member_role(uuid,uuid,text), remove_member(uuid,uuid), accept_member_invite(uuid) to authenticated;
revoke execute on function join_company(uuid,text,uuid) from authenticated;
grant execute on function get_member_invite(uuid) to anon, authenticated;
