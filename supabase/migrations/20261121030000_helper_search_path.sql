-- Fija la ruta de búsqueda de 4 funciones auxiliares (aviso de seguridad de Supabase «function_search_path_mutable»).
-- No cambia lo que hacen ni toca datos.
alter function public.email_domain(text) set search_path = public;
alter function public.web_domain(text) set search_path = public;
alter function public.free_email_domain(text) set search_path = public;
alter function public.contribution_label(text) set search_path = public;
