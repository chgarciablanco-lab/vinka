-- Migración aplicada en Supabase (20261109060037). Exportada tal cual desde supabase_migrations.schema_migrations.

do $$
declare p record; q text; c text; stmt text;
begin
  for p in select * from pg_policies where schemaname = 'public'
           and (qual ~ 'auth\.uid\(\)' or with_check ~ 'auth\.uid\(\)') loop
    q := regexp_replace(p.qual, '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'g');
    c := regexp_replace(p.with_check, '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'g');
    stmt := format('alter policy %I on public.%I', p.policyname, p.tablename);
    if q is not null then stmt := stmt || format(' using (%s)', q); end if;
    if c is not null then stmt := stmt || format(' with check (%s)', c); end if;
    execute stmt;
  end loop;
end $$;
