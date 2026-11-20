-- Privacidad de colaboradores: un asesor invitado a una vacante no recibe contacto, notas, evaluaciones,
-- etiquetas, IA ni oferta del postulante; el equipo de la empresa sigue recibiendo todo. Todo se deshace al final.
begin;
do $t$
declare
  paula uuid; m record; member uuid; d_team jsonb; d_col jsonb; out text := '';
begin
  -- un proceso cualquiera con equipo en la empresa
  select x.* into m from matches x where exists (select 1 from company_members cm where cm.company_id = x.company_id) limit 1;
  select user_id into member from company_members where company_id = m.company_id limit 1;
  -- una asesora activa que no pertenece a esa empresa
  select a.user_id into paula from advisors a where a.active and not exists (select 1 from company_members cm where cm.user_id = a.user_id and cm.company_id = m.company_id) limit 1;
  update matches set contact_shared = true where id = m.id;
  update profiles set phone = '+56 9 1111 2222' where id = m.candidate_id;
  insert into candidate_notes (job_id, candidate_id, company_id, author_id, body) values (m.job_id, m.candidate_id, m.company_id, member, 'Nota interna de prueba');
  insert into evaluations (company_id, job_id, candidate_id, author_id, scores, overall, recommendation, note) values (m.company_id, m.job_id, m.candidate_id, member, '{}'::jsonb, 4, 'si', 'Evaluación interna de prueba');
  insert into candidate_tags (company_id, subject_id, tag) values (m.company_id, m.candidate_id, 'etiqueta-prueba') on conflict do nothing;
  insert into job_collaborators (job_id, user_id, invited_by) values (m.job_id, paula, member) on conflict do nothing;

  -- equipo de la empresa
  perform set_config('request.jwt.claims', json_build_object('sub', member, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  d_team := subject_detail(m.job_id, m.candidate_id);
  -- colaboradora invitada
  perform set_config('request.jwt.claims', json_build_object('sub', paula, 'role', 'authenticated')::text, true);
  d_col := subject_detail(m.job_id, m.candidate_id);
  execute 'reset role';

  out := out || E'\n1 equipo ve teléfono: ' || ((d_team->'candidate'->>'phone') is not null);
  out := out || E'\n2 equipo ve notas internas: ' || (jsonb_array_length(d_team->'notes') > 0);
  out := out || E'\n3 equipo ve etiquetas: ' || (jsonb_array_length(d_team->'tags') > 0);
  out := out || E'\n3b equipo ve evaluaciones: ' || (jsonb_array_length(d_team->'evaluations') > 0);
  out := out || E'\n4 colaboradora NO ve teléfono: ' || not (d_col->'candidate' ? 'phone');
  out := out || E'\n5 colaboradora NO ve correo: ' || not (d_col->'candidate' ? 'email');
  out := out || E'\n6 colaboradora NO ve notas internas: ' || (jsonb_array_length(d_col->'notes') = 0);
  out := out || E'\n7 colaboradora NO ve evaluaciones: ' || (jsonb_array_length(d_col->'evaluations') = 0);
  out := out || E'\n8 colaboradora NO ve etiquetas: ' || (jsonb_array_length(d_col->'tags') = 0);
  out := out || E'\n9 colaboradora NO ve oferta ni IA: ' || ((d_col->'offer') = 'null'::jsonb and d_col->'ai' = '{}'::jsonb);
  out := out || E'\n10 colaboradora sí ve perfil laboral y etapa: ' || ((d_col->'candidate'->>'headline') is not distinct from (d_team->'candidate'->>'headline') and d_col->'match'->>'stage' = d_team->'match'->>'stage');
  out := out || E'\n11 colaboradora no puede gestionar: ' || ((d_col->>'can_manage')::boolean = false);
  out := out || E'\n12 vista marcada como reducida: ' || coalesce((d_col->>'collab_view')::boolean, false);
  -- 13: alguien sin relación con la vacante sigue sin acceso
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from candidate_profiles where user_id <> m.candidate_id limit 1), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform subject_detail(m.job_id, m.candidate_id); out := out || E'\n13 ajeno sin acceso: false';
  exception when others then out := out || E'\n13 ajeno sin acceso: true';
  end;
  execute 'reset role';
  raise notice '%', out;
end $t$;
rollback;
