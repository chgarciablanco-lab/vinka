-- Migración aplicada en Supabase (20261107043929). Exportada tal cual desde supabase_migrations.schema_migrations.

-- Etapa unificada para postulantes externos
create or replace function ext_to_col(s text) returns text language sql immutable as $$
  select case s when 'nuevo' then 'match' when 'contactado' then 'contacto' else s end $$;
create or replace function col_to_ext(s text) returns text language sql immutable as $$
  select case s when 'match' then 'nuevo' when 'contacto' then 'contactado' else s end $$;

-- ===== Tablero (kanban) de una vacante =====
create or replace function job_pipeline(p_job uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare j jobs; res jsonb;
begin
  select * into j from jobs where id = p_job;
  if j.id is null or not is_company_member(j.company_id) then raise exception 'Vacante no encontrada'; end if;
  with ev as (
    select job_id, candidate_id, external_id, round(avg(overall)::numeric, 1) avg, count(*) n,
           count(*) filter (where recommendation = 'si') yes from evaluations where job_id = p_job group by 1,2,3
  ), cards as (
    -- Postularon (dijeron "Me interesa") y la empresa aún no decide
    select 'interesado' kind, a.candidate_id id, a.candidate_id, 'postulante' stage, a.created_at since,
      trim(p.first_name || ' ' || left(p.last_name,1) || case when p.last_name <> '' then '.' else '' end) name,
      cp.headline, cp.comuna, knocked_out(j.questions, a.answers) ko, a.answers is not null answered, null::uuid match_id, 'vinka' source
    from candidate_job_actions a join profiles p on p.id = a.candidate_id join candidate_profiles cp on cp.user_id = a.candidate_id
    where a.job_id = p_job and a.action = 'interest'
      and not exists (select 1 from company_candidate_actions x where x.job_id = p_job and x.candidate_id = a.candidate_id)
      and not exists (select 1 from matches m where m.job_id = p_job and m.candidate_id = a.candidate_id)
    union all
    select 'match', m.candidate_id, m.candidate_id, m.stage, m.stage_changed_at,
      trim(p.first_name || ' ' || p.last_name), cp.headline, cp.comuna,
      knocked_out(j.questions, a.answers), a.answers is not null, m.id, 'vinka'
    from matches m join profiles p on p.id = m.candidate_id join candidate_profiles cp on cp.user_id = m.candidate_id
    left join candidate_job_actions a on a.job_id = m.job_id and a.candidate_id = m.candidate_id
    where m.job_id = p_job and not m.closed
    union all
    select 'externo', e.id, null, ext_to_col(e.stage), e.stage_changed_at, e.full_name, e.headline, '', false, false, null, coalesce(nullif(e.source,''), 'externo')
    from external_applicants e where e.job_id = p_job
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'kind', c.kind, 'id', c.id, 'candidate_id', c.candidate_id, 'match_id', c.match_id, 'stage', c.stage, 'since', c.since,
      'name', c.name, 'headline', c.headline, 'comuna', c.comuna, 'knocked_out', c.ko, 'answered', c.answered, 'source', c.source,
      'eval_avg', ev.avg, 'eval_n', coalesce(ev.n, 0), 'eval_yes', coalesce(ev.yes, 0),
      'fit', (select (data->>'score')::int from ai_insights ai where ai.job_id = p_job and ai.candidate_id = c.candidate_id and ai.kind = 'fit'),
      'tags', coalesce((select jsonb_agg(t.tag order by t.tag) from candidate_tags t where t.company_id = j.company_id and t.subject_id = c.id), '[]'::jsonb),
      'next_interview', (select min(i.starts_at) from interviews i where i.match_id = c.match_id and i.status = 'confirmada' and i.starts_at > now())
    ) order by c.since desc), '[]'::jsonb) into res
  from cards c left join ev on (c.candidate_id is not null and ev.candidate_id = c.candidate_id) or (c.kind = 'externo' and ev.external_id = c.id);
  return jsonb_build_object('job', jsonb_build_object('id', j.id, 'title', j.title, 'status', j.status, 'questions', j.questions, 'company_id', j.company_id),
    'can_manage', can_manage(j.company_id), 'cards', res);
