-- Cobro del plan: aviso 5 días antes del vencimiento, alerta de pago vencido y corte a plan Gratis 5 días después.
create table if not exists backup.subscriptions_20261111 as select * from public.subscriptions;

alter table public.subscriptions add column if not exists billing_alerts text[] not null default '{}';

-- Estado del cobro de una cuenta (matriz): monto, vencimiento, fecha de corte y etapa
create or replace function public.company_billing(p_root uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s subscriptions; p plans; v_net int; v_due timestamptz; v_cut timestamptz;
begin
  select * into s from subscriptions where company_id = p_root;
  if s.company_id is null or s.status not in ('active', 'past_due') or s.current_period_end is null then return null; end if;
  select * into p from plans where id = s.plan_id;
  v_net := coalesce(s.custom_price_clp, p.price_clp);
  if coalesce(v_net, 0) <= 0 then return null; end if;
  v_due := s.current_period_end;
  v_cut := v_due + interval '5 days';
  return jsonb_build_object('plan', p.name, 'net', v_net, 'iva', round(v_net * 0.19)::int, 'total', v_net + round(v_net * 0.19)::int,
    'due', v_due, 'cut_at', v_cut,
    'state', case when now() >= v_due then 'overdue' when now() >= v_due - interval '5 days' then 'upcoming' else 'ok' end,
    'days_to_cut', greatest(0, ceil(extract(epoch from v_cut - now()) / 86400))::int,
    'days_to_due', greatest(0, ceil(extract(epoch from v_due - now()) / 86400))::int);
end $$;
revoke execute on function public.company_billing(uuid) from public, anon, authenticated;

do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.company_plan'::regproc);
  n := replace(d, '''plans'', (select jsonb_agg(to_jsonb(x) order by x.sort) from plans x)',
    '''billing'', case when company_parent(p_company) is null then company_billing(p_company) end, ''plans'', (select jsonb_agg(to_jsonb(x) order by x.sort) from plans x)');
  if n = d then raise exception 'company_plan'; end if; execute n;
end $mig$;

-- Tarea programada: avisa, marca pago pendiente y corta a plan Gratis
create or replace function public.billing_housekeeping() returns integer
language plpgsql security definer set search_path = public as $$
declare s subscriptions; b jsonb; k text; n int := 0; v_to uuid[]; v_name text; d_due text; d_cut text; v_total text;
begin
  for s in select * from subscriptions where status in ('active', 'past_due') and current_period_end is not null loop
    b := company_billing(s.company_id);
    continue when b is null or b->>'state' = 'ok';
    v_to := array(select unnest(company_staff(s.company_id, array['owner', 'admin'])));
    v_name := (select display_name from companies where id = s.company_id);
    d_due := to_char((b->>'due')::timestamptz at time zone 'America/Santiago', 'DD-MM-YYYY');
    d_cut := to_char((b->>'cut_at')::timestamptz at time zone 'America/Santiago', 'DD-MM-YYYY');
    v_total := '$' || replace(to_char((b->>'total')::int, 'FM999G999G999'), ',', '.');

    if now() >= (b->>'cut_at')::timestamptz then
      -- Corte: pasa a plan Gratis sin perder datos
      update subscriptions set plan_id = 'gratis', status = 'active', current_period_end = null, trial_ends_at = null,
        note = 'Corte por falta de pago (venció el ' || d_due || ')', updated_at = now(), billing_alerts = '{}' where company_id = s.company_id;
      insert into audit_logs (actor_id, action, entity, entity_id, detail)
        values (null, 'billing_cut', 'company', s.company_id, jsonb_build_object('plan', s.plan_id, 'due', b->>'due'));
      perform notify_users(v_to, 'plan', 'Tu empresa pasó al plan Gratis',
        'No registramos el pago de tu plan ' || (b->>'plan') || ' (venció el ' || d_due || '). Tus datos siguen disponibles; para volver a tu plan escríbenos a contacto@vinka.cl.', '/plan', true);
      perform notify_users(array(select user_id from admins), 'plan', 'Corte por falta de pago: ' || v_name,
        'Pasó de ' || (b->>'plan') || ' a Gratis. Venció el ' || d_due || '.', '/admin', false);
      n := n + 1;
      continue;
    end if;

    if b->>'state' = 'overdue' then
      if s.status = 'active' then update subscriptions set status = 'past_due', updated_at = now() where company_id = s.company_id; end if;
      k := 'vencido:' || d_due;
      if not k = any(s.billing_alerts) then
        update subscriptions set billing_alerts = array_append(billing_alerts, k) where company_id = s.company_id;
        perform notify_users(v_to, 'plan', 'Pago vencido: el servicio se cortará el ' || d_cut,
          'Tu plan ' || (b->>'plan') || ' venció el ' || d_due || '. Si no registramos el pago de ' || v_total || ' (IVA incluido), el ' || d_cut || ' tu empresa pasará al plan Gratis.', '/plan', true);
        n := n + 1;
      end if;
      k := 'ultimo:' || d_due;
      if now() >= (b->>'cut_at')::timestamptz - interval '1 day' and not k = any(s.billing_alerts) then
        update subscriptions set billing_alerts = array_append(billing_alerts, k) where company_id = s.company_id;
        perform notify_users(v_to, 'plan', 'Mañana se corta tu plan ' || (b->>'plan'),
          'Aún no registramos el pago de ' || v_total || ' (IVA incluido). Si ya pagaste, avísanos a contacto@vinka.cl.', '/plan', true);
        n := n + 1;
      end if;
    elsif b->>'state' = 'upcoming' then
      k := 'aviso:' || d_due;
      if not k = any(s.billing_alerts) then
        update subscriptions set billing_alerts = array_append(billing_alerts, k) where company_id = s.company_id;
        perform notify_users(v_to, 'plan', 'Tu plan ' || (b->>'plan') || ' vence el ' || d_due,
          'Cobro: ' || v_total || ' IVA incluido. VINKA te enviará los datos de pago. Si ya pagaste, no necesitas hacer nada.', '/plan', true);
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.billing_housekeeping() from public, anon, authenticated;

select cron.schedule('vinka-cobros', '15 * * * *', 'select public.billing_housekeeping()');
