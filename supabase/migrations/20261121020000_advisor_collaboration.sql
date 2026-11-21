-- Colaboración y crédito de asesores (fase 1 corregida, 20-11-2026). Sin dinero: solo registro, permisos y atribución.
-- Reemplaza la fase 1 del 18-11, que nunca se aplicó en producción. Diseño: «VINKA · Fase 1 corregida — arquitectura propuesta».
--  1) Captación de empresas por estados: registrada → contactada → verificada → activada (reserva 30 días, activación hasta el día 60)
--  2) Roles: captador y encargado de cuenta por empresa; responsable por vacante
--  3) Autorización de representación explícita y revocable (12 meses)
--  4) Propuestas de candidatos solo con autorización vigente
--  5) Vacantes abiertas a la red, solicitudes para colaborar y «Oportunidades»
--  6) Ficha de atribución: confirmación automática a los 7 días, nadie confirma lo propio, VINKA resuelve desacuerdos
--  7) Verificación automática de empresas de bajo riesgo, con revisión posterior de VINKA
--  8) Embudo de indicadores
create schema if not exists backup;
create table if not exists backup.fn_company_guard_20261121 as select now() saved_at, pg_get_functiondef('public.company_guard()'::regprocedure) def;

-- ───────── Ayudantes ─────────
create or replace function public.advisor_approved(p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from advisors a join advisor_profiles ap on ap.user_id = a.user_id
                 where a.user_id = p_user and a.active and a.terms_accepted_at is not null and ap.pub is not null) $$;

create or replace function public.is_demo_user(p_user uuid) returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from auth.users u where u.id = p_user and (u.email like '%@example.com' or coalesce(u.raw_app_meta_data->>'demo', '') = 'true')) $$;

create or replace function public.email_domain(p text) returns text language sql immutable as $$
  select nullif(lower(split_part(trim(coalesce(p, '')), '@', 2)), '') $$;

create or replace function public.web_domain(p text) returns text language sql immutable as $$
  select nullif(split_part(regexp_replace(regexp_replace(lower(trim(coalesce(p, ''))), '^[a-z]+://', ''), '^www\.', ''), '/', 1), '') $$;

create or replace function public.free_email_domain(p text) returns boolean language sql immutable as $$
  select coalesce(p, '') in ('gmail.com', 'gmail.cl', 'googlemail.com', 'hotmail.com', 'hotmail.cl', 'hotmail.es', 'outlook.com', 'outlook.cl', 'outlook.es',
    'live.com', 'live.cl', 'msn.com', 'yahoo.com', 'yahoo.es', 'yahoo.cl', 'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me', 'aol.com', 'gmx.com', 'zoho.com') $$;

-- RUT que ya publica o publicó en VINKA (con cualquier cuenta)
create or replace function public.rut_has_published(p_rut text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from jobs j join companies c on c.id = j.company_id
                 where rut_clean(c.rut) = rut_clean(p_rut) and j.status in ('published', 'paused', 'closed')) $$;

-- ───────── Columnas nuevas ─────────
alter table public.jobs add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.jobs add column if not exists network_open boolean not null default false;
alter table public.jobs add column if not exists network_open_at timestamptz;
create index if not exists idx_jobs_owner on public.jobs (owner_id);
create index if not exists idx_jobs_network on public.jobs (network_open_at desc) where network_open;
alter table public.companies add column if not exists verification_method text not null default 'manual';
alter table public.companies add column if not exists auto_verified_at timestamptz;
alter table public.companies add column if not exists auto_reviewed_at timestamptz;
do $c$ begin
  alter table public.companies add constraint companies_verification_method_check check (verification_method in ('manual', 'automatica'));
exception when duplicate_object then null; end $c$;

-- Responsable de cada vacante existente: el dueño de su empresa (se guarda qué filas se llenaron)
create table if not exists backup.jobs_owner_20261121 as select id, owner_id from public.jobs where owner_id is null;
update public.jobs j set owner_id = c.owner_id from public.companies c where c.id = j.company_id and j.owner_id is null;

-- Responsable y apertura a la red solo cambian por funciones
create or replace function public.job_owner_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare api boolean := coalesce(auth.role(), '') in ('authenticated', 'anon'); internal boolean := coalesce(current_setting('vinka.job_admin', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    if new.owner_id is null or (api and not internal and not is_admin()) then
      new.owner_id := coalesce(auth.uid(), (select owner_id from companies where id = new.company_id)); end if;
    if api and not internal and not is_admin() then new.network_open := false; new.network_open_at := null; end if;
    return new;
  end if;
  if api and not internal and not is_admin() then
    new.owner_id := old.owner_id; new.network_open := old.network_open; new.network_open_at := old.network_open_at;
  end if;
  if new.status = 'closed' and old.status is distinct from 'closed' then new.network_open := false; end if;
  return new;
end $$;
drop trigger if exists job_owner_guard on public.jobs;
create trigger job_owner_guard before insert or update on public.jobs for each row execute function public.job_owner_guard();

-- ───────── Verificación: permisos internos ─────────
-- company_guard: las funciones internas (espacio del asesor y verificación automática) pueden fijar la verificación.
-- Los usuarios no pueden fijar variables vinka.*.
do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.company_guard()'::regprocedure);
  if strpos(d, 'vinka.company_verify') > 0 then return; end if;
  n := replace(d, 'if api and not is_admin() then new.verification_status := ''pending'';',
    'if api and not is_admin() and coalesce(current_setting(''vinka.company_verify'', true), '''') <> ''1'' then new.verification_status := ''pending'';');
  n := replace(n, 'if api and not is_admin() then raise exception ''Solo administración puede cambiar la verificación''; end if;',
    'if api and not is_admin() and coalesce(current_setting(''vinka.company_verify'', true), '''') <> ''1'' then raise exception ''Solo administración puede cambiar la verificación''; end if;');
  if n = d or (length(n) - length(replace(n, 'vinka.company_verify', ''))) / length('vinka.company_verify') <> 2 then
    raise exception 'company_guard: no se encontraron las dos reglas de verificación'; end if;
  execute n;
end $m$;

-- Verificación automática de bajo riesgo. Devuelve true si la verificó.
-- Reglas: RUT válido y sin duplicado; correo corporativo (no gratuito) del mismo dominio que el sitio web;
-- si es cliente de una consultora, la consultora está verificada. VINKA revisa después (48 horas).
create or replace function public.company_try_auto_verify(p_company uuid, p_email text) returns boolean
language plpgsql security definer set search_path = public as $$
declare c companies; dom text := email_domain(p_email);
begin
  select * into c from companies where id = p_company for update;
  if c.id is null or c.verification_status <> 'pending' then return false; end if;
  if not rut_valid(c.rut) or c.rut_duplicate_of is not null
     or exists (select 1 from companies o where o.id <> c.id and rut_clean(o.rut) = rut_clean(c.rut)) then return false; end if;
  if dom is null or free_email_domain(dom) or web_domain(c.website) is null
     or not (web_domain(c.website) = dom or web_domain(c.website) like '%.' || dom) then return false; end if;
  if c.parent_id is not null and not exists (select 1 from companies p where p.id = c.parent_id and p.verification_status = 'verified') then return false; end if;
  perform set_config('vinka.company_verify', '1', true);
  update companies set verification_status = 'verified', verification_method = 'automatica', auto_verified_at = now(),
         verification_note = 'Verificación automática: RUT válido, correo ' || dom || ' del mismo dominio que el sitio web.'
   where id = c.id;
  perform set_config('vinka.company_verify', '', true);
  perform notify_users(admin_ids(), 'verification', 'Empresa verificada automáticamente: revisar',
    c.display_name || ' (RUT ' || c.rut || ', ' || dom || '). Revísala dentro de 48 horas.', '/', false);
  return true;
end $$;
revoke execute on function public.company_try_auto_verify(uuid, text) from public, anon, authenticated;

-- ───────── 1) Captación de empresas ─────────
create table if not exists public.company_captures (
  id uuid primary key default gen_random_uuid(),
  advisor_id uuid not null references auth.users(id) on delete cascade,
  rut_norm text not null,
  legal_name text not null default '',
  contact_email text not null default '',
  company_id uuid references public.companies(id) on delete set null,
  via text not null check (via in ('cliente_gestionado', 'empresa_propia')),
  status text not null default 'registrada' check (status in ('registrada', 'contactada', 'verificada', 'activada', 'vencida', 'anulada')),
  token uuid not null default gen_random_uuid() unique,
  registered_at timestamptz not null default now(),
  contacted_at timestamptz, contact_accepted_at timestamptz, verified_at timestamptz, activated_at timestamptz, closed_at timestamptz,
  reserved_until timestamptz not null default now() + interval '30 days',
  activate_by timestamptz not null default now() + interval '60 days',
  note text not null default ''
);
create unique index if not exists company_captures_one_open on public.company_captures (rut_norm) where status in ('registrada', 'contactada', 'verificada', 'activada');
create index if not exists idx_company_captures_advisor on public.company_captures (advisor_id, status);
create index if not exists idx_company_captures_company on public.company_captures (company_id);
alter table public.company_captures enable row level security;
revoke all on public.company_captures from anon, authenticated;

create table if not exists public.company_advisor_roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  advisor_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('captador', 'encargado_cuenta')),
  since timestamptz not null default now(),
  until timestamptz,
  assigned_by uuid references auth.users(id) on delete set null,
  capture_id uuid references public.company_captures(id) on delete set null
);
create unique index if not exists company_advisor_roles_one_active on public.company_advisor_roles (company_id, role) where until is null;
create index if not exists idx_company_advisor_roles_advisor on public.company_advisor_roles (advisor_id);
create index if not exists idx_company_advisor_roles_capture on public.company_advisor_roles (capture_id);
create index if not exists idx_company_advisor_roles_assigned_by on public.company_advisor_roles (assigned_by);
alter table public.company_advisor_roles enable row level security;
revoke all on public.company_advisor_roles from anon, authenticated;

