-- «Solicitar demo» se registra con su propio motivo (demo) en vez de «Otra consulta», y el aviso a VINKA lo dice.
-- No modifica solicitudes existentes. El formulario de cotización completo sigue igual.
create schema if not exists backup;
create table if not exists backup.fn_submit_quote_20261124 as select now() saved_at, pg_get_functiondef('public.submit_quote(jsonb)'::regprocedure) def;
revoke all on backup.fn_submit_quote_20261124 from public, anon, authenticated;
alter table public.quote_requests drop constraint if exists quote_reason_check;
alter table public.quote_requests add constraint quote_reason_check check (reason = any (array['plan', 'demo', 'consultora', 'volumen', 'otro']));

create or replace function public.submit_quote(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_email text := lower(trim(coalesce(p->>'email', ''))); v_rut text := upper(regexp_replace(coalesce(p->>'rut', ''), '[^0-9kK-]', '', 'g'));
begin
  if coalesce(trim(p->>'company_name'), '') = '' or coalesce(trim(p->>'contact_name'), '') = '' then raise exception 'Indica el nombre de la empresa y tu nombre'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Revisa el correo'; end if;
  if v_rut <> '' and not rut_valid(v_rut) then raise exception 'RUT no válido (ej.: 76.123.456-7)'; end if;
  if coalesce(p->>'reason', 'plan') not in ('plan', 'demo', 'consultora', 'volumen', 'otro') then raise exception 'Motivo no válido'; end if;
  if not coalesce((p->>'consent')::boolean, false) then raise exception 'Para responderte necesitamos tu autorización para usar estos datos'; end if;
  if (select count(*) from quote_requests where email = v_email and created_at > now() - interval '1 day') >= 3 then raise exception 'Ya recibimos tu solicitud. Te responderemos pronto.'; end if;
  if (select count(*) from quote_requests where created_at > now() - interval '1 hour') >= 60 then raise exception 'Estamos recibiendo muchas solicitudes. Intenta en unos minutos.'; end if;
  insert into quote_requests (reason, plan_id, company_name, rut, contact_name, contact_role, email, phone, company_size, open_jobs, hires_year, regions, message, path)
  values (coalesce(p->>'reason', 'plan'), nullif(p->>'plan_id', ''), left(trim(p->>'company_name'), 160), v_rut, left(trim(p->>'contact_name'), 120), left(coalesce(trim(p->>'contact_role'), ''), 120),
    v_email, left(coalesce(trim(p->>'phone'), ''), 30), left(coalesce(p->>'company_size', ''), 40),
    nullif(regexp_replace(coalesce(p->>'open_jobs', ''), '\D', '', 'g'), '')::int, nullif(regexp_replace(coalesce(p->>'hires_year', ''), '\D', '', 'g'), '')::int,
    left(coalesce(p->>'regions', ''), 300), left(coalesce(trim(p->>'message'), ''), 2000), left(coalesce(p->>'path', ''), 200))
  returning id into v_id;
  perform notify_users(array(select user_id from admins), 'plan', case when p->>'reason' = 'demo' then 'Nueva solicitud de demo' else 'Nueva solicitud de cotización' end,
    left(trim(p->>'company_name'), 80) || ' · ' || coalesce(nullif(p->>'plan_id', ''), p->>'reason') || ' · ' || coalesce(nullif(p->>'open_jobs', ''), '?') || ' vacantes a la vez.', '/', true);
  return v_id;
end $function$;
