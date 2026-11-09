-- Bloque 2 de la auditoría + regla de chat: la empresa (o el asesor/a) inicia la conversación.

create table if not exists backup.offers_20261109b as select * from public.offers;
create table if not exists backup.promotions_20261109 as select * from public.promotions;
create table if not exists backup.promo_stats_20261109 as select * from public.promo_stats;

-- 1) Chat del match: la persona candidata escribe después de que la empresa le escriba.
--    Solo aplica a mensajes escritos desde la app; los automáticos (reserva o cancelación de entrevista) siguen igual.
-- Se ejecuta con los permisos de quien escribe (no «security definer») para distinguir los mensajes de la app de los automáticos.
create or replace function public.chat_company_first() returns trigger
language plpgsql set search_path = public as $$
declare m matches;
begin
  if current_user <> 'authenticated' then return new; end if;
  select * into m from matches where id = new.match_id;
  if new.sender_id = m.candidate_id and not exists (select 1 from messages x where x.match_id = new.match_id and x.sender_id <> m.candidate_id) then
    raise exception 'La empresa inicia la conversación. Podrás responder apenas te escriba.';
  end if;
  return new;
end $$;
drop trigger if exists chat_company_first on public.messages;
create trigger chat_company_first before insert on public.messages for each row execute function public.chat_company_first();

-- 2) Chat de asesoría: la persona escribe después de que su asesor/a o VINKA le escriba.
create or replace function public.service_chat_advisor_first() returns trigger
language plpgsql security definer set search_path = public as $$
declare r service_requests;
begin
  select * into r from service_requests where id = new.request_id;
  if new.sender_id = r.candidate_id and not exists (select 1 from service_messages x where x.request_id = new.request_id and x.sender_id <> r.candidate_id) then
    raise exception 'Tu asesor/a inicia la conversación. Podrás responder apenas te escriba.';
  end if;
  return new;
end $$;
revoke execute on function public.service_chat_advisor_first() from public, anon, authenticated;
drop trigger if exists service_chat_advisor_first on public.service_messages;
create trigger service_chat_advisor_first before insert on public.service_messages for each row execute function public.service_chat_advisor_first();

-- 3) Oferta aceptada: el proceso pasa solo a «contratado» (la empresa puede cambiar la etapa si no se concreta)
create or replace function public.respond_offer(p_id uuid, p_accept boolean, p_note text default ''::text)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare o offers; who text; members uuid[];
begin
  select * into o from offers where id = p_id;
  if o.id is null or o.candidate_id <> auth.uid() then raise exception 'Oferta no encontrada'; end if;
  if o.status <> 'enviada' then raise exception 'Esta oferta ya no está vigente'; end if;
  if o.expires_on is not null and o.expires_on < (now() at time zone 'America/Santiago')::date then raise exception 'La oferta venció. Escríbele a la empresa por el chat.'; end if;
  update offers set status = case when p_accept then 'aceptada' else 'rechazada' end, responded_at = now(), response_note = left(coalesce(p_note,''), 1000) where id = p_id;
  perform log_event(o.company_id, o.job_id, o.candidate_id, null, case when p_accept then 'offer_accepted' else 'offer_rejected' end, '{}'::jsonb);
  if p_accept then
    update matches set stage = 'contratado' where id = o.match_id and stage <> 'contratado';
  end if;
  select trim(first_name || ' ' || last_name) into who from profiles where id = o.candidate_id;
  select array_agg(user_id) into members from company_members where company_id = o.company_id and role <> 'viewer';
  perform notify_users(members, 'offer_response',
    case when p_accept then who || ' aceptó la oferta' else who || ' rechazó la oferta' end,
    case when p_accept then 'Para «' || o.position || '». Quedó como contratado/a; si el ingreso no se concreta, cambia la etapa en su ficha.'
         else 'Para «' || o.position || '».' || case when coalesce(p_note,'') <> '' then ' Comentario: ' || left(p_note, 120) else '' end end,
    '/vacantes/' || o.job_id || '/candidato/' || o.candidate_id, true);
end $function$;

-- 4) Ofertas vencidas: estado propio y aviso a la empresa (cada hora)
alter table public.offers drop constraint if exists offers_status_check;
alter table public.offers add constraint offers_status_check check (status in ('por_aprobar', 'enviada', 'aceptada', 'rechazada', 'retirada', 'vencida'));
create or replace function public.expire_offers() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in update offers set status = 'vencida'
    where status = 'enviada' and expires_on is not null and expires_on < (now() at time zone 'America/Santiago')::date returning * loop
    perform log_event(r.company_id, r.job_id, r.candidate_id, null, 'offer_expired', jsonb_build_object('offer', r.id));
    perform notify_users(array(select user_id from company_members where company_id = r.company_id and role <> 'viewer'), 'offer_expired',
      'Oferta vencida: ' || short_name(r.candidate_id), 'La oferta para «' || r.position || '» venció sin respuesta. Puedes editarla y reenviarla.',
      '/ofertas/' || r.id, false);
  end loop;
