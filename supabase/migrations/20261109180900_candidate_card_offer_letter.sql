-- Migración aplicada en Supabase (20261109180900). Exportada tal cual desde supabase_migrations.schema_migrations.

create table if not exists backup.offers_20261109 as select * from public.offers;

drop function if exists public.candidates_for_job(uuid, boolean);
create function public.candidates_for_job(p_job uuid, p_broad boolean default false)
 returns table(candidate_id uuid, display_name text, initials text, headline text, region text, comuna text, availability text, modalities text[], schedules text[], has_experience boolean, experiences jsonb, education jsonb, skills text[], bio text, has_video boolean, already_interested boolean, score integer, reasons text[], out_of_profile boolean, featured boolean, promotion_id uuid,
   role_label text, areas text[], locations text[], relocate text, salary_expectation integer, updated_at timestamptz)
 language plpgsql stable security definer set search_path to 'public'
as $function$
declare j jobs;
begin
  select * into j from jobs where id = p_job;
  if j.id is null or not is_company_member(j.company_id) or j.status <> 'published'
     or not exists (select 1 from companies where id = j.company_id and verification_status = 'verified') then return; end if;
  return query
  with base as (
    select cp.*, p.first_name, p.last_name,
      exists (select 1 from candidate_job_actions a where a.job_id = j.id and a.candidate_id = cp.user_id and a.action = 'interest') as interested,
      role_fit(cp.role_family, cp.role_related, cp.role_level, j.role_family, j.role_related, j.role_level) as rf,
      (cp.headline <> '' and exists (select 1 from unnest(regexp_split_to_array(lower(j.title), '\s+')) w
         where length(w) > 3 and lower(cp.headline) like '%'||w||'%')) as word_hit,
      array_remove(array[
        case when cp.role_family is not null and cp.role_family = j.role_family then 'Mismo tipo de cargo'
             when role_fit(cp.role_family, cp.role_related, cp.role_level, j.role_family, j.role_related, j.role_level) > 0 then 'Cargo afín' end,
        case when cp.role_level is not null and cp.role_level = j.role_level then 'Nivel adecuado' end,
        case when j.area <> '' and j.area = any(cp.areas) then 'Área' end,
        case when j.comuna <> '' and (j.comuna = cp.comuna or j.comuna = any(cp.locations)) then 'Comuna'
             when j.region <> '' and j.region = cp.region then 'Región' end,
        case when j.modality <> '' and j.modality = any(cp.modalities) then 'Modalidad' end,
        case when j.schedule <> '' and j.schedule = any(cp.schedules) then 'Jornada' end,
        case when cp.salary_expectation is not null and j.salary_max is not null and j.salary_type = 'liquido'
              and cp.salary_expectation <= j.salary_max then 'Renta en rango' end
      ], null) as why,
      case when cp.is_public then (select pp.id from promotions pp where pp.candidate_id = cp.user_id and pp.target = 'profile' and pp.status = 'activa' and pp.ends_at > now() limit 1) end as promo
    from candidate_profiles cp join profiles p on p.id = cp.user_id
    where cp.onboarding_done
      and not exists (select 1 from company_candidate_actions x where x.job_id = j.id and x.candidate_id = cp.user_id)
  ), ranked as (
    select b.*, (coalesce(b.rf, case when b.word_hit or (j.area <> '' and j.area = any(b.areas)) then 1 else -1 end) >= 0) as fits from base b
  ), numbered as (
    select b.*, row_number() over (partition by b.interested, (b.promo is not null)
      order by coalesce(b.rf, 0) desc, coalesce(array_length(b.why,1),0) desc, md5(b.user_id::text || current_date::text), b.updated_at desc) - 1 as k
    from ranked b where (b.is_public or b.interested) and b.fits = not p_broad
  )
  select b.user_id, trim(b.first_name || ' ' || left(b.last_name,1) || case when b.last_name <> '' then '.' else '' end),
    upper(left(b.first_name,1) || left(b.last_name,1)), b.headline, b.region, b.comuna, b.availability, b.modalities, b.schedules,
    b.has_experience, b.experiences, b.education, b.skills,
    case when b.intro_visibility = 'all' then b.bio else '' end,
    (b.video_path is not null and b.intro_visibility = 'all'),
    b.interested, coalesce(b.rf, 0) * 10 + coalesce(array_length(b.why,1),0), b.why, not b.fits, b.promo is not null, b.promo,
    b.role_label, b.areas, b.locations, b.relocate, b.salary_expectation, b.updated_at
  from numbered b
  order by b.interested desc, promo_slot(b.promo is not null, b.k), coalesce(b.rf, 0) desc, coalesce(array_length(b.why,1),0) desc, b.updated_at desc
  limit 50;
