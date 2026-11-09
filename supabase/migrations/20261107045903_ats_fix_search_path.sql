-- Migración aplicada en Supabase (20261107045903). Exportada tal cual desde supabase_migrations.schema_migrations.

alter function public.knocked_out(jsonb, jsonb) set search_path = public;
alter function public.ext_to_col(text) set search_path = public;
alter function public.col_to_ext(text) set search_path = public;
alter function public.stage_rank(text) set search_path = public;
do $$ begin
  if exists (select 1 from pg_proc where proname = 'fmt_cl' and pronamespace = 'public'::regnamespace) then
    execute (select 'alter function public.fmt_cl(' || pg_get_function_identity_arguments(oid) || ') set search_path = public' from pg_proc where proname = 'fmt_cl' and pronamespace = 'public'::regnamespace limit 1);
  end if;
end $$;