end $$;

-- ===== Mover una tarjeta =====
create or replace function pipeline_move(p_kind text, p_id uuid, p_job uuid, p_stage text) returns uuid
language plpgsql security definer set search_path = public as $$
declare j jobs; m matches;
begin
  select * into j from jobs where id = p_job;
  if j.id is null or not can_manage(j.company_id) then raise exception 'No tienes permiso para mover candidatos'; end if;
  if p_stage not in ('match','contacto','entrevista','oferta','contratado','descartado') then raise exception 'Etapa no válida'; end if;
  if p_kind = 'externo' then
    update external_applicants set stage = col_to_ext(p_stage) where id = p_id and job_id = p_job;
    return null;
  end if;
  if p_kind = 'interesado' then
    if p_stage = 'descartado' then
      insert into company_candidate_actions (job_id, candidate_id, action, created_by) values (p_job, p_id, 'pass', auth.uid())
      on conflict (job_id, candidate_id) do update set action = 'pass', created_by = auth.uid(), created_at = now();
      perform log_event(j.company_id, p_job, p_id, null, 'stage', jsonb_build_object('from','postulante','to','descartado'));
      return null;
    end if;
    if j.status <> 'published' or not exists (select 1 from companies where id = j.company_id and verification_status = 'verified') then
      raise exception 'La vacante debe estar publicada para avanzar postulantes'; end if;
    insert into company_candidate_actions (job_id, candidate_id, action, created_by) values (p_job, p_id, 'interest', auth.uid())
    on conflict (job_id, candidate_id) do update set action = 'interest', created_by = auth.uid(), created_at = now();
    select * into m from matches where job_id = p_job and candidate_id = p_id;
    if m.id is null then raise exception 'No se pudo crear el match'; end if;
    if p_stage <> 'match' then update matches set stage = p_stage where id = m.id; end if;
    return m.id;
  end if;
  update matches set stage = p_stage where job_id = p_job and candidate_id = p_id and not closed returning * into m;
  return m.id;
end $$;

