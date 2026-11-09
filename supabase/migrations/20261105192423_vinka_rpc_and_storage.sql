-- Migración aplicada en Supabase (20261105192423). Exportada tal cual desde supabase_migrations.schema_migrations.

-- Feed de vacantes para el candidato, con razones explicables
create or replace function public.job_feed()
returns table (id uuid, title text, area text, level text, description text, requirements jsonb, modality text, schedule text, contract text,
  region text, comuna text, salary_min int, salary_max int, salary_type text, company_id uuid, company_name text, company_sector text,
  company_size text, score int, reasons text[])
language plpgsql stable security definer set search_path = public as $$
declare c candidate_profiles;
begin
  select * into c from candidate_profiles where user_id = auth.uid();
  if c.user_id is null then return; end if;
  return query
  with base as (
    select j.*, co.display_name, co.sector, co.size,
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
    b.salary_min, b.salary_max, b.salary_type, b.company_id, b.display_name, b.sector, b.size,
    coalesce(array_length(b.why,1),0), b.why
  from base b
  order by coalesce(array_length(b.why,1),0) desc, b.created_at desc
  limit 50;
end $$;

-- Candidatos para una vacante (vista empresa, datos minimizados)
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
    where cp.is_public and cp.onboarding_done
      and not exists (select 1 from company_candidate_actions x where x.job_id = j.id and x.candidate_id = cp.user_id)
  )
  select b.user_id, trim(b.first_name || ' ' || left(b.last_name,1) || case when b.last_name <> '' then '.' else '' end),
    upper(left(b.first_name,1) || left(b.last_name,1)), b.headline, b.region, b.comuna, b.availability, b.modalities, b.schedules,
    b.has_experience, b.experiences, b.education, b.skills,
    case when b.intro_visibility = 'all' then b.bio else '' end,
    (b.video_path is not null and b.intro_visibility = 'all'),
    b.interested, coalesce(array_length(b.why,1),0), b.why
  from base b
  order by b.interested desc, coalesce(array_length(b.why,1),0) desc, b.updated_at desc
  limit 50;
end $$;

