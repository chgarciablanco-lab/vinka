-- Migración aplicada en Supabase (20261109050005). Exportada tal cual desde supabase_migrations.schema_migrations.

alter table profiles add column if not exists show_online boolean not null default true;
alter table profiles add column if not exists last_seen_at timestamptz;

-- Latido: la app lo llama cada minuto mientras está abierta; "salir" marca desconectado al instante
create or replace function touch_presence(p_leaving boolean default false) returns void
language sql security definer set search_path = public as $$
  update profiles set last_seen_at = case when p_leaving then now() - interval '2 minutes' else now() end where id = auth.uid();
$$;

create or replace function set_show_online(p_on boolean) returns void
language sql security definer set search_path = public as $$
  update profiles set show_online = p_on where id = auth.uid();
$$;

create or replace function presence_bucket(ts timestamptz) returns text language sql stable set search_path = public as $$
  select case when ts is null then null
    when ts > now() - interval '90 seconds' then 'online'
    when ts > now() - interval '1 hour' then 'recent'
    when ts > now() - interval '24 hours' then 'today'
    when ts > now() - interval '7 days' then 'week' end
$$;

-- Estado de personas y empresas que quien consulta puede ver.
-- Reglas: si ocultas tu estado, tampoco ves el de otros. Solo se ve el estado de quien lo muestra.
-- Detalle (minutos) solo con relación real: match, mismo equipo, o postulante a tus vacantes.
-- Con perfiles públicos que una empresa revisa, solo se muestra "activo hoy / esta semana".
create or replace function presence(p_users uuid[] default '{}', p_companies uuid[] default '{}')
returns table(id uuid, kind text, status text, last_seen timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare me profiles;
begin
  select * into me from profiles where profiles.id = auth.uid();
  if me.id is null or not me.show_online then return; end if;
  return query
  with u as (
    select p.id, p.last_seen_at,
      exists (select 1 from matches m where not m.closed and (
               (m.candidate_id = p.id and is_company_member(m.company_id))
            or (m.candidate_id = me.id and exists (select 1 from company_members cm where cm.company_id = m.company_id and cm.user_id = p.id))))
      or exists (select 1 from company_members a join company_members b on a.company_id = b.company_id where a.user_id = me.id and b.user_id = p.id)
      or exists (select 1 from candidate_job_actions x join jobs j on j.id = x.job_id where x.candidate_id = p.id and x.action = 'interest' and is_company_member(j.company_id)) as close_rel,
      (me.role = 'company' and exists (select 1 from candidate_profiles cp where cp.user_id = p.id and cp.is_public and cp.onboarding_done)) as browsable
    from profiles p
    where p.id = any(p_users[1:200]) and p.id <> me.id and p.show_online
  )
  select u.id, 'user'::text,
    case when u.close_rel then presence_bucket(u.last_seen_at)
         when presence_bucket(u.last_seen_at) in ('online','recent','today') then 'today'
         else presence_bucket(u.last_seen_at) end,
    case when u.close_rel then u.last_seen_at end
  from u where (u.close_rel or u.browsable) and presence_bucket(u.last_seen_at) is not null
  union all
  -- Empresa: el miembro del equipo más reciente que muestre su estado
  select c.id, 'company'::text, presence_bucket(max(p.last_seen_at)), max(p.last_seen_at)
  from companies c join company_members cm on cm.company_id = c.id join profiles p on p.id = cm.user_id and p.show_online
  where c.id = any(p_companies[1:200]) and (c.verification_status = 'verified' or is_company_member(c.id))
  group by c.id having presence_bucket(max(p.last_seen_at)) is not null;
end $$;

revoke execute on function touch_presence(boolean), set_show_online(boolean), presence(uuid[], uuid[]), presence_bucket(timestamptz) from public, anon;
grant execute on function touch_presence(boolean), set_show_online(boolean), presence(uuid[], uuid[]) to authenticated;