-- Avanza una captación según lo que ya ocurrió. Idempotente.
create or replace function public.capture_refresh(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c company_captures; co companies;
begin
  select * into c from company_captures where id = p_id for update;
  if c.id is null or c.status in ('activada', 'vencida', 'anulada') then return c.status; end if;
  if c.company_id is not null then select * into co from companies where id = c.company_id; end if;
  -- verificada: el contacto aceptó y la empresa está verificada, dentro de la reserva
  if c.status in ('registrada', 'contactada') and c.contact_accepted_at is not null and co.verification_status = 'verified' and now() <= c.reserved_until then
    update company_captures set status = 'verificada', verified_at = now(), reserved_until = activate_by where id = c.id returning * into c;
  end if;
  -- activada: primera vacante publicada antes del día 60
  if c.status = 'verificada' and now() <= c.activate_by and exists (select 1 from jobs where company_id = c.company_id and status = 'published') then
    update company_captures set status = 'activada', activated_at = now() where id = c.id returning * into c;
    insert into company_advisor_roles (company_id, advisor_id, role, capture_id) values (c.company_id, c.advisor_id, 'captador', c.id) on conflict do nothing;
    if not exists (select 1 from company_advisor_roles where company_id = c.company_id and role = 'encargado_cuenta' and until is null) then
      insert into company_advisor_roles (company_id, advisor_id, role, capture_id) values (c.company_id, c.advisor_id, 'encargado_cuenta', c.id) on conflict do nothing;
    end if;
    insert into audit_logs (actor_id, action, entity, entity_id, detail) values (c.advisor_id, 'capture_activated', 'company', c.company_id, jsonb_build_object('capture', c.id));
    perform notify_users(array[c.advisor_id], 'community', 'Empresa activada: quedas como captador/a',
      coalesce(co.display_name, c.legal_name) || ' publicó su primera vacante.', '/', false);
    return c.status;
  end if;
  -- vencida
  if (c.status in ('registrada', 'contactada') and now() > c.reserved_until) or (c.status = 'verificada' and now() > c.activate_by) then
    update company_captures set status = 'vencida', closed_at = now() where id = c.id returning * into c;
    perform notify_users(array[c.advisor_id], 'community', 'Captación vencida', coalesce(co.display_name, c.legal_name) || ': venció el plazo; el RUT quedó libre.', '/', false);
  end if;
  return c.status;
end $$;
revoke execute on function public.capture_refresh(uuid) from public, anon, authenticated;

-- Registro de una empresa propia (prospecto que aún no tiene cuenta)
create or replace function public.capture_register_prospect(p_rut text, p_legal_name text, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v company_captures; v_rut text := rut_clean(p_rut);
begin
  if not advisor_approved(auth.uid()) then raise exception 'Tu perfil de asesor debe estar aprobado por VINKA'; end if;
  if not rut_valid(p_rut) then raise exception 'RUT no válido (ej.: 76.123.456-7)'; end if;
  if char_length(trim(coalesce(p_legal_name, ''))) < 3 then raise exception 'Indica la razón social'; end if;
  if trim(coalesce(p_email, '')) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Indica un correo válido del contacto'; end if;
  if (select count(*) from company_captures where advisor_id = auth.uid() and status in ('registrada', 'contactada', 'verificada')) >= 20 then
    raise exception 'Tienes 20 captaciones en curso, el máximo. Espera a que avancen o venzan.'; end if;
  if rut_has_published(v_rut) then raise exception 'Esta empresa ya publica en VINKA'; end if;
  if exists (select 1 from companies where rut_clean(rut) = v_rut and parent_id is null) then raise exception 'Esta empresa ya tiene cuenta en VINKA'; end if;
  begin
    insert into company_captures (advisor_id, rut_norm, legal_name, contact_email, via)
    values (auth.uid(), v_rut, left(trim(p_legal_name), 160), lower(trim(p_email)), 'empresa_propia') returning * into v;
  exception when unique_violation then raise exception 'Esta empresa ya está en proceso de captación';
  end;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'capture_registered', 'capture', v.id, jsonb_build_object('rut', v_rut, 'via', 'empresa_propia'));
  return jsonb_build_object('id', v.id, 'token', v.token, 'reserved_until', v.reserved_until);
end $$;

-- El enlace de registro que comparte el asesor: lo abre el contacto (sin sesión) y marca la captación como contactada
create or replace function public.get_capture_invite(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c company_captures;
begin
  select * into c from company_captures where token = p_token and via = 'empresa_propia' and status in ('registrada', 'contactada');
  if c.id is null or now() > c.reserved_until then return null; end if;
  if c.status = 'registrada' then update company_captures set status = 'contactada', contacted_at = now() where id = c.id; end if;
  return jsonb_build_object('legal_name', c.legal_name, 'rut', c.rut_norm, 'email', c.contact_email, 'advisor', short_name(c.advisor_id));
end $$;

create or replace function public.my_captures() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not is_advisor() then raise exception 'Solo para asesores'; end if;
  for r in select id from company_captures where advisor_id = auth.uid() and status in ('registrada', 'contactada', 'verificada') loop perform capture_refresh(r.id); end loop;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'status', c.status, 'via', c.via, 'rut', c.rut_norm,
      'name', coalesce(co.display_name, c.legal_name), 'contact_email', c.contact_email, 'company_id', c.company_id,
      'token', case when c.via = 'empresa_propia' and c.status in ('registrada', 'contactada') then c.token end,
      'registered_at', c.registered_at, 'contacted_at', c.contacted_at, 'contact_accepted_at', c.contact_accepted_at,
      'verified_at', c.verified_at, 'activated_at', c.activated_at, 'reserved_until', c.reserved_until, 'activate_by', c.activate_by,
      'company_verified', co.verification_status = 'verified', 'note', c.note) order by c.registered_at desc)
    from company_captures c left join companies co on co.id = c.company_id where c.advisor_id = auth.uid()), '[]'::jsonb);
end $$;

create or replace function public.admin_captures(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'status', c.status, 'via', c.via, 'rut', c.rut_norm, 'name', coalesce(co.display_name, c.legal_name),
      'advisor', short_name(c.advisor_id), 'registered_at', c.registered_at, 'activated_at', c.activated_at, 'note', c.note) order by c.registered_at desc)
    from (select * from company_captures where p_status is null or status = p_status order by registered_at desc limit 300) c left join companies co on co.id = c.company_id), '[]'::jsonb);
end $$;

create or replace function public.admin_capture_annul(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare c company_captures;
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  if char_length(trim(coalesce(p_note, ''))) < 10 then raise exception 'Explica el motivo (al menos 10 caracteres)'; end if;
  update company_captures set status = 'anulada', closed_at = now(), note = left(trim(p_note), 500) where id = p_id and status <> 'anulada' returning * into c;
  if c.id is null then raise exception 'Captación no encontrada'; end if;
  update company_advisor_roles set until = now() where capture_id = c.id and until is null;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'capture_annulled', 'capture', c.id, jsonb_build_object('note', p_note));
  perform notify_users(array[c.advisor_id], 'community', 'VINKA anuló una captación', left(trim(p_note), 140), '/', false);
end $$;

