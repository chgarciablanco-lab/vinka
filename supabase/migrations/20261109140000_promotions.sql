-- Destacados: ofertas laborales destacadas (empresas) y perfiles destacados (personas).
-- Pagar solo cambia la posición en las listas y agrega una etiqueta. No toca evaluaciones, puntajes ni la IA.
-- Sin pasarela de pago todavía: las compras quedan "solicitadas" y administración las activa al recibir el pago.

-- 0) Respaldo de las tablas que se modifican (esquema no expuesto por la API)
create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;
create table if not exists backup.payments_20261109 as select * from public.payments;
create table if not exists backup.plans_20261109 as select * from public.plans;
create table if not exists backup.subscriptions_20261109 as select * from public.subscriptions;

-- 1) Registro de pagos con neto, IVA y total (los montos registrados no se modifican)
alter table public.payments
  add column if not exists net_clp int,
  add column if not exists iva_clp int,
  add column if not exists total_clp int,
  add column if not exists promotion_id uuid,
  add column if not exists provider text not null default 'manual',
  add column if not exists provider_ref text not null default '';
alter table public.payments drop constraint if exists payments_kind_check;
alter table public.payments add constraint payments_kind_check check (kind in ('plan', 'asesoria', 'promocion'));

-- Planes se cobran + IVA (el monto registrado es neto); asesorías se cobran con IVA incluido
update public.payments set
  net_clp = case when kind = 'plan' then amount_clp else round(amount_clp / 1.19)::int end,
  iva_clp = case when kind = 'plan' then round(amount_clp * 0.19)::int else amount_clp - round(amount_clp / 1.19)::int end
where net_clp is null;
update public.payments set total_clp = net_clp + iva_clp where total_clp is null;

create or replace function public.payment_split() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.net_clp is null then
    if new.kind = 'asesoria' then new.net_clp := round(new.amount_clp / 1.19)::int; new.iva_clp := new.amount_clp - new.net_clp;
    else new.net_clp := new.amount_clp; new.iva_clp := round(new.amount_clp * 0.19)::int; end if;
  end if;
  new.iva_clp := coalesce(new.iva_clp, 0);
  new.total_clp := coalesce(new.total_clp, new.net_clp + new.iva_clp);
  return new;
end $$;
revoke execute on function public.payment_split() from public, anon, authenticated;
drop trigger if exists payment_split on public.payments;
create trigger payment_split before insert on public.payments for each row execute function public.payment_split();

-- 2) Destacados incluidos en cada plan de empresa (por mes)
alter table public.plans
  add column if not exists promo_credits int not null default 0 check (promo_credits >= 0),
  add column if not exists promo_days int not null default 7 check (promo_days between 1 and 60);
update public.plans set promo_credits = 0, promo_days = 7 where id = 'gratis';
update public.plans set promo_credits = 1, promo_days = 7 where id = 'pyme';
update public.plans set promo_credits = 3, promo_days = 15 where id = 'equipo';
update public.plans set promo_credits = 5, promo_days = 30 where id = 'empresa';

-- 3) Catálogo de productos
create table if not exists public.promo_products (
  id text primary key,
  target text not null check (target in ('job', 'profile')),
  name text not null,
  days int not null check (days between 1 and 90),
  price_clp int not null check (price_clp >= 0),
  price_mode text not null check (price_mode in ('neto', 'iva_incluido')),
  active boolean not null default true,
  sort int not null default 0
);
alter table public.promo_products enable row level security;
create policy "destacados: catálogo público" on public.promo_products for select to anon using (active);
create policy "destacados: catálogo con sesión" on public.promo_products for select to authenticated using (active or (select is_admin()));
insert into public.promo_products (id, target, name, days, price_clp, price_mode, sort) values
  ('job_7', 'job', 'Oferta destacada 7 días', 7, 4990, 'neto', 1),
  ('job_15', 'job', 'Oferta destacada 15 días', 15, 8990, 'neto', 2),
  ('job_30', 'job', 'Oferta destacada 30 días', 30, 14990, 'neto', 3),
  ('profile_7', 'profile', 'Perfil destacado 7 días', 7, 1990, 'iva_incluido', 4),
  ('profile_15', 'profile', 'Perfil destacado 15 días', 15, 3490, 'iva_incluido', 5),
  ('profile_30', 'profile', 'Perfil destacado 30 días', 30, 5990, 'iva_incluido', 6)