end $function$;
revoke execute on function public.candidates_for_job(uuid, boolean) from public, anon;
grant execute on function public.candidates_for_job(uuid, boolean) to authenticated;

alter table public.companies add column if not exists logo_path text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];
create policy "logos: subir (admin de la empresa)" on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and is_company_admin(request_folder(name)));
create policy "logos: borrar (admin de la empresa)" on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and is_company_admin(request_folder(name)));

create or replace function public.set_company_logo(p_company uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_company_admin(p_company) then raise exception 'Solo quien administra la empresa puede cambiar el logo'; end if;
  if p_path is not null and request_folder(p_path) is distinct from p_company then raise exception 'Archivo no válido'; end if;
  update companies set logo_path = p_path where id = p_company;
end $$;
revoke execute on function public.set_company_logo(uuid, text) from public, anon;
grant execute on function public.set_company_logo(uuid, text) to authenticated;

alter table public.offers add column if not exists letter jsonb not null default '{}'::jsonb;
alter table public.offers add column if not exists emailed_at timestamptz;
alter table public.offers drop constraint if exists offers_letter_size;
alter table public.offers add constraint offers_letter_size check (length(letter::text) <= 8000);

create or replace function public.send_offer(p_match uuid, p jsonb)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare m matches; v_id uuid; co text; jt text; needs boolean; v_letter jsonb;
begin
  select * into m from matches where id = p_match;
  if m.id is null or not can_manage(m.company_id) then raise exception 'No tienes permiso para enviar ofertas'; end if;
  if m.closed then raise exception 'Esta conversación está cerrada'; end if;
  v_letter := case when jsonb_typeof(p->'letter') = 'object' then jsonb_strip_nulls(jsonb_build_object(
      'intro', left(p->'letter'->>'intro', 2500), 'closing', left(p->'letter'->>'closing', 1500),
      'signer_name', left(p->'letter'->>'signer_name', 120), 'signer_title', left(p->'letter'->>'signer_title', 120),
      'city', left(p->'letter'->>'city', 80))) else '{}'::jsonb end;
  needs := not is_company_admin(m.company_id) and exists (select 1 from companies where id = m.company_id and require_approval);
  update offers set status = 'retirada' where match_id = p_match and status in ('enviada', 'por_aprobar');
  insert into offers (match_id, company_id, job_id, candidate_id, position, salary, salary_type, start_date, contract, schedule, location, benefits, message, expires_on, created_by, status, letter)
  values (m.id, m.company_id, m.job_id, m.candidate_id, trim(p->>'position'), nullif(p->>'salary','')::int, coalesce(nullif(p->>'salary_type',''),'liquido'),
    nullif(p->>'start_date','')::date, coalesce(p->>'contract',''), coalesce(p->>'schedule',''), coalesce(p->>'location',''), coalesce(p->>'benefits',''),
    coalesce(p->>'message',''), nullif(p->>'expires_on','')::date, auth.uid(), case when needs then 'por_aprobar' else 'enviada' end, v_letter)
  returning id into v_id;
  select display_name into co from companies where id = m.company_id;
  select title into jt from jobs where id = m.job_id;
  if needs then
    perform log_event(m.company_id, m.job_id, m.candidate_id, null, 'offer_pending', jsonb_build_object('offer', v_id));
    perform notify_users(array(select user_id from company_members where company_id = m.company_id and role in ('owner', 'admin')), 'approval', 'Carta oferta por aprobar', 'Hay una oferta para «' || jt || '» esperando tu aprobación.', '/vacantes/' || m.job_id || '/candidato/' || m.candidate_id, false);
    return v_id;
  end if;
  perform log_event(m.company_id, m.job_id, m.candidate_id, null, 'offer_sent', jsonb_build_object('offer', v_id));
  perform notify_users(array[m.candidate_id], 'offer', '¡Recibiste una carta oferta!', co || ' te envió una oferta para «' || jt || '». Revísala y responde desde VINKA.', '/ofertas/' || v_id, true);
  update offers set emailed_at = now() where id = v_id;
  if m.stage <> 'oferta' then update matches set stage = 'oferta' where id = m.id; end if;
  return v_id;
end $function$;

create or replace function public.offer_letter(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o offers; mine boolean; m matches;
begin
  select * into o from offers where id = p_id;
  if o.id is null then raise exception 'Oferta no encontrada'; end if;
  mine := o.candidate_id = auth.uid();
  if not mine and not is_company_member(o.company_id) then raise exception 'Oferta no encontrada'; end if;
  select * into m from matches where id = o.match_id;
  return jsonb_build_object(
    'offer', to_jsonb(o) - 'created_by',
    'company', (select jsonb_build_object('display_name', c.display_name, 'legal_name', c.legal_name, 'rut', c.rut, 'comuna', c.comuna, 'region', c.region, 'website', c.website, 'logo_path', c.logo_path) from companies c where c.id = o.company_id),
    'candidate', (select jsonb_build_object('name', trim(p.first_name || ' ' || p.last_name),
        'email', case when mine or coalesce(m.contact_shared, false) then (select email from auth.users where id = o.candidate_id) end) from profiles p where p.id = o.candidate_id),
    'job_title', (select title from jobs where id = o.job_id),
    'sender', (select trim(first_name || ' ' || last_name) from profiles where id = o.created_by),
    'can_manage', can_manage(o.company_id));
end $$;
revoke execute on function public.offer_letter(uuid) from public, anon;
grant execute on function public.offer_letter(uuid) to authenticated;

create or replace function public.email_offer(p_id uuid, p_copy_me boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o offers; co text;
begin
  select * into o from offers where id = p_id;
  if o.id is null or not can_manage(o.company_id) then raise exception 'Oferta no encontrada'; end if;
  if o.status not in ('enviada', 'aceptada') then raise exception 'Solo se puede enviar una oferta vigente'; end if;
  if o.emailed_at is not null and o.emailed_at > now() - interval '10 minutes' then raise exception 'La carta se envió hace poco. Espera unos minutos para reenviarla.'; end if;
  select display_name into co from companies where id = o.company_id;
  perform notify_users(array[o.candidate_id], 'offer', 'Carta oferta de ' || co, co || ' te reenvió la carta oferta para «' || o.position || '».', '/ofertas/' || o.id, true);
  if p_copy_me then
    perform notify_users(array[auth.uid()], 'offer_copy', 'Copia: carta oferta para ' || short_name(o.candidate_id), 'Copia de la carta oferta para «' || o.position || '».', '/ofertas/' || o.id, true);
  end if;
  update offers set emailed_at = now() where id = p_id;
  perform log_event(o.company_id, o.job_id, o.candidate_id, null, 'offer_emailed', jsonb_build_object('offer', o.id, 'copy', p_copy_me));
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.email_offer(uuid, boolean) from public, anon;
grant execute on function public.email_offer(uuid, boolean) to authenticated;
