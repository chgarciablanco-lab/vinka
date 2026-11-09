-- Migración aplicada en Supabase (20261109145422). Exportada tal cual desde supabase_migrations.schema_migrations.

alter table public.subscriptions add column if not exists custom_price_clp int check (custom_price_clp is null or custom_price_clp >= 0);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('plan', 'asesoria')),
  company_id uuid references public.companies(id) on delete set null,
  request_id uuid references public.service_requests(id) on delete set null,
  candidate_id uuid references auth.users(id) on delete set null,
  amount_clp int not null check (amount_clp >= 0),
  months int not null default 1 check (months between 1 and 24),
  plan_id text references public.plans(id),
  method text not null default 'transferencia' check (method in ('transferencia', 'tarjeta', 'efectivo', 'otro')),
  note text not null default '',
  paid_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_payments_paid_at on public.payments (paid_at);
create index if not exists idx_payments_company on public.payments (company_id);
create index if not exists idx_payments_request on public.payments (request_id);
create index if not exists idx_payments_candidate on public.payments (candidate_id);
create index if not exists idx_payments_plan on public.payments (plan_id);
create index if not exists idx_payments_created_by on public.payments (created_by);
alter table public.payments enable row level security;
create policy "pagos: solo administración" on public.payments for select to authenticated using ((select is_admin()));

create policy "asesorías: catálogo público" on public.career_services for select to anon using (active);