-- ===== Acciones masivas (mover + mensaje con variables) =====
create or replace function bulk_pipeline(p_job uuid, p_items jsonb, p_stage text, p_message text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare it jsonb; mid uuid; moved int := 0; sent int := 0; j jobs; co text; nm text; body text;
begin
  select * into j from jobs where id = p_job;
  if j.id is null or not can_manage(j.company_id) then raise exception 'No tienes permiso'; end if;
  if jsonb_array_length(coalesce(p_items,'[]')) > 100 then raise exception 'Máximo 100 candidatos por acción'; end if;
  select display_name into co from companies where id = j.company_id;
  for it in select * from jsonb_array_elements(p_items) loop
    mid := null;
    if coalesce(p_stage, '') <> '' then
      mid := pipeline_move(it->>'kind', (it->>'id')::uuid, p_job, p_stage); moved := moved + 1;
    elsif it->>'kind' = 'match' then
      select id into mid from matches where job_id = p_job and candidate_id = (it->>'id')::uuid and not closed;
    end if;
    if mid is not null and coalesce(trim(p_message), '') <> '' then
      select p.first_name into nm from matches m join profiles p on p.id = m.candidate_id where m.id = mid;
      body := replace(replace(replace(left(p_message, 2000), '{nombre}', coalesce(nm, '')), '{cargo}', j.title), '{empresa}', co);
      insert into messages (match_id, sender_id, body) values (mid, auth.uid(), body); sent := sent + 1;
    end if;
  end loop;
  return jsonb_build_object('moved', moved, 'sent', sent);
end $$;

-- ===== Ficha completa de un candidato VINKA en una vacante =====
create or replace function subject_detail(p_job uuid, p_candidate uuid) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare j jobs; m matches; a candidate_job_actions; cp candidate_profiles; p profiles; matched boolean; res jsonb;
begin
  select * into j from jobs where id = p_job;
  if j.id is null or not is_company_member(j.company_id) then raise exception 'Vacante no encontrada'; end if;
  select * into m from matches where job_id = p_job and candidate_id = p_candidate;
  select * into a from candidate_job_actions where job_id = p_job and candidate_id = p_candidate;
  if m.id is null and (a.candidate_id is null or a.action <> 'interest')
     and not exists (select 1 from company_candidate_actions where job_id = p_job and candidate_id = p_candidate) then
    raise exception 'Este candidato no participa en la vacante'; end if;
  select * into cp from candidate_profiles where user_id = p_candidate;
  select * into p from profiles where id = p_candidate;
  matched := m.id is not null;
  res := jsonb_build_object(
    'kind', case when matched then 'match' else 'interesado' end,
    'job', jsonb_build_object('id', j.id, 'title', j.title, 'questions', j.questions, 'company_id', j.company_id, 'area', j.area, 'level', j.level),
    'can_manage', can_manage(j.company_id), 'my_id', auth.uid(),
    'match', case when matched then jsonb_build_object('id', m.id, 'stage', m.stage, 'closed', m.closed, 'created_at', m.created_at, 'contact_shared', m.contact_shared) end,
    'candidate', jsonb_build_object('id', p_candidate,
      'name', case when matched then trim(p.first_name || ' ' || p.last_name) else trim(p.first_name || ' ' || left(p.last_name,1) || case when p.last_name <> '' then '.' else '' end) end,
      'headline', cp.headline, 'region', cp.region, 'comuna', cp.comuna, 'availability', cp.availability, 'modalities', cp.modalities,
      'schedules', cp.schedules, 'has_experience', cp.has_experience, 'experiences', cp.experiences, 'education', cp.education, 'skills', cp.skills,
      'bio', case when matched or cp.intro_visibility = 'all' then cp.bio else '' end, 'has_video', cp.video_path is not null,
      'phone', case when m.contact_shared then p.phone end,
      'email', case when m.contact_shared then (select email from auth.users where id = p_candidate) end),
    'applied_at', case when a.action = 'interest' then a.created_at end,
    'answers', coalesce((select jsonb_agg(jsonb_build_object('text', q->>'text', 'type', q->>'type', 'answer', a.answers->>(q->>'id'),
                 'ko', q->>'knockout' in ('si','no') and a.answers->>(q->>'id') = q->>'knockout')) from jsonb_array_elements(j.questions) q), '[]'::jsonb),
    'knocked_out', knocked_out(j.questions, a.answers),
    'evaluations', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'author_id', e.author_id, 'author', trim(ap.first_name || ' ' || ap.last_name),
                 'scores', e.scores, 'overall', e.overall, 'recommendation', e.recommendation, 'note', e.note, 'updated_at', e.updated_at) order by e.updated_at desc)
                 from evaluations e left join profiles ap on ap.id = e.author_id where e.job_id = p_job and e.candidate_id = p_candidate), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'author_id', n.author_id, 'author', trim(ap.first_name || ' ' || ap.last_name),
                 'body', n.body, 'created_at', n.created_at) order by n.created_at)
                 from candidate_notes n left join profiles ap on ap.id = n.author_id where n.job_id = p_job and n.candidate_id = p_candidate), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', ev.kind, 'detail', ev.detail, 'at', ev.created_at, 'actor', trim(ap.first_name || ' ' || ap.last_name)) order by ev.created_at desc)
                 from (select * from pipeline_events where job_id = p_job and candidate_id = p_candidate order by created_at desc limit 60) ev left join profiles ap on ap.id = ev.actor_id), '[]'::jsonb),
    'tags', coalesce((select jsonb_agg(tag order by tag) from candidate_tags where company_id = j.company_id and subject_id = p_candidate), '[]'::jsonb),
    'ai', coalesce((select jsonb_object_agg(kind, data || jsonb_build_object('at', created_at)) from ai_insights where job_id = p_job and candidate_id = p_candidate), '{}'::jsonb),
    'offer', (select to_jsonb(o) from offers o where o.match_id = m.id order by created_at desc limit 1),
    'interviews', coalesce((select jsonb_agg(jsonb_build_object('starts_at', i.starts_at, 'mode', i.mode, 'status', i.status) order by i.starts_at desc) from interviews i where i.match_id = m.id), '[]'::jsonb),
    'team', coalesce((select jsonb_agg(jsonb_build_object('id', cm.user_id, 'name', trim(tp.first_name || ' ' || tp.last_name))) from company_members cm join profiles tp on tp.id = cm.user_id where cm.company_id = j.company_id), '[]'::jsonb)
  );
  return res;
