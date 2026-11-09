-- Migración aplicada en Supabase (20261109044836). Exportada tal cual desde supabase_migrations.schema_migrations.

create or replace function role_fit(cf text, cr text[], cl int, jf text, jr text[], jl int) returns int
language sql immutable set search_path = public as $$
  select case
    when cf is null or jf is null then null
    -- misma familia, o afinidad reconocida por ambos lados
    when not (cf = jf or (jf = any(coalesce(cr,'{}')) and cf = any(coalesce(jr,'{}')))) then -1
    when cl is not null and jl is not null and abs(cl - jl) > 1 then -1
    else (case when cf = jf then 3 else 1 end) + (case when cl = jl then 2 when cl is null or jl is null then 0 else 1 end)
  end
$$;