on conflict (id) do nothing;

-- 4) Reglas de espacios
create table if not exists public.promo_settings (
  id boolean primary key default true check (id),
  slots_per_ten int not null default 2 check (slots_per_ten between 0 and 5),
  home_slots int not null default 6 check (home_slots between 0 and 12),
  max_jobs int not null default 40 check (max_jobs >= 0),
  max_profiles int not null default 100 check (max_profiles >= 0),
  updated_at timestamptz not null default now()
);
insert into public.promo_settings (id) values (true) on conflict do nothing;
alter table public.promo_settings enable row level security;
create policy "destacados: reglas solo administración" on public.promo_settings for select to authenticated using ((select is_admin()));

-- 5) Promociones
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  product_id text references public.promo_products(id),
  target text not null check (target in ('job', 'profile')),
  job_id uuid references public.jobs(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  candidate_id uuid references auth.users(id) on delete cascade,
  status text not null default 'solicitada' check (status in ('solicitada', 'activa', 'pausada', 'finalizada', 'cancelada')),
  source text not null default 'compra' check (source in ('compra', 'plan', 'cortesia')),
  days int not null check (days between 1 and 90),
  net_clp int not null default 0, iva_clp int not null default 0, total_clp int not null default 0,
  starts_at timestamptz, ends_at timestamptz,
  paused_by text check (paused_by in ('job', 'admin', 'profile')),
  remaining_seconds int,
  payment_id uuid references public.payments(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  activated_by uuid references auth.users(id) on delete set null,
  consent_at timestamptz,
  ending_notified boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((target = 'job' and job_id is not null and company_id is not null) or (target = 'profile' and candidate_id is not null))
);
create unique index if not exists promotions_one_open_job on public.promotions (job_id) where target = 'job' and status in ('solicitada', 'activa', 'pausada');
create unique index if not exists promotions_one_open_profile on public.promotions (candidate_id) where target = 'profile' and status in ('solicitada', 'activa', 'pausada');
create index if not exists idx_promotions_active on public.promotions (target, status, ends_at);
create index if not exists idx_promotions_company on public.promotions (company_id);
create index if not exists idx_promotions_candidate on public.promotions (candidate_id);
create index if not exists idx_promotions_product on public.promotions (product_id);
create index if not exists idx_promotions_payment on public.promotions (payment_id);
create index if not exists idx_promotions_requested_by on public.promotions (requested_by);
create index if not exists idx_promotions_activated_by on public.promotions (activated_by);
alter table public.promotions enable row level security;
create policy "destacados: ver los propios" on public.promotions for select to authenticated
  using ((select is_admin()) or candidate_id = (select auth.uid()) or (company_id is not null and is_company_member(company_id)));
alter table public.payments add constraint payments_promotion_id_fkey foreign key (promotion_id) references public.promotions(id) on delete set null;
create index if not exists idx_payments_promotion on public.payments (promotion_id);

create table if not exists public.promo_stats (
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  day date not null,
  impressions int not null default 0,
  clicks int not null default 0,
  primary key (promotion_id, day)
);
alter table public.promo_stats enable row level security;
create policy "destacados: estadísticas propias" on public.promo_stats for select to authenticated
  using (exists (select 1 from promotions p where p.id = promotion_id and ((select is_admin()) or p.candidate_id = (select auth.uid()) or (p.company_id is not null and is_company_member(p.company_id)))));

-- Activa ahora (para filtrar listas)
create or replace function public.job_featured(p_job uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from promotions where job_id = p_job and target = 'job' and status = 'activa' and ends_at > now())
$$;
create or replace function public.profile_featured(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from promotions where candidate_id = p_user and target = 'profile' and status = 'activa' and ends_at > now())
$$;
revoke execute on function public.job_featured(uuid) from public, anon;
revoke execute on function public.profile_featured(uuid) from public, anon;
grant execute on function public.job_featured(uuid) to authenticated;
grant execute on function public.profile_featured(uuid) to authenticated;

-- Posición en una lista con destacados intercalados: máximo `slots` por cada 10, el resto orgánico
create or replace function public.promo_slot(p_featured boolean, p_k bigint) returns numeric
language sql stable set search_path = public as $$
  select case
    when (select slots_per_ten from promo_settings) = 0 then null
    when p_featured then p_k * (10.0 / (select slots_per_ten from promo_settings))
    else p_k + floor(p_k / greatest(1, (10.0 / (select slots_per_ten from promo_settings)) - 1)) + 1 end
$$;
revoke execute on function public.promo_slot(boolean, bigint) from public, anon;
grant execute on function public.promo_slot(boolean, bigint) to authenticated;

create or replace function public.admin_ids() returns uuid[]
language sql stable security definer set search_path = public as $$ select coalesce(array_agg(user_id), '{}') from admins $$;
revoke execute on function public.admin_ids() from public, anon, authenticated;

-- 6) Solicitar un destacado (empresa: oferta; persona: su perfil)
create or replace function public.request_promotion(p_product text, p_job uuid default null, p_use_credit boolean default false, p_consent boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pr promo_products; j jobs; pl plans; used int; v_id uuid; v_days int; v_net int; v_iva int; v_open int; st promo_settings; who text;
begin
  select * into st from promo_settings;
  if p_job is not null then
    select * into j from jobs where id = p_job;
    if j.id is null or not can_manage(j.company_id) then raise exception 'No tienes permiso para destacar esta vacante'; end if;
    if j.status <> 'published' or not exists (select 1 from companies where id = j.company_id and verification_status = 'verified') then
      raise exception 'Solo se pueden destacar vacantes publicadas de empresas verificadas'; end if;
    if exists (select 1 from promotions where job_id = p_job and status in ('solicitada', 'activa', 'pausada')) then
      raise exception 'Esta vacante ya tiene un destacado vigente o en trámite'; end if;
    if p_use_credit then
      pl := plan_of(j.company_id);
      select count(*) into used from promotions where company_id = j.company_id and source = 'plan'
        and created_at >= date_trunc('month', now() at time zone 'America/Santiago') at time zone 'America/Santiago';
      if used >= pl.promo_credits then raise exception 'Ya usaste los destacados incluidos en tu plan este mes'; end if;
      select count(*) into v_open from promotions where target = 'job' and status = 'activa' and ends_at > now();
      if v_open >= st.max_jobs then raise exception 'Los espacios destacados están completos. Inténtalo en unos días.'; end if;
      insert into promotions (target, job_id, company_id, status, source, days, starts_at, ends_at, requested_by, activated_by)
      values ('job', j.id, j.company_id, 'activa', 'plan', pl.promo_days, now(), now() + make_interval(days => pl.promo_days), auth.uid(), auth.uid())
      returning id into v_id;
      perform log_event(j.company_id, j.id, null, null, 'promo_started', jsonb_build_object('days', pl.promo_days, 'source', 'plan'));
      return jsonb_build_object('id', v_id, 'status', 'activa', 'days', pl.promo_days);
    end if;
    select * into pr from promo_products where id = p_product and target = 'job' and active;
    if pr.id is null then raise exception 'Producto no disponible'; end if;
    v_net := pr.price_clp; v_iva := round(pr.price_clp * 0.19)::int;
    insert into promotions (product_id, target, job_id, company_id, status, source, days, net_clp, iva_clp, total_clp, requested_by)
    values (pr.id, 'job', j.id, j.company_id, 'solicitada', 'compra', pr.days, v_net, v_iva, v_net + v_iva, auth.uid()) returning id into v_id;
    select display_name into who from companies where id = j.company_id;
    perform notify_users(admin_ids(), 'promo_request', 'Destacado solicitado', who || ' pidió destacar «' || j.title || '» ' || pr.days || ' días ($' || to_char(v_net + v_iva, 'FM999G999G999') || ' con IVA).', '/promociones', false);
    return jsonb_build_object('id', v_id, 'status', 'solicitada');
  end if;

  -- Perfil destacado de la persona que pide
  if not exists (select 1 from candidate_profiles where user_id = auth.uid() and onboarding_done) then raise exception 'Completa tu perfil primero'; end if;
  if not coalesce((select is_public from candidate_profiles where user_id = auth.uid()), false) then
    raise exception 'Tu perfil está oculto para empresas. Hazlo visible para poder destacarlo.'; end if;
  if not coalesce(p_consent, false) then raise exception 'Debes aceptar que tu perfil se muestre con más frecuencia a empresas'; end if;
  if exists (select 1 from promotions where candidate_id = auth.uid() and status in ('solicitada', 'activa', 'pausada')) then
    raise exception 'Ya tienes un perfil destacado vigente o en trámite'; end if;
  select * into pr from promo_products where id = p_product and target = 'profile' and active;
  if pr.id is null then raise exception 'Producto no disponible'; end if;
  v_net := round(pr.price_clp / 1.19)::int; v_iva := pr.price_clp - v_net;
  insert into promotions (product_id, target, candidate_id, status, source, days, net_clp, iva_clp, total_clp, requested_by, consent_at)
  values (pr.id, 'profile', auth.uid(), 'solicitada', 'compra', pr.days, v_net, v_iva, pr.price_clp, auth.uid(), now()) returning id into v_id;
  perform notify_users(admin_ids(), 'promo_request', 'Perfil destacado solicitado', short_name(auth.uid()) || ' pidió destacar su perfil ' || pr.days || ' días ($' || to_char(pr.price_clp, 'FM999G999G999') || ').', '/promociones', false);
  return jsonb_build_object('id', v_id, 'status', 'solicitada');
end $$;
revoke execute on function public.request_promotion(text, uuid, boolean, boolean) from public, anon;
grant execute on function public.request_promotion(text, uuid, boolean, boolean) to authenticated;

-- Cancelar una solicitud o detener un destacado propio
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

-- 7) Administración
create or replace function public.admin_activate_promotion(p_id uuid, p_paid boolean, p_method text default 'transferencia', p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare p promotions; st promo_settings; v_open int; v_max int; v_pay uuid; v_users uuid[];
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  select * into p from promotions where id = p_id for update;
  if p.id is null or p.status <> 'solicitada' then raise exception 'La solicitud ya no está pendiente'; end if;
  select * into st from promo_settings;
  select count(*) into v_open from promotions where target = p.target and status = 'activa' and ends_at > now();
  v_max := case when p.target = 'job' then st.max_jobs else st.max_profiles end;
  if v_open >= v_max then raise exception 'Los espacios destacados están completos (ajusta el límite en Reglas)'; end if;
  if p.target = 'job' and not exists (select 1 from jobs where id = p.job_id and status = 'published') then raise exception 'La vacante no está publicada'; end if;
  if p.target = 'profile' and not coalesce((select is_public from candidate_profiles where user_id = p.candidate_id), false) then raise exception 'El perfil está oculto para empresas'; end if;
  if p_paid then
    insert into payments (kind, company_id, candidate_id, amount_clp, net_clp, iva_clp, total_clp, method, note, created_by, promotion_id)
    values ('promocion', p.company_id, p.candidate_id, p.total_clp, p.net_clp, p.iva_clp, p.total_clp, coalesce(p_method, 'transferencia'),
      left(coalesce(nullif(p_note, ''), (select name from promo_products where id = p.product_id)), 300), auth.uid(), p.id) returning id into v_pay;
  end if;
  update promotions set status = 'activa', source = case when p_paid then 'compra' else 'cortesia' end, payment_id = v_pay,
    starts_at = now(), ends_at = now() + make_interval(days => p.days), activated_by = auth.uid(), note = left(coalesce(p_note, ''), 300), updated_at = now()
  where id = p_id;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'promo_activate', 'promotion', p_id, jsonb_build_object('paid', p_paid));
  if p.target = 'job' then
    v_users := array(select user_id from company_members where company_id = p.company_id and role <> 'viewer');
    perform notify_users(v_users, 'promo', 'Tu vacante ya está destacada', '«' || (select title from jobs where id = p.job_id) || '» aparece entre los primeros resultados por ' || p.days || ' días.', '/vacantes/' || p.job_id || '/destacar', true);
  else
    perform notify_users(array[p.candidate_id], 'promo', 'Tu perfil ya está destacado', 'Las empresas verán tu perfil entre los primeros por ' || p.days || ' días.', '/visibilidad', true);
  end if;
