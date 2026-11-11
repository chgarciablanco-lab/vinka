-- Cotizaciones desde la web: formulario propio (no el registro de empresa), con el motivo y los antecedentes mínimos.
create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reason text not null default 'plan',
  plan_id text,
  company_name text not null,
  rut text not null default '',
  contact_name text not null,
  contact_role text not null default '',
  email text not null,
  phone text not null default '',
  company_size text not null default '',
  open_jobs int,
  hires_year int,
  regions text not null default '',
  message text not null default '',
  path text not null default '',
  status text not null default 'nuevo' check (status in ('nuevo', 'contactado', 'cotizado', 'cerrado', 'descartado')),
  admin_note text not null default '',
  updated_at timestamptz not null default now(),
  constraint quote_reason_check check (reason in ('plan', 'consultora', 'volumen', 'otro'))
);
alter table public.quote_requests enable row level security;
create policy "cotizaciones: solo administración" on public.quote_requests for select using ((select is_admin()));

create or replace function public.submit_quote(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text := lower(trim(coalesce(p->>'email', ''))); v_rut text := upper(regexp_replace(coalesce(p->>'rut', ''), '[^0-9kK-]', '', 'g'));
begin
  if coalesce(trim(p->>'company_name'), '') = '' or coalesce(trim(p->>'contact_name'), '') = '' then raise exception 'Indica el nombre de la empresa y tu nombre'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Revisa el correo'; end if;
  if v_rut <> '' and v_rut !~ '^[0-9]{7,8}-[0-9K]$' then raise exception 'RUT no válido (ej.: 76.123.456-7)'; end if;
  if coalesce(p->>'reason', 'plan') not in ('plan', 'consultora', 'volumen', 'otro') then raise exception 'Motivo no válido'; end if;
  if not coalesce((p->>'consent')::boolean, false) then raise exception 'Para responderte necesitamos tu autorización para usar estos datos'; end if;
  if (select count(*) from quote_requests where email = v_email and created_at > now() - interval '1 day') >= 3 then raise exception 'Ya recibimos tu solicitud. Te responderemos pronto.'; end if;
  if (select count(*) from quote_requests where created_at > now() - interval '1 hour') >= 60 then raise exception 'Estamos recibiendo muchas solicitudes. Intenta en unos minutos.'; end if;
  insert into quote_requests (reason, plan_id, company_name, rut, contact_name, contact_role, email, phone, company_size, open_jobs, hires_year, regions, message, path)
  values (coalesce(p->>'reason', 'plan'), nullif(p->>'plan_id', ''), left(trim(p->>'company_name'), 160), v_rut, left(trim(p->>'contact_name'), 120), left(coalesce(trim(p->>'contact_role'), ''), 120),
    v_email, left(coalesce(trim(p->>'phone'), ''), 30), left(coalesce(p->>'company_size', ''), 40),
    nullif(regexp_replace(coalesce(p->>'open_jobs', ''), '\D', '', 'g'), '')::int, nullif(regexp_replace(coalesce(p->>'hires_year', ''), '\D', '', 'g'), '')::int,
    left(coalesce(p->>'regions', ''), 300), left(coalesce(trim(p->>'message'), ''), 2000), left(coalesce(p->>'path', ''), 200))
  returning id into v_id;
  perform notify_users(array(select user_id from admins), 'plan', 'Nueva solicitud de cotización',
    left(trim(p->>'company_name'), 80) || ' · ' || coalesce(nullif(p->>'plan_id', ''), p->>'reason') || ' · ' || coalesce(nullif(p->>'open_jobs', ''), '?') || ' vacantes a la vez.', '/', true);
  return v_id;
end $$;
grant execute on function public.submit_quote(jsonb) to anon, authenticated;

create or replace function public.admin_update_quote(p_id uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  update quote_requests set status = p_status, admin_note = left(coalesce(p_note, ''), 2000), updated_at = now() where id = p_id;
end $$;
revoke execute on function public.admin_update_quote(uuid, text, text) from public, anon;
grant execute on function public.admin_update_quote(uuid, text, text) to authenticated;
