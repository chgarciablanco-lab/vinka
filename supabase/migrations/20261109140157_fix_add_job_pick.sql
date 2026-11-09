-- Migración aplicada en Supabase (20261109140157). Exportada tal cual desde supabase_migrations.schema_migrations.

create or replace function public.add_job_pick(p_request uuid, p_job uuid, p_title text, p_company text, p_comuna text, p_url text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r service_requests; v_id uuid; v_title text := left(trim(coalesce(p_title, '')), 120); v_company text := left(coalesce(p_company, ''), 120); v_comuna text := left(coalesce(p_comuna, ''), 80);
begin
  select * into r from service_requests where id = p_request;
  if r.id is null or not (is_admin() or (r.assigned_to = auth.uid() and is_advisor())) then raise exception 'No tienes acceso a esta asesoría'; end if;
  if p_job is not null then
    select jj.title, c.display_name, coalesce(jj.comuna, '') into v_title, v_company, v_comuna
      from jobs jj join companies c on c.id = jj.company_id where jj.id = p_job and jj.status = 'published';
    if not found then raise exception 'Esa vacante ya no está publicada'; end if;
    if exists (select 1 from service_job_picks where request_id = p_request and job_id = p_job) then raise exception 'Ya sugeriste esta vacante'; end if;
  else
    if v_title = '' then raise exception 'Escribe el cargo de la oferta'; end if;
    if coalesce(p_url, '') <> '' and p_url !~* '^https?://' then raise exception 'El enlace debe empezar con https://'; end if;
  end if;
  if not is_admin() and (has_contact_info(p_note) or has_contact_info(p_url)) then raise exception 'No incluyas teléfonos, correos ni redes sociales.'; end if;
  insert into service_job_picks (request_id, job_id, title, company, comuna, url, note, created_by)
  values (p_request, p_job, v_title, v_company, v_comuna, case when p_job is null then left(coalesce(p_url, ''), 500) else '' end, left(coalesce(p_note, ''), 500), auth.uid())
  returning id into v_id;
  perform log_service(p_request, 'oferta', 'Sugirió la oferta: ' || v_title || coalesce(' — ' || nullif(v_company, ''), ''), p_note, null, true);
  return v_id;
end $$;