end $$;
revoke execute on function public.admin_activate_promotion(uuid, boolean, text, text) from public, anon;
grant execute on function public.admin_activate_promotion(uuid, boolean, text, text) to authenticated;

create or replace function public.admin_set_promotion(p_id uuid, p_action text, p_days int default null) returns void
language plpgsql security definer set search_path = public as $$
declare p promotions;
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  select * into p from promotions where id = p_id for update;
  if p.id is null then raise exception 'Destacado no encontrado'; end if;
  if p_action = 'pausar' and p.status = 'activa' then
    update promotions set status = 'pausada', paused_by = 'admin', remaining_seconds = greatest(0, extract(epoch from ends_at - now()))::int, updated_at = now() where id = p_id;
  elsif p_action = 'reanudar' and p.status = 'pausada' then
    update promotions set status = 'activa', paused_by = null, ends_at = now() + make_interval(secs => coalesce(remaining_seconds, 0)), remaining_seconds = null, updated_at = now() where id = p_id;
  elsif p_action = 'finalizar' and p.status in ('activa', 'pausada') then
    update promotions set status = 'finalizada', ends_at = least(coalesce(ends_at, now()), now()), updated_at = now() where id = p_id;
  elsif p_action = 'cancelar' and p.status = 'solicitada' then
    update promotions set status = 'cancelada', updated_at = now() where id = p_id;
  elsif p_action = 'extender' and p.status in ('activa', 'pausada') and coalesce(p_days, 0) between 1 and 60 then
    update promotions set ends_at = ends_at + make_interval(days => p_days), remaining_seconds = remaining_seconds + p_days * 86400, days = days + p_days, updated_at = now() where id = p_id;
  else raise exception 'Acción no válida para este destacado'; end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'promo_' || p_action, 'promotion', p_id, jsonb_build_object('days', p_days));