-- Cliente gestionado: al crear el cliente desde su espacio, el asesor queda con la captación «registrada» (si el RUT está libre)
create or replace function public.company_capture_on_insert() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare v_email text; c company_captures;
begin
  if new.parent_id is not null then
    if advisor_approved(auth.uid()) and not rut_has_published(new.rut)
       and not exists (select 1 from companies o where o.id <> new.id and o.parent_id is null and rut_clean(o.rut) = rut_clean(new.rut)) then
      insert into company_captures (advisor_id, rut_norm, legal_name, company_id, via)
      values (auth.uid(), rut_clean(new.rut), new.legal_name, new.id, 'cliente_gestionado')
      on conflict (rut_norm) where status in ('registrada', 'contactada', 'verificada', 'activada') do nothing;
    end if;
  elsif auth.uid() is not null then
    -- Empresa propia que se registra con el enlace del asesor (mismo RUT y mismo correo)
    select email into v_email from auth.users where id = auth.uid();
    select * into c from company_captures where via = 'empresa_propia' and rut_norm = rut_clean(new.rut) and status in ('registrada', 'contactada')
      and lower(contact_email) = lower(v_email) and now() <= reserved_until for update;
    if c.id is not null then
      update company_captures set company_id = new.id, contact_accepted_at = now(), contacted_at = coalesce(contacted_at, now()),
             status = 'contactada' where id = c.id;
    end if;
    perform company_try_auto_verify(new.id, v_email);
    if c.id is not null then perform capture_refresh(c.id); end if;
  end if;
  return null;
end $$;
drop trigger if exists company_capture_on_insert on public.companies;
create trigger company_capture_on_insert after insert on public.companies for each row execute function public.company_capture_on_insert();

create or replace function public.company_capture_on_verify() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.verification_status is distinct from old.verification_status then
    for r in select id from company_captures where company_id = new.id and status in ('registrada', 'contactada', 'verificada') loop perform capture_refresh(r.id); end loop;
  end if;
  return null;
end $$;
drop trigger if exists company_capture_on_verify on public.companies;
create trigger company_capture_on_verify after update of verification_status on public.companies for each row execute function public.company_capture_on_verify();

-- Invitación al contacto del cliente (rol «cliente»): enviarla = contactada; aceptarla = contacto confirmado
create or replace function public.invite_capture_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.role <> 'client' then return null; end if;
  if tg_op = 'INSERT' then
    update company_captures set status = 'contactada', contacted_at = now(), contact_email = lower(new.email)
     where company_id = new.company_id and via = 'cliente_gestionado' and status = 'registrada';
  elsif new.accepted_at is not null and old.accepted_at is null then
    for r in select id from company_captures where company_id = new.company_id and via = 'cliente_gestionado' and status in ('registrada', 'contactada')
               and (contact_email = '' or lower(contact_email) = lower(new.email)) loop
      update company_captures set contact_accepted_at = now(), contact_email = lower(new.email), contacted_at = coalesce(contacted_at, now()) where id = r.id;
    end loop;
    perform company_try_auto_verify(new.company_id, new.email);
    for r in select id from company_captures where company_id = new.company_id and status in ('registrada', 'contactada', 'verificada') loop perform capture_refresh(r.id); end loop;
  end if;
  return null;
end $$;
drop trigger if exists invite_capture_sync on public.company_invites;
create trigger invite_capture_sync after insert or update of accepted_at on public.company_invites for each row execute function public.invite_capture_sync();

create or replace function public.job_capture_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    for r in select id from company_captures where company_id = new.company_id and status = 'verificada' loop perform capture_refresh(r.id); end loop;
  end if;
  return null;
end $$;
drop trigger if exists job_capture_sync on public.jobs;
create trigger job_capture_sync after insert or update of status on public.jobs for each row execute function public.job_capture_sync();

-- ───────── 2) Roles ─────────
create or replace function public.company_roles(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_company_member(p_company) or is_admin() or exists (select 1 from company_advisor_roles where company_id = p_company and advisor_id = auth.uid())) then
    raise exception 'Sin acceso'; end if;
  return jsonb_build_object(
    'captador', (select jsonb_build_object('id', advisor_id, 'name', short_name(advisor_id), 'since', since) from company_advisor_roles where company_id = p_company and role = 'captador' and until is null),
    'encargado_cuenta', (select jsonb_build_object('id', advisor_id, 'name', short_name(advisor_id), 'since', since) from company_advisor_roles where company_id = p_company and role = 'encargado_cuenta' and until is null),
    'can_assign', is_company_admin(p_company) or is_admin());
end $$;

create or replace function public.company_set_account_manager(p_company uuid, p_advisor uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_company_admin(p_company) or is_admin()) then raise exception 'Solo quien administra la empresa puede asignar al encargado de cuenta'; end if;
  if not advisor_approved(p_advisor) then raise exception 'Debe ser un asesor/a aprobado/a de VINKA'; end if;
  if exists (select 1 from company_advisor_roles where company_id = p_company and role = 'encargado_cuenta' and until is null and advisor_id = p_advisor) then return; end if;
  update company_advisor_roles set until = now() where company_id = p_company and role = 'encargado_cuenta' and until is null;
  insert into company_advisor_roles (company_id, advisor_id, role, assigned_by) values (p_company, p_advisor, 'encargado_cuenta', auth.uid());
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'account_manager_set', 'company', p_company, jsonb_build_object('advisor', p_advisor));
  perform notify_users(array[p_advisor], 'community', 'Eres encargado/a de cuenta', (select display_name from companies where id = p_company), '/', false);
end $$;

create or replace function public.job_set_owner(p_job uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare j jobs;
begin
  select * into j from jobs where id = p_job;
  if j.id is null or not can_manage(j.company_id) then raise exception 'Solo quien gestiona la vacante puede cambiar al responsable'; end if;
  if not exists (select 1 from company_members m where m.user_id = p_user and m.role in ('owner', 'admin', 'recruiter')
                 and (m.company_id = j.company_id or m.company_id = (select parent_id from companies where id = j.company_id))) then
    raise exception 'El responsable debe ser parte del equipo que gestiona la empresa'; end if;
  perform set_config('vinka.job_admin', '1', true);
  update jobs set owner_id = p_user where id = p_job;
  perform set_config('vinka.job_admin', '', true);
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'job_owner_set', 'job', p_job, jsonb_build_object('owner', p_user));
end $$;

-- ───────── 3) Autorización de representación ─────────
create table if not exists public.representation_authorizations (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references auth.users(id) on delete cascade,
  advisor_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'solicitada' check (status in ('solicitada', 'vigente', 'rechazada', 'revocada', 'vencida')),
  requested_at timestamptz not null default now(),
  answered_at timestamptz, revoked_at timestamptz, expires_at timestamptz
);
create unique index if not exists representation_authorizations_one_open on public.representation_authorizations (candidate_id, advisor_id) where status in ('solicitada', 'vigente');
create index if not exists idx_representation_authorizations_advisor on public.representation_authorizations (advisor_id, status);
alter table public.representation_authorizations enable row level security;
revoke all on public.representation_authorizations from anon, authenticated;

create or replace function public.rep_auth_active(p_candidate uuid, p_advisor uuid) returns uuid language sql stable security definer set search_path = public as $$
  select id from representation_authorizations where candidate_id = p_candidate and advisor_id = p_advisor and status = 'vigente' and expires_at > now() limit 1 $$;
revoke execute on function public.rep_auth_active(uuid, uuid) from public, anon, authenticated;

create or replace function public.rep_auth_request(p_candidate uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not advisor_approved(auth.uid()) then raise exception 'Tu perfil de asesor debe estar aprobado por VINKA'; end if;
  if not exists (select 1 from service_requests where candidate_id = p_candidate and assigned_to = auth.uid() and status in ('en_curso', 'entregada', 'aprobada')) then
    raise exception 'Solo puedes pedir autorización a personas que asesoras o asesoraste'; end if;
  if exists (select 1 from representation_authorizations where candidate_id = p_candidate and advisor_id = auth.uid() and status in ('solicitada', 'vigente') and coalesce(expires_at, 'infinity') > now()) then
    raise exception 'Ya tienes una autorización pedida o vigente con esta persona'; end if;
  if exists (select 1 from representation_authorizations where candidate_id = p_candidate and advisor_id = auth.uid() and status = 'rechazada' and answered_at > now() - interval '30 days') then
    raise exception 'Esta persona prefirió no darte autorización. Podrás pedirla de nuevo 30 días después.'; end if;
  update representation_authorizations set status = 'vencida' where candidate_id = p_candidate and advisor_id = auth.uid() and status = 'vigente' and expires_at <= now();
  insert into representation_authorizations (candidate_id, advisor_id) values (p_candidate, auth.uid()) returning id into v_id;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'rep_auth_requested', 'authorization', v_id, jsonb_build_object('candidate', p_candidate));
  perform notify_users(array[p_candidate], 'service_request', short_name(auth.uid()) || ' pide autorización para presentarte',
    'Si aceptas, podrá proponerte a vacantes. Tú decides cada vez si la empresa ve tu perfil, y puedes retirar el permiso cuando quieras.', '/propuestas', true);
  return v_id;
end $$;

