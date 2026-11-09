-- Migración aplicada en Supabase (20261105193236). Exportada tal cual desde supabase_migrations.schema_migrations.

create or replace function public.candidates_for_job(p_job uuid)
returns table (candidate_id uuid, display_name text, initials text, headline text, region text, comuna text, availability text,
  modalities text[], schedules text[], has_experience boolean, experiences jsonb, education jsonb, skills text[], bio text,
  has_video boolean, already_interested boolean, score int, reasons text[])
language plpgsql stable security definer set search_path = public as $$
declare j jobs;
begin
  select * into j from jobs where id = p_job;
  if j.id is null or not is_company_member(j.company_id) or j.status <> 'published'
     or not exists (select 1 from companies where id = j.company_id and verification_status = 'verified') then return; end if;
  return query
  with base as (
    select cp.*, p.first_name, p.last_name,
      exists (select 1 from candidate_job_actions a where a.job_id = j.id and a.candidate_id = cp.user_id and a.action = 'interest') as interested,
      array_remove(array[
        case when cp.headline <> '' and exists (select 1 from unnest(regexp_split_to_array(lower(j.title), '\s+')) w
             where length(w) > 3 and lower(cp.headline) like '%'||w||'%') then 'Cargo' end,
        case when j.area <> '' and j.area = any(cp.areas) then 'Área' end,
        case when j.comuna <> '' and (j.comuna = cp.comuna or j.comuna = any(cp.locations)) then 'Comuna'
             when j.region <> '' and j.region = cp.region then 'Región' end,
        case when j.modality <> '' and j.modality = any(cp.modalities) then 'Modalidad' end,
        case when j.schedule <> '' and j.schedule = any(cp.schedules) then 'Jornada' end,
        case when cp.salary_expectation is not null and j.salary_max is not null and j.salary_type = 'liquido'
              and cp.salary_expectation <= j.salary_max then 'Renta en rango' end
      ], null) as why
    from candidate_profiles cp join profiles p on p.id = cp.user_id
    where cp.onboarding_done
      and not exists (select 1 from company_candidate_actions x where x.job_id = j.id and x.candidate_id = cp.user_id)
  )
  select b.user_id, trim(b.first_name || ' ' || left(b.last_name,1) || case when b.last_name <> '' then '.' else '' end),
    upper(left(b.first_name,1) || left(b.last_name,1)), b.headline, b.region, b.comuna, b.availability, b.modalities, b.schedules,
    b.has_experience, b.experiences, b.education, b.skills,
    case when b.intro_visibility = 'all' then b.bio else '' end,
    (b.video_path is not null and b.intro_visibility = 'all'),
    b.interested, coalesce(array_length(b.why,1),0), b.why
  from base b
  where b.is_public or b.interested
  order by b.interested desc, coalesce(array_length(b.why,1),0) desc, b.updated_at desc
  limit 50;
end $$;
revoke execute on function public.candidates_for_job(uuid) from public, anon;
grant execute on function public.candidates_for_job(uuid) to authenticated;

-- Video: si el perfil es privado, solo lo ven empresas con interés recibido de esa persona o match
create or replace function public.can_view_candidate_video(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select owner = auth.uid() or is_admin()
    or (is_verified_company_user() and exists (select 1 from candidate_profiles where user_id = owner and is_public and intro_visibility = 'all'))
    or exists (select 1 from candidate_job_actions a join jobs j on j.id = a.job_id join company_members cm on cm.company_id = j.company_id
               join candidate_profiles cp on cp.user_id = a.candidate_id
               where a.candidate_id = owner and a.action = 'interest' and cm.user_id = auth.uid() and cp.intro_visibility = 'all')
    or exists (select 1 from matches m join company_members cm on cm.company_id = m.company_id where m.candidate_id = owner and cm.user_id = auth.uid());
$$;