end $$;
revoke execute on function public.admin_set_promotion(uuid, text, int) from public, anon;
grant execute on function public.admin_set_promotion(uuid, text, int) to authenticated;

create or replace function public.admin_promo_config(p_products jsonb, p_settings jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare x jsonb;
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_products, '[]'::jsonb)) loop
    update promo_products set price_clp = greatest(0, (x->>'price_clp')::int), days = (x->>'days')::int, active = coalesce((x->>'active')::boolean, true),
      name = case when target = 'job' then 'Oferta destacada ' else 'Perfil destacado ' end || (x->>'days') || ' días'
    where id = x->>'id';
  end loop;
  if p_settings is not null then
    update promo_settings set slots_per_ten = coalesce((p_settings->>'slots_per_ten')::int, slots_per_ten), home_slots = coalesce((p_settings->>'home_slots')::int, home_slots),
      max_jobs = coalesce((p_settings->>'max_jobs')::int, max_jobs), max_profiles = coalesce((p_settings->>'max_profiles')::int, max_profiles), updated_at = now();
  end if;
  insert into audit_logs (actor_id, action, entity, detail) values (auth.uid(), 'promo_config', 'promo_settings', jsonb_build_object('products', p_products, 'settings', p_settings));
end $$;
revoke execute on function public.admin_promo_config(jsonb, jsonb) from public, anon;
grant execute on function public.admin_promo_config(jsonb, jsonb) to authenticated;

