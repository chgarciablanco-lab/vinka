-- Renta como rango: las empresas ya no reciben el monto exacto de la renta esperada, solo un tramo.
-- El monto exacto sigue privado en candidate_profiles (cada persona lee solo el suyo).
create or replace function public.salary_band(v integer) returns int4range
language sql immutable set search_path = public as $$
  select case when v is null or v <= 0 then null
    else int4range((v / (case when v < 1000000 then 100000 else 200000 end)) * (case when v < 1000000 then 100000 else 200000 end),
                   (v / (case when v < 1000000 then 100000 else 200000 end) + 1) * (case when v < 1000000 then 100000 else 200000 end)) end
$$;
revoke execute on function public.salary_band(integer) from public, anon;
grant execute on function public.salary_band(integer) to authenticated;

drop function if exists public.candidates_for_job(uuid, boolean);
create function public.candidates_for_job(p_job uuid, p_broad boolean default false)
 returns table(candidate_id uuid, display_name text, initials text, headline text, region text, comuna text, availability text, modalities text[], schedules text[], has_experience boolean, experiences jsonb, education jsonb, skills text[], bio text, has_video boolean, already_interested boolean, score integer, reasons text[], out_of_profile boolean, featured boolean, promotion_id uuid, role_label text, areas text[], locations text[], relocate text, salary_min integer, salary_max integer, salary_in_range boolean, updated_at timestamp with time zone)
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
      case when cp.is_public then (select pp.id from promotions pp where pp.candidate_id = cp.user_id and pp.target = 'profile' and pp.status = 'activa' and pp.ends_at > now() limit 1) end as promo,
      salary_band(cp.salary_expectation) as band,
      case when cp.salary_expectation is not null and j.salary_max is not null and j.salary_type = 'liquido' then cp.salary_expectation <= j.salary_max end as in_range
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
    b.role_label, b.areas, b.locations, b.relocate, lower(b.band), upper(b.band), b.in_range, b.updated_at
  from numbered b
  order by b.interested desc, promo_slot(b.promo is not null, b.k), coalesce(b.rf, 0) desc, coalesce(array_length(b.why,1),0) desc, b.updated_at desc
  limit 50;
end $function$;
revoke execute on function public.candidates_for_job(uuid, boolean) from public, anon;
grant execute on function public.candidates_for_job(uuid, boolean) to authenticated;
