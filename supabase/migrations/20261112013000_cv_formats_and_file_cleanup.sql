-- 1) Asesorías: «CV mejorado en Word y PDF» se exige como dos archivos (uno Word, uno PDF), no «cualquier archivo».
--    Hoy no hay archivos en asesorías, así que no cambia el estado de ninguna asesoría existente.
create schema if not exists backup;
create table if not exists backup.fn_service_progress_20261112 as
  select now() as saved_at, pg_get_functiondef('public.service_progress(uuid)'::regprocedure) as def;

do $m$
declare d text := pg_get_functiondef('public.service_progress(uuid)'::regprocedure); n text;
begin
  n := replace(d,
$o$    select count(*) into v from service_messages where request_id = p_id and file_path is not null and sender_kind in ('advisor', 'admin');
    out := out || jsonb_build_object('key', 'advisor_files', 'label', 'CV mejorado enviado por el chat', 'need', (q->>'advisor_files')::int, 'have', v);$o$,
$n$    select count(*) into v from service_messages where request_id = p_id and file_path is not null and sender_kind in ('advisor', 'admin')
      and lower(coalesce(nullif(file_name, ''), file_path)) ~ '\.(docx|doc)$';
    out := out || jsonb_build_object('key', 'advisor_files_word', 'label', 'CV mejorado en Word enviado por el chat', 'need', (q->>'advisor_files')::int, 'have', v);
    select count(*) into v from service_messages where request_id = p_id and file_path is not null and sender_kind in ('advisor', 'admin')
      and lower(coalesce(nullif(file_name, ''), file_path)) ~ '\.pdf$';
    out := out || jsonb_build_object('key', 'advisor_files_pdf', 'label', 'CV mejorado en PDF enviado por el chat', 'need', (q->>'advisor_files')::int, 'have', v);$n$);
  if n = d then raise exception 'service_progress: no se encontró el bloque advisor_files'; end if;
  execute n;
end $m$;

-- 2) Archivos sin dueño: subidos pero nunca registrados (o reemplazados) en la base.
--    La base no puede borrar archivos físicos; los borra la función «cleanup-files» con la API de Storage.
create or replace function public.orphan_storage_objects(p_min_age interval default interval '24 hours', p_limit int default 500)
returns table (bucket text, path text, size bigint, created_at timestamptz)
language sql stable security definer set search_path = public, storage as $$
  with ref as (
    select 'videos'::text b, video_path p from public.candidate_profiles where video_path is not null
    union all select 'cvs', file_path from public.cv_files where file_path is not null
    union all select 'logos', logo_path from public.companies where logo_path is not null
    union all select 'company-photos', x->>'path' from public.companies, jsonb_array_elements(coalesce(photos, '[]'::jsonb)) x
    union all select 'asesorias', file_path from public.service_messages where file_path is not null)
  select o.bucket_id, o.name, (o.metadata->>'size')::bigint, o.created_at
  from storage.objects o
  where o.bucket_id in ('videos', 'cvs', 'logos', 'company-photos', 'asesorias')
    and o.created_at < now() - p_min_age
    and o.name not like '%.emptyFolderPlaceholder'
    and not exists (select 1 from ref r where r.b = o.bucket_id and r.p = o.name)
  order by o.created_at
  limit greatest(1, least(p_limit, 1000));
$$;
revoke execute on function public.orphan_storage_objects(interval, int) from public, anon, authenticated;
grant execute on function public.orphan_storage_objects(interval, int) to service_role;

-- Llamada diaria (04:20 Chile aprox.) a la función que borra los archivos sin dueño de más de 24 horas
create or replace function public.request_file_cleanup() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare cfg jsonb := (select jsonb_object_agg(key, value) from private.config);
begin
  perform net.http_post(url := replace(cfg->>'notify_url', 'notify-match', 'cleanup-files'), body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', cfg->>'notify_secret'));
end $$;
revoke execute on function public.request_file_cleanup() from public, anon, authenticated;

select cron.unschedule('vinka-limpieza-archivos') where exists (select 1 from cron.job where jobname = 'vinka-limpieza-archivos');
select cron.schedule('vinka-limpieza-archivos', '20 7 * * *', 'select public.request_file_cleanup()');
