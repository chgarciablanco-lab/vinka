-- Migración aplicada en Supabase (20261109050604). Exportada tal cual desde supabase_migrations.schema_migrations.

alter table profiles add column if not exists away_until timestamptz;
alter table profiles add column if not exists away_message text not null default '' check (length(away_message) <= 140);

create or replace function set_away(p_until timestamptz, p_message text default '') returns void
language sql security definer set search_path = public as $$
  update profiles set away_until = case when p_until is null or p_until <= now() then null else least(p_until, now() + interval '60 days') end,
    away_message = case when p_until is null or p_until <= now() then '' else left(trim(coalesce(p_message,'')), 140) end
  where id = auth.uid();
$$;

drop function if exists presence(uuid[], uuid[]);
create function presence(p_users uuid[] default '{}', p_companies uuid[] default '{}')
returns table(id uuid, kind text, status text, last_seen timestamptz, away_until timestamptz, away_message text)
language plpgsql stable security definer set search_path = public as $$
declare me profiles;
begin
  select * into me from profiles where profiles.id = auth.uid();
  if me.id is null then return; end if;
  return query
  with u as (
    select p.id, p.last_seen_at, p.show_online, p.away_until a_until, p.away_message a_msg,
      exists (select 1 from matches m where not m.closed and (
               (m.candidate_id = p.id and is_company_member(m.company_id))
            or (m.candidate_id = me.id and exists (select 1 from company_members cm where cm.company_id = m.company_id and cm.user_id = p.id))))
      or exists (select 1 from company_members a join company_members b on a.company_id = b.company_id where a.user_id = me.id and b.user_id = p.id)
      or exists (select 1 from candidate_job_actions x join jobs j on j.id = x.job_id where x.candidate_id = p.id and x.action = 'interest' and is_company_member(j.company_id)) as close_rel,
      (me.role = 'company' and exists (select 1 from candidate_profiles cp where cp.user_id = p.id and cp.is_public and cp.onboarding_done)) as browsable
    from profiles p
    where p.id = any(p_users[1:200]) and p.id <> me.id
  )
  -- "No disponible" se muestra siempre a quien tiene relación (es un aviso intencional)
  select u.id, 'user'::text, 'away'::text, null::timestamptz, u.a_until, case when u.close_rel then u.a_msg else '' end
  from u where u.a_until > now() and (u.close_rel or u.browsable)
  union all
  -- En línea / última conexión: solo si ambos lo muestran
  select u.id, 'user'::text,
    case when u.close_rel then presence_bucket(u.last_seen_at)
         when presence_bucket(u.last_seen_at) in ('online','recent','today') then 'today'
         else presence_bucket(u.last_seen_at) end,
    case when u.close_rel then u.last_seen_at end, null::timestamptz, ''::text
  from u where me.show_online and u.show_online and not coalesce(u.a_until > now(), false)
    and (u.close_rel or u.browsable) and presence_bucket(u.last_seen_at) is not null
  union all
  -- Empresa: estado de quienes están disponibles; si todo el equipo está "no disponible", la empresa aparece así
  select c.id, 'company'::text,
    case when bool_or(coalesce(p.away_until > now(), false) = false and p.show_online and me.show_online and presence_bucket(p.last_seen_at) is not null)
      then presence_bucket(max(p.last_seen_at) filter (where coalesce(p.away_until > now(), false) = false and p.show_online))
      when bool_and(coalesce(p.away_until > now(), false)) then 'away' end,
    case when me.show_online then max(p.last_seen_at) filter (where coalesce(p.away_until > now(), false) = false and p.show_online) end,
    case when bool_and(coalesce(p.away_until > now(), false)) then min(p.away_until) end,
    case when bool_and(coalesce(p.away_until > now(), false)) then (array_agg(p.away_message order by p.away_until) filter (where p.away_message <> ''))[1] else '' end
  from companies c join company_members cm on cm.company_id = c.id join profiles p on p.id = cm.user_id
  where c.id = any(p_companies[1:200]) and (c.verification_status = 'verified' or is_company_member(c.id))
  group by c.id
  having (bool_and(coalesce(p.away_until > now(), false))
      or bool_or(coalesce(p.away_until > now(), false) = false and p.show_online and me.show_online and presence_bucket(p.last_seen_at) is not null));
end $$;

revoke execute on function presence(uuid[], uuid[]), set_away(timestamptz, text) from public, anon;
grant execute on function presence(uuid[], uuid[]), set_away(timestamptz, text) to authenticated;