create or replace function public.admin_record_payment(p_company uuid, p_plan text, p_amount int, p_months int, p_method text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare s subscriptions; v_from timestamptz;
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Monto no válido'; end if;
  if not exists (select 1 from plans where id = p_plan) then raise exception 'Plan no válido'; end if;
  select * into s from subscriptions where company_id = p_company;
  v_from := greatest(coalesce(s.current_period_end, now()), now());
  insert into payments (kind, company_id, amount_clp, months, plan_id, method, note, created_by)
  values ('plan', p_company, p_amount, coalesce(p_months, 1), p_plan, coalesce(p_method, 'transferencia'), left(coalesce(p_note, ''), 300), auth.uid());
  insert into subscriptions (company_id, plan_id, status, current_period_end, note, updated_at, updated_by)
  values (p_company, p_plan, 'active', v_from + make_interval(months => coalesce(p_months, 1)), 'Pago registrado', now(), auth.uid())
  on conflict (company_id) do update set plan_id = excluded.plan_id, status = 'active', trial_ends_at = null,
    current_period_end = excluded.current_period_end, updated_at = now(), updated_by = auth.uid();
  insert into audit_logs (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'payment', 'company', p_company, jsonb_build_object('plan', p_plan, 'amount', p_amount, 'months', p_months, 'method', p_method));
  perform notify_users(array(select user_id from company_members where company_id = p_company and role in ('owner', 'admin')),
    'plan', 'Pago recibido', 'Tu plan ' || (select name from plans where id = p_plan) || ' está activo hasta el ' || to_char((v_from + make_interval(months => coalesce(p_months, 1))) at time zone 'America/Santiago', 'DD-MM-YYYY') || '.', '/plan', true);
end $$;
revoke execute on function public.admin_record_payment(uuid, text, int, int, text, text) from public, anon;
grant execute on function public.admin_record_payment(uuid, text, int, int, text, text) to authenticated;

create or replace function public.service_payment_on_start() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'en_curso' and old.status in ('solicitada', 'pago_pendiente')
     and not exists (select 1 from payments where request_id = new.id) then
    insert into payments (kind, request_id, candidate_id, amount_clp, method, note, paid_at, created_by)
    values ('asesoria', new.id, new.candidate_id, new.price_clp, 'transferencia', new.service_name, now(), auth.uid());
  end if;
  return new;
end $$;
revoke execute on function public.service_payment_on_start() from public, anon, authenticated;
drop trigger if exists service_payment_on_start on public.service_requests;
create trigger service_payment_on_start after update of status on public.service_requests for each row execute function public.service_payment_on_start();

create or replace function public.admin_revenue(p_include_demo boolean default true) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m0 timestamptz := date_trunc('month', now() at time zone 'America/Santiago') at time zone 'America/Santiago';
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  return (with p as (
      select pay.*, (exists (select 1 from seed.companies d where d.id = pay.company_id) or exists (select 1 from seed.users u where u.id = pay.candidate_id)) demo
      from payments pay
    ), f as (select * from p where p_include_demo or not demo),
    subs as (
      select s.*, coalesce(s.custom_price_clp, pl.price_clp, 0) price, exists (select 1 from seed.companies d where d.id = s.company_id) demo
      from subscriptions s join plans pl on pl.id = s.plan_id where s.status = 'active'
    ), fs as (select * from subs where (p_include_demo or not demo) and price > 0)
    select jsonb_build_object(
      'month', (select coalesce(sum(amount_clp), 0) from f where paid_at >= m0),
      'month_plans', (select coalesce(sum(amount_clp), 0) from f where paid_at >= m0 and kind = 'plan'),
      'month_advisory', (select coalesce(sum(amount_clp), 0) from f where paid_at >= m0 and kind = 'asesoria'),
      'prev_month', (select coalesce(sum(amount_clp), 0) from f where paid_at >= m0 - interval '1 month' and paid_at < m0),
      'prev_month_to_date', (select coalesce(sum(amount_clp), 0) from f where paid_at >= m0 - interval '1 month' and paid_at < now() - interval '1 month'),
      'last12', (select coalesce(sum(amount_clp), 0) from f where paid_at >= m0 - interval '11 months'),
      'total', (select coalesce(sum(amount_clp), 0) from f),
      'mrr', (select coalesce(sum(price), 0) from fs),
      'paying', (select count(*) from fs),
      'advisory_month_count', (select count(*) from f where paid_at >= m0 and kind = 'asesoria'),
      'series', (select jsonb_agg(jsonb_build_object('month', to_char(g, 'YYYY-MM'),
          'plans', (select coalesce(sum(amount_clp), 0) from f where kind = 'plan' and paid_at >= g at time zone 'America/Santiago' and paid_at < (g + interval '1 month') at time zone 'America/Santiago'),
          'advisory', (select coalesce(sum(amount_clp), 0) from f where kind = 'asesoria' and paid_at >= g at time zone 'America/Santiago' and paid_at < (g + interval '1 month') at time zone 'America/Santiago')) order by g)
        from generate_series(date_trunc('month', now() at time zone 'America/Santiago') - interval '23 months', date_trunc('month', now() at time zone 'America/Santiago'), interval '1 month') g),
      'by_plan', (select coalesce(jsonb_agg(jsonb_build_object('plan', x.plan_id, 'n', x.n, 'mrr', x.mrr) order by x.mrr desc), '[]'::jsonb)
        from (select plan_id, count(*) n, sum(price) mrr from fs group by plan_id) x),
      'recent', (select coalesce(jsonb_agg(jsonb_build_object('kind', y.kind, 'amount', y.amount_clp, 'paid_at', y.paid_at, 'method', y.method, 'demo', y.demo,
          'who', coalesce((select display_name from companies c where c.id = y.company_id), (select trim(first_name || ' ' || last_name) from profiles pr where pr.id = y.candidate_id)),
          'what', case when y.kind = 'plan' then 'Plan ' || coalesce((select name from plans where id = y.plan_id), '') || case when y.months > 1 then ' × ' || y.months || ' meses' else '' end else y.note end) order by y.paid_at desc), '[]'::jsonb)
        from (select * from f order by paid_at desc limit 15) y)
    ));
end $$;
revoke execute on function public.admin_revenue(boolean) from public, anon;
grant execute on function public.admin_revenue(boolean) to authenticated;
