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

### Asesorías con reclutador (simulación de 2 años, desde nov. 2024)

| Qué | Cantidad aprox. |
|---|---|
| Asesores | 6 (5 de demostración + asesor.test; Matías suspendido en abril 2026) |
| Solicitudes de asesoría | 430 (313 aprobadas, 75 canceladas, el resto en curso o por revisar) |
| Mensajes del chat de asesoría | ~3.600 |
| Registros de historial de trabajo | ~4.800 |
| Sesiones (calendario) | ~415 (≈15 próximas) |
| Ofertas sugeridas | ~1.100 |
| Notas internas asesor ↔ VINKA | ~280 |
| CV guardados (PDF reales, originales y mejorados) | 500 |

- Precios históricos: hasta junio 2025 $12.990 / $19.990 / $29.990; desde julio 2025 los actuales.
- Solicitudes registradas en `seed.advisory`; asesores en `seed.advisors` y `seed.users`.

- Todas las cuentas usan correos `@example.com` (VINKA nunca les envía correos) y la contraseña `Prueba2026`.
- Las cuentas demo están marcadas con `"demo": true` en `raw_app_meta_data` y registradas en `seed.users` y `seed.companies`.
- Catálogos usados (cargos, nombres, comunas, tipos de empresa): tablas del esquema `seed`.

## Borrar todos los datos demo (antes de abrir a usuarios reales)

Ejecutar en el SQL Editor de Supabase:

```sql
delete from storage.objects where bucket_id = 'cvs' and split_part(name, '/', 1)::uuid in (select id from seed.users);
delete from service_requests where id in (select request_id from seed.advisory);
delete from companies where id in (select id from seed.companies);
delete from auth.users where id in (select id from seed.users);
drop schema seed cascade;
```


## Destacados simulados (2 años)

703 destacados de demostración (ofertas de las 60 empresas demo y perfiles de personas demo), con sus pagos y estadísticas diarias. Incluye 11 ofertas y 26 perfiles vigentes hoy y 5 solicitudes por activar. Sus ids están en `seed.promotions`.

Para borrarlos (antes del resto de la limpieza):

```sql
delete from payments where promotion_id in (select id from seed.promotions);
delete from promotions where id in (select id from seed.promotions);
drop table seed.promotions;
```