end $$;

create or replace function external_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e external_applicants; j jobs;
begin
  select * into e from external_applicants where id = p_id;
  if e.id is null or not is_company_member(e.company_id) then raise exception 'Postulante no encontrado'; end if;
  select * into j from jobs where id = e.job_id;
  return jsonb_build_object('kind', 'externo',
    'job', jsonb_build_object('id', j.id, 'title', j.title, 'company_id', j.company_id),
    'can_manage', can_manage(e.company_id), 'my_id', auth.uid(),
    'external', to_jsonb(e) - 'invite_token' || jsonb_build_object('col', ext_to_col(e.stage)),
    'evaluations', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'author_id', v.author_id, 'author', trim(ap.first_name || ' ' || ap.last_name),
                 'scores', v.scores, 'overall', v.overall, 'recommendation', v.recommendation, 'note', v.note, 'updated_at', v.updated_at) order by v.updated_at desc)
                 from evaluations v left join profiles ap on ap.id = v.author_id where v.external_id = p_id), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'author_id', n.author_id, 'author', trim(ap.first_name || ' ' || ap.last_name), 'body', n.body, 'created_at', n.created_at) order by n.created_at)
                 from candidate_notes n left join profiles ap on ap.id = n.author_id where n.external_id = p_id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', ev.kind, 'detail', ev.detail, 'at', ev.created_at, 'actor', trim(ap.first_name || ' ' || ap.last_name)) order by ev.created_at desc)
                 from pipeline_events ev left join profiles ap on ap.id = ev.actor_id where ev.external_id = p_id), '[]'::jsonb),
    'tags', coalesce((select jsonb_agg(tag order by tag) from candidate_tags where company_id = e.company_id and subject_id = p_id), '[]'::jsonb),
    'duplicates', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'job_title', dj.title, 'stage', d.stage)) from external_applicants d join jobs dj on dj.id = d.job_id
                 where d.company_id = e.company_id and d.id <> e.id and e.email <> '' and lower(d.email) = lower(e.email)), '[]'::jsonb),
    'team', coalesce((select jsonb_agg(jsonb_build_object('id', cm.user_id, 'name', trim(tp.first_name || ' ' || tp.last_name))) from company_members cm join profiles tp on tp.id = cm.user_id where cm.company_id = e.company_id), '[]'::jsonb));
end $$;