-- Resultado de cada destacado: apariciones y clics (seguimiento) + postulaciones o contactos (del proceso)
create or replace function public.promo_results(p promotions) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'impressions', coalesce((select sum(impressions) from promo_stats where promotion_id = p.id), 0),
    'clicks', coalesce((select sum(clicks) from promo_stats where promotion_id = p.id), 0),
    'actions', case when p.target = 'job' then
        (select count(*) from candidate_job_actions a where a.job_id = p.job_id and a.action = 'interest' and a.created_at >= p.starts_at and a.created_at < least(coalesce(p.ends_at, now()), now()))
        + (select count(*) from external_applicants e where e.job_id = p.job_id and e.created_at >= p.starts_at and e.created_at < least(coalesce(p.ends_at, now()), now()))
      else
        (select count(*) from company_candidate_actions x where x.candidate_id = p.candidate_id and x.action = 'interest' and x.created_at >= p.starts_at and x.created_at < least(coalesce(p.ends_at, now()), now()))
      end)
$$;
revoke execute on function public.promo_results(promotions) from public, anon, authenticated;

create or replace function public.admin_promotions(p_target text default 'job', p_include_demo boolean default true) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m0 timestamptz := date_trunc('month', now() at time zone 'America/Santiago') at time zone 'America/Santiago';
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  return (with p as (
      select pr.*, (exists (select 1 from seed.companies d where d.id = pr.company_id) or exists (select 1 from seed.users u where u.id = pr.candidate_id)) demo
      from promotions pr where pr.target = p_target
    ), f as (select * from p where p_include_demo or not demo)
    select jsonb_build_object(
      'active', (select count(*) from f where status = 'activa' and ends_at > now()),
      'requested', (select count(*) from f where status = 'solicitada'),
      'month_net', (select coalesce(sum(net_clp), 0) from f where payment_id is not null and starts_at >= m0),
      'month_sold', (select count(*) from f where source = 'compra' and payment_id is not null and starts_at >= m0),
      'month_plan', (select count(*) from f where source = 'plan' and starts_at >= m0),
      'impressions_30d', (select coalesce(sum(s.impressions), 0) from promo_stats s join f on f.id = s.promotion_id where s.day >= current_date - 30),
      'clicks_30d', (select coalesce(sum(s.clicks), 0) from promo_stats s join f on f.id = s.promotion_id where s.day >= current_date - 30),
      'settings', (select to_jsonb(s) from promo_settings s),
      'products', (select jsonb_agg(to_jsonb(x) order by x.sort) from promo_products x where x.target = p_target),
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', f.id, 'status', case when f.status = 'activa' and f.ends_at <= now() then 'finalizada' else f.status end, 'source', f.source, 'days', f.days,
          'net', f.net_clp, 'iva', f.iva_clp, 'total', f.total_clp, 'starts_at', f.starts_at, 'ends_at', f.ends_at, 'created_at', f.created_at, 'demo', f.demo, 'paused_by', f.paused_by,
          'who', case when f.target = 'job' then (select display_name from companies where id = f.company_id) else (select trim(first_name || ' ' || last_name) from profiles where id = f.candidate_id) end,
          'what', case when f.target = 'job' then (select title from jobs where id = f.job_id) else (select headline from candidate_profiles where user_id = f.candidate_id) end,
          'results', promo_results((select pr from promotions pr where pr.id = f.id))
        ) order by (f.status = 'solicitada') desc, (f.status in ('activa', 'pausada')) desc, f.created_at desc), '[]'::jsonb)
        from (select * from f order by (status = 'solicitada') desc, (status in ('activa', 'pausada')) desc, created_at desc limit 200) f)
    ));
