-- Página pública de empleos por empresa y postulación sin cuenta.
alter table public.companies add column if not exists slug text;

create or replace function public.slugify(t text) returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(translate(coalesce(t, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function public.company_slug() returns trigger
language plpgsql security definer set search_path = public as $$
declare base text; s text; i int := 1;
begin
  if new.slug is not null and new.slug <> '' and (tg_op = 'INSERT' or new.slug = old.slug) then return new; end if;
  base := left(nullif(slugify(coalesce(nullif(new.display_name, ''), new.legal_name)), ''), 50);
  if base is null then base := 'empresa'; end if;
  s := base;
  while exists (select 1 from companies where slug = s and id <> new.id) loop i := i + 1; s := base || '-' || i; end loop;
  new.slug := s;
  return new;
end $$;
drop trigger if exists company_slug on public.companies;
create trigger company_slug before insert or update of slug on public.companies for each row execute function company_slug();
-- una empresa a la vez, para que cada slug vea los anteriores
do $$ declare r record; begin for r in select id from public.companies where slug is null order by created_at loop update public.companies set slug = null where id = r.id; end loop; end $$;
create unique index if not exists companies_slug_key on public.companies (slug);

create or replace function public.public_company(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'company', jsonb_build_object('slug', c.slug, 'display_name', c.display_name, 'description', c.description, 'sector', c.sector,
      'comuna', c.comuna, 'region', c.region, 'benefits', c.benefits, 'website', c.website, 'size', c.size),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'title', j.title, 'comuna', j.comuna, 'region', j.region, 'modality', j.modality,
        'schedule', j.schedule, 'contract', j.contract, 'salary_min', j.salary_min, 'salary_max', j.salary_max, 'salary_type', j.salary_type, 'created_at', j.created_at)
        order by j.created_at desc)
      from jobs j where j.company_id = c.id and j.status = 'published'), '[]'::jsonb))
  from companies c where c.slug = p_slug and c.verification_status = 'verified'
$$;

create or replace function public.public_job(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'job', jsonb_build_object('id', j.id, 'title', j.title, 'description', j.description, 'requirements', j.requirements, 'area', j.area,
      'comuna', j.comuna, 'region', j.region, 'modality', j.modality, 'schedule', j.schedule, 'contract', j.contract,
      'salary_min', j.salary_min, 'salary_max', j.salary_max, 'salary_type', j.salary_type, 'created_at', j.created_at),
    'company', jsonb_build_object('slug', c.slug, 'display_name', c.display_name, 'description', c.description, 'sector', c.sector, 'benefits', c.benefits))
  from jobs j join companies c on c.id = j.company_id
  where j.id = p_id and j.status = 'published' and c.verification_status = 'verified'
$$;

create or replace function public.public_apply(p_job uuid, p_name text, p_email text, p_phone text, p_headline text, p_note text, p_consent boolean, p_hp text default '')
returns text language plpgsql security definer set search_path = public as $$
declare j jobs; v_email text := lower(trim(coalesce(p_email, ''))); v_name text := trim(coalesce(p_name, ''));
begin
  if coalesce(p_hp, '') <> '' then return 'ok'; end if;  -- campo trampa para bots
  if not coalesce(p_consent, false) then raise exception 'Debes aceptar la política de privacidad para postular'; end if;
  if char_length(v_name) < 3 or char_length(v_name) > 120 then raise exception 'Escribe tu nombre y apellido'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 160 then raise exception 'Revisa tu correo'; end if;
  select * into j from jobs where id = p_job and status = 'published';
  if j.id is null or not exists (select 1 from companies where id = j.company_id and verification_status = 'verified') then
    raise exception 'Esta vacante ya no recibe postulaciones';
  end if;
  if exists (select 1 from external_applicants where job_id = p_job and lower(email) = v_email) then return 'ya_postulaste'; end if;
  if (select count(*) from external_applicants where lower(email) = v_email and source = 'Página de empleos' and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Hiciste muchas postulaciones hoy. Intenta mañana.';
  end if;
  if (select count(*) from external_applicants where job_id = p_job and source = 'Página de empleos' and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Esta vacante está recibiendo muchas postulaciones. Intenta en unos minutos.';
  end if;
  insert into external_applicants (company_id, job_id, full_name, email, phone, headline, notes, stage, source)
  values (j.company_id, p_job, v_name, v_email, left(regexp_replace(coalesce(p_phone, ''), '[^\d+ ]', '', 'g'), 20),
          left(trim(coalesce(p_headline, '')), 120), left(trim(coalesce(p_note, '')), 1500), 'nuevo', 'Página de empleos');
  if not exists (select 1 from notifications n where n.kind = 'public_apply' and n.url = '/vacantes/' || p_job || '/proceso' and n.created_at > now() - interval '30 minutes') then
    perform notify_users(array(select user_id from company_members where company_id = j.company_id and role in ('owner', 'admin', 'recruiter')),
      'public_apply', 'Nueva postulación para «' || j.title || '»', v_name || ' postuló desde tu página de empleos.', '/vacantes/' || p_job || '/proceso', false);
  end if;
  return 'ok';
end $$;

revoke all on function public.public_company(text) from public;
revoke all on function public.public_job(uuid) from public;
revoke all on function public.public_apply(uuid, text, text, text, text, text, boolean, text) from public;
grant execute on function public.public_company(text) to anon, authenticated;
grant execute on function public.public_job(uuid) to anon, authenticated;
grant execute on function public.public_apply(uuid, text, text, text, text, text, boolean, text) to anon, authenticated;