-- ===== Banco de talento =====
create or replace function talent_pool(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
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
      cp.headline, cp.comuna, cp.region, cp.areas, cp.skills, ''::text email, v.jobs, v.last_at, v.saved, false dup
    from vin v join profiles p on p.id = v.cand join candidate_profiles cp on cp.user_id = v.cand
    union all
    select e.id, 'externo', e.linked_user_id, e.full_name, e.headline, '', '', '{}'::text[], '{}'::text[], e.email,
      jsonb_build_array(jsonb_build_object('job_id', e.job_id, 'title', j.title, 'stage', ext_to_col(e.stage))), e.stage_changed_at, false,
      e.email <> '' and exists (select 1 from external_applicants d where d.company_id = p_company and d.id <> e.id and lower(d.email) = lower(e.email))
    from external_applicants e join jobs j on j.id = e.job_id where e.company_id = p_company
  )
  select coalesce(jsonb_agg(jsonb_build_object('subject_id', r.subject_id, 'kind', r.kind, 'candidate_id', r.candidate_id, 'name', r.name, 'headline', r.headline,
      'comuna', r.comuna, 'region', r.region, 'areas', r.areas, 'skills', r.skills, 'email', r.email, 'jobs', r.jobs, 'last_at', r.last_at, 'saved', r.saved, 'duplicate', r.dup,
      'tags', coalesce((select jsonb_agg(t.tag order by t.tag) from candidate_tags t where t.company_id = p_company and t.subject_id = r.subject_id), '[]'::jsonb))
    order by r.last_at desc), '[]'::jsonb) into res from rows r;
  return res;
end $$;

create or replace function invite_to_job(p_candidate uuid, p_job uuid) returns text
language plpgsql security definer set search_path = public as $$
declare j jobs;
begin
  select * into j from jobs where id = p_job;
  if j.id is null or not can_manage(j.company_id) then raise exception 'No tienes permiso'; end if;
  if j.status <> 'published' then raise exception 'La vacante debe estar publicada'; end if;
  if not exists (
       select 1 from matches where company_id = j.company_id and candidate_id = p_candidate
       union all select 1 from company_candidate_actions x join jobs jj on jj.id = x.job_id where jj.company_id = j.company_id and x.candidate_id = p_candidate
       union all select 1 from candidate_job_actions a join jobs jj on jj.id = a.job_id where jj.company_id = j.company_id and a.candidate_id = p_candidate and a.action = 'interest') then
    raise exception 'Solo puedes invitar a personas de tu banco de talento'; end if;
  if exists (select 1 from matches where job_id = p_job and candidate_id = p_candidate) then return 'ya_en_proceso'; end if;
  insert into company_candidate_actions (job_id, candidate_id, action, created_by) values (p_job, p_candidate, 'interest', auth.uid())
  on conflict (job_id, candidate_id) do update set action = 'interest', created_by = auth.uid(), created_at = now();
  return case when exists (select 1 from matches where job_id = p_job and candidate_id = p_candidate) then 'match' else 'invitado' end;
end $$;

create or replace function copy_external_to_job(p_external uuid, p_job uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare e external_applicants; v uuid;
begin
  select * into e from external_applicants where id = p_external;
  if e.id is null or not can_manage(e.company_id) or not exists (select 1 from jobs where id = p_job and company_id = e.company_id) then raise exception 'No tienes permiso'; end if;
  if exists (select 1 from external_applicants where job_id = p_job and ((e.email <> '' and lower(email) = lower(e.email)) or (e.email = '' and full_name = e.full_name))) then
    raise exception 'Esta persona ya está en esa vacante'; end if;
  insert into external_applicants (company_id, job_id, full_name, email, phone, headline, notes, stage, source, created_by)
  values (e.company_id, p_job, e.full_name, e.email, e.phone, e.headline, e.notes, 'nuevo', 'banco de talento', auth.uid()) returning id into v;
  return v;
end $$;

revoke execute on function ext_to_col(text), col_to_ext(text), job_pipeline(uuid), pipeline_move(text,uuid,uuid,text), bulk_pipeline(uuid,jsonb,text,text),
  subject_detail(uuid,uuid), external_detail(uuid), talent_pool(uuid), invite_to_job(uuid,uuid), copy_external_to_job(uuid,uuid) from public, anon;
grant execute on function ext_to_col(text), col_to_ext(text), job_pipeline(uuid), pipeline_move(text,uuid,uuid,text), bulk_pipeline(uuid,jsonb,text,text),
  subject_detail(uuid,uuid), external_detail(uuid), talent_pool(uuid), invite_to_job(uuid,uuid), copy_external_to_job(uuid,uuid) to authenticated;
