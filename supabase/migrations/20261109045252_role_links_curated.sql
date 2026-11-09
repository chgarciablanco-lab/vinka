-- Migración aplicada en Supabase (20261109045252). Exportada tal cual desde supabase_migrations.schema_migrations.

-- Afinidades entre tipos de cargo definidas a mano (solo funciones realmente parecidas)
create table if not exists role_family_links (a text not null, b text not null, primary key (a, b));
alter table role_family_links enable row level security;
truncate role_family_links;
insert into role_family_links (a, b) values
  ('ventas_tienda','cajero'),            -- vender y cobrar en el mismo local
  ('ventas_tienda','gestion_tienda'),    -- carrera natural en retail (el nivel filtra)
  ('bodega_logistica','maquinaria'),     -- grúa horquilla en bodega
  ('bodega_logistica','produccion'),     -- operarios de planta y bodega
  ('produccion','agro'),                 -- packing y agroindustria
  ('construccion_oficios','construccion_gestion'),
  ('mantencion','maquinaria'),
  ('administracion','recepcion_secretaria'),
  ('administracion','contabilidad'),
  ('contabilidad','finanzas'),
  ('desarrollo_software','soporte_ti'),
  ('salud_tecnico','salud_profesional'),
  ('turismo_hoteleria','recepcion_secretaria');
insert into role_family_links (a, b) select b, a from role_family_links on conflict do nothing;

create or replace function role_fit(cf text, cr text[], cl int, jf text, jr text[], jl int) returns int
language sql stable set search_path = public as $$
  select case
    when cf is null or jf is null then null
    when not (cf = jf or exists (select 1 from role_family_links where a = cf and b = jf)) then -1
    when cl is not null and jl is not null and abs(cl - jl) > 1 then -1
    else (case when cf = jf then 3 else 1 end) + (case when cl = jl then 2 when cl is null or jl is null then 0 else 1 end)
  end
$$;
revoke execute on function role_fit(text,text[],int,text,text[],int) from public, anon;

-- Reclasificar lo que quedó como "atención al cliente" o "turismo" con las definiciones nuevas
update jobs set role_family = null where role_family in ('atencion_cliente','turismo_hoteleria');
update candidate_profiles set role_family = null where role_family in ('atencion_cliente','turismo_hoteleria');
