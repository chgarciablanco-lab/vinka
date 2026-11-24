-- Postulación sin cuenta: si la misma persona ya postuló a esa vacante con su cuenta de VINKA (mismo correo),
-- responde «ya_postulaste» y no crea una segunda tarjeta en el tablero. No modifica datos existentes.
create schema if not exists backup;
create table if not exists backup.fn_public_apply_20261124 as select now() saved_at, pg_get_functiondef('public.public_apply(uuid,text,text,text,text,text,boolean,text)'::regprocedure) def;
revoke all on backup.fn_public_apply_20261124 from public, anon, authenticated;

create or replace function public.public_apply(p_job uuid, p_name text, p_email text, p_phone text, p_headline text, p_note text, p_consent boolean, p_hp text DEFAULT ''::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare j jobs; v_email text := lower(trim(coalesce(p_email, ''))); v_name text := trim(coalesce(p_name, ''));
begin
  if coalesce(p_hp, '') <> '' then return 'ok'; end if;
  if not coalesce(p_consent, false) then raise exception 'Debes aceptar la política de privacidad para postular'; end if;
  if char_length(v_name) < 3 or char_length(v_name) > 120 then raise exception 'Escribe tu nombre y apellido'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 160 then raise exception 'Revisa tu correo'; end if;
  select * into j from jobs where id = p_job and status = 'published';
  if j.id is null or not exists (select 1 from companies where id = j.company_id and verification_status = 'verified') then
    raise exception 'Esta vacante ya no recibe postulaciones';
  end if;
  if exists (select 1 from external_applicants where job_id = p_job and lower(email) = v_email) then return 'ya_postulaste'; end if;
  -- La misma persona ya postuló con su cuenta de VINKA (mismo correo): no se crea una segunda tarjeta en el tablero
  if exists (select 1 from auth.users u where lower(u.email) = v_email
             and (exists (select 1 from candidate_job_actions a where a.job_id = p_job and a.candidate_id = u.id and a.action = 'interest')
                  or exists (select 1 from matches m where m.job_id = p_job and m.candidate_id = u.id))) then return 'ya_postulaste'; end if;
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
    perform notify_users(array(select unnest(company_staff(j.company_id, array['owner', 'admin', 'recruiter']))),
      'public_apply', 'Nueva postulación para «' || j.title || '»', v_name || ' postuló desde tu página de empleos.', '/vacantes/' || p_job || '/proceso', false);
  end if;
  return 'ok';
end $function$;