create or replace function public.rep_auth_answer(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r representation_authorizations;
begin
  select * into r from representation_authorizations where id = p_id and candidate_id = auth.uid() for update;
  if r.id is null then raise exception 'Solicitud no encontrada'; end if;
  if r.status <> 'solicitada' then raise exception 'Esta solicitud ya fue respondida'; end if;
  update representation_authorizations set status = case when p_accept then 'vigente' else 'rechazada' end, answered_at = now(),
         expires_at = case when p_accept then now() + interval '12 months' end where id = p_id;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), case when p_accept then 'rep_auth_granted' else 'rep_auth_declined' end, 'authorization', p_id, '{}'::jsonb);
  perform notify_users(array[r.advisor_id], 'community', short_name(auth.uid()) || case when p_accept then ' te autorizó a presentarle' else ' prefirió no darte autorización' end,
    case when p_accept then 'Ya puedes proponerle a vacantes durante 12 meses.' else '' end, '/', false);
end $$;

create or replace function public.rep_auth_revoke(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare r representation_authorizations; n int;
begin
  select * into r from representation_authorizations where id = p_id and candidate_id = auth.uid() for update;
  if r.id is null then raise exception 'Autorización no encontrada'; end if;
  if r.status not in ('solicitada', 'vigente') then raise exception 'Esta autorización ya no está activa'; end if;
  update representation_authorizations set status = 'revocada', revoked_at = now() where id = p_id;
  update candidate_proposals set status = 'retirada', answered_at = now(), withdrawn_reason = 'autorizacion_revocada'
   where candidate_id = r.candidate_id and advisor_id = r.advisor_id and status = 'enviada';
  get diagnostics n = row_count;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'rep_auth_revoked', 'authorization', p_id, jsonb_build_object('proposals_withdrawn', n));
  perform notify_users(array[r.advisor_id], 'community', short_name(auth.uid()) || ' retiró tu autorización',
    case when n > 0 then n || ' propuesta(s) pendiente(s) quedaron retiradas.' else 'Ya no puedes proponerle a vacantes.' end, '/', false);
  return n;
end $$;

create or replace function public.my_authorizations() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update representation_authorizations set status = 'vencida' where (candidate_id = auth.uid() or advisor_id = auth.uid()) and status = 'vigente' and expires_at <= now();
  if is_advisor() then
    return jsonb_build_object('role', 'advisor',
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'candidate_id', r.candidate_id, 'name', short_name(r.candidate_id), 'status', r.status,
          'requested_at', r.requested_at, 'answered_at', r.answered_at, 'expires_at', r.expires_at) order by r.requested_at desc)
        from representation_authorizations r where r.advisor_id = auth.uid()), '[]'::jsonb),
      'requestable', coalesce((select jsonb_agg(jsonb_build_object('candidate_id', x.candidate_id, 'name', short_name(x.candidate_id)) order by short_name(x.candidate_id))
        from (select distinct s.candidate_id from service_requests s where s.assigned_to = auth.uid() and s.status in ('en_curso', 'entregada', 'aprobada')
              and not exists (select 1 from representation_authorizations r where r.candidate_id = s.candidate_id and r.advisor_id = auth.uid()
                              and (r.status in ('solicitada', 'vigente') or (r.status = 'rechazada' and r.answered_at > now() - interval '30 days')))) x), '[]'::jsonb));
  end if;
  return jsonb_build_object('role', 'candidate',
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'advisor_id', r.advisor_id, 'advisor', short_name(r.advisor_id), 'status', r.status,
        'requested_at', r.requested_at, 'answered_at', r.answered_at, 'expires_at', r.expires_at, 'revoked_at', r.revoked_at) order by r.requested_at desc)
      from representation_authorizations r where r.candidate_id = auth.uid()), '[]'::jsonb));
end $$;

-- ───────── 4) Propuestas ─────────
create table if not exists public.candidate_proposals (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  candidate_id uuid not null references auth.users(id) on delete cascade,
  advisor_id uuid not null references auth.users(id) on delete cascade,
  authorization_id uuid references public.representation_authorizations(id) on delete set null,
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'enviada' check (status in ('enviada', 'aceptada', 'rechazada', 'vencida', 'retirada')),
  withdrawn_reason text,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create unique index if not exists candidate_proposals_one_open on public.candidate_proposals (job_id, candidate_id) where status in ('enviada', 'aceptada');
create index if not exists idx_candidate_proposals_candidate on public.candidate_proposals (candidate_id, status);
create index if not exists idx_candidate_proposals_advisor on public.candidate_proposals (advisor_id);
create index if not exists idx_candidate_proposals_authorization on public.candidate_proposals (authorization_id);
alter table public.candidate_proposals enable row level security;
revoke all on public.candidate_proposals from anon, authenticated;

-- ¿Puede este asesor trabajar sobre la vacante? (la gestiona o colabora)
create or replace function public.advisor_on_job(p_job uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_advisor() and (is_job_collaborator(p_job) or can_manage((select company_id from jobs where id = p_job))) $$;

-- ¿Puede proponer a esta vacante? (participa, o la vacante está abierta a la red y su perfil está aprobado)
create or replace function public.advisor_can_propose(p_job uuid) returns boolean language sql stable security definer set search_path = public as $$
  select advisor_on_job(p_job) or (advisor_approved(auth.uid()) and exists (select 1 from jobs where id = p_job and network_open and status = 'published')) $$;

create or replace function public.my_proposable_candidates(p_job uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not advisor_can_propose(p_job) then raise exception 'Solo asesores que participan en esta vacante, o en vacantes abiertas a la red'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'candidate_id', r.candidate_id, 'name', short_name(r.candidate_id), 'headline', c.headline, 'comuna', c.comuna, 'expires_at', r.expires_at,
      'state', case
        when exists (select 1 from matches m where m.job_id = p_job and m.candidate_id = r.candidate_id) then 'en_proceso'
        when exists (select 1 from candidate_job_actions a where a.job_id = p_job and a.candidate_id = r.candidate_id and a.action = 'interest') then 'ya_postulo'
        when exists (select 1 from candidate_proposals p where p.job_id = p_job and p.candidate_id = r.candidate_id and p.status in ('enviada', 'aceptada')) then 'ya_presentado'
        else 'disponible' end) order by short_name(r.candidate_id))
    from representation_authorizations r join candidate_profiles c on c.user_id = r.candidate_id
    where r.advisor_id = auth.uid() and r.status = 'vigente' and r.expires_at > now() and c.onboarding_done), '[]'::jsonb);
end $$;

create or replace function public.proposal_create(p_job uuid, p_candidate uuid, p_note text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare j jobs; v_id uuid; v_auth uuid;
begin
  if not advisor_can_propose(p_job) then raise exception 'Solo asesores que participan en esta vacante, o en vacantes abiertas a la red'; end if;
  select * into j from jobs where id = p_job;
  if j.status <> 'published' then raise exception 'La vacante debe estar publicada'; end if;
  v_auth := rep_auth_active(p_candidate, auth.uid());
  if v_auth is null then raise exception 'Necesitas la autorización vigente de esta persona para presentarla'; end if;
  if exists (select 1 from matches m where m.job_id = p_job and m.candidate_id = p_candidate)
     or exists (select 1 from candidate_job_actions a where a.job_id = p_job and a.candidate_id = p_candidate and a.action = 'interest') then
    raise exception 'Esta persona ya postuló o ya está en el proceso'; end if;
  if (select count(*) from candidate_proposals where advisor_id = auth.uid() and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Llegaste al máximo de 30 propuestas por día'; end if;
  begin
    insert into candidate_proposals (job_id, candidate_id, advisor_id, authorization_id, note)
    values (p_job, p_candidate, auth.uid(), v_auth, left(trim(coalesce(p_note, '')), 500)) returning id into v_id;
  exception when unique_violation then raise exception 'Esta persona ya fue presentada a esta vacante';
  end;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'proposal_sent', 'job', p_job, jsonb_build_object('candidate', p_candidate, 'proposal', v_id));
  perform notify_users(array[p_candidate], 'service_request', short_name(auth.uid()) || ' te propone para una vacante',
    '«' || j.title || '». Revísala y decide si quieres que la empresa vea tu perfil.', '/propuestas', true);
  return v_id;
end $$;

create or replace function public.my_proposals() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update candidate_proposals set status = 'vencida', answered_at = now()
   where status = 'enviada' and created_at < now() - interval '14 days' and (candidate_id = auth.uid() or advisor_id = auth.uid());
  return jsonb_build_object(
    'received', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'status', p.status, 'note', p.note, 'created_at', p.created_at,
        'advisor', short_name(p.advisor_id), 'job_id', j.id, 'job', j.title, 'company', case when j.confidential then 'Confidencial' else co.display_name end,
        'comuna', j.comuna, 'modality', j.modality, 'open', j.status = 'published') order by p.created_at desc)
      from candidate_proposals p join jobs j on j.id = p.job_id join companies co on co.id = j.company_id where p.candidate_id = auth.uid()), '[]'::jsonb),
    'sent', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'status', p.status, 'created_at', p.created_at, 'answered_at', p.answered_at,
        'withdrawn_reason', p.withdrawn_reason, 'candidate', short_name(p.candidate_id), 'job_id', p.job_id, 'job', j.title) order by p.created_at desc)
      from candidate_proposals p join jobs j on j.id = p.job_id where p.advisor_id = auth.uid()), '[]'::jsonb));
