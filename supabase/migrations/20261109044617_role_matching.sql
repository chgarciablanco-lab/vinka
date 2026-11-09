-- Migración aplicada en Supabase (20261109044617). Exportada tal cual desde supabase_migrations.schema_migrations.

-- Clasificación de cargos: familia de funciones + nivel (1 Operativo … 6 Gerencia)
alter table jobs add column if not exists role_family text, add column if not exists role_related text[] not null default '{}',
  add column if not exists role_level int check (role_level between 1 and 6), add column if not exists role_label text not null default '';
alter table candidate_profiles add column if not exists role_family text, add column if not exists role_related text[] not null default '{}',
  add column if not exists role_level int check (role_level between 1 and 6), add column if not exists role_label text not null default '';

-- Pedir clasificación al guardar (la hace la función "classify" con IA)
create or replace function request_classify() returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare cfg jsonb := (select jsonb_object_agg(key, value) from private.config);
begin
  perform net.http_post(url := replace(cfg->>'notify_url', 'notify-match', 'classify'),
    body := jsonb_build_object('kind', tg_argv[0], 'id', case when tg_argv[0] = 'job' then to_jsonb(new) ->> 'id' else to_jsonb(new) ->> 'user_id' end),
    headers := jsonb_build_object('Content-Type','application/json','x-notify-secret', cfg->>'notify_secret'));
  return new;
exception when others then return new;
end $$;
revoke execute on function request_classify() from public, anon, authenticated;

drop trigger if exists job_classify on jobs;
create trigger job_classify after insert or update of title, description, level, requirements, area on jobs
  for each row execute function request_classify('job');
drop trigger if exists cand_classify on candidate_profiles;
create trigger cand_classify after insert or update of headline, experiences, education, has_experience, skills on candidate_profiles
  for each row execute function request_classify('candidate');

-- Compatibilidad de cargo: misma familia o familia relacionada; nivel a máximo 1 de distancia
create or replace function role_fit(cf text, cr text[], cl int, jf text, jr text[], jl int) returns int
language sql immutable set search_path = public as $$
  select case
    when cf is null or jf is null then null                       -- sin clasificar aún
    when not (cf = jf or jf = any(coalesce(cr,'{}')) or cf = any(coalesce(jr,'{}'))) then -1
    when cl is not null and jl is not null and abs(cl - jl) > 1 then -1
    else (case when cf = jf then 3 else 1 end) + (case when cl = jl then 2 when cl is null or jl is null then 0 else 1 end)
  end
$$;

