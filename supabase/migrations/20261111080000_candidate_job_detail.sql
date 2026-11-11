-- Detalle completo de una vacante para la persona que la guardó, mostró interés o tiene match (aunque ya no esté publicada)
create or replace function public.candidate_job_detail(p_job uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare j jobs; c companies; act text; mid uuid;
begin
  select * into j from jobs where id = p_job;
  if j.id is null then return null; end if;
  select * into c from companies where id = j.company_id;
  select action into act from candidate_job_actions where job_id = p_job and candidate_id = auth.uid();
  select id into mid from matches where job_id = p_job and candidate_id = auth.uid();
  if c.verification_status <> 'verified' or (j.status <> 'published' and act is null and mid is null) then return null; end if;
  return jsonb_build_object(
    'job', jsonb_build_object('id', j.id, 'title', j.title, 'description', j.description, 'requirements', j.requirements, 'area', j.area,
      'comuna', j.comuna, 'region', j.region, 'modality', j.modality, 'schedule', j.schedule, 'contract', j.contract,
      'salary_min', j.salary_min, 'salary_max', j.salary_max, 'salary_type', j.salary_type, 'created_at', j.created_at,
      'open', j.status = 'published', 'has_questions', coalesce(jsonb_array_length(j.questions), 0) > 0),
    'company', case when j.confidential then jsonb_build_object('display_name', 'Empresa confidencial', 'description', '', 'sector', '', 'size', '', 'benefits', '', 'website', '', 'confidential', true,
        'managed_by', (select pc.display_name from companies pc where pc.id = c.parent_id))
      else jsonb_build_object('display_name', c.display_name, 'description', c.description, 'sector', c.sector, 'size', c.size, 'benefits', c.benefits, 'website', c.website,
        'comuna', c.comuna, 'logo_path', c.logo_path, 'slug', c.slug, 'managed_by', (select pc.display_name from companies pc where pc.id = c.parent_id)) end,
    'my_action', act, 'match_id', mid);
end $$;
revoke execute on function public.candidate_job_detail(uuid) from public, anon;
grant execute on function public.candidate_job_detail(uuid) to authenticated;

-- Fotos: también para quien guardó o mostró interés en la vacante
create or replace function public.job_photos(p_job uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select c.photos from jobs j join companies c on c.id = j.company_id
    where j.id = p_job and not coalesce(j.confidential, false) and c.verification_status = 'verified'
      and (j.status = 'published' or is_company_member(j.company_id)
        or exists (select 1 from matches m where m.job_id = j.id and m.candidate_id = auth.uid())
        or exists (select 1 from candidate_job_actions a where a.job_id = j.id and a.candidate_id = auth.uid()))), '[]'::jsonb) $$;