end $$;
revoke execute on function public.expire_offers() from public, anon, authenticated;
select cron.schedule('vinka-ofertas-vencidas', '25 * * * *', $$select public.expire_offers()$$);
select public.expire_offers();

-- 5) Historial de versiones de la carta (todas las del match, con envíos por correo)
create or replace function public.offer_history(p_match uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match;
  if m.id is null or not (m.candidate_id = auth.uid() or is_company_member(m.company_id)) then raise exception 'Sin acceso'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'position', o.position, 'salary', o.salary, 'salary_type', o.salary_type, 'status', o.status,
      'created_at', o.created_at, 'responded_at', o.responded_at, 'emailed_at', o.emailed_at,
      'sender', (select trim(first_name || ' ' || last_name) from profiles where id = o.created_by),
      'emails', (select count(*) from pipeline_events e where e.kind = 'offer_emailed' and e.detail->>'offer' = o.id::text)) order by o.created_at desc), '[]'::jsonb)
    from offers o where o.match_id = p_match and (is_company_member(m.company_id) or o.status <> 'por_aprobar'));
end $$;
revoke execute on function public.offer_history(uuid) from public, anon;
grant execute on function public.offer_history(uuid) to authenticated;

-- 6) Perfil oculto: su destacado se pausa (conserva los días) y se reanuda al volver a mostrarlo
create or replace function public.promo_follow_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.is_public and not new.is_public then
    update promotions set status = 'pausada', paused_by = 'profile', remaining_seconds = greatest(0, extract(epoch from ends_at - now()))::int, updated_at = now()
    where candidate_id = new.user_id and target = 'profile' and status = 'activa' and ends_at > now();
  elsif new.is_public and not old.is_public then
    update promotions set status = 'activa', paused_by = null, ends_at = now() + make_interval(secs => coalesce(remaining_seconds, 0)), remaining_seconds = null, updated_at = now()
    where candidate_id = new.user_id and target = 'profile' and status = 'pausada' and paused_by = 'profile';
  end if;
  return new;
end $$;
revoke execute on function public.promo_follow_profile() from public, anon, authenticated;
drop trigger if exists promo_follow_profile on public.candidate_profiles;
create trigger promo_follow_profile after update of is_public on public.candidate_profiles for each row execute function public.promo_follow_profile();
-- perfiles que ya estaban ocultos con un destacado activo
update promotions p set status = 'pausada', paused_by = 'profile', remaining_seconds = greatest(0, extract(epoch from p.ends_at - now()))::int, updated_at = now()
from candidate_profiles cp where cp.user_id = p.candidate_id and not cp.is_public and p.target = 'profile' and p.status = 'activa' and p.ends_at > now();

-- 7) Estadísticas: una aparición y un clic por persona (o navegador) al día; los visitantes anónimos tienen tope diario
create table if not exists public.promo_seen (
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  viewer text not null,
  kind text not null check (kind in ('impression', 'click')),
  day date not null,
  primary key (promotion_id, viewer, kind, day)
);
alter table public.promo_seen enable row level security;
drop function if exists public.promo_track(uuid[], text);
create function public.promo_track(p_ids uuid[], p_kind text, p_viewer text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v text; d date := (now() at time zone 'America/Santiago')::date; pid uuid;
begin
  if p_kind not in ('impression', 'click') or p_ids is null then return; end if;
  v := coalesce(auth.uid()::text, case when length(coalesce(p_viewer, '')) between 8 and 64 then 'a:' || p_viewer end);
  if v is null then return; end if;
  for pid in select distinct x from unnest(p_ids[1:30]) x loop
    continue when not exists (select 1 from promotions where id = pid and status = 'activa' and ends_at > now());
    -- tope diario de visitantes sin cuenta por destacado
    continue when auth.uid() is null and (select count(*) from promo_seen where promotion_id = pid and kind = p_kind and day = d and viewer like 'a:%') >= 300;
    insert into promo_seen values (pid, v, p_kind, d) on conflict do nothing;
    if found then
      insert into promo_stats (promotion_id, day, impressions, clicks) values (pid, d, case when p_kind = 'impression' then 1 else 0 end, case when p_kind = 'click' then 1 else 0 end)
      on conflict (promotion_id, day) do update set impressions = promo_stats.impressions + excluded.impressions, clicks = promo_stats.clicks + excluded.clicks;
    end if;
  end loop;
end $$;
revoke execute on function public.promo_track(uuid[], text, text) from public;
grant execute on function public.promo_track(uuid[], text, text) to anon, authenticated;
select cron.schedule('vinka-limpiar-vistas', '33 8 * * *', $$delete from public.promo_seen where day < current_date - 2$$);
