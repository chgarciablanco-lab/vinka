-- Publicar exige título (mín. 4 caracteres) y descripción del cargo (mín. 30). Se cierran las dos vacantes de prueba «G» de Nova Retail.
create table if not exists backup.jobs_g_20261111 as select * from public.jobs where id in ('1fe53df2-9a8e-4e25-844c-b00a31e320d6', '8fc38de1-00a7-497b-93b6-fa355296308c');

do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.job_guard'::regproc);
  n := replace(d, 'if new.status = ''published'' and (tg_op = ''INSERT'' or old.status is distinct from ''published'') then
    if not exists',
    'if new.status = ''published'' and (tg_op = ''INSERT'' or old.status is distinct from ''published'') then
    if char_length(btrim(coalesce(new.title, ''''))) < 4 then raise exception ''Para publicar, escribe el nombre del cargo (al menos 4 caracteres).''; end if;
    if char_length(btrim(coalesce(new.description, ''''))) < 30 then raise exception ''Para publicar, describe el cargo: funciones, horario o beneficios (al menos 30 caracteres).''; end if;
    if not exists');
  if n = d then raise exception 'job_guard'; end if; execute n;
end $mig$;

update public.jobs set status = 'closed' where id in ('1fe53df2-9a8e-4e25-844c-b00a31e320d6', '8fc38de1-00a7-497b-93b6-fa355296308c') and title = 'G' and status = 'published';
