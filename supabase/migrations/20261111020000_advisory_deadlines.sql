-- Asesorías: fecha comprometida concreta por hito, responsable y atraso, con aviso cuando un hito se vence.
-- Días hábiles = lunes a viernes, hora de Chile (no descuenta feriados).
create table if not exists backup.career_services_20261111 as select * from public.career_services;

alter table public.career_services add column if not exists deadline_days int;
alter table public.career_services add column if not exists milestone text;
update public.career_services set deadline_days = 3, milestone = 'Entregar el CV mejorado' where id = 'cv' and deadline_days is null;
update public.career_services set deadline_days = 5, milestone = 'Realizar la sesión' where id = 'busqueda' and deadline_days is null;
update public.career_services set deadline_days = 3, milestone = 'Iniciar: primera sesión o CV mejorado' where id = 'completa' and deadline_days is null;

alter table public.service_requests add column if not exists delivered_at timestamptz;
alter table public.service_requests add column if not exists deadline_alerts text[] not null default '{}';

create or replace function public.service_mark_delivered() returns trigger language plpgsql as $$
begin
  if new.status = 'entregada' and old.status is distinct from 'entregada' then new.delivered_at := now(); end if;
  return new;
end $$;
drop trigger if exists service_mark_delivered on public.service_requests;
create trigger service_mark_delivered before update of status on public.service_requests for each row execute function public.service_mark_delivered();
update public.service_requests set delivered_at = updated_at where status = 'entregada' and delivered_at is null;

-- Suma días hábiles (lun-vie) en hora de Chile, manteniendo la hora del día
create or replace function public.add_business_days(p_from timestamptz, p_days int) returns timestamptz
language plpgsql immutable set search_path = public as $$
declare t timestamp := p_from at time zone 'America/Santiago'; n int := 0;
begin
  while n < p_days loop
    t := t + interval '1 day';
    if extract(isodow from t) < 6 then n := n + 1; end if;
  end loop;
  return t at time zone 'America/Santiago';
end $$;

-- Hitos de una asesoría: qué toca, quién responde, para cuándo y si está atrasado
create or replace function public.service_milestones(r service_requests) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cs career_services; out jsonb := '[]'::jsonb; adv text; first_msg timestamptz; files int; sess int; dd timestamptz;
begin
  select * into cs from career_services where id = r.service_id;
  adv := coalesce(nullif(r.assigned_name, ''), (select trim(first_name || ' ' || last_name) from profiles where id = r.assigned_to), 'Asesor/a por asignar');
  if r.status in ('solicitada', 'pago_pendiente') then
    out := out || jsonb_build_object('key', 'pago', 'label', case when r.status = 'solicitada' then 'Escribir a la persona para coordinar el pago' else 'Confirmar el pago' end,
      'who', 'VINKA', 'due', add_business_days(r.created_at, case when r.status = 'solicitada' then 1 else 3 end), 'done', false);
  elsif r.status = 'en_curso' and r.started_at is not null then
    select min(created_at) into first_msg from service_messages where request_id = r.id and sender_kind in ('advisor', 'admin') and sender_id is not null and created_at >= r.started_at;
    out := out || jsonb_build_object('key', 'contacto', 'label', 'Primer mensaje a la persona', 'who', adv, 'due', add_business_days(r.started_at, 1), 'done', first_msg is not null, 'done_at', first_msg);
    select count(*) into files from service_messages where request_id = r.id and file_path is not null and sender_kind in ('advisor', 'admin');
    select count(*) into sess from service_sessions where request_id = r.id and status = 'realizada';
    dd := add_business_days(r.started_at, coalesce(cs.deadline_days, 5));
    out := out || jsonb_build_object('key', 'hito', 'label', coalesce(cs.milestone, 'Entregar el servicio'), 'who', adv, 'due', dd,
      'done', case r.service_id when 'cv' then files > 0 when 'busqueda' then sess > 0 else files > 0 or sess > 0 end);
    if r.service_id = 'completa' then
      out := out || jsonb_build_object('key', 'seguimiento', 'label', 'Completar el seguimiento de 2 semanas y entregar', 'who', adv, 'due', dd + interval '14 days', 'done', false);
    else
      out := out || jsonb_build_object('key', 'entrega', 'label', 'Marcar como entregada para revisión', 'who', adv, 'due', add_business_days(dd, 2), 'done', false);
    end if;
  elsif r.status = 'entregada' then
    out := out || jsonb_build_object('key', 'revision', 'label', 'Revisar y aprobar la entrega', 'who', 'VINKA', 'due', add_business_days(coalesce(r.delivered_at, r.updated_at), 2), 'done', false);
  end if;
  return (select coalesce(jsonb_agg(x || jsonb_build_object('late', not (x->>'done')::boolean and (x->>'due')::timestamptz < now())), '[]'::jsonb) from jsonb_array_elements(out) x);