end $$;
revoke execute on function public.admin_promotions(text, boolean) from public, anon;
grant execute on function public.admin_promotions(text, boolean) to authenticated;

-- 8) Lo que ve cada dueño
create or replace function public.job_promotions(p_job uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare j jobs; pl plans; used int;
begin
  select * into j from jobs where id = p_job;
  if j.id is null or not is_company_member(j.company_id) then raise exception 'Sin acceso'; end if;
  pl := plan_of(j.company_id);
  select count(*) into used from promotions where company_id = j.company_id and source = 'plan'
    and created_at >= date_trunc('month', now() at time zone 'America/Santiago') at time zone 'America/Santiago';
  return jsonb_build_object(
    'job', jsonb_build_object('id', j.id, 'title', j.title, 'status', j.status),
    'plan', jsonb_build_object('name', pl.name, 'credits', pl.promo_credits, 'days', pl.promo_days, 'used', used),
    'products', (select jsonb_agg(to_jsonb(x) order by x.sort) from promo_products x where x.target = 'job' and x.active),
    'baseline', jsonb_build_object(
      'actions_per_day', round(((select count(*) from candidate_job_actions a where a.job_id = j.id and a.action = 'interest'
          and not exists (select 1 from promotions p where p.job_id = j.id and p.starts_at is not null and a.created_at >= p.starts_at and a.created_at < coalesce(p.ends_at, now())))::numeric
        / greatest(1, extract(epoch from now() - j.created_at) / 86400 - coalesce((select sum(extract(epoch from least(coalesce(p.ends_at, now()), now()) - p.starts_at)) / 86400 from promotions p where p.job_id = j.id and p.starts_at is not null), 0))), 2)),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'status', case when p.status = 'activa' and p.ends_at <= now() then 'finalizada' else p.status end,
        'source', p.source, 'days', p.days, 'net', p.net_clp, 'iva', p.iva_clp, 'total', p.total_clp, 'starts_at', p.starts_at, 'ends_at', p.ends_at,
        'paused_by', p.paused_by, 'created_at', p.created_at, 'results', promo_results(p)) order by p.created_at desc), '[]'::jsonb)
      from promotions p where p.job_id = j.id));
