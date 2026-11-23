# Pruebas de VINKA

Tres niveles, todos repetibles:

| Nivel | Qué prueba | Cómo se ejecuta |
|---|---|---|
| Unitarias (`src/test`) | RUT, fechas y reglas de lógica | `npm test` |
| Base de datos (`tests/sql`) | Permisos, aislamiento y reglas de negocio con **usuarios reales de prueba** | Pegar cada archivo en el editor SQL de Supabase |
| Pantallas (`tests/ui`) | Recorridos de cada rol, accesibilidad y diseño en 4 tamaños, con **datos simulados** | `npm run build`, `npx vite preview --port 4173` y luego `node tests/ui/run.cjs` |

## Base de datos (`tests/sql`)

Cada archivo es un bloque `do $t$ … $t$` que actúa como un usuario real de prueba (`camila.test`, `diego.test`, `nova.test`, `agro.test`, `asesor.test`, `admin.test`, `carolina.asesora`, todos `@example.com`) y **termina siempre con un error a propósito** (`RAISE EXCEPTION 'RESULTADO …'`): así Postgres deshace todo y no queda ningún cambio. El texto del error es el resultado; `✓` es correcto y `✗` es falla.

| Archivo | Qué comprueba |
|---|---|
| `01_aislamiento.sql` | 56 intentos de leer o cambiar datos ajenos (postulante, empresa y asesora) |
| `02_barrido_funciones.sql` | Todas las funciones con privilegios, llamadas por un usuario ajeno con datos de terceros |
| `03_asignacion_asesores.sql` | Elección del asesor, consentimiento, propuestas, excepciones y cupos |
| `04_valoraciones.sql` | Valoraciones verificadas, respuesta, denuncia y moderación |
| `05_pagos_demo.sql` | Pago demo: rechazos, doble cobro, planes, destacados y comprobantes |
| `06_traspaso_y_pago_con_eleccion.sql` | Traspaso de empresa (F02) y pago que respeta al asesor elegido (C01) |
| `07_correcciones_auditoria.sql` | Pagos demo fuera de ventas reales, editar perfil y corregir nombre |
| `08_privacidad_colaboradores.sql` | Un asesor colaborador no recibe contacto, notas, evaluaciones, etiquetas, IA ni oferta; el equipo sí. Usa cualquier proceso existente y se deshace con `rollback` |
| `09_colaboracion_asesores.sql` | Captación por estados y plazos, roles, autorización revocable, propuestas, vacantes abiertas a la red, ficha de atribución, confirmación automática y verificación automática: 30 verificaciones, incluida una llamada ajena a 31 funciones. Crea sus propios usuarios y se deshace con `rollback` |
| `10_informes_ia.sql` | Informes psicolaborales con IA: quién crea, ve y edita; archivos privados; autorización obligatoria; límite mensual por plan y cupo devuelto si la IA falla; cierre y limpieza de archivos (los reportes de test se conservan para el anexo); comparativo: requisitos, cupo, permisos y notas internas excluidas (16 verificaciones). Se deshace con `rollback` |
| `11_test_disc.sql` | Test DISC VINKA: enlace sin cuenta, respuestas válidas, puntaje, integridad (otro dispositivo, tiempos), enlace renovado o anulado, quién ve el resultado, límite mensual del reporte y uso en el informe (10 verificaciones). Se deshace con `rollback` |
| `12_primeros_pasos.sql` | Primeros pasos guiados: pasos según el rol (postulante, empresa dueña o reclutador, asesor) calculados con los datos de la cuenta, otra empresa y sin sesión bloqueados, pasos de «visitar», ocultar, mostrar y recorrido solo de la propia cuenta (5 verificaciones). Se deshace con `rollback` |

Usan identificadores de las cuentas y solicitudes de prueba actuales; si se borran o cambian esos datos, hay que actualizar los identificadores al inicio de cada archivo.

## Pantallas (`tests/ui`)

Requieren Playwright con Chromium y `axe-core` (`npm i -D playwright axe-core && npx playwright install chromium`; no se agregan al proyecto para no hacer más pesada la publicación). Simulan las respuestas de Supabase, así que **no tocan datos reales** y prueban la interfaz, no el servidor. Las capturas quedan en `tests/ui/resultados/`.

## Lo que estas pruebas no cubren

- Recorridos en la app publicada con datos reales.
- iPhone y Android reales (teclado, cámara, avisos, instalación).
- Dos pagos exactamente simultáneos por el último cupo.
