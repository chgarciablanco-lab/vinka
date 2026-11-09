-- Migración aplicada en Supabase (20261106133005). Exportada tal cual desde supabase_migrations.schema_migrations.

drop function if exists public.job_feed();
create function public.job_feed()
returns table (id uuid, title text, area text, level text, description text, requirements jsonb, modality text, schedule text, contract text,
  region text, comuna text, salary_min int, salary_max int, salary_type text, company_id uuid, company_name text, company_sector text,
  company_size text, company_description text, company_benefits text, invited boolean, score int, reasons text[])
language plpgsql stable security definer set search_path = public as $$
declare c candidate_profiles;
begin
  select * into c from candidate_profiles where user_id = auth.uid();
  if c.user_id is null then return; end if;
  return query
  with base as (
    select j.*, co.display_name, co.sector, co.size, co.description as co_desc, co.benefits as co_ben,
      exists (select 1 from company_candidate_actions x where x.job_id = j.id and x.candidate_id = c.user_id and x.action = 'interest') as inv,
      array_remove(array[
        case when c.headline <> '' and exists (select 1 from unnest(regexp_split_to_array(lower(c.headline), '\s+')) w
             where length(w) > 3 and lower(j.title) like '%'||w||'%') then 'Cargo similar' end,
        case when j.area <> '' and j.area = any(c.areas) then 'Área: '||j.area end,
        case when j.modality = 'Remota' and 'Remota' = any(c.modalities) then 'Remota'
             when j.comuna <> '' and (j.comuna = c.comuna or j.comuna = any(c.locations)) then j.comuna
             when j.region <> '' and j.region = c.region then 'Región '||j.region end,
        case when j.modality <> '' and j.modality = any(c.modalities) and j.modality <> 'Remota' then j.modality end,
        case when j.schedule <> '' and j.schedule = any(c.schedules) then 'Jornada '||lower(j.schedule) end,
        case when c.salary_expectation is not null and j.salary_max is not null and j.salary_type = 'liquido'
              and c.salary_expectation <= j.salary_max then 'Renta en tu rango' end
      ], null) as why
    from jobs j join companies co on co.id = j.company_id
    where j.status = 'published' and co.verification_status = 'verified'
      and not exists (select 1 from candidate_job_actions a where a.job_id = j.id and a.candidate_id = c.user_id)
  )
  select b.id, b.title, b.area, b.level, b.description, b.requirements, b.modality, b.schedule, b.contract, b.region, b.comuna,
    b.salary_min, b.salary_max, b.salary_type, b.company_id, b.display_name, b.sector, b.size, b.co_desc, b.co_ben, b.inv,
    coalesce(array_length(b.why,1),0), b.why
  from base b
  order by b.inv desc, coalesce(array_length(b.why,1),0) desc, b.created_at desc
  limit 50;
end $$;
revoke execute on function public.job_feed() from public, anon;
grant execute on function public.job_feed() to authenticated;