end $$;
revoke execute on function public.job_promotions(uuid) from public, anon;
grant execute on function public.job_promotions(uuid) to authenticated;

create or replace function public.my_profile_promotion() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'is_public', coalesce((select is_public from candidate_profiles where user_id = auth.uid()), false),
    'products', (select jsonb_agg(to_jsonb(x) order by x.sort) from promo_products x where x.target = 'profile' and x.active),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'status', case when p.status = 'activa' and p.ends_at <= now() then 'finalizada' else p.status end,
        'source', p.source, 'days', p.days, 'total', p.total_clp, 'starts_at', p.starts_at, 'ends_at', p.ends_at, 'paused_by', p.paused_by,
        'created_at', p.created_at, 'results', promo_results(p)) order by p.created_at desc), '[]'::jsonb)
      from promotions p where p.candidate_id = auth.uid() and p.target = 'profile'))
$$;
revoke execute on function public.my_profile_promotion() from public, anon;
grant execute on function public.my_profile_promotion() to authenticated;

-- Seguimiento de apariciones y clics (solo cuenta destacados activos; máximo 30 por llamada)
create or replace function public.promo_track(p_ids uuid[], p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('impression', 'click') or p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then return; end if;
  insert into promo_stats (promotion_id, day, impressions, clicks)
  select p.id, (now() at time zone 'America/Santiago')::date, case when p_kind = 'impression' then 1 else 0 end, case when p_kind = 'click' then 1 else 0 end
  from promotions p where p.id = any (p_ids[1:30]) and p.status = 'activa' and p.ends_at > now()
  on conflict (promotion_id, day) do update set impressions = promo_stats.impressions + excluded.impressions, clicks = promo_stats.clicks + excluded.clicks;
end $$;
revoke execute on function public.promo_track(uuid[], text) from public;
grant execute on function public.promo_track(uuid[], text) to anon, authenticated;

-- Destacadas para la página de inicio y el portal público (rotan al azar)
create or replace function public.public_featured_jobs(p_limit int default 6) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select jsonb_build_object('promotion_id', p.id, 'id', j.id, 'title', j.title, 'comuna', j.comuna, 'region', j.region, 'modality', j.modality,
      'salary_min', j.salary_min, 'salary_max', j.salary_max, 'salary_type', j.salary_type, 'company', c.display_name, 'slug', c.slug) x
    from promotions p join jobs j on j.id = p.job_id join companies c on c.id = j.company_id
    where p.target = 'job' and p.status = 'activa' and p.ends_at > now() and j.status = 'published' and c.verification_status = 'verified'
    order by random() limit least(greatest(coalesce(p_limit, 6), 0), (select home_slots from promo_settings))) s
