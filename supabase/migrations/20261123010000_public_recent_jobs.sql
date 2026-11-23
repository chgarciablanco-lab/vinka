-- Portada de VINKA Empleo: vacantes recientes para visitantes sin cuenta.
-- Solo lectura: vacantes publicadas de empresas verificadas, con los mismos datos que ya muestra la página pública de cada vacante.
-- «demo» marca los avisos de las empresas de demostración (esquema seed) para identificarlos en la portada.
create or replace function public.public_recent_jobs(p_limit integer default 6) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select jsonb_build_object('id', j.id, 'title', j.title, 'comuna', j.comuna, 'region', j.region, 'modality', j.modality,
      'salary_min', j.salary_min, 'salary_max', j.salary_max, 'salary_type', j.salary_type,
      'company', case when j.confidential then 'Empresa confidencial' else c.display_name end,
      'demo', exists (select 1 from seed.companies d where d.id = c.id), 'published_at', j.created_at) x
    from jobs j join companies c on c.id = j.company_id
    where j.status = 'published' and c.verification_status = 'verified'
    order by j.created_at desc limit least(greatest(coalesce(p_limit, 6), 1), 24)) s
$$;
revoke execute on function public.public_recent_jobs(integer) from public;
grant execute on function public.public_recent_jobs(integer) to anon, authenticated;
