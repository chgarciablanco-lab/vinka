-- Correcciones de la revisión: firma obligatoria en la carta oferta, aviso al bajar de plan, demostración marcada
-- en asesorías y errores de la app que se pueden marcar como resueltos.

-- 1. Carta oferta: cargo, nombre y cargo de quien firma son obligatorios (antes solo lo exigía la pantalla)
do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.send_offer'::regproc);
  d := replace(d, $a$  if m.closed then raise exception 'Esta conversación está cerrada'; end if;$a$,
    $b$  if m.closed then raise exception 'Esta conversación está cerrada'; end if;
  if coalesce(trim(p->>'position'), '') = '' then raise exception 'Indica el cargo que ofreces'; end if;
  if coalesce(trim(p->'letter'->>'signer_name'), '') = '' or coalesce(trim(p->'letter'->>'signer_title'), '') = '' then
    raise exception 'Indica el nombre y el cargo de quien firma la carta'; end if;$b$);
  if position('quien firma la carta' in d) = 0 then raise exception 'No se pudo actualizar send_offer'; end if;
  execute d;
end $mig$;

-- 2. Bajar de plan con más vacantes publicadas que el nuevo límite: aviso a la empresa (no se pausa nada solo)
create or replace function public.plan_limit_notice() returns trigger
language plpgsql security definer set search_path = public as $$
declare p plans; n int;
begin
  if tg_op = 'UPDATE' and new.plan_id is not distinct from old.plan_id and new.status is not distinct from old.status then return new; end if;
  p := plan_of(new.company_id);
  select count(*) into n from jobs where company_id = new.company_id and status = 'published';
  if p.max_active_jobs is not null and n > p.max_active_jobs then
    perform notify_users(array(select user_id from company_members where company_id = new.company_id and role in ('owner', 'admin')), 'plan',
      'Tienes más vacantes publicadas que tu plan',
      'Tu plan ' || p.name || ' permite ' || p.max_active_jobs || ' vacante(s) a la vez y tienes ' || n || '. Pausa ' || (n - p.max_active_jobs) || ' o cambia de plan; mientras tanto no podrás publicar nuevas.',
      '/plan', true);
  end if;
  return new;
end $$;
drop trigger if exists plan_limit_notice on public.subscriptions;
create trigger plan_limit_notice after insert or update on public.subscriptions for each row execute function public.plan_limit_notice();

-- 3. Asesorías: marcar las de demostración para que administración pueda excluirlas de las cifras
do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.admin_service_requests'::regproc);
  d := replace(d, $a$'candidate_id', r.candidate_id,$a$, $b$'candidate_id', r.candidate_id, 'demo', exists (select 1 from seed.users su where su.id = r.candidate_id),$b$);
  if position('''demo''' in d) = 0 then raise exception 'No se pudo actualizar admin_service_requests'; end if;
  execute d;
end $mig$;

-- 4. Errores de la app: se pueden marcar como resueltos y el panel muestra solo los pendientes
alter table public.client_errors add column if not exists resolved_at timestamptz;
do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.admin_overview'::regproc);
  d := replace(d, 'from client_errors where ', 'from client_errors where resolved_at is null and ');
  d := replace(d, 'from client_errors order', 'from client_errors where resolved_at is null order');
  execute d;
end $mig$;
create or replace function public.admin_resolve_errors() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  update client_errors set resolved_at = now() where resolved_at is null;
  get diagnostics n = row_count;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'errors_resolved', 'client_errors', null, jsonb_build_object('count', n));
  return n;
end $$;
revoke execute on function public.admin_resolve_errors() from public, anon;
grant execute on function public.admin_resolve_errors() to authenticated;
-- Los 7 errores «text/html» del 9 de noviembre (14:56 y 15:24) se corrigieron con el bloque 1 (15:50)
update public.client_errors set resolved_at = now() where resolved_at is null and message like '%is not a valid JavaScript MIME type%' and created_at < '2026-11-09 18:50:00+00';