$$;
revoke execute on function public.public_featured_jobs(int) from public;
grant execute on function public.public_featured_jobs(int) to anon, authenticated;

-- 9) La vacante se pausa o cierra: el destacado se pausa y conserva sus días; al volver a publicarse, sigue
create or replace function public.promo_follow_job() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'published' and new.status <> 'published' then
    update promotions set status = 'pausada', paused_by = 'job', remaining_seconds = greatest(0, extract(epoch from ends_at - now()))::int, updated_at = now()
    where job_id = new.id and status = 'activa' and ends_at > now();
  elsif new.status = 'published' and old.status <> 'published' then
    update promotions set status = 'activa', paused_by = null, ends_at = now() + make_interval(secs => coalesce(remaining_seconds, 0)), remaining_seconds = null, updated_at = now()
    where job_id = new.id and status = 'pausada' and paused_by = 'job';
  end if;
  return new;
end $$;
revoke execute on function public.promo_follow_job() from public, anon, authenticated;
drop trigger if exists promo_follow_job on public.jobs;
create trigger promo_follow_job after update of status on public.jobs for each row execute function public.promo_follow_job();

-- 10) Vencimientos y aviso 2 días antes (cada hora)
create or replace function public.promo_housekeeping() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in update promotions set ending_notified = true
    where status = 'activa' and not ending_notified and ends_at > now() and ends_at <= now() + interval '2 days' and source <> 'cortesia' returning * loop
    if r.target = 'job' then
      perform notify_users(array(select user_id from company_members where company_id = r.company_id and role <> 'viewer'), 'promo', 'Tu destacado termina pronto',
        '«' || (select title from jobs where id = r.job_id) || '» deja de estar destacada el ' || to_char(r.ends_at at time zone 'America/Santiago', 'DD-MM') || '.', '/vacantes/' || r.job_id || '/destacar', false);
    else
      perform notify_users(array[r.candidate_id], 'promo', 'Tu perfil destacado termina pronto', 'Termina el ' || to_char(r.ends_at at time zone 'America/Santiago', 'DD-MM') || '.', '/visibilidad', false);
    end if;
  end loop;
  update promotions set status = 'finalizada', updated_at = now() where status = 'activa' and ends_at <= now();
end $$;
revoke execute on function public.promo_housekeeping() from public, anon, authenticated;
select cron.schedule('vinka-destacados', '5 * * * *', $$select public.promo_housekeeping()$$);

-- 11) Uso del plan incluye destacados
create or replace function public.company_plan(p_company uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare s subscriptions; p plans;
begin
  if not is_company_member(p_company) and not is_admin() then raise exception 'Sin acceso'; end if;
  select * into s from subscriptions where company_id = p_company;
  p := plan_of(p_company);
  return jsonb_build_object(
    'plan', to_jsonb(p), 'status', coalesce(s.status, 'active'), 'trial_ends_at', s.trial_ends_at, 'current_period_end', s.current_period_end,
    'usage', jsonb_build_object(
      'jobs', (select count(*) from jobs where company_id = p_company and status = 'published'),
      'members', (select count(*) from company_members where company_id = p_company),
      'ai', (select count(*) from ai_log where company_id = p_company and created_at >= date_trunc('month', now() at time zone 'America/Santiago') at time zone 'America/Santiago'),
      'promos', (select count(*) from promotions where company_id = p_company and source = 'plan' and created_at >= date_trunc('month', now() at time zone 'America/Santiago') at time zone 'America/Santiago')),
    'plans', (select jsonb_agg(to_jsonb(x) order by x.sort) from plans x));
end $function$;
