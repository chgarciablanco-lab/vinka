-- Migración aplicada en Supabase (20261107044528). Exportada tal cual desde supabase_migrations.schema_migrations.

alter table company_members drop constraint if exists company_members_role_check;
