do $t$
declare
  rq uuid := '78afe749-4dd2-4c7e-87ae-58674f3ad058'; cand uuid := 'b3da4d3a-bfd5-4005-bfa7-b5c6f8bc11b7'; adv uuid := '5f54257e-01f8-4ad2-9a7e-7671f7a47380';
  other uuid := 'e6b460ca-0fe5-4b79-8b5e-26d346add349'; otheradv uuid := 'f48354d0-5e3a-4da5-9189-8271eb88a90b';
  adm uuid; open_rq uuid; open_cand uuid; j jsonb; rid uuid; out text := ''; ok boolean; nb int; na int;
begin
  select user_id into adm from admins limit 1;
  select id, candidate_id into open_rq, open_cand from service_requests where status = 'en_curso' and assigned_to is not null limit 1;
  -- trigger (como postgres)
  select count(*) into nb from notifications where user_id = open_cand;
  update service_requests set status = 'aprobada' where id = open_rq;
  select count(*) into na from notifications where user_id = open_cand and title = 'Valora tu asesoría';
  out := out || E'\n1 invitación al aprobar: ' || (na >= 1);
  update service_requests set status = 'en_curso' where id = open_rq;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', cand, 'role', 'authenticated')::text, true);
  begin perform review_submit(rq, 0, 5, 5, 5, 5, ''); out := out || E'\n2 estrellas inválidas: FALLA'; exception when others then out := out || E'\n2 estrellas inválidas bloqueadas: ' || sqlerrm; end;
  perform review_submit(rq, 5, 4, 5, 5, 4, '  Muy clara y puntual  ');
  out := out || E'\n3 valoración creada';
  begin perform review_submit(rq, 3, 3, 3, 3, 3, ''); out := out || E'\n4 doble: FALLA'; exception when others then out := out || E'\n4 doble bloqueada: ' || sqlerrm; end;
  j := my_reviews(); out := out || E'\n5 my_reviews: ' || (j->rq::text->>'overall');
  j := advisor_reviews_public(adv); out := out || E'\n6 públicas: ' || jsonb_array_length(j) || ' sin nombre: ' || not (j::text ilike '%example.com%' or j ? 'candidate');
  j := advisor_public_profile(adv); out := out || E'\n7 perfil público: ratings=' || (j->>'ratings') || ' rating=' || (j->>'rating') || ' puntualidad=' || (j->>'punctuality');
  begin perform admin_reviews(); out := out || E'\n8 candidato admin: FALLA'; exception when others then out := out || E'\n8 candidato no ve admin: ' || sqlerrm; end;
  begin perform 1 from advisor_reviews; out := out || E'\n9 lectura directa: FALLA'; exception when others then out := out || E'\n9 tabla cerrada: ' || sqlerrm; end;
  perform set_config('request.jwt.claims', json_build_object('sub', open_cand, 'role', 'authenticated')::text, true);
  begin perform review_submit(open_rq, 5, 5, 5, 5, 5, ''); out := out || E'\n10 en curso: FALLA'; exception when others then out := out || E'\n10 en curso bloqueada: ' || sqlerrm; end;
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  begin perform review_submit(rq, 5, 5, 5, 5, 5, ''); out := out || E'\n11 ajena: FALLA'; exception when others then out := out || E'\n11 ajena bloqueada: ' || sqlerrm; end;
  -- asesor
  perform set_config('request.jwt.claims', json_build_object('sub', adv, 'role', 'authenticated')::text, true);
  j := my_advisor_reviews(); rid := (j->'items'->0->>'id')::uuid; out := out || E'\n12 asesor ve: ' || jsonb_array_length(j->'items') || ' resumen=' || (j->'summary'->>'rating');
  perform review_reply(rid, 'Gracias por tu confianza');
  begin perform review_report(rid, 'corto'); out := out || E'\n13 denuncia corta: FALLA'; exception when others then out := out || E'\n13 denuncia corta bloqueada: ' || sqlerrm; end;
  perform review_report(rid, 'Menciona datos personales del postulante');
  j := advisor_reviews_public(adv); out := out || E'\n14 denunciada fuera de la lista pública: ' || (jsonb_array_length(j) = 0) || ' nota sigue: ' || (advisor_public_profile(adv)->>'ratings');
  perform set_config('request.jwt.claims', json_build_object('sub', otheradv, 'role', 'authenticated')::text, true);
  begin perform review_reply(rid, 'hola'); out := out || E'\n15 otro asesor: FALLA'; exception when others then out := out || E'\n15 otro asesor bloqueado: ' || sqlerrm; end;
  -- admin
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  j := admin_reviews(); out := out || E'\n16 admin ve primera reportada: ' || (j->'items'->0->>'status') || ' indicador=' || (j->'advisors'->adv::text->>'ratings');
  begin perform admin_review_moderate(rid, true, 'corto'); out := out || E'\n17 nota corta: FALLA'; exception when others then out := out || E'\n17 nota corta bloqueada: ' || sqlerrm; end;
  perform admin_review_moderate(rid, true, 'Contiene datos personales; se oculta.');
  out := out || E'\n18 oculta → card ratings=' || (advisor_public_profile(adv)->>'ratings');
  execute 'reset role';
  out := out || E'\n19 auditoría: ' || (select string_agg(action, ',' order by id) from audit_logs where entity_id in (rq, rid) and action like 'review%');
  raise exception 'ROLLBACK OK %', out;
end $t$;
