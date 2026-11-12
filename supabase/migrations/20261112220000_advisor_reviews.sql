-- P2 · Valoraciones verificadas de asesorías: una por servicio finalizado y aprobado por VINKA.
-- Sin notas ficticias. El asesor responde o pide revisión; VINKA modera con registro de auditoría.
create schema if not exists backup;
create table if not exists backup.fn_advisor_card_20261112 as
  select now() as saved_at, pg_get_functiondef('public.advisor_card(uuid)'::regprocedure) as def;

create table if not exists public.advisor_reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.service_requests(id) on delete cascade,
  advisor_id uuid not null references public.advisors(user_id) on delete cascade,
  candidate_id uuid not null references public.profiles(id) on delete cascade,
  service_id text not null,
  overall smallint not null check (overall between 1 and 5),
  punctuality smallint not null check (punctuality between 1 and 5),
  quality smallint not null check (quality between 1 and 5),
  communication smallint not null check (communication between 1 and 5),
  deliverables smallint not null check (deliverables between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 600),
  reply text not null default '' check (char_length(reply) <= 600),
  replied_at timestamptz,
  status text not null default 'visible' check (status in ('visible', 'reportada', 'oculta')),
  report_reason text not null default '',
  reported_at timestamptz,
  moderation_note text not null default '',
  moderated_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists advisor_reviews_advisor on public.advisor_reviews (advisor_id, created_at desc);
alter table public.advisor_reviews enable row level security;
revoke all on public.advisor_reviews from anon, authenticated;

-- Promedio solo con valoraciones visibles o en revisión (una denuncia no borra la nota mientras VINKA decide)
create or replace function public.advisor_rating(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ratings', count(*), 'rating', round(avg(overall)::numeric, 1),
    'punctuality', round(avg(punctuality)::numeric, 1), 'quality', round(avg(quality)::numeric, 1),
    'communication', round(avg(communication)::numeric, 1), 'deliverables', round(avg(deliverables)::numeric, 1))
  from advisor_reviews where advisor_id = p_user and status <> 'oculta'
$$;

create or replace function public.advisor_card(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select ap.pub || jsonb_build_object('id', ap.user_id, 'available', advisor_available(ap.user_id),
    'service_names', coalesce((select jsonb_agg(c.name order by c.sort) from career_services c where ap.pub->'services' ? c.id), '[]'::jsonb))
    || advisor_rating(ap.user_id)
  from advisor_profiles ap where ap.user_id = p_user and ap.pub is not null
$$;

-- Opiniones públicas de un asesor: sin nombre del postulante, solo «Postulante verificado», servicio y mes
create or replace function public.advisor_reviews_public(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_admin() or exists (select 1 from profiles where id = auth.uid() and role in ('candidate', 'advisor'))) then
    raise exception 'Las valoraciones son para usuarios de VINKA'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'overall', v.overall, 'punctuality', v.punctuality, 'quality', v.quality,
      'communication', v.communication, 'deliverables', v.deliverables, 'comment', v.comment, 'reply', v.reply,
      'service', (select name from career_services where id = v.service_id), 'created_at', date_trunc('month', v.created_at)) order by v.created_at desc)
    from (select * from advisor_reviews where advisor_id = p_user and status = 'visible' order by created_at desc limit 50) v), '[]'::jsonb);
end $$;

-- El postulante valora (una vez por asesoría finalizada y aprobada por VINKA)
create or replace function public.review_submit(p_request uuid, p_overall int, p_punctuality int, p_quality int, p_communication int, p_deliverables int, p_comment text default '')
returns void language plpgsql security definer set search_path = public as $$
declare r service_requests; v_c text := left(btrim(coalesce(p_comment, '')), 600);
begin
  select * into r from service_requests where id = p_request and candidate_id = auth.uid() for update;
  if r.id is null then raise exception 'Solicitud no encontrada'; end if;
  if r.status <> 'aprobada' then raise exception 'Podrás valorar cuando VINKA apruebe la entrega de tu asesoría'; end if;
  if r.assigned_to is null then raise exception 'Esta asesoría no tiene asesor/a para valorar'; end if;
  if exists (select 1 from advisor_reviews where request_id = p_request) then raise exception 'Ya valoraste esta asesoría'; end if;
  if least(p_overall, p_punctuality, p_quality, p_communication, p_deliverables) < 1 or greatest(p_overall, p_punctuality, p_quality, p_communication, p_deliverables) > 5
    or p_overall is null or p_punctuality is null or p_quality is null or p_communication is null or p_deliverables is null then
    raise exception 'Marca de 1 a 5 estrellas en cada punto'; end if;
  insert into advisor_reviews (request_id, advisor_id, candidate_id, service_id, overall, punctuality, quality, communication, deliverables, comment)
  values (r.id, r.assigned_to, r.candidate_id, r.service_id, p_overall, p_punctuality, p_quality, p_communication, p_deliverables, v_c);
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'review_created', 'service_request', r.id, jsonb_build_object('advisor', r.assigned_to, 'overall', p_overall));
  perform notify_users(array[r.assigned_to], 'service_request', 'Nueva valoración: ' || p_overall || ' de 5', 'Un postulante valoró tu ' || r.service_name || '. Puedes responder desde tu cuenta.', '/cuenta', false);
end $$;

-- Mis valoraciones hechas (postulante), para mostrar «Tu valoración» en cada asesoría
create or replace function public.my_reviews()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(request_id, jsonb_build_object('overall', overall, 'punctuality', punctuality, 'quality', quality,
    'communication', communication, 'deliverables', deliverables, 'comment', comment, 'reply', reply, 'status', status)), '{}'::jsonb)
  from advisor_reviews where candidate_id = auth.uid()
$$;

