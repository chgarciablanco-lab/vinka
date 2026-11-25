-- Entrevista reprogramada y oferta vencida: ATS (empresa) y Empleo (persona) deben ver el mismo estado. Datos propios; todo se deshace con rollback.
begin;
create function pg_temp.act(u uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.root() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('request.jwt.claims', '{}', true); end $$;
do $t$
declare own uuid := gen_random_uuid(); cand uuid := gen_random_uuid(); co uuid; job uuid; m uuid; s1 uuid; s2 uuid; s3 uuid; i1 uuid;
  ofr uuid; ofr2 uuid; a text; b text; msg text; n int; out text := ''; j jsonb;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (own, 'duena@reprog.test', '{"role":"company","first_name":"Olga","last_name":"Dueña"}'),
    (cand, 'ana@reprog.test', '{"first_name":"Ana","last_name":"Postula"}');
  insert into companies (owner_id, display_name, legal_name, rut, verification_status) values (own, 'Reprog SpA', 'Reprog SpA', '76.111.222-8', 'verified') returning id into co;
  insert into jobs (company_id, title, area, level, description, modality, schedule, contract, region, comuna, status)
    values (co, 'Vendedor/a', 'ventas', 'junior', 'Atención de clientes en sala de ventas y caja, jornada completa.', 'presencial', 'completa', 'indefinido', 'Maule', 'Talca', 'published') returning id into job;
  insert into matches (job_id, candidate_id, company_id, stage) values (job, cand, co, 'contacto') returning id into m;
  insert into interview_slots (company_id, job_id, starts_at, ends_at, mode) values
    (co, job, now() + interval '2 days', now() + interval '2 days 30 minutes', 'online'),
    (co, job, now() + interval '3 days', now() + interval '3 days 30 minutes', 'online'),
    (co, job, now() + interval '4 days', now() + interval '4 days 30 minutes', 'online');
  select id into s1 from interview_slots where company_id = co order by starts_at limit 1;
  select id into s2 from interview_slots where company_id = co order by starts_at offset 1 limit 1;
  select id into s3 from interview_slots where company_id = co order by starts_at offset 2 limit 1;

  -- 1) Agenda: la persona agenda y ambos lados ven la misma entrevista confirmada
  perform pg_temp.act(own); perform invite_to_schedule(m);
  perform pg_temp.act(cand); perform book_slot(s1, m);
  select string_agg(status || '@' || to_char(starts_at, 'DD HH24:MI'), ',' order by starts_at) into b from my_interviews() where match_id = m;
  perform pg_temp.act(own); select string_agg(status || '@' || to_char(starts_at, 'DD HH24:MI'), ',' order by starts_at) into a from my_interviews() where match_id = m;
  out := out || E'\n1 agendada: persona y empresa ven lo mismo (' || coalesce(b, '-') || '): ' || coalesce((a = b and b like 'confirmada@%'), false);

  -- 2) Reprogramar desde la empresa: cancela con motivo, vuelve a invitar y la persona elige otro horario
  perform pg_temp.root(); select id into i1 from interviews where match_id = m and status = 'confirmada';
  perform pg_temp.act(own); perform cancel_interview(i1, 'Cambio de turno, elige otro horario');
  perform pg_temp.act(cand);
  select string_agg(status || '/' || coalesce(cancelled_by, '') || '/' || cancel_reason, ',') into b from my_interviews() where match_id = m;
  select count(*) into n from available_slots(m) s where s.slot_id = s1;
  out := out || E'\n2 empresa cancela: la persona ve «cancelada por la empresa» con el motivo y ese horario ya no se ofrece: '
    || coalesce((b = 'cancelada/company/Cambio de turno, elige otro horario' and n = 0), false);
  perform pg_temp.act(own); perform invite_to_schedule(m);
  perform pg_temp.act(cand); perform book_slot(s2, m);
  select string_agg(status || '@' || to_char(starts_at, 'DD HH24:MI'), ',' order by starts_at) into b from my_interviews() where match_id = m;
  perform pg_temp.act(own); select string_agg(status || '@' || to_char(starts_at, 'DD HH24:MI'), ',' order by starts_at) into a from my_interviews() where match_id = m;
  perform pg_temp.root();
  out := out || E'\n2b reprogramada: ambos ven la cancelada y la nueva confirmada, en el mismo orden (' || coalesce(b, '-') || '); etapa entrevista: '
    || coalesce((a = b and b like 'cancelada@%,confirmada@%' and (select stage from matches where id = m) = 'entrevista'), false);

  -- 3) Reprogramar desde la persona: cancela, su horario vuelve a quedar libre y elige otro
  select id into i1 from interviews where match_id = m and status = 'confirmada';
  perform pg_temp.act(cand); perform cancel_interview(i1, 'Me salió un examen');
  begin perform book_slot(s3, m); msg := 'ok'; exception when others then msg := sqlerrm; end;
  perform pg_temp.act(own);
  select count(*) filter (where status = 'confirmada'), count(*) filter (where status = 'cancelada' and cancelled_by = 'candidate') into n, a from my_interviews() where match_id = m;
  perform pg_temp.root();
  out := out || E'\n3 persona cancela y reagenda: la empresa ve 1 confirmada y la cancelación de la persona; el horario cancelado vuelve a estar libre: '
    || coalesce((msg = 'ok' and n = 1 and a = '1' and (select status from interview_slots where id = s2) = 'open'), false) || ' (' || msg || ')';

  -- 4) Oferta enviada que vence sin respuesta
  perform pg_temp.act(own);
  ofr := send_offer(m, '{"position":"Vendedor/a","salary":700000,"contract":"indefinido","schedule":"completa","expires_on":"2030-01-01","letter":{"signer_name":"Olga Dueña","signer_title":"Gerenta"}}'::jsonb);
  perform pg_temp.root(); update offers set expires_on = (now() at time zone 'America/Santiago')::date - 1 where id = ofr;
  -- 4a) Aunque el proceso nocturno aún no corra, la persona no puede aceptarla
  perform pg_temp.act(cand); begin perform respond_offer(ofr, true, ''); msg := 'aceptó'; exception when others then msg := sqlerrm; end;
  out := out || E'\n4a vencida antes del proceso nocturno: la persona no puede aceptarla y ve un mensaje claro: ' || coalesce((msg like 'La oferta venció%'), false) || ' («' || msg || '»)';
  -- 4b) Proceso nocturno: ambos lados ven «vencida»; la empresa recibe aviso
  perform pg_temp.root(); perform expire_offers();
  perform pg_temp.act(cand); select status into b from offers where match_id = m order by created_at desc limit 1; j := offer_letter(ofr);
  perform pg_temp.act(own); select status into a from offers where match_id = m order by created_at desc limit 1;
  perform pg_temp.root();
  out := out || E'\n4b proceso nocturno: persona (chat y carta) y empresa ven «vencida» y la empresa recibe aviso: '
    || coalesce((a = 'vencida' and b = 'vencida' and j->'offer'->>'status' = 'vencida' and exists (select 1 from notifications where user_id = own and kind = 'offer_expired')), false);
  out := out || E'\n4c INFORMATIVO la persona recibe aviso de que su oferta venció: ' || case when exists (select 1 from notifications where user_id = cand and kind = 'offer_expired') then 'sí' else 'no' end
    || '; etapa del proceso tras vencer: ' || (select stage from matches where id = m);
  -- 4d) La empresa puede reenviar una oferta nueva y la persona la acepta
  perform pg_temp.act(own);
  ofr2 := send_offer(m, '{"position":"Vendedor/a","salary":720000,"contract":"indefinido","schedule":"completa","expires_on":"2030-01-01","letter":{"signer_name":"Olga Dueña","signer_title":"Gerenta"}}'::jsonb);
  perform pg_temp.act(cand); perform respond_offer(ofr2, true, 'Acepto');
  perform pg_temp.act(own); select status into a from offers where id = ofr2;
  perform pg_temp.root();
  out := out || E'\n4d reenviar tras vencer: la nueva oferta se acepta y el proceso queda contratado; la vencida se conserva: '
    || coalesce((a = 'aceptada' and (select stage from matches where id = m) = 'contratado' and (select status from offers where id = ofr) = 'vencida'), false);
  raise notice '%', out;
  if out ~ ': false' then raise exception 'PRUEBA FALLIDA:%', out; end if;
end $t$;
rollback;
