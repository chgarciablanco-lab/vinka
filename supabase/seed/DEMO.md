# Datos de demostración (simulación de ~3 años de uso)

Generados el 9 de noviembre de 2026 directamente en la base de Supabase. Todo es ficticio.

| Qué | Cantidad aprox. |
|---|---|
| Postulantes | 1.200 |
| Empresas | 60 (57 verificadas, 3 en revisión) |
| Personas de equipos de empresas | 158 |
| Vacantes | ~940 (desde dic. 2023; ~100 abiertas hoy) |
| Postulaciones / acciones de postulantes | ~9.100 |
| Matches | ~2.750 (≈465 contrataciones) |
| Mensajes de chat | ~12.600 |
| Entrevistas | ~1.200 (≈100 próximas) |
| Cartas oferta | ~530 |
| Evaluaciones / notas internas | ~1.300 / ~600 |
| Postulantes de otros portales | ~790 |

- Todas las cuentas usan correos `@example.com` (VINKA nunca les envía correos) y la contraseña `Prueba2026`.
- Las cuentas demo están marcadas con `"demo": true` en `raw_app_meta_data` y registradas en `seed.users` y `seed.companies`.
- Catálogos usados (cargos, nombres, comunas, tipos de empresa): tablas del esquema `seed`.

## Borrar todos los datos demo (antes de abrir a usuarios reales)

Ejecutar en el SQL Editor de Supabase:

```sql
delete from companies where id in (select id from seed.companies);
delete from auth.users where id in (select id from seed.users);
drop schema seed cascade;
```