end $$;

create or replace function public.service_next(r service_requests) returns jsonb
language sql stable security definer set search_path = public as $$
  select x from jsonb_array_elements(service_milestones(r)) x where not (x->>'done')::boolean order by (x->>'due')::timestamptz limit 1 $$;

create or replace function public.service_deadline(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r service_requests;
begin
  if not can_access_request(p_id) then raise exception 'No tienes acceso a esta asesoría'; end if;
  select * into r from service_requests where id = p_id;
  return jsonb_build_object('milestones', service_milestones(r), 'next', service_next(r));
end $$;
revoke execute on function public.service_milestones(service_requests), public.service_next(service_requests) from public, anon, authenticated;
grant execute on function public.service_deadline(uuid) to authenticated;

do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.admin_service_requests'::regproc);
  n := replace(d, '''notes'', (select count(*) from team_notes t where t.request_id = r.id))', '''notes'', (select count(*) from team_notes t where t.request_id = r.id), ''next'', service_next(r))');
  if n = d then raise exception 'admin_service_requests'; end if; execute n;
  d := pg_get_functiondef('public.advisor_requests'::regproc);
  n := replace(d, '''last_message_at'', (select max(created_at) from service_messages m where m.request_id = r.id))', '''last_message_at'', (select max(created_at) from service_messages m where m.request_id = r.id), ''next'', service_next(r))');
  if n = d then raise exception 'advisor_requests'; end if; execute n;
end $mig$;

-- Aviso cuando un hito se vence (una vez por hito), al responsable y a administración
create or replace function public.service_deadline_alerts() returns integer
language plpgsql security definer set search_path = public as $$
declare r service_requests; x jsonb; n int := 0; who text;
begin
  for r in select sr.* from service_requests sr where sr.status in ('solicitada', 'pago_pendiente', 'en_curso', 'entregada')
      and not exists (select 1 from seed.users su where su.id = sr.candidate_id) loop
    for x in select * from jsonb_array_elements(service_milestones(r)) loop
      if (x->>'late')::boolean and not ((r.status || ':' || (x->>'key')) = any(r.deadline_alerts)) then
        update service_requests set deadline_alerts = array_append(deadline_alerts, r.status || ':' || (x->>'key')) where id = r.id;
        who := x->>'who';
        perform notify_users(array(select user_id from admins), 'service_request', 'Hito atrasado: ' || r.service_name,
          (x->>'label') || ' · responsable: ' || who || ' · vencía el ' || to_char((x->>'due')::timestamptz at time zone 'America/Santiago', 'DD-MM HH24:MI') || '.', '/asesorias', true);
        if r.assigned_to is not null and who <> 'VINKA' then
          perform notify_users(array[r.assigned_to], 'team_note', 'Hito atrasado: ' || r.service_name,
            (x->>'label') || ' vencía el ' || to_char((x->>'due')::timestamptz at time zone 'America/Santiago', 'DD-MM HH24:MI') || '. Ponte al día o avisa a VINKA por el chat interno.', '/', true);
        end if;
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end $$;
revoke execute on function public.service_deadline_alerts() from public, anon, authenticated;

select cron.schedule('vinka-asesorias-plazos', '50 * * * *', 'select public.service_deadline_alerts()');

-- Antes del pago: si VINKA ya escribió por el chat, el hito pasa a «Confirmar el pago» (aplicado como advisory_deadlines_payment_step)
do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.service_milestones'::regproc);
  n := replace(d, 'case when r.status = ''solicitada'' then ''Escribir a la persona para coordinar el pago'' else ''Confirmar el pago'' end,',
    'case when r.status = ''solicitada'' and not exists (select 1 from service_messages m where m.request_id = r.id and m.sender_kind = ''admin'') then ''Escribir a la persona para coordinar el pago'' else ''Confirmar el pago'' end,');
  n := replace(n, '''due'', add_business_days(r.created_at, case when r.status = ''solicitada'' then 1 else 3 end), ''done'', false);',
    '''due'', add_business_days(r.created_at, case when r.status = ''solicitada'' and not exists (select 1 from service_messages m where m.request_id = r.id and m.sender_kind = ''admin'') then 1 else 3 end), ''done'', false);');
  if n = d or position('sender_kind = ''admin''' in n) = 0 then raise exception 'service_milestones'; end if; execute n;
end $mig$;
