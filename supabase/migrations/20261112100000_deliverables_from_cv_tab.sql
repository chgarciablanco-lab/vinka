-- Asesorías: el CV mejorado en Word y en PDF cuenta tanto si se subió en la pestaña «CV» (versión mejorada
-- registrada para esta asesoría) como si se envió por el chat. Antes solo contaba el chat y los asesores usan la pestaña CV.
create schema if not exists backup;
create table if not exists backup.fn_service_progress_20261112b as
  select now() as saved_at, pg_get_functiondef('public.service_progress(uuid)'::regprocedure) as def;

do $m$
declare d text := pg_get_functiondef('public.service_progress(uuid)'::regprocedure); n text;
begin
  n := replace(d,
$o$    select count(*) into v from service_messages where request_id = p_id and file_path is not null and sender_kind in ('advisor', 'admin')
      and lower(coalesce(nullif(file_name, ''), file_path)) ~ '\.(docx|doc)$';
    out := out || jsonb_build_object('key', 'advisor_files_word', 'label', 'CV mejorado en Word enviado por el chat', 'need', (q->>'advisor_files')::int, 'have', v);
    select count(*) into v from service_messages where request_id = p_id and file_path is not null and sender_kind in ('advisor', 'admin')
      and lower(coalesce(nullif(file_name, ''), file_path)) ~ '\.pdf$';
    out := out || jsonb_build_object('key', 'advisor_files_pdf', 'label', 'CV mejorado en PDF enviado por el chat', 'need', (q->>'advisor_files')::int, 'have', v);$o$,
$n$    select count(*) into v from (
        select file_name, file_path from service_messages where request_id = p_id and file_path is not null and sender_kind in ('advisor', 'admin')
        union all
        select file_name, file_path from cv_files where request_id = p_id and kind = 'mejorado'
      ) f where lower(coalesce(nullif(f.file_name, ''), f.file_path)) ~ '\.(docx|doc)$';
    out := out || jsonb_build_object('key', 'advisor_files_word', 'label', 'CV mejorado en Word', 'need', (q->>'advisor_files')::int, 'have', v);
    select count(*) into v from (
        select file_name, file_path from service_messages where request_id = p_id and file_path is not null and sender_kind in ('advisor', 'admin')
        union all
        select file_name, file_path from cv_files where request_id = p_id and kind = 'mejorado'
      ) f where lower(coalesce(nullif(f.file_name, ''), f.file_path)) ~ '\.pdf$';
    out := out || jsonb_build_object('key', 'advisor_files_pdf', 'label', 'CV mejorado en PDF', 'need', (q->>'advisor_files')::int, 'have', v);$n$);
  if n = d then raise exception 'service_progress: no se encontró el bloque del CV en Word y PDF'; end if;
  execute n;
end $m$;