end $$;

create or replace function public.proposal_answer(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare p candidate_proposals; j jobs;
begin
  select * into p from candidate_proposals where id = p_id and candidate_id = auth.uid() for update;
  if p.id is null then raise exception 'Propuesta no encontrada'; end if;
  if p.status <> 'enviada' or p.created_at < now() - interval '14 days' then raise exception 'Esta propuesta ya no está vigente'; end if;
  select * into j from jobs where id = p.job_id;
  if p_accept then
    if j.status <> 'published' then raise exception 'La vacante ya no está publicada'; end if;
    if rep_auth_active(p.candidate_id, p.advisor_id) is null then raise exception 'La autorización a este asesor ya no está vigente'; end if;
    insert into candidate_job_actions (candidate_id, job_id, action) values (auth.uid(), p.job_id, 'interest')
    on conflict (candidate_id, job_id) do update set action = 'interest', created_at = now();
    update candidate_proposals set status = 'aceptada', answered_at = now() where id = p_id;
  else
    update candidate_proposals set status = 'rechazada', answered_at = now() where id = p_id;
  end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), case when p_accept then 'proposal_accepted' else 'proposal_declined' end, 'job', p.job_id, jsonb_build_object('proposal', p_id));
  perform notify_users(array[p.advisor_id], 'community', short_name(auth.uid()) || case when p_accept then ' aceptó tu propuesta' else ' prefirió no postular' end,
    '«' || j.title || '»' || case when p_accept then '. Ya aparece entre los interesados de la vacante.' else '.' end, '/', false);
end $$;

-- ───────── 5) Invitar asesores, vacantes abiertas a la red y Oportunidades ─────────
create or replace function public.advisors_for_job(p_job uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare j jobs;
begin
  select * into j from jobs where id = p_job;
  if j.id is null or not can_manage(j.company_id) then raise exception 'Solo quien gestiona la vacante puede invitar asesores'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'name', short_name(a.user_id), 'specialty', a.specialty,
      'invited', exists (select 1 from job_collaborators c where c.job_id = p_job and c.user_id = a.user_id)) order by short_name(a.user_id))
    from advisors a join advisor_profiles ap on ap.user_id = a.user_id
    where a.active and a.terms_accepted_at is not null and ap.pub is not null and not ap.hidden and a.user_id <> auth.uid()), '[]'::jsonb);
end $$;

create or replace function public.job_invite_advisor(p_job uuid, p_advisor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare j jobs;
begin
  select * into j from jobs where id = p_job;
  if j.id is null or not can_manage(j.company_id) then raise exception 'Solo quien gestiona la vacante puede invitar asesores'; end if;
  if j.status = 'closed' then raise exception 'La vacante está cerrada'; end if;
  if not exists (select 1 from advisors where user_id = p_advisor and active and terms_accepted_at is not null) then raise exception 'Esa persona no es asesor/a activo/a'; end if;
  if p_advisor = auth.uid() then raise exception 'Ya gestionas esta vacante'; end if;
  if (select count(*) from job_collaborators where job_id = p_job) >= 10 then raise exception 'Máximo 10 asesores por vacante'; end if;
  insert into job_collaborators (job_id, user_id, invited_by) values (p_job, p_advisor, auth.uid()) on conflict do nothing;
  if not found then raise exception 'Ya está invitado/a'; end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'collab_invited', 'job', p_job, jsonb_build_object('advisor', p_advisor, 'from', 'vacante'));
  perform notify_users(array[p_advisor], 'community', short_name(auth.uid()) || ' te invitó a colaborar',
    '«' || j.title || '». Puedes proponer candidatos que te autorizaron y sugerir avances.', '/vacantes/' || p_job || '/proceso', true);
end $$;

create or replace function public.job_set_network(p_job uuid, p_open boolean) returns void
language plpgsql security definer set search_path = public as $$
declare j jobs;
begin
  select * into j from jobs where id = p_job;
  if j.id is null or not can_manage(j.company_id) then raise exception 'Solo quien gestiona la vacante puede abrirla a la red'; end if;
  if p_open and j.status <> 'published' then raise exception 'Publica la vacante antes de abrirla a la red'; end if;
  perform set_config('vinka.job_admin', '1', true);
  update jobs set network_open = p_open, network_open_at = case when p_open then coalesce(network_open_at, now()) end where id = p_job;
  perform set_config('vinka.job_admin', '', true);
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), case when p_open then 'job_network_opened' else 'job_network_closed' end, 'job', p_job, '{}'::jsonb);
end $$;

create table if not exists public.job_collab_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  advisor_id uuid not null references auth.users(id) on delete cascade,
  message text not null default '' check (char_length(message) <= 300),
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'rechazada', 'vencida')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  answered_by uuid references auth.users(id) on delete set null
);
create unique index if not exists job_collab_requests_one_open on public.job_collab_requests (job_id, advisor_id) where status = 'pendiente';
create index if not exists idx_job_collab_requests_advisor on public.job_collab_requests (advisor_id);
create index if not exists idx_job_collab_requests_answered_by on public.job_collab_requests (answered_by);
alter table public.job_collab_requests enable row level security;
revoke all on public.job_collab_requests from anon, authenticated;

create table if not exists public.network_dismissals (
  advisor_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (advisor_id, job_id)
);
create index if not exists idx_network_dismissals_job on public.network_dismissals (job_id);
alter table public.network_dismissals enable row level security;
revoke all on public.network_dismissals from anon, authenticated;

create or replace function public.collab_request_create(p_job uuid, p_message text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare j jobs; v_id uuid;
begin
  if not advisor_approved(auth.uid()) then raise exception 'Tu perfil de asesor debe estar aprobado por VINKA'; end if;
  select * into j from jobs where id = p_job;
  if j.id is null or not j.network_open or j.status <> 'published' then raise exception 'Esta vacante no está abierta a la red'; end if;
  if is_company_member(j.company_id) then raise exception 'Ya eres parte del equipo de esta empresa'; end if;
  if exists (select 1 from job_collaborators where job_id = p_job and user_id = auth.uid()) then raise exception 'Ya colaboras en esta vacante'; end if;
  begin
    insert into job_collab_requests (job_id, advisor_id, message) values (p_job, auth.uid(), left(trim(coalesce(p_message, '')), 300)) returning id into v_id;
  exception when unique_violation then raise exception 'Ya pediste colaborar; espera la respuesta';
  end;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'collab_requested', 'job', p_job, jsonb_build_object('request', v_id));
  perform notify_users(array(select distinct u from unnest(company_staff(j.company_id, array['owner', 'admin']) || j.owner_id) u), 'community',
    short_name(auth.uid()) || ' quiere colaborar', '«' || j.title || '». Acepta o rechaza desde el proceso de la vacante.', '/vacantes/' || p_job || '/proceso', false);
  return v_id;
end $$;

create or replace function public.collab_requests_for_job(p_job uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not can_manage((select company_id from jobs where id = p_job)) then raise exception 'Solo quien gestiona la vacante'; end if;
  update job_collab_requests set status = 'vencida' where job_id = p_job and status = 'pendiente' and created_at < now() - interval '14 days';
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'advisor_id', r.advisor_id, 'advisor', short_name(r.advisor_id), 'specialty', a.specialty,
      'credited_hires', advisor_credited_hires(r.advisor_id), 'message', r.message, 'status', r.status, 'created_at', r.created_at) order by r.created_at desc)
    from job_collab_requests r left join advisors a on a.user_id = r.advisor_id where r.job_id = p_job), '[]'::jsonb);
end $$;

create or replace function public.collab_request_answer(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r job_collab_requests; j jobs;
begin
  select * into r from job_collab_requests where id = p_id for update;
  if r.id is null then raise exception 'Solicitud no encontrada'; end if;
  select * into j from jobs where id = r.job_id;
  if not can_manage(j.company_id) then raise exception 'Solo quien gestiona la vacante puede responder'; end if;
  if r.status <> 'pendiente' then raise exception 'Esta solicitud ya fue respondida'; end if;
  if p_accept then
    if (select count(*) from job_collaborators where job_id = r.job_id) >= 10 then raise exception 'Máximo 10 asesores por vacante'; end if;
    insert into job_collaborators (job_id, user_id, invited_by) values (r.job_id, r.advisor_id, auth.uid()) on conflict do nothing;
  end if;
  update job_collab_requests set status = case when p_accept then 'aceptada' else 'rechazada' end, answered_at = now(), answered_by = auth.uid() where id = p_id;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), case when p_accept then 'collab_request_accepted' else 'collab_request_declined' end, 'job', r.job_id, jsonb_build_object('advisor', r.advisor_id));
  perform notify_users(array[r.advisor_id], 'community', case when p_accept then 'Te aceptaron como colaborador/a' else 'No aceptaron tu solicitud' end,
    '«' || j.title || '»', case when p_accept then '/vacantes/' || r.job_id || '/proceso' else '/' end, false);
