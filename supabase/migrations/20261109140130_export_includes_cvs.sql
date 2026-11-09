-- Migración aplicada en Supabase (20261109140130). Exportada tal cual desde supabase_migrations.schema_migrations.

do $$
declare d text;
begin
  d := replace(pg_get_functiondef('public.export_my_data()'::regprocedure), '''asesorias'',',
    '''cv_guardados'', coalesce((select jsonb_agg(jsonb_build_object(''archivo'', f.file_name, ''tipo'', f.kind, ''version'', f.version, ''nota'', f.note, ''fecha'', f.created_at) order by f.version) from cv_files f where f.candidate_id = uid), ''[]''::jsonb),
    ''sesiones_asesoria'', coalesce((select jsonb_agg(jsonb_build_object(''inicio'', s.starts_at, ''modalidad'', s.mode, ''estado'', s.status, ''resumen'', s.summary)) from service_sessions s join service_requests r on r.id = s.request_id where r.candidate_id = uid), ''[]''::jsonb),
    ''ofertas_sugeridas'', coalesce((select jsonb_agg(jsonb_build_object(''cargo'', k.title, ''empresa'', k.company, ''estado'', k.status, ''fecha'', k.created_at)) from service_job_picks k join service_requests r on r.id = k.request_id where r.candidate_id = uid), ''[]''::jsonb),
    ''asesorias'',');
  execute d;
end $$;
