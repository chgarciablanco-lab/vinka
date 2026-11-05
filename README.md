# VINKA

Marketplace laboral móvil para Chile. *Tu próximo match empieza aquí.*

App web pensada para el celular (se instala en la pantalla de inicio): React + Vite + Tailwind + Supabase, publicada en Vercel.

## Variables de entorno
Copiar `.env.example` a `.env` y completar con la URL y la clave publicable del proyecto Supabase `vinka` (sa-east-1).

## Desarrollo
```
npm install
npm run dev
```

## Reglas clave (aplicadas en la base de datos)
- Match solo con interés mutuo en la **misma vacante**.
- Empresas quedan pendientes hasta ser verificadas por administración; sus vacantes se publican al verificarse.
- Chat solo para participantes del match; bloqueo cierra la conversación.
- Teléfono y correo del candidato solo se muestran si él los comparte.
- Videos (máx. 15 s) en almacenamiento privado con enlaces temporales.
- RLS activo en todas las tablas.

## Pendiente
- Logo original (reemplazar `Logo` en `src/components/ui.jsx` y los íconos de `public/`).
- Textos legales revisados por abogado (Ley 21.719).