end $$;

create or replace function public.network_opportunities() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not advisor_approved(auth.uid()) then raise exception 'Tu perfil de asesor debe estar aprobado por VINKA'; end if;
  return coalesce((select jsonb_agg(x order by x->>'opened_at' desc) from (
    select jsonb_build_object('id', j.id, 'title', j.title, 'company', case when j.confidential then 'Confidencial' else co.display_name end,
      'comuna', j.comuna, 'region', j.region, 'modality', j.modality, 'area', j.area, 'level', j.level, 'opened_at', j.network_open_at,
      'collaborating', exists (select 1 from job_collaborators c where c.job_id = j.id and c.user_id = auth.uid()),
      'request', (select r.status from job_collab_requests r where r.job_id = j.id and r.advisor_id = auth.uid() order by r.created_at desc limit 1),
      'proposable', (select count(*) from representation_authorizations ra where ra.advisor_id = auth.uid() and ra.status = 'vigente' and ra.expires_at > now()
                      and not exists (select 1 from candidate_job_actions a where a.job_id = j.id and a.candidate_id = ra.candidate_id and a.action = 'interest')
                      and not exists (select 1 from matches m where m.job_id = j.id and m.candidate_id = ra.candidate_id)
                      and not exists (select 1 from candidate_proposals p where p.job_id = j.id and p.candidate_id = ra.candidate_id and p.status in ('enviada', 'aceptada')))) x
    from jobs j join companies co on co.id = j.company_id
    where j.network_open and j.status = 'published'
      and not exists (select 1 from network_dismissals d where d.advisor_id = auth.uid() and d.job_id = j.id)
      and not exists (select 1 from company_members m where m.user_id = auth.uid() and (m.company_id = j.company_id or m.company_id = co.parent_id))
    order by j.network_open_at desc limit 100) s), '[]'::jsonb);
end $$;

create or replace function public.network_dismiss(p_job uuid, p_hide boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_advisor() then raise exception 'Solo para asesores'; end if;
  if p_hide then insert into network_dismissals (advisor_id, job_id) values (auth.uid(), p_job) on conflict do nothing;
  else delete from network_dismissals where advisor_id = auth.uid() and job_id = p_job; end if;
end $$;

-- ───────── 6) Ficha de atribución ─────────
create table if not exists public.hire_contributions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  candidate_id uuid not null references auth.users(id) on delete cascade,
  advisor_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('capto_empresa', 'llevo_cuenta', 'gestiono', 'propuso_candidato', 'colaboro')),
  evidence jsonb not null default '{}'::jsonb,
  source text not null default 'sistema' check (source in ('sistema', 'manual')),
  status text not null default 'por_confirmar' check (status in ('por_confirmar', 'confirmada', 'desacuerdo', 'anulada')),
  auto_confirm_at timestamptz,
  note text not null default '',
  confirmed_by uuid references auth.users(id) on delete set null, confirmed_at timestamptz,
  disputed_by uuid references auth.users(id) on delete set null, disputed_at timestamptz,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (match_id, advisor_id, role)
);
create index if not exists idx_hire_contributions_advisor on public.hire_contributions (advisor_id, status);
create index if not exists idx_hire_contributions_job on public.hire_contributions (job_id);
create index if not exists idx_hire_contributions_candidate on public.hire_contributions (candidate_id);
create index if not exists idx_hire_contributions_confirmed_by on public.hire_contributions (confirmed_by);
create index if not exists idx_hire_contributions_disputed_by on public.hire_contributions (disputed_by);
create index if not exists idx_hire_contributions_auto on public.hire_contributions (auto_confirm_at) where status = 'por_confirmar';
alter table public.hire_contributions enable row level security;
revoke all on public.hire_contributions from anon, authenticated;

create or replace function public.contribution_label(p_role text) returns text language sql immutable as $$
  select case p_role when 'capto_empresa' then 'Captó la empresa' when 'llevo_cuenta' then 'Llevó la cuenta' when 'gestiono' then 'Gestionó el proceso'
    when 'propuso_candidato' then 'Aportó al candidato' when 'colaboro' then 'Colaboró' end $$;

-- Al pasar a «contratado» se arma la ficha con lo registrado. Solo asesores activos.
create or replace function public.hire_credit_build(p_match uuid) returns int
language plpgsql security definer set search_path = public as $$
declare m matches; j jobs; r record; auto timestamptz := now() + interval '7 days'; v_demo boolean;
begin
  select * into m from matches where id = p_match;
  select * into j from jobs where id = m.job_id;
  for r in select ar.advisor_id, ar.role, ar.since, cc.registered_at, cc.activated_at, cc.rut_norm
           from company_advisor_roles ar join advisors a on a.user_id = ar.advisor_id and a.active
           left join company_captures cc on cc.id = ar.capture_id
           where ar.company_id = j.company_id and ar.until is null loop
    v_demo := is_demo_user(r.advisor_id) or is_demo_user(m.candidate_id);
    insert into hire_contributions (match_id, job_id, candidate_id, advisor_id, role, evidence, auto_confirm_at, demo)
    values (m.id, j.id, m.candidate_id, r.advisor_id, case r.role when 'captador' then 'capto_empresa' else 'llevo_cuenta' end,
            case when r.role = 'captador' then jsonb_build_object('rut', r.rut_norm, 'registered_at', r.registered_at, 'activated_at', r.activated_at)
                 else jsonb_build_object('since', r.since) end, auto, v_demo) on conflict do nothing;
  end loop;
  if j.owner_id is not null and exists (select 1 from advisors where user_id = j.owner_id and active) then
    insert into hire_contributions (match_id, job_id, candidate_id, advisor_id, role, evidence, auto_confirm_at, demo)
    values (m.id, j.id, m.candidate_id, j.owner_id, 'gestiono', jsonb_build_object(
        'interviews', (select count(*) from interviews i where i.match_id = m.id and i.status = 'realizada'),
        'offer', exists (select 1 from offers o where o.match_id = m.id)), auto, is_demo_user(j.owner_id) or is_demo_user(m.candidate_id)) on conflict do nothing;
  end if;
  for r in select p.advisor_id, p.created_at, p.answered_at from candidate_proposals p join advisors a on a.user_id = p.advisor_id and a.active
           where p.job_id = j.id and p.candidate_id = m.candidate_id and p.status = 'aceptada' loop
    insert into hire_contributions (match_id, job_id, candidate_id, advisor_id, role, evidence, auto_confirm_at, demo)
    values (m.id, j.id, m.candidate_id, r.advisor_id, 'propuso_candidato', jsonb_build_object('proposed_at', r.created_at, 'accepted_at', r.answered_at), auto,
            is_demo_user(r.advisor_id) or is_demo_user(m.candidate_id)) on conflict do nothing;
  end loop;
  for r in select c.user_id,
             (select count(*) from collab_suggestions s where s.job_id = j.id and s.collaborator_id = c.user_id and s.status = 'aprobada') sug,
             (select count(*) from collab_tasks t where t.job_id = j.id and t.collaborator_id = c.user_id and t.done_at is not null) tasks
           from job_collaborators c join advisors a on a.user_id = c.user_id and a.active where c.job_id = j.id loop
    if r.sug + r.tasks > 0 then
      insert into hire_contributions (match_id, job_id, candidate_id, advisor_id, role, evidence, source, demo)
      values (m.id, j.id, m.candidate_id, r.user_id, 'colaboro', jsonb_build_object('approved_suggestions', r.sug, 'done_tasks', r.tasks), 'manual',
              is_demo_user(r.user_id) or is_demo_user(m.candidate_id)) on conflict do nothing;
    end if;
  end loop;
  return (select count(*) from hire_contributions where match_id = m.id and status <> 'anulada');
end $$;
revoke execute on function public.hire_credit_build(uuid) from public, anon, authenticated;

create or replace function public.match_hire_credit() returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.stage = 'contratado' and old.stage is distinct from 'contratado' then
    -- si vuelve a «contratado» tras salir, los créditos anulados por esa salida vuelven a quedar por confirmar
    update hire_contributions set status = 'por_confirmar', note = '', auto_confirm_at = case when source = 'sistema' then now() + interval '7 days' end
     where match_id = new.id and status = 'anulada' and note = 'El postulante salió de «contratado»';
    n := hire_credit_build(new.id);
    if n > 0 then
      perform notify_users(array(select distinct u from unnest(company_staff(new.company_id, array['owner', 'admin', 'client'])) u), 'team_note',
        'Revisa quién ayudó en esta contratación', short_name(new.candidate_id) || ' · ' || (select title from jobs where id = new.job_id)
        || '. Los aportes registrados por el sistema se confirman solos en 7 días si nadie los objeta.',
        '/vacantes/' || new.job_id || '/candidato/' || new.candidate_id, false);
      perform notify_users(array(select distinct advisor_id from hire_contributions where match_id = new.id and status = 'por_confirmar'), 'community',
        'Contratación con tu aporte', short_name(new.candidate_id) || ' · ' || (select title from jobs where id = new.job_id), '/', false);
    end if;
  elsif old.stage = 'contratado' and new.stage is distinct from 'contratado' then
    update hire_contributions set status = 'anulada', note = 'El postulante salió de «contratado»'
     where match_id = new.id and status in ('por_confirmar', 'desacuerdo');
  end if;
  return new;
