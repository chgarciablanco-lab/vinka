-- Pago con tarjeta en MODO DEMOSTRACIÓN para asesorías, planes de empresa y destacados.
-- No hay cobro real ni pasarela: solo se aceptan tarjetas de prueba (la app nunca envía el número completo;
-- solo llega una clave de tarjeta de prueba, la marca y los últimos 4 dígitos). El precio lo calcula siempre la base de datos.
-- Al aprobarse, se registra el pago (método «tarjeta», proveedor «vinka_demo») y se activa lo comprado.

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('asesoria', 'plan', 'promocion')),
  ref_id uuid not null,
  plan_id text,
  months int,
  user_id uuid not null default auth.uid(),
  company_id uuid,
  candidate_id uuid,
  title text not null default '',
  amount_clp int not null,
  card_brand text not null,
  card_last4 text not null check (card_last4 ~ '^[0-9]{4}$'),
  card_type text not null check (card_type in ('credito', 'debito')),
  installments int not null default 1 check (installments between 1 and 12),
  status text not null check (status in ('aprobado', 'rechazado')),
  reject_reason text not null default '',
  order_code text not null unique,
  auth_code text,
  payment_id uuid references public.payments(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists payment_attempts_user on public.payment_attempts (user_id, created_at desc);
create index if not exists payment_attempts_company on public.payment_attempts (company_id, created_at desc);
alter table public.payment_attempts enable row level security;
revoke all on public.payment_attempts from anon, authenticated;

-- Qué se cobra y si se puede pagar ahora (lo usa la pantalla antes de mostrar el formulario)
create or replace function public.checkout_quote(p_kind text, p_ref uuid, p_plan text default null, p_months int default 1)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r service_requests; pr promotions; pl plans; s subscriptions; v_net int; v_total int; v_title text; v_detail text; v_reason text; v_months int := coalesce(p_months, 1);
begin
  if auth.uid() is null then raise exception 'Inicia sesión para pagar'; end if;
  if p_kind = 'asesoria' then
    select * into r from service_requests where id = p_ref and candidate_id = auth.uid();
    if r.id is null then raise exception 'Solicitud no encontrada'; end if;
    v_title := r.service_name; v_total := r.price_clp; v_net := round(r.price_clp / 1.19)::int;
    v_detail := 'Asesoría con reclutador · pago único';
    if r.status <> 'pago_pendiente' then v_reason := case when r.status = 'solicitada' then 'VINKA aún debe confirmar el servicio contigo por el chat' else 'Esta asesoría no tiene un pago pendiente' end;
    elsif r.assigned_to is null and coalesce(case when r.choice = 'asesor' and advisor_unavailable_reason(r.preferred_advisor, r.service_id) is null then r.preferred_advisor end, advisor_suggest(r.service_id)) is null then
      v_reason := 'Antes de pagar, VINKA debe asignarte un asesor/a. Te avisaremos apenas esté.';
    end if;
  elsif p_kind = 'plan' then
    if not is_company_admin(p_ref) then raise exception 'Solo quien administra la empresa puede pagar el plan'; end if;
    if company_parent(p_ref) is not null then raise exception 'El plan de esta empresa lo paga su consultora matriz'; end if;
    if v_months not in (1, 3, 6, 12) then raise exception 'Elige 1, 3, 6 o 12 meses'; end if;
    select * into pl from plans where id = p_plan and public;
    if pl.id is null then raise exception 'Plan no válido'; end if;
    if coalesce(pl.price_clp, 0) <= 0 then raise exception 'Este plan no se paga con tarjeta'; end if;
    select * into s from subscriptions where company_id = p_ref;
    v_net := case when s.plan_id = pl.id and s.custom_price_clp is not null then s.custom_price_clp else pl.price_clp end * v_months;
    v_total := v_net + round(v_net * 0.19)::int;
    v_title := 'Plan ' || pl.name || case when v_months > 1 then ' × ' || v_months || ' meses' else ' · 1 mes' end;
    v_detail := case when s.plan_id = pl.id and s.status = 'active' and s.current_period_end > now()
      then 'Se suma al período pagado (hasta el ' || to_char(s.current_period_end at time zone 'America/Santiago', 'DD-MM-YYYY') || ')' else 'Se activa al aprobarse el pago' end;
  elsif p_kind = 'promocion' then
    select * into pr from promotions where id = p_ref;
    if pr.id is null or not ((pr.target = 'job' and can_manage(pr.company_id)) or (pr.target = 'profile' and pr.candidate_id = auth.uid())) then raise exception 'Destacado no encontrado'; end if;
    v_title := coalesce((select name from promo_products where id = pr.product_id), 'Destacado') || ' · ' || pr.days || ' días';
    v_total := pr.total_clp; v_net := pr.net_clp;
    v_detail := case when pr.target = 'job' then 'Vacante: ' || coalesce((select title from jobs where id = pr.job_id), '') else 'Tu perfil destacado' end;
    if pr.status <> 'solicitada' or pr.source <> 'compra' then v_reason := 'Este destacado ya no tiene un pago pendiente'; end if;
  else
    raise exception 'Tipo de pago no válido';
  end if;
  return jsonb_build_object('title', v_title, 'detail', v_detail, 'net', v_net, 'iva', v_total - v_net, 'total', v_total, 'reason', v_reason,
    'merchant', 'VINKA SpA (demostración)', 'demo', true);
end $$;

-- Pagar. Las tarjetas de prueba deciden el resultado: aprobada, rechazada por el banco o sin fondos.
create or replace function public.checkout_pay(p_kind text, p_ref uuid, p_card text, p_type text, p_installments int default 1,
  p_plan text default null, p_months int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  q jsonb; v_brand text; v_last4 text; v_ok boolean; v_why text; v_order text; v_auth text; v_pay uuid; v_inst int := coalesce(p_installments, 1);
  r service_requests; pr promotions; pl plans; s subscriptions; st promo_settings; v_adv uuid; v_from timestamptz; v_end timestamptz; v_open int; v_max int; v_users uuid[];
  v_company uuid; v_candidate uuid; v_months int := coalesce(p_months, 1);
begin
  -- Tarjetas de prueba (las mismas que muestra la pantalla). Nada más se acepta.
  select b, l, ok, why into v_brand, v_last4, v_ok, v_why from (values
    ('visa_ok', 'Visa', '6623', true, ''),
    ('redcompra_ok', 'Redcompra', '7763', true, ''),
    ('mc_rechazo', 'Mastercard', '0568', false, 'Transacción rechazada por el banco emisor'),
    ('sin_fondos', 'Visa', '0002', false, 'Fondos insuficientes')) t(k, b, l, ok, why) where k = p_card;
  if v_brand is null then raise exception 'En modo demostración solo se aceptan las tarjetas de prueba'; end if;
  if p_type not in ('credito', 'debito') then raise exception 'Elige crédito o débito'; end if;
  if (v_brand = 'Redcompra') <> (p_type = 'debito') then raise exception 'Esa tarjeta es de %', case when v_brand = 'Redcompra' then 'débito' else 'crédito' end; end if;
  if p_type = 'debito' then v_inst := 1; end if;
  if v_inst not in (1, 2, 3, 6, 12) then raise exception 'Cuotas no válidas'; end if;
  if (select count(*) from payment_attempts where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 12 then
    raise exception 'Demasiados intentos de pago. Espera un momento e inténtalo de nuevo.'; end if;

  -- Bloquea lo que se paga para que no se cobre dos veces y valida que siga pendiente
  if p_kind = 'asesoria' then
    select * into r from service_requests where id = p_ref and candidate_id = auth.uid() for update;
    v_candidate := r.candidate_id;
  elsif p_kind = 'promocion' then
    select * into pr from promotions where id = p_ref for update;
    v_company := pr.company_id; v_candidate := pr.candidate_id;
  elsif p_kind = 'plan' then
    perform 1 from companies where id = p_ref for update;
    v_company := p_ref;
  end if;
  q := checkout_quote(p_kind, p_ref, p_plan, v_months);
  if q->>'reason' is not null then raise exception '%', q->>'reason'; end if;

  if p_kind = 'promocion' and v_ok then
    select * into st from promo_settings;
    select count(*) into v_open from promotions where target = pr.target and status = 'activa' and ends_at > now();
    v_max := case when pr.target = 'job' then st.max_jobs else st.max_profiles end;
    if v_open >= v_max and not exists (select 1 from promotions o where o.id = pr.renews_id and o.status = 'activa' and o.ends_at > now()) then
      raise exception 'Los espacios destacados están completos ahora. No se hizo ningún cobro; inténtalo en unos días.'; end if;
    if pr.target = 'job' and not exists (select 1 from jobs where id = pr.job_id and status = 'published') then raise exception 'La vacante no está publicada. No se hizo ningún cobro.'; end if;
    if pr.target = 'profile' and not coalesce((select is_public from candidate_profiles where user_id = pr.candidate_id), false) then raise exception 'Tu perfil está oculto para empresas. No se hizo ningún cobro.'; end if;
  end if;

  v_order := 'VK-' || to_char(now() at time zone 'America/Santiago', 'YYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
  if v_ok then
    v_auth := lpad((floor(random() * 1000000))::int::text, 6, '0');
    if p_kind = 'asesoria' then
      insert into payments (kind, request_id, candidate_id, amount_clp, method, note, paid_at, created_by, provider, provider_ref)
      values ('asesoria', r.id, r.candidate_id, r.price_clp, 'tarjeta', r.service_name, now(), auth.uid(), 'vinka_demo', v_order) returning id into v_pay;
      if r.assigned_to is null then
        v_adv := coalesce(case when r.choice = 'asesor' and advisor_unavailable_reason(r.preferred_advisor, r.service_id) is null then r.preferred_advisor end, advisor_suggest(r.service_id));
        perform service_do_assign(r.id, v_adv, null, 'pago');
      end if;
      update service_requests set status = 'en_curso', updated_at = now() where id = r.id returning * into r;
      perform log_service(r.id, 'estado', 'Estado: en curso', 'Pago con tarjeta aprobado (' || v_brand || ' ****' || v_last4 || ', orden ' || v_order || ')', null, false);
      perform notify_users(array[r.candidate_id], 'service_request', 'Pago aprobado: tu asesoría comenzó', r.service_name || ' · orden ' || v_order || '. Ya puedes conversar con tu asesor/a.', '/asesoria', true);
      perform notify_users(array[r.assigned_to], 'team_note', 'Pago confirmado: puedes comenzar', r.service_name, '/', true);
      perform notify_users(admin_ids(), 'service_request', 'Pago con tarjeta: ' || r.service_name, '$' || to_char(r.price_clp, 'FM999G999G999') || ' · orden ' || v_order, '/asesorias', false);
    elsif p_kind = 'plan' then
      select * into pl from plans where id = p_plan;
      select * into s from subscriptions where company_id = p_ref;
      v_from := case when s.plan_id = pl.id and s.status = 'active' then greatest(coalesce(s.current_period_end, now()), now()) else now() end;
      v_end := cl_end_of_day(v_from + make_interval(months => v_months));
      insert into payments (kind, company_id, amount_clp, net_clp, iva_clp, total_clp, months, plan_id, method, note, paid_at, created_by, provider, provider_ref)
      values ('plan', p_ref, (q->>'net')::int, (q->>'net')::int, (q->>'iva')::int, (q->>'total')::int, v_months, pl.id, 'tarjeta', q->>'title', now(), auth.uid(), 'vinka_demo', v_order) returning id into v_pay;
      insert into subscriptions (company_id, plan_id, status, current_period_end, note, updated_at, updated_by)
      values (p_ref, pl.id, 'active', v_end, 'Pago con tarjeta ' || v_order, now(), auth.uid())
      on conflict (company_id) do update set plan_id = excluded.plan_id, status = 'active', trial_ends_at = null,
        current_period_end = excluded.current_period_end, note = excluded.note, updated_at = now(), updated_by = auth.uid();
      insert into audit_logs (actor_id, action, entity, entity_id, detail)
      values (auth.uid(), 'payment', 'company', p_ref, jsonb_build_object('plan', pl.id, 'amount', (q->>'net')::int, 'months', v_months, 'method', 'tarjeta', 'order', v_order));
      perform notify_users(array(select unnest(company_staff(p_ref, array['owner', 'admin']))), 'plan', 'Pago aprobado',
        'Tu plan ' || pl.name || ' está activo hasta el ' || to_char(v_end at time zone 'America/Santiago', 'DD-MM-YYYY') || '. Orden ' || v_order || '.', '/plan', true);
      perform notify_users(admin_ids(), 'plan_request', 'Pago con tarjeta: plan ' || pl.name, (select display_name from companies where id = p_ref) || ' · orden ' || v_order, '/', false);
    else
      insert into payments (kind, company_id, candidate_id, amount_clp, net_clp, iva_clp, total_clp, method, note, paid_at, created_by, promotion_id, provider, provider_ref)
      values ('promocion', pr.company_id, pr.candidate_id, pr.total_clp, pr.net_clp, pr.iva_clp, pr.total_clp, 'tarjeta', q->>'title', now(), auth.uid(), pr.id, 'vinka_demo', v_order) returning id into v_pay;
      update promotions set status = 'activa', payment_id = v_pay, starts_at = now(), ends_at = now() + make_interval(days => pr.days),
        activated_by = auth.uid(), note = left('Pago con tarjeta ' || v_order, 300), updated_at = now() where id = pr.id;
      if pr.renews_id is not null then perform promo_apply_renewal(pr.id); end if;
      insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'promo_activate', 'promotion', pr.id, jsonb_build_object('paid', true, 'method', 'tarjeta', 'order', v_order));
      if pr.target = 'job' then
        v_users := array(select unnest(company_staff(pr.company_id, array['owner', 'admin', 'recruiter', 'client'])));
        perform notify_users(v_users, 'promo', 'Tu vacante ya está destacada', '«' || (select title from jobs where id = pr.job_id) || '» aparece entre los primeros resultados. Orden ' || v_order || '.', '/vacantes/' || pr.job_id || '/destacar', true);
      else
        perform notify_users(array[pr.candidate_id], 'promo', 'Tu perfil ya está destacado', 'Las empresas verán tu perfil entre los primeros. Orden ' || v_order || '.', '/visibilidad', true);
      end if;
      perform notify_users(admin_ids(), 'promo_request', 'Pago con tarjeta: destacado', q->>'title' || ' · orden ' || v_order, '/promociones', false);
    end if;
  end if;

  insert into payment_attempts (kind, ref_id, plan_id, months, company_id, candidate_id, title, amount_clp, card_brand, card_last4, card_type, installments, status, reject_reason, order_code, auth_code, payment_id)
  values (p_kind, p_ref, case when p_kind = 'plan' then p_plan end, case when p_kind = 'plan' then v_months end, v_company, v_candidate, q->>'title', (q->>'total')::int,
    v_brand, v_last4, p_type, v_inst, case when v_ok then 'aprobado' else 'rechazado' end, v_why, v_order, v_auth, v_pay);

  return jsonb_build_object('status', case when v_ok then 'aprobado' else 'rechazado' end, 'reason', v_why, 'order', v_order, 'auth_code', v_auth,
    'amount', (q->>'total')::int, 'net', (q->>'net')::int, 'iva', (q->>'iva')::int, 'title', q->>'title', 'detail', q->>'detail',
    'brand', v_brand, 'last4', v_last4, 'type', p_type, 'installments', v_inst, 'paid_at', now(), 'merchant', q->>'merchant');
end $$;

-- Comprobantes: los del postulante, o los de la empresa (solo quien la administra)
create or replace function public.my_payment_receipts(p_company uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if p_company is not null and not is_company_admin(p_company) then raise exception 'Solo quien administra la empresa ve sus pagos'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('order', a.order_code, 'kind', a.kind, 'title', a.title, 'amount', a.amount_clp, 'brand', a.card_brand,
      'last4', a.card_last4, 'type', a.card_type, 'installments', a.installments, 'status', a.status, 'reason', a.reject_reason, 'auth_code', a.auth_code,
      'paid_at', a.created_at) order by a.created_at desc)
    from (select * from payment_attempts where case when p_company is null then user_id = auth.uid() and company_id is null else company_id = p_company end
          order by created_at desc limit 30) a), '[]'::jsonb);
end $$;

do $g$
declare f text;
begin
  foreach f in array array['checkout_quote(text, uuid, text, int)', 'checkout_pay(text, uuid, text, text, int, text, int)', 'my_payment_receipts(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $g$;