drop function if exists job_feed();
create function job_feed(p_broad boolean default false)
returns table(id uuid, title text, area text, level text, description text, requirements jsonb, modality text, schedule text, contract text, region text, comuna text, salary_min integer, salary_max integer, salary_type text, company_id uuid, company_name text, company_sector text, company_size text, company_description text, company_benefits text, invited boolean, score integer, reasons text[], out_of_profile boolean)
language plpgsql stable security definer set search_path to 'public' as $function$
declare c candidate_profiles;
begin
  select * into c from candidate_profiles where user_id = auth.uid();
  if c.user_id is null then return; end if;
  return query
  with base as (
    select j.*, co.display_name, co.sector, co.size, co.description as co_desc, co.benefits as co_ben,
      exists (select 1 from company_candidate_actions x where x.job_id = j.id and x.candidate_id = c.user_id and x.action = 'interest') as inv,
      role_fit(c.role_family, c.role_related, c.role_level, j.role_family, j.role_related, j.role_level) as rf,
      array_remove(array[
        case when c.role_family is not null and c.role_family = j.role_family then 'Tu tipo de cargo'
             when role_fit(c.role_family, c.role_related, c.role_level, j.role_family, j.role_related, j.role_level) > 0 then 'Cargo afín' end,
        case when c.role_level is not null and c.role_level = j.role_level then 'Tu nivel' end,
        case when j.area <> '' and j.area = any(c.areas) then 'Área: '||j.area end,
        case when j.modality = 'Remota' and 'Remota' = any(c.modalities) then 'Remota'
             when j.comuna <> '' and (j.comuna = c.comuna or j.comuna = any(c.locations)) then j.comuna
             when j.region <> '' and j.region = c.region then 'Región '||j.region end,
        case when j.schedule <> '' and j.schedule = any(c.schedules) then 'Jornada '||lower(j.schedule) end,
        case when c.salary_expectation is not null and j.salary_max is not null and j.salary_type = 'liquido'
              and c.salary_expectation <= j.salary_max then 'Renta en tu rango' end
      ], null) as why,
      -- respaldo por palabras cuando aún no hay clasificación
      (c.headline <> '' and exists (select 1 from unnest(regexp_split_to_array(lower(c.headline), '\s+')) w
         where length(w) > 3 and lower(j.title) like '%'||w||'%')) as word_hit
    from jobs j join companies co on co.id = j.company_id
    where j.status = 'published' and co.verification_status = 'verified'
      and not exists (select 1 from candidate_job_actions a where a.job_id = j.id and a.candidate_id = c.user_id)
  ), ranked as (
    select b.*, (b.inv or coalesce(b.rf, case when b.word_hit or (b.area <> '' and b.area = any(c.areas)) then 1 else -1 end) >= 0) as fits
    from base b
  )
  select r.id, r.title, r.area, r.level, r.description, r.requirements, r.modality, r.schedule, r.contract, r.region, r.comuna,
    r.salary_min, r.salary_max, r.salary_type, r.company_id, r.display_name, r.sector, r.size, r.co_desc, r.co_ben, r.inv,
    coalesce(r.rf, 0) * 10 + coalesce(array_length(r.why,1),0), r.why, not r.fits
  from ranked r
  where r.fits = not p_broad
  order by r.inv desc, coalesce(r.rf, 0) desc, coalesce(array_length(r.why,1),0) desc, r.created_at desc
  limit 50;
end $function$;

drop function if exists candidates_for_job(uuid);
create function candidates_for_job(p_job uuid, p_broad boolean default false)
returns table(candidate_id uuid, display_name text, initials text, headline text, region text, comuna text, availability text, modalities text[], schedules text[], has_experience boolean, experiences jsonb, education jsonb, skills text[], bio text, has_video boolean, already_interested boolean, score integer, reasons text[], out_of_profile boolean)
language plpgsql stable security definer set search_path to 'public' as $function$
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
      ], null) as why
    from candidate_profiles cp join profiles p on p.id = cp.user_id
    where cp.onboarding_done
      and not exists (select 1 from company_candidate_actions x where x.job_id = j.id and x.candidate_id = cp.user_id)
  ), ranked as (
    select b.*, (coalesce(b.rf, case when b.word_hit or (j.area <> '' and j.area = any(b.areas)) then 1 else -1 end) >= 0) as fits from base b
  )
  select b.user_id, trim(b.first_name || ' ' || left(b.last_name,1) || case when b.last_name <> '' then '.' else '' end),
    upper(left(b.first_name,1) || left(b.last_name,1)), b.headline, b.region, b.comuna, b.availability, b.modalities, b.schedules,
    b.has_experience, b.experiences, b.education, b.skills,
    case when b.intro_visibility = 'all' then b.bio else '' end,
    (b.video_path is not null and b.intro_visibility = 'all'),
    b.interested, coalesce(b.rf, 0) * 10 + coalesce(array_length(b.why,1),0), b.why, not b.fits
  from ranked b
  where (b.is_public or b.interested) and b.fits = not p_broad
  order by b.interested desc, coalesce(b.rf, 0) desc, coalesce(array_length(b.why,1),0) desc, b.updated_at desc
  limit 50;
end $function$;

revoke execute on function job_feed(boolean), candidates_for_job(uuid, boolean), role_fit(text,text[],int,text,text[],int) from public, anon;
grant execute on function job_feed(boolean), candidates_for_job(uuid, boolean) to authenticated;
