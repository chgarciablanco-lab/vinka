-- Asistente de ayuda (web y app) y bandeja de reportes de errores y mejoras de los usuarios.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  role text not null default '',
  kind text not null check (kind in ('error', 'mejora', 'consulta')),
  summary text not null check (length(summary) between 3 and 300),
  details text not null default '' check (length(details) <= 4000),
  path text not null default '',
  user_agent text not null default '',
  source text not null default 'formulario' check (source in ('formulario', 'asistente')),
  status text not null default 'nuevo' check (status in ('nuevo', 'revisando', 'resuelto', 'descartado')),
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists feedback_status_idx on public.feedback (status, created_at desc);
alter table public.feedback enable row level security;
drop policy if exists "reportes: leer propios" on public.feedback;
create policy "reportes: leer propios" on public.feedback for select to authenticated using (user_id = (select auth.uid()) or is_admin());

-- Crear un reporte (desde el formulario o desde el asistente). Aviso a administración.
create or replace function public.submit_feedback(p_kind text, p_summary text, p_details text default '', p_path text default '', p_agent text default '', p_source text default 'formulario', p_user uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_user uuid := coalesce(auth.uid(), case when current_user in ('service_role', 'postgres') then p_user end); v_role text;
begin
  if v_user is null then raise exception 'Inicia sesión para enviar un reporte'; end if;
  if p_kind not in ('error', 'mejora', 'consulta') then raise exception 'Tipo no válido'; end if;
  if length(trim(coalesce(p_summary, ''))) < 3 then raise exception 'Cuéntanos en pocas palabras qué pasó'; end if;
  if (select count(*) from feedback where user_id = v_user and created_at > now() - interval '1 day') >= 15 then
    raise exception 'Ya enviaste varios reportes hoy. Gracias; los estamos revisando.'; end if;
  select case when exists (select 1 from admins where user_id = v_user) then 'admin' else coalesce(role, '') end into v_role from profiles where id = v_user;
  insert into feedback (user_id, role, kind, summary, details, path, user_agent, source)
  values (v_user, coalesce(v_role, ''), p_kind, left(trim(p_summary), 300), left(coalesce(p_details, ''), 4000), left(coalesce(p_path, ''), 200), left(coalesce(p_agent, ''), 300),
    case when p_source = 'asistente' then 'asistente' else 'formulario' end)
  returning id into v_id;
  perform notify_users(array(select user_id from admins), 'feedback', case p_kind when 'error' then 'Error reportado' when 'mejora' then 'Sugerencia de mejora' else 'Consulta de un usuario' end,
    left(trim(p_summary), 140), '/sugerencias', false);
  return v_id;
end $$;
revoke execute on function public.submit_feedback(text, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.submit_feedback(text, text, text, text, text, text, uuid) to authenticated, service_role;

create or replace function public.admin_feedback() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'summary', f.summary, 'details', f.details, 'path', f.path, 'agent', f.user_agent,
      'source', f.source, 'status', f.status, 'note', f.admin_note, 'role', f.role, 'created_at', f.created_at,
      'name', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), 'email', u.email,
      'demo', exists (select 1 from seed.users su where su.id = f.user_id))
    order by case f.status when 'nuevo' then 0 when 'revisando' then 1 else 2 end, f.created_at desc)
    from feedback f left join profiles p on p.id = f.user_id left join auth.users u on u.id = f.user_id), '[]'::jsonb);
end $$;
revoke execute on function public.admin_feedback() from public, anon;
grant execute on function public.admin_feedback() to authenticated;

create or replace function public.admin_update_feedback(p_id uuid, p_status text, p_note text default '', p_notify boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare f feedback;
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  if p_status not in ('nuevo', 'revisando', 'resuelto', 'descartado') then raise exception 'Estado no válido'; end if;
  update feedback set status = p_status, admin_note = left(coalesce(p_note, ''), 1000), updated_at = now() where id = p_id returning * into f;
  if f.id is null then raise exception 'Reporte no encontrado'; end if;
  if p_notify and f.user_id is not null and p_status in ('resuelto', 'descartado') then
    perform notify_users(array[f.user_id], 'feedback', case when p_status = 'resuelto' then 'Gracias: lo revisamos' else 'Revisamos tu reporte' end,
      coalesce(nullif(trim(p_note), ''), case when f.kind = 'error' then 'Corregimos el problema que nos contaste.' else 'Gracias por tu sugerencia.' end), '/ayuda', false);
  end if;
end $$;
revoke execute on function public.admin_update_feedback(uuid, text, text, boolean) from public, anon;
grant execute on function public.admin_update_feedback(uuid, text, text, boolean) to authenticated;

-- Cupo diario del asistente (lo usa solo la función del servidor)
create table if not exists public.help_usage (viewer text not null, day date not null, count int not null default 0, primary key (viewer, day));
alter table public.help_usage enable row level security;
create or replace function public.help_quota(p_viewer text, p_limit int, p_global int) returns boolean
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'America/Santiago')::date; n int; g int;
begin
  if current_user not in ('service_role', 'postgres') then raise exception 'No autorizado'; end if;
  select coalesce(sum(count), 0) into g from help_usage where day = d;
  if g >= p_global then return false; end if;
  insert into help_usage (viewer, day, count) values (left(p_viewer, 80), d, 1)
  on conflict (viewer, day) do update set count = help_usage.count + 1 returning count into n;
  delete from help_usage where day < d - 30;
  return n <= p_limit;
end $$;
revoke execute on function public.help_quota(text, int, int) from public, anon, authenticated;
grant execute on function public.help_quota(text, int, int) to service_role;
