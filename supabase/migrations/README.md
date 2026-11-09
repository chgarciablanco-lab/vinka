# Migraciones

Esta carpeta contiene **todas** las migraciones aplicadas en el proyecto Supabase `jifhlhbntcfnvmcpbexo`, con el mismo número y nombre que figuran en `supabase_migrations.schema_migrations`. El texto se exportó tal cual desde la base el 9 de noviembre de 2026, así que aplicadas en orden reconstruyen el esquema actual.

Reglas:

- Cada cambio nuevo se aplica con un nombre descriptivo y se guarda aquí con el número que asigne Supabase.
- Antes de un cambio estructural se copian las tablas afectadas al esquema `backup` (no expuesto por la API).
- Nunca se guardan claves en estos archivos. En `20261106134800_match_notifications.sql` las claves de avisos al teléfono están reemplazadas por `<SECRETO…>`; los valores reales viven solo en la base. Para un entorno nuevo hay que generar claves nuevas.
- Los datos de demostración no son migraciones: ver `supabase/seed/DEMO.md`.
- La prueba completa de la base está en `supabase/tests/matriz.sql`.

Para comprobar que la carpeta coincide con la base:

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```
