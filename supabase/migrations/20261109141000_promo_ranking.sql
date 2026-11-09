-- Destacados en las listas: se intercalan (máximo 2 de cada 10 por defecto) solo entre resultados que ya corresponden.
-- La relevancia (puntaje y motivos) no cambia: el destacado solo mueve la posición.

drop function if exists public.job_feed(boolean);
create function public.job_feed(p_broad boolean default false)
 returns table(id uuid, title text, area text, level text, description text, requirements jsonb, modality text, schedule text, contract text, region text, comuna text, salary_min integer, salary_max integer, salary_type text, company_id uuid, company_name text, company_sector text, company_size text, company_description text, company_benefits text, invited boolean, score integer, reasons text[], out_of_profile boolean, featured boolean, promotion_id uuid)
 language plpgsql stable security definer set search_path to 'public'
as $function$
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
      (c.headline <> '' and exists (select 1 from unnest(regexp_split_to_array(lower(c.headline), '\s+')) w
         where length(w) > 3 and lower(j.title) like '%'||w||'%')) as word_hit,
      (select pp.id from promotions pp where pp.job_id = j.id and pp.target = 'job' and pp.status = 'activa' and pp.ends_at > now() limit 1) as promo
    from jobs j join companies co on co.id = j.company_id
    where j.status = 'published' and co.verification_status = 'verified'
      and not exists (select 1 from candidate_job_actions a where a.job_id = j.id and a.candidate_id = c.user_id)
  ), ranked as (
    select b.*, (b.inv or coalesce(b.rf, case when b.word_hit or (b.area <> '' and b.area = any(c.areas)) then 1 else -1 end) >= 0) as fits
    from base b
  ), numbered as (
    select r.*, row_number() over (partition by r.inv, (r.promo is not null)
      order by coalesce(r.rf, 0) desc, coalesce(array_length(r.why,1),0) desc, md5(r.id::text || current_date::text), r.created_at desc) - 1 as k
    from ranked r where r.fits = not p_broad
  )
  select r.id, r.title, r.area, r.level, r.description, r.requirements, r.modality, r.schedule, r.contract, r.region, r.comuna,
    r.salary_min, r.salary_max, r.salary_type, r.company_id, r.display_name, r.sector, r.size, r.co_desc, r.co_ben, r.inv,
    coalesce(r.rf, 0) * 10 + coalesce(array_length(r.why,1),0), r.why, not r.fits, r.promo is not null, r.promo
  from numbered r
  order by r.inv desc, promo_slot(r.promo is not null, r.k), coalesce(r.rf, 0) desc, coalesce(array_length(r.why,1),0) desc, r.created_at desc
  limit 50;
end $function$;
revoke execute on function public.job_feed(boolean) from public, anon;
grant execute on function public.job_feed(boolean) to authenticated;

drop function if exists public.candidates_for_job(uuid, boolean);
create function public.candidates_for_job(p_job uuid, p_broad boolean default false)
 returns table(candidate_id uuid, display_name text, initials text, headline text, region text, comuna text, availability text, modalities text[], schedules text[], has_experience boolean, experiences jsonb, education jsonb, skills text[], bio text, has_video boolean, already_interested boolean, score integer, reasons text[], out_of_profile boolean, featured boolean, promotion_id uuid)
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
    b.interested, coalesce(b.rf, 0) * 10 + coalesce(array_length(b.why,1),0), b.why, not b.fits, b.promo is not null, b.promo
  from numbered b
  order by b.interested desc, promo_slot(b.promo is not null, b.k), coalesce(b.rf, 0) desc, coalesce(array_length(b.why,1),0) desc, b.updated_at desc
  limit 50;
end $function$;
revoke execute on function public.candidates_for_job(uuid, boolean) from public, anon;
grant execute on function public.candidates_for_job(uuid, boolean) to authenticated;

-- Portal público de cada empresa: destacadas primero y con etiqueta
create or replace function public.public_company(p_slug text)
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select jsonb_build_object(
    'company', jsonb_build_object('slug', c.slug, 'display_name', c.display_name, 'description', c.description, 'sector', c.sector,
      'comuna', c.comuna, 'region', c.region, 'benefits', c.benefits, 'website', c.website, 'size', c.size),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'title', j.title, 'comuna', j.comuna, 'region', j.region, 'modality', j.modality,
        'schedule', j.schedule, 'contract', j.contract, 'salary_min', j.salary_min, 'salary_max', j.salary_max, 'salary_type', j.salary_type, 'created_at', j.created_at,
        'featured', pr.id is not null, 'promotion_id', pr.id)
        order by (pr.id is not null) desc, j.created_at desc)
      from jobs j left join lateral (select pp.id from promotions pp where pp.job_id = j.id and pp.target = 'job' and pp.status = 'activa' and pp.ends_at > now() limit 1) pr on true
      where j.company_id = c.id and j.status = 'published'), '[]'::jsonb))
  from companies c where c.slug = p_slug and c.verification_status = 'verified'
