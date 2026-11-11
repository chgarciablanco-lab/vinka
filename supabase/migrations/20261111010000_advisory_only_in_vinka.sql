-- Asesorías: todo por VINKA. Se elimina el WhatsApp oficial y la preferencia de contacto externo (WhatsApp/correo/videollamada):
-- la coordinación del pago, la asesoría y el seguimiento ocurren en el chat de la asesoría.
create table if not exists backup.career_services_20261110 as select * from public.career_services;
create table if not exists backup.app_settings_20261110 as select * from public.app_settings;
create table if not exists backup.service_requests_20261110 as select * from public.service_requests;

update public.career_services
set includes = array_replace(includes, 'Seguimiento por WhatsApp durante 2 semanas con tu asesor/a, desde el WhatsApp oficial de VINKA',
                             'Seguimiento de 2 semanas con tu asesor/a por el chat de VINKA')
where id = 'completa';
do $mig$ begin
  if exists (select 1 from career_services, unnest(includes) i where i ilike '%whatsapp%') then raise exception 'Quedó WhatsApp en los servicios'; end if;
end $mig$;

delete from public.app_settings where key = 'whatsapp_vinka';

alter table public.service_requests drop constraint if exists service_requests_contact_pref_check;
alter table public.service_requests add constraint service_requests_contact_pref_check check (contact_pref in ('chat', 'whatsapp', 'correo', 'videollamada'));
alter table public.service_requests alter column contact_pref set default 'chat';

create or replace function public.service_welcome_text(r service_requests) returns text
language sql stable security definer set search_path to 'public' as $function$
  select 'Hola ' || coalesce(nullif(p.first_name, ''), '') || ', confirmamos el pago de tu «' || r.service_name || '». '
    || 'Tu asesor/a' || coalesce(' ' || nullif(r.assigned_name, ''), '') || ' te escribirá por este chat dentro de 1 día hábil para coordinar los próximos pasos. '
    || coalesce('Plazo del servicio: ' || nullif(cs.delivery, '') || '. ', '')
    || 'Toda la asesoría (mensajes, archivos, sesiones y seguimiento) ocurre aquí, dentro de VINKA. Si tienes dudas, puedes escribir cuando quieras. — Mensaje automático de VINKA'
  from profiles p left join career_services cs on cs.id = r.service_id where p.id = r.candidate_id
$function$;

do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.service_progress'::regproc);
  n := replace(d, '''Seguimientos registrados (WhatsApp o chat)''', '''Seguimientos registrados en el chat''');
  if n = d then raise exception 'service_progress'; end if; execute n;

  d := pg_get_functiondef('public.request_career_service'::regproc);
  n := replace(d, 'if p_contact not in (''whatsapp'', ''correo'', ''videollamada'') then raise exception ''Elige cómo prefieres que te contactemos''; end if;', '');
  n := replace(n, 'left(coalesce(trim(p_goal), ''''), 1000), p_contact)', 'left(coalesce(trim(p_goal), ''''), 1000), ''chat'')');
  n := replace(n, '''Un reclutador de VINKA te contactará por '' || case p_contact when ''whatsapp'' then ''WhatsApp'' when ''correo'' then ''correo'' else ''videollamada'' end || '' para coordinar el pago y empezar.''',
                  '''VINKA te escribirá por el chat de tu asesoría, dentro de la app, para coordinar el pago y empezar.''');
  if position('''chat'')' in n) = 0 or position('whatsapp' in lower(n)) > 0 then raise exception 'request_career_service'; end if; execute n;
end $mig$;