-- Asesor: sus valoraciones (todas), responder y pedir revisión
create or replace function public.my_advisor_reviews()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_advisor() then raise exception 'Solo para asesores'; end if;
  return jsonb_build_object('summary', advisor_rating(auth.uid()), 'items', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'overall', v.overall,
      'punctuality', v.punctuality, 'quality', v.quality, 'communication', v.communication, 'deliverables', v.deliverables, 'comment', v.comment,
      'reply', v.reply, 'status', v.status, 'report_reason', v.report_reason, 'moderation_note', v.moderation_note,
      'service', (select name from career_services where id = v.service_id), 'created_at', v.created_at) order by v.created_at desc)
    from advisor_reviews v where v.advisor_id = auth.uid()), '[]'::jsonb));
end $$;

create or replace function public.review_reply(p_id uuid, p_reply text)
returns void language plpgsql security definer set search_path = public as $$
declare v advisor_reviews; t text := left(btrim(coalesce(p_reply, '')), 600);
begin
  select * into v from advisor_reviews where id = p_id and advisor_id = auth.uid() for update;
  if v.id is null then raise exception 'Valoración no encontrada'; end if;
  if char_length(t) < 2 then raise exception 'Escribe tu respuesta'; end if;
  update advisor_reviews set reply = t, replied_at = now() where id = p_id;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'review_replied', 'advisor_review', p_id, '{}'::jsonb);
end $$;

create or replace function public.review_report(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v advisor_reviews; t text := left(btrim(coalesce(p_reason, '')), 400);
begin
  select * into v from advisor_reviews where id = p_id and advisor_id = auth.uid() for update;
  if v.id is null then raise exception 'Valoración no encontrada'; end if;
  if v.status <> 'visible' then raise exception 'Esta valoración ya está en revisión o fue moderada'; end if;
  if v.moderated_at is not null then raise exception 'VINKA ya revisó esta valoración'; end if;
  if char_length(t) < 15 then raise exception 'Explica por qué es inapropiada (al menos 15 caracteres)'; end if;
  update advisor_reviews set status = 'reportada', report_reason = t, reported_at = now() where id = p_id;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'review_reported', 'advisor_review', p_id, jsonb_build_object('reason', t));
  perform notify_users(array(select user_id from admins), 'service_request', 'Valoración denunciada', 'Un asesor pidió revisar una valoración.', '/asesores', false);
end $$;

-- Administración: ver valoraciones e indicadores, y moderar (mantener u ocultar) con nota y auditoría
create or replace function public.admin_reviews()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'advisor_id', v.advisor_id,
        'advisor', coalesce((select pub->>'display_name' from advisor_profiles where user_id = v.advisor_id), (select trim(first_name || ' ' || last_name) from profiles where id = v.advisor_id)),
        'candidate', (select trim(first_name || ' ' || last_name) from profiles where id = v.candidate_id), 'service', (select name from career_services where id = v.service_id),
        'overall', v.overall, 'punctuality', v.punctuality, 'quality', v.quality, 'communication', v.communication, 'deliverables', v.deliverables,
        'comment', v.comment, 'reply', v.reply, 'status', v.status, 'report_reason', v.report_reason, 'moderation_note', v.moderation_note,
        'created_at', v.created_at) order by (v.status = 'reportada') desc, v.created_at desc)
      from (select * from advisor_reviews order by (status = 'reportada') desc, created_at desc limit 200) v), '[]'::jsonb),
    'advisors', coalesce((select jsonb_object_agg(a.user_id, advisor_rating(a.user_id)) from advisors a), '{}'::jsonb));
end $$;

create or replace function public.admin_review_moderate(p_id uuid, p_hide boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v advisor_reviews; t text := left(btrim(coalesce(p_note, '')), 400);
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  select * into v from advisor_reviews where id = p_id for update;
  if v.id is null then raise exception 'Valoración no encontrada'; end if;
  if char_length(t) < 10 then raise exception 'Explica la decisión (al menos 10 caracteres). Queda registrada y la verá el asesor/a.'; end if;
  update advisor_reviews set status = case when p_hide then 'oculta' else 'visible' end, moderation_note = t, moderated_at = now() where id = p_id;
  insert into audit_logs (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), case when p_hide then 'review_hidden' else 'review_kept' end, 'advisor_review', p_id, jsonb_build_object('note', t, 'previous', v.status, 'report', v.report_reason));
  perform notify_users(array[v.advisor_id], 'service_request', case when p_hide then 'VINKA ocultó una valoración' else 'VINKA mantuvo una valoración' end, t, '/cuenta', false);
  if p_hide then
    perform notify_users(array[v.candidate_id], 'service_request', 'VINKA ocultó tu valoración', t, '/asesoria', false);
  end if;
end $$;

-- Al aprobarse una asesoría, se invita al postulante a valorarla
create or replace function public.service_review_invite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'aprobada' and old.status is distinct from 'aprobada' and new.assigned_to is not null then
    perform notify_users(array[new.candidate_id], 'service_request', 'Valora tu asesoría',
      'Cuéntanos cómo fue tu ' || new.service_name || ': puntualidad, calidad, comunicación y entregables. Solo toma un minuto.', '/asesoria', false);
  end if;
  return new;
end $$;
drop trigger if exists service_review_invite on public.service_requests;
create trigger service_review_invite after update of status on public.service_requests for each row execute function public.service_review_invite();

do $g$
declare f text;
begin
  foreach f in array array['advisor_reviews_public(uuid)', 'review_submit(uuid, int, int, int, int, int, text)', 'my_reviews()', 'my_advisor_reviews()',
    'review_reply(uuid, text)', 'review_report(uuid, text)', 'admin_reviews()', 'admin_review_moderate(uuid, boolean, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['advisor_rating(uuid)', 'advisor_card(uuid)', 'service_review_invite()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $g$;
