-- Migración aplicada en Supabase (20261109174501). Exportada tal cual desde supabase_migrations.schema_migrations.

drop policy if exists "destacados: catálogo público" on public.promo_products;
create policy "destacados: catálogo público" on public.promo_products for select to anon using (active);
create policy "destacados: catálogo con sesión" on public.promo_products for select to authenticated using (active or (select is_admin()));
