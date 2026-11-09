-- Prueba de aislamiento entre empresas y de permisos por rol. No modifica datos (todo termina en rollback).
-- Ejecutar en el SQL Editor de Supabase o con la herramienta execute_sql; cada columna debe salir en true.
begin;
-- elegir una empresa A con reclutador y lector, y otra empresa B con datos internos
select set_config('t.a', (select cm.company_id::text from company_members cm group by cm.company_id
  having count(*) filter (where cm.role = 'viewer') > 0 and count(*) filter (where cm.role in ('recruiter','admin')) > 0
     and exists (select 1 from matches m where m.company_id = cm.company_id) limit 1), true);
select set_config('t.rec', (select user_id::text from company_members where company_id = current_setting('t.a')::uuid and role in ('recruiter','admin') limit 1), true);
select set_config('t.viewer', (select user_id::text from company_members where company_id = current_setting('t.a')::uuid and role = 'viewer' limit 1), true);
select set_config('t.b', (select e.company_id::text from evaluations e where e.company_id <> current_setting('t.a')::uuid limit 1), true);
select set_config('t.bjob', (select id::text from jobs where company_id = current_setting('t.b')::uuid limit 1), true);
select set_config('t.match', (select id::text from matches where company_id = current_setting('t.a')::uuid limit 1), true);
select set_config('t.cand', (select candidate_id::text from matches where id = current_setting('t.match')::uuid), true);
select set_config('t.ajob', (select job_id::text from matches where id = current_setting('t.match')::uuid), true);
select set_config('t.bcand', (select candidate_id::text from matches where company_id = current_setting('t.b')::uuid limit 1), true);

-- 1) lector de A intenta mover a alguien de etapa
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.viewer'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform pipeline_move('match', current_setting('t.cand')::uuid, current_setting('t.ajob')::uuid, 'contacto');
  perform set_config('t.viewer_blocked', 'false', true);
exception when others then perform set_config('t.viewer_blocked', 'true', true); end $$;

-- 2) reclutador de A intenta ver la ficha de un candidato de B
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.rec'), 'role', 'authenticated')::text, true);
do $$ begin
  perform subject_detail(current_setting('t.bjob')::uuid, current_setting('t.bcand')::uuid);
  perform set_config('t.detail_blocked', 'false', true);
exception when others then perform set_config('t.detail_blocked', 'true', true); end $$;

select
  current_setting('t.viewer_blocked')::boolean as lector_no_puede_mover,
  current_setting('t.detail_blocked')::boolean as no_ve_ficha_de_otra_empresa,
  (select count(*) = 0 from evaluations where company_id = current_setting('t.b')::uuid) as evaluaciones_aisladas,
  (select count(*) = 0 from candidate_notes where company_id = current_setting('t.b')::uuid) as notas_aisladas,
  (select count(*) = 0 from external_applicants where company_id = current_setting('t.b')::uuid) as externos_aislados,
  (select count(*) = 0 from offers where company_id = current_setting('t.b')::uuid) as ofertas_aisladas,
  (select count(*) = 0 from matches where company_id = current_setting('t.b')::uuid) as matches_aislados,
  (select count(*) = 0 from message_templates where company_id = current_setting('t.b')::uuid) as plantillas_aisladas,
  (select count(*) = 0 from pipeline_events where company_id = current_setting('t.b')::uuid) as historial_aislado,
  (select count(*) = 0 from client_errors) as errores_solo_admin,
  (select count(*) > 0 from matches where company_id = current_setting('t.a')::uuid) as ve_lo_propio;
rollback;