-- Intereses del candidato: enviados, guardados, invitaciones recibidas
create or replace function public.my_interests()
returns table (kind text, job_id uuid, title text, company_name text, comuna text, modality text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select case a.action when 'interest' then 'sent' else 'saved' end, j.id, j.title, co.display_name, j.comuna, j.modality, a.created_at
  from candidate_job_actions a join jobs j on j.id = a.job_id join companies co on co.id = j.company_id
  where a.candidate_id = auth.uid() and a.action in ('interest','save')
    and not exists (select 1 from matches m where m.job_id = j.id and m.candidate_id = auth.uid())
  union all
  select 'invited', j.id, j.title, co.display_name, j.comuna, j.modality, x.created_at
  from company_candidate_actions x join jobs j on j.id = x.job_id join companies co on co.id = j.company_id
  where x.candidate_id = auth.uid() and x.action = 'interest' and j.status = 'published'
    and not exists (select 1 from candidate_job_actions a where a.job_id = j.id and a.candidate_id = auth.uid())
  order by 7 desc;
$$;

-- Matches con datos de la contraparte
create or replace function public.my_matches()
returns table (match_id uuid, job_id uuid, job_title text, company_id uuid, company_name text, candidate_id uuid, candidate_name text,
  candidate_headline text, stage text, contact_shared boolean, contact_requested boolean, candidate_phone text, candidate_email text,
  closed boolean, created_at timestamptz, last_message text, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, j.id, j.title, co.id, co.display_name, m.candidate_id, trim(p.first_name||' '||p.last_name), cp.headline,
    m.stage, m.contact_shared, m.contact_requested,
    case when m.contact_shared or m.candidate_id = auth.uid() then p.phone end,
    case when m.contact_shared or m.candidate_id = auth.uid() then u.email::text end,
    m.closed, m.created_at,
    (select body from messages x where x.match_id = m.id order by created_at desc limit 1),
    (select created_at from messages x where x.match_id = m.id order by created_at desc limit 1)
  from matches m join jobs j on j.id = m.job_id join companies co on co.id = m.company_id
  join profiles p on p.id = m.candidate_id join candidate_profiles cp on cp.user_id = m.candidate_id
  join auth.users u on u.id = m.candidate_id
  where m.candidate_id = auth.uid() or is_company_member(m.company_id)
  order by coalesce((select max(created_at) from messages x where x.match_id = m.id), m.created_at) desc;
$$;

-- Acciones sobre un match
create or replace function public.match_update(p_match uuid, p_action text, p_stage text default null)
returns void language plpgsql security definer set search_path = public as $$
declare m matches; is_cand boolean; is_comp boolean;
begin
  select * into m from matches where id = p_match;
  if m.id is null then raise exception 'Match no encontrado'; end if;
  is_cand := m.candidate_id = auth.uid();
  is_comp := is_company_member(m.company_id);
  if p_action = 'share_contact' and is_cand then update matches set contact_shared = true where id = p_match;
  elsif p_action = 'decline_contact' and is_cand then update matches set contact_requested = false where id = p_match;
  elsif p_action = 'request_contact' and is_comp then update matches set contact_requested = true where id = p_match;
  elsif p_action = 'stage' and is_comp and p_stage in ('match','contacto','entrevista','oferta','contratado','descartado') then
    update matches set stage = p_stage where id = p_match;
  elsif p_action = 'block' and (is_cand or is_comp) then
    update matches set closed = true where id = p_match;
    insert into audit_logs (actor_id, action, entity, entity_id) values (auth.uid(), 'block', 'match', p_match);
  else raise exception 'Acción no permitida';
  end if;
end $$;

-- Estadísticas de la empresa
create or replace function public.company_stats(p_company uuid)
returns table (job_id uuid, interests int, matches int)
language sql stable security definer set search_path = public as $$
  select j.id,
    (select count(*)::int from candidate_job_actions a where a.job_id = j.id and a.action = 'interest'),
    (select count(*)::int from matches m where m.job_id = j.id)
  from jobs j where j.company_id = p_company and is_company_member(p_company);
$$;

-- Eliminar mi cuenta
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  delete from storage.objects where bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text;
  delete from companies where owner_id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;

revoke execute on function public.job_feed() from anon;
revoke execute on function public.candidates_for_job(uuid) from anon;
revoke execute on function public.my_interests() from anon;
revoke execute on function public.my_matches() from anon;
revoke execute on function public.match_update(uuid, text, text) from anon;
revoke execute on function public.company_stats(uuid) from anon;
revoke execute on function public.delete_my_account() from anon;

-- ===== Storage: videos privados (15 s, máx 25 MB) =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', false, 26214400, array['video/mp4','video/quicktime','video/webm'])
on conflict (id) do nothing;

create or replace function public.can_view_candidate_video(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select owner = auth.uid() or is_admin()
    or (is_verified_company_user() and exists (select 1 from candidate_profiles where user_id = owner and is_public and intro_visibility = 'all'))
    or exists (select 1 from matches m join company_members cm on cm.company_id = m.company_id where m.candidate_id = owner and cm.user_id = auth.uid());
$$;

create policy "video: subir propio" on storage.objects for insert to authenticated
  with check (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "video: actualizar propio" on storage.objects for update to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "video: borrar propio" on storage.objects for delete to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "video: ver autorizado" on storage.objects for select to authenticated
  using (bucket_id = 'videos' and public.can_view_candidate_video(((storage.foldername(name))[1])::uuid));

-- Ruta del video para empresas autorizadas
create or replace function public.candidate_video_path(p_candidate uuid) returns text
language sql stable security definer set search_path = public as $$
  select video_path from candidate_profiles where user_id = p_candidate and can_view_candidate_video(p_candidate);
$$;
revoke execute on function public.candidate_video_path(uuid) from anon;