$function$;

-- Banco de talentos: etiqueta de perfil destacado (no cambia el orden ni los datos)
do $do$
declare d text := pg_get_functiondef('public.talent_pool(uuid)'::regprocedure);
begin
  if position('''featured''' in d) = 0 then
    d := replace(d, '''edu_text'', r.edu_text,', '''edu_text'', r.edu_text, ''featured'', r.kind = ''vinka'' and profile_featured(r.candidate_id),');
    execute d;
  end if;
end $do$;

-- Ingresos: se informan netos de IVA e incluyen destacados
create or replace function public.admin_revenue(p_include_demo boolean default true) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m0 timestamptz := date_trunc('month', now() at time zone 'America/Santiago') at time zone 'America/Santiago';
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  return (with p as (
      select pay.*, (exists (select 1 from seed.companies d where d.id = pay.company_id) or exists (select 1 from seed.users u where u.id = pay.candidate_id)) demo
      from payments pay
    ), f as (select * from p where p_include_demo or not demo),
    subs as (
      select s.*, coalesce(s.custom_price_clp, pl.price_clp, 0) price, exists (select 1 from seed.companies d where d.id = s.company_id) demo
      from subscriptions s join plans pl on pl.id = s.plan_id where s.status = 'active'
    ), fs as (select * from subs where (p_include_demo or not demo) and price > 0)
    select jsonb_build_object(
      'month', (select coalesce(sum(net_clp), 0) from f where paid_at >= m0),
      'month_iva', (select coalesce(sum(iva_clp), 0) from f where paid_at >= m0),
      'month_plans', (select coalesce(sum(net_clp), 0) from f where paid_at >= m0 and kind = 'plan'),
      'month_advisory', (select coalesce(sum(net_clp), 0) from f where paid_at >= m0 and kind = 'asesoria'),
      'month_promos', (select coalesce(sum(net_clp), 0) from f where paid_at >= m0 and kind = 'promocion'),
      'prev_month', (select coalesce(sum(net_clp), 0) from f where paid_at >= m0 - interval '1 month' and paid_at < m0),
      'prev_month_to_date', (select coalesce(sum(net_clp), 0) from f where paid_at >= m0 - interval '1 month' and paid_at < now() - interval '1 month'),
      'last12', (select coalesce(sum(net_clp), 0) from f where paid_at >= m0 - interval '11 months'),
      'total', (select coalesce(sum(net_clp), 0) from f),
      'mrr', (select coalesce(sum(price), 0) from fs),
      'paying', (select count(*) from fs),
      'advisory_month_count', (select count(*) from f where paid_at >= m0 and kind = 'asesoria'),
      'promo_month_count', (select count(*) from f where paid_at >= m0 and kind = 'promocion'),
      'series', (select jsonb_agg(jsonb_build_object('month', to_char(g, 'YYYY-MM'),
          'plans', (select coalesce(sum(net_clp), 0) from f where kind = 'plan' and paid_at >= g at time zone 'America/Santiago' and paid_at < (g + interval '1 month') at time zone 'America/Santiago'),
          'advisory', (select coalesce(sum(net_clp), 0) from f where kind = 'asesoria' and paid_at >= g at time zone 'America/Santiago' and paid_at < (g + interval '1 month') at time zone 'America/Santiago'),
          'promos', (select coalesce(sum(net_clp), 0) from f where kind = 'promocion' and paid_at >= g at time zone 'America/Santiago' and paid_at < (g + interval '1 month') at time zone 'America/Santiago')) order by g)
        from generate_series(date_trunc('month', now() at time zone 'America/Santiago') - interval '23 months', date_trunc('month', now() at time zone 'America/Santiago'), interval '1 month') g),
      'by_plan', (select coalesce(jsonb_agg(jsonb_build_object('plan', x.plan_id, 'n', x.n, 'mrr', x.mrr) order by x.mrr desc), '[]'::jsonb)
        from (select plan_id, count(*) n, sum(price) mrr from fs group by plan_id) x),
      'recent', (select coalesce(jsonb_agg(jsonb_build_object('kind', y.kind, 'amount', y.net_clp, 'total', y.total_clp, 'paid_at', y.paid_at, 'method', y.method, 'demo', y.demo,
          'who', coalesce((select display_name from companies c where c.id = y.company_id), (select trim(first_name || ' ' || last_name) from profiles pr where pr.id = y.candidate_id)),
          'what', case when y.kind = 'plan' then 'Plan ' || coalesce((select name from plans where id = y.plan_id), '') || case when y.months > 1 then ' × ' || y.months || ' meses' else '' end else y.note end) order by y.paid_at desc), '[]'::jsonb)
        from (select * from f order by paid_at desc limit 15) y)
    ));
end $$;
revoke execute on function public.admin_revenue(boolean) from public, anon;
grant execute on function public.admin_revenue(boolean) to authenticated;
