-- Migración aplicada en Supabase (20261109130745). Exportada tal cual desde supabase_migrations.schema_migrations.

create or replace function public.talent_pool(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $function$
declare res jsonb;
begin
  if not is_company_member(p_company) then raise exception 'Sin acceso'; end if;
  with vin as (
    select cand, bool_or(matched) matched, bool_or(saved) saved,
      jsonb_agg(jsonb_build_object('job_id', job_id, 'title', title, 'stage', stage) order by at desc) jobs, max(at) last_at
    from (
      select m.candidate_id cand, true matched, false saved, m.job_id, j.title, m.stage, m.stage_changed_at at
        from matches m join jobs j on j.id = m.job_id where m.company_id = p_company
      union all
      select x.candidate_id, false, x.action = 'save', x.job_id, j.title, case x.action when 'save' then 'guardado' when 'pass' then 'descartado' else 'invitado' end, x.created_at
        from company_candidate_actions x join jobs j on j.id = x.job_id where j.company_id = p_company
        and not exists (select 1 from matches m where m.job_id = x.job_id and m.candidate_id = x.candidate_id)
      union all
      select a.candidate_id, false, false, a.job_id, j.title, 'postulante', a.created_at
        from candidate_job_actions a join jobs j on j.id = a.job_id where j.company_id = p_company and a.action = 'interest'
        and not exists (select 1 from matches m where m.job_id = a.job_id and m.candidate_id = a.candidate_id)
        and not exists (select 1 from company_candidate_actions x where x.job_id = a.job_id and x.candidate_id = a.candidate_id)
    ) s group by cand
  ), rows as (
    select v.cand subject_id, 'vinka' kind, v.cand candidate_id,
      case when v.matched then trim(p.first_name || ' ' || p.last_name) else trim(p.first_name || ' ' || left(p.last_name,1) || case when p.last_name <> '' then '.' else '' end) end name,
      cp.headline, cp.comuna, cp.region, cp.areas, cp.skills, ''::text email, v.jobs, v.last_at, v.saved, false dup,
      cp.role_label, cp.role_level, cp.has_experience,
      coalesce((select string_agg(coalesce(x->>'role','') || ' ' || coalesce(x->>'company',''), ' · ') from jsonb_array_elements(case when jsonb_typeof(cp.experiences) = 'array' then cp.experiences else '[]'::jsonb end) x), '') exp_text,
      coalesce((select string_agg(coalesce(x->>'title','') || ' ' || coalesce(x->>'institution',''), ' · ') from jsonb_array_elements(case when jsonb_typeof(cp.education) = 'array' then cp.education else '[]'::jsonb end) x), '') edu_text
    from vin v join profiles p on p.id = v.cand join candidate_profiles cp on cp.user_id = v.cand
    union all
    select e.id, 'externo', e.linked_user_id, e.full_name, e.headline, '', '', '{}'::text[], '{}'::text[], e.email,
      jsonb_build_array(jsonb_build_object('job_id', e.job_id, 'title', j.title, 'stage', ext_to_col(e.stage))), e.stage_changed_at, false,
      e.email <> '' and exists (select 1 from external_applicants d where d.company_id = p_company and d.id <> e.id and lower(d.email) = lower(e.email)),
      null, null, null, '', ''
    from external_applicants e join jobs j on j.id = e.job_id where e.company_id = p_company
  )
  select coalesce(jsonb_agg(jsonb_build_object('subject_id', r.subject_id, 'kind', r.kind, 'candidate_id', r.candidate_id, 'name', r.name, 'headline', r.headline,
      'comuna', r.comuna, 'region', r.region, 'areas', r.areas, 'skills', r.skills, 'email', r.email, 'jobs', r.jobs, 'last_at', r.last_at, 'saved', r.saved, 'duplicate', r.dup,
      'role_label', r.role_label, 'role_level', r.role_level, 'has_experience', r.has_experience, 'exp_text', r.exp_text, 'edu_text', r.edu_text,
      'tags', coalesce((select jsonb_agg(t.tag order by t.tag) from candidate_tags t where t.company_id = p_company and t.subject_id = r.subject_id), '[]'::jsonb))
    order by r.last_at desc), '[]'::jsonb) into res from rows r;
  return res;
end $function$;