end $$;
drop trigger if exists match_hire_credit on public.matches;
create trigger match_hire_credit after update of stage on public.matches for each row execute function public.match_hire_credit();

-- Quién puede confirmar u objetar cada aporte (nunca el propio)
create or replace function public.contribution_rights(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'confirm', h.status = 'por_confirmar' and h.advisor_id <> auth.uid()
               and (can_manage(m.company_id) or member_role(m.company_id) = 'client' or is_admin()),
    'dispute', h.status = 'por_confirmar' and h.advisor_id <> auth.uid()
               and (is_company_admin(m.company_id) or member_role(m.company_id) = 'client' or j.owner_id = auth.uid()
                    or exists (select 1 from hire_contributions o where o.match_id = h.match_id and o.advisor_id = auth.uid() and o.status <> 'anulada')))
  from hire_contributions h join matches m on m.id = h.match_id join jobs j on j.id = h.job_id where h.id = p_id $$;
revoke execute on function public.contribution_rights(uuid) from public, anon, authenticated;

create or replace function public.hire_attribution(p_match uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match;
  if m.id is null or not (is_company_member(m.company_id) or is_admin() or exists (select 1 from hire_contributions h where h.match_id = p_match and h.advisor_id = auth.uid())) then
    raise exception 'Sin acceso'; end if;
  return jsonb_build_object('match_id', m.id, 'stage', m.stage,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'role', h.role, 'label', contribution_label(h.role), 'advisor', short_name(h.advisor_id),
        'advisor_id', h.advisor_id, 'mine', h.advisor_id = auth.uid(), 'evidence', h.evidence, 'source', h.source, 'status', h.status, 'note', h.note,
        'auto_confirm_at', h.auto_confirm_at, 'created_at', h.created_at, 'rights', contribution_rights(h.id))
        order by array_position(array['capto_empresa', 'llevo_cuenta', 'gestiono', 'propuso_candidato', 'colaboro'], h.role))
      from hire_contributions h where h.match_id = p_match and h.status <> 'anulada'), '[]'::jsonb));
end $$;

create or replace function public.contribution_confirm(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h hire_contributions;
begin
  if not coalesce((contribution_rights(p_id)->>'confirm')::boolean, false) then raise exception 'No puedes confirmar este aporte'; end if;
  update hire_contributions set status = 'confirmada', confirmed_by = auth.uid(), confirmed_at = now() where id = p_id returning * into h;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'credit_confirmed', 'match', h.match_id, jsonb_build_object('id', p_id));
  perform notify_users(array[h.advisor_id], 'community', 'Aporte confirmado: ' || contribution_label(h.role), short_name(h.candidate_id) || ' · ' || (select title from jobs where id = h.job_id), '/', false);
end $$;

create or replace function public.contribution_dispute(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare h hire_contributions; v_note text := left(trim(coalesce(p_note, '')), 500);
begin
  if not coalesce((contribution_rights(p_id)->>'dispute')::boolean, false) then raise exception 'No puedes objetar este aporte'; end if;
  if char_length(v_note) < 10 then raise exception 'Explica el desacuerdo (al menos 10 caracteres). VINKA lo revisará.'; end if;
  update hire_contributions set status = 'desacuerdo', note = v_note, disputed_by = auth.uid(), disputed_at = now(), auto_confirm_at = null where id = p_id returning * into h;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'credit_disputed', 'match', h.match_id, jsonb_build_object('id', p_id, 'note', v_note));
  perform notify_users(array[h.advisor_id], 'community', 'Tu aporte quedó en revisión', contribution_label(h.role) || ' · VINKA lo revisará.', '/', false);
  perform notify_users(admin_ids(), 'team_note', 'Desacuerdo de atribución por revisar', v_note, '/', false);
end $$;

-- Confirma los aportes del sistema que cumplieron 7 días sin objeción. Idempotente.
create or replace function public.contributions_autoconfirm() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update hire_contributions set status = 'confirmada', confirmed_at = now(), note = 'Confirmado automáticamente (7 días sin objeciones)'
   where status = 'por_confirmar' and source = 'sistema' and auto_confirm_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.contributions_autoconfirm() from public, anon, authenticated;

create or replace function public.my_contributions() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_advisor() then raise exception 'Solo para asesores'; end if;
  return jsonb_build_object(
    'hires_confirmed', (select count(distinct match_id) from hire_contributions where advisor_id = auth.uid() and status = 'confirmada'),
    'hires_pending', (select count(distinct match_id) from hire_contributions where advisor_id = auth.uid() and status in ('por_confirmar', 'desacuerdo')),
    'companies_captured', (select count(*) from company_captures where advisor_id = auth.uid() and status = 'activada'),
    'captures_open', (select count(*) from company_captures where advisor_id = auth.uid() and status in ('registrada', 'contactada', 'verificada')),
    'authorizations', (select count(*) from representation_authorizations where advisor_id = auth.uid() and status = 'vigente' and expires_at > now()),
    'proposals_accepted', (select count(*) from candidate_proposals where advisor_id = auth.uid() and status = 'aceptada'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('match_id', h.match_id, 'job', j.title, 'candidate', short_name(h.candidate_id), 'role', h.role,
        'label', contribution_label(h.role), 'status', h.status, 'auto_confirm_at', h.auto_confirm_at, 'created_at', h.created_at) order by h.created_at desc)
      from (select * from hire_contributions where advisor_id = auth.uid() and status <> 'anulada' order by created_at desc limit 100) h join jobs j on j.id = h.job_id), '[]'::jsonb));
end $$;

-- Contrataciones acreditadas (confirmadas) para el perfil público del asesor
create or replace function public.advisor_credited_hires(p_advisor uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(distinct match_id)::int from hire_contributions where advisor_id = p_advisor and status = 'confirmada' and not demo $$;

create or replace function public.admin_contributions(p_status text default 'desacuerdo', p_include_demo boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'match_id', h.match_id, 'job', j.title, 'company', co.display_name, 'candidate', short_name(h.candidate_id),
      'advisor', short_name(h.advisor_id), 'role', h.role, 'label', contribution_label(h.role), 'status', h.status, 'note', h.note, 'evidence', h.evidence,
      'disputed_by', short_name(h.disputed_by), 'created_at', h.created_at) order by h.created_at desc)
    from hire_contributions h join jobs j on j.id = h.job_id join companies co on co.id = j.company_id
    where (p_status is null or h.status = p_status) and (p_include_demo or not h.demo)), '[]'::jsonb);
end $$;

create or replace function public.admin_contribution_resolve(p_id uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare h hire_contributions;
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  if p_status not in ('confirmada', 'anulada') then raise exception 'Estado no válido'; end if;
  if char_length(trim(coalesce(p_note, ''))) < 10 then raise exception 'Explica la decisión (al menos 10 caracteres)'; end if;
  update hire_contributions set status = p_status, note = left(trim(p_note), 500), confirmed_by = auth.uid(), confirmed_at = now(), auto_confirm_at = null
   where id = p_id returning * into h;
  if h.id is null then raise exception 'Registro no encontrado'; end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'credit_resolved', 'match', h.match_id, jsonb_build_object('id', p_id, 'status', p_status, 'note', p_note));
  perform notify_users(array[h.advisor_id], 'community', case when p_status = 'confirmada' then 'VINKA confirmó tu aporte' else 'VINKA anuló un aporte' end, left(trim(p_note), 140), '/', false);
end $$;

-- Empresas verificadas automáticamente, para la revisión posterior de VINKA
create or replace function public.admin_auto_verified() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.display_name, 'legal_name', c.legal_name, 'rut', c.rut, 'website', c.website,
      'note', c.verification_note, 'status', c.verification_status, 'auto_verified_at', c.auto_verified_at, 'reviewed_at', c.auto_reviewed_at,
      'overdue', c.auto_reviewed_at is null and c.auto_verified_at < now() - interval '48 hours') order by c.auto_verified_at desc)
    from (select * from companies where verification_method = 'automatica' order by auto_verified_at desc limit 200) c), '[]'::jsonb);
end $$;

create or replace function public.admin_auto_verified_ok(p_company uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  update companies set auto_reviewed_at = now() where id = p_company and verification_method = 'automatica';
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'auto_verification_reviewed', 'company', p_company, '{}'::jsonb);
end $$;

