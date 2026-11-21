-- Seguridad: ruta de búsqueda fija en las dos funciones auxiliares de los informes (aviso del asesor de seguridad de Supabase).
-- No cambia su comportamiento: solo usan funciones del sistema.
alter function public.eval_folder(text) set search_path = public;
alter function public.report_month() set search_path = public;