-- ───────── Tarea diaria ─────────
create or replace function public.collab_daily() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v_auth int; v_prop int; v_closed int; v_req int; v_conf int; v_cap int := 0;
begin
  for r in select id from company_captures where status in ('registrada', 'contactada', 'verificada') loop
    if capture_refresh(r.id) = 'vencida' then v_cap := v_cap + 1; end if;
  end loop;
  update representation_authorizations set status = 'vencida' where status = 'vigente' and expires_at <= now();
  get diagnostics v_auth = row_count;
  update candidate_proposals p set status = 'retirada', answered_at = now(), withdrawn_reason = 'autorizacion_vencida'
   where p.status = 'enviada' and not exists (select 1 from representation_authorizations a where a.candidate_id = p.candidate_id and a.advisor_id = p.advisor_id and a.status = 'vigente');
  update candidate_proposals set status = 'vencida', answered_at = now() where status = 'enviada' and created_at < now() - interval '14 days';
  get diagnostics v_prop = row_count;
  update candidate_proposals p set status = 'retirada', answered_at = now(), withdrawn_reason = 'vacante_cerrada'
   where p.status = 'enviada' and exists (select 1 from jobs j where j.id = p.job_id and j.status <> 'published');
  get diagnostics v_closed = row_count;
  update job_collab_requests set status = 'vencida' where status = 'pendiente' and created_at < now() - interval '14 days';
  get diagnostics v_req = row_count;
  v_conf := contributions_autoconfirm();
  return jsonb_build_object('captures_expired', v_cap, 'authorizations_expired', v_auth, 'proposals_expired', v_prop, 'proposals_job_closed', v_closed,
                            'requests_expired', v_req, 'credits_confirmed', v_conf);
end $$;
revoke execute on function public.collab_daily() from public, anon, authenticated;
do $cron$ begin
  perform cron.unschedule('vinka-colaboracion-diaria');
exception when others then null; end $cron$;
select cron.schedule('vinka-colaboracion-diaria', '41 9 * * *', $$select public.collab_daily()$$);

-- ───────── Espacio de reclutamiento propio del asesor ─────────
create or replace function public.advisor_create_workspace() returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text;
begin
  if not advisor_approved(auth.uid()) then raise exception 'Tu perfil de asesor debe estar aprobado por VINKA antes de crear tu espacio'; end if;
  if exists (select 1 from company_members where user_id = auth.uid()) then raise exception 'Ya tienes tu espacio de reclutamiento'; end if;
  select trim(first_name || ' ' || last_name) into v_name from profiles where id = auth.uid();
  perform set_config('vinka.company_admin', '1', true); perform set_config('vinka.company_verify', '1', true);
  insert into companies (owner_id, kind, display_name, legal_name, rut, sector, verification_status, rut_dup_ok, description)
  values (auth.uid(), 'consultora', left(coalesce(nullif(v_name, ''), 'Asesor') || ' · Reclutamiento', 120), 'VINKA Plataforma Laboral SpA', '77.854.185-8',
          'Reclutamiento y selección', 'verified', true, 'Espacio de reclutamiento de un asesor de VINKA.')
  returning id into v_id;
  perform set_config('vinka.company_admin', '', true); perform set_config('vinka.company_verify', '', true);
  update subscriptions set plan_id = 'asesor', status = 'active', trial_ends_at = null, current_period_end = null,
         note = 'Espacio de reclutamiento de asesor (sin cobro)', updated_at = now(), updated_by = auth.uid()
   where company_id = v_id;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'advisor_workspace_created', 'company', v_id, jsonb_build_object('self', true));
  return v_id;
end $$;

-- ───────── 8) Embudo ─────────
create or replace function public.funnel_metrics(p_days int default 30, p_company uuid default null, p_advisor uuid default null, p_include_demo boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := case when coalesce(p_days, 0) > 0 then now() - make_interval(days => p_days) else '-infinity'::timestamptz end; v jsonb;
begin
  if p_company is not null then
    if not (is_company_member(p_company) or is_admin()) then raise exception 'Sin acceso'; end if;
  elsif p_advisor is not null then
    if not (p_advisor = auth.uid() or is_admin()) then raise exception 'Sin acceso'; end if;
  elsif not is_admin() then raise exception 'Solo administración de VINKA';
  end if;
  with scope_jobs as (
    select j.* from jobs j join companies co on co.id = j.company_id
    where (p_include_demo or not (exists (select 1 from seed.companies s where s.id = co.id)
             or exists (select 1 from auth.users u where u.id = co.owner_id and u.email like '%@example.com')))
      and (p_company is null or j.company_id = p_company or co.parent_id = p_company)
      and (p_advisor is null or j.owner_id = p_advisor
           or exists (select 1 from company_advisor_roles ar where ar.advisor_id = p_advisor and ar.company_id = j.company_id and ar.until is null)
           or exists (select 1 from job_collaborators c where c.job_id = j.id and c.user_id = p_advisor)
           or exists (select 1 from company_members cm where cm.user_id = p_advisor and cm.role in ('owner', 'admin', 'recruiter') and (cm.company_id = j.company_id or cm.company_id = co.parent_id)))
  ), hires as (
    select m.id, m.stage_changed_at, s.created_at job_at from matches m join scope_jobs s on s.id = m.job_id where m.stage = 'contratado' and m.stage_changed_at >= since
  )
  select jsonb_build_object(
    'days', p_days,
    'companies_publishing', (select count(distinct company_id) from scope_jobs where status = 'published' or (created_at >= since and status in ('paused', 'closed'))),
    'jobs_published', (select count(*) from scope_jobs where status = 'published' or (created_at >= since and status in ('paused', 'closed'))),
    'relevant_candidates', (select count(*) from company_candidate_actions a join scope_jobs s on s.id = a.job_id where a.action = 'interest' and a.created_at >= since),
    'interviews_scheduled', (select count(*) from interviews i join scope_jobs s on s.id = i.job_id where i.status in ('confirmada', 'realizada') and i.starts_at >= since and i.starts_at <= now()),
    'interviews_done', (select count(*) from interviews i join scope_jobs s on s.id = i.job_id where i.status = 'realizada' and i.starts_at >= since),
    'hires', (select count(*) from hires),
    'hires_external', (select count(*) from external_applicants e join scope_jobs s on s.id = e.job_id where e.stage = 'contratado' and e.stage_changed_at >= since),
    'hires_with_advisor_proposal', (select count(*) from hires h join matches m on m.id = h.id where exists (select 1 from candidate_proposals p where p.job_id = m.job_id and p.candidate_id = m.candidate_id and p.status = 'aceptada')),
    'avg_days_to_hire', (select round(avg(extract(epoch from h.stage_changed_at - h.job_at) / 86400)::numeric, 1) from hires h),
    'hires_credited', case when p_advisor is not null then (select count(distinct match_id) from hire_contributions where advisor_id = p_advisor and status = 'confirmada' and created_at >= since) end
  ) into v;
  return v;
end $$;

-- ───────── Permisos: solo lo que la app llama ─────────
do $g$
declare f text;
begin
  foreach f in array array['job_owner_guard()', 'company_capture_on_insert()', 'company_capture_on_verify()', 'invite_capture_sync()', 'job_capture_sync()', 'match_hire_credit()',
    'advisor_approved(uuid)', 'is_demo_user(uuid)', 'rut_has_published(text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['capture_register_prospect(text, text, text)', 'my_captures()', 'admin_captures(text)', 'admin_capture_annul(uuid, text)',
    'company_roles(uuid)', 'company_set_account_manager(uuid, uuid)', 'job_set_owner(uuid, uuid)',
    'rep_auth_request(uuid)', 'rep_auth_answer(uuid, boolean)', 'rep_auth_revoke(uuid)', 'my_authorizations()',
    'advisor_on_job(uuid)', 'advisor_can_propose(uuid)', 'my_proposable_candidates(uuid)', 'proposal_create(uuid, uuid, text)', 'my_proposals()', 'proposal_answer(uuid, boolean)',
    'advisors_for_job(uuid)', 'job_invite_advisor(uuid, uuid)', 'job_set_network(uuid, boolean)',
    'collab_request_create(uuid, text)', 'collab_requests_for_job(uuid)', 'collab_request_answer(uuid, boolean)', 'network_opportunities()', 'network_dismiss(uuid, boolean)',
    'hire_attribution(uuid)', 'contribution_confirm(uuid)', 'contribution_dispute(uuid, text)', 'my_contributions()', 'advisor_credited_hires(uuid)',
    'admin_contributions(text, boolean)', 'admin_contribution_resolve(uuid, text, text)', 'admin_auto_verified()', 'admin_auto_verified_ok(uuid)',
    'advisor_create_workspace()', 'funnel_metrics(integer, uuid, uuid, boolean)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'revoke execute on function public.get_capture_invite(uuid) from public';
  execute 'grant execute on function public.get_capture_invite(uuid) to anon, authenticated';
end $g$;
