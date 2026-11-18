-- Barrido de las funciones con privilegios (SECURITY DEFINER) que puede llamar cualquier usuario con sesión.
-- Cada una se llama como un usuario AJENO pasando identificadores de datos de otra persona o empresa.
-- Se espera error o resultado vacío. Lo que devuelva datos queda marcado para revisión. Todo se deshace.
do $t$
declare
  f record; a text; args text[]; call text; ids uuid[]; i uuid; v text; n bigint; flagged text := ''; ok int := 0; errs int := 0; empty int := 0; skipped text := ''; actor record;
  foreign_ids jsonb := jsonb_build_object(
    'job', '641455e3-c454-447b-8869-893c572be82a', 'company', '189c6e85-2bc4-4c58-8e9f-722eb5a2a36a', 'match', 'ef3a9534-f1d1-4b0a-bc4c-bcb64944284a',
    'user', 'ac342631-5e57-41bb-a4ca-5b5bf2a11f17', 'offer', 'c65e4df9-a356-415e-8758-7fc42be2eca2', 'interview', 'bd560b3b-d499-4b09-a232-f8992fa77c6a',
    'slot', 'cf4cb1df-7492-4fed-bd3f-04811bd82ac7', 'request', '61158fa3-56eb-4b8a-911c-d7c158703906', 'post', '7f9598e4-da18-4d3d-9511-5f39ca042711');
  pn text; pt text; k int; any_data boolean; sample text;
begin
  for actor in select 'postulante' r, id from auth.users where email = 'camila.test@example.com'
               union all select 'empresa', id from auth.users where email = 'nova.test@example.com' loop
  for f in select p.oid, p.proname, p.proargnames, p.proargtypes::regtype[] types, p.pronargs, p.proretset, p.prorettype::regtype rt
           from pg_proc p where pronamespace = 'public'::regnamespace and prosecdef and has_function_privilege('authenticated', p.oid, 'execute')
             and p.prorettype <> 'trigger'::regtype and p.proname !~ '^(public_|get_invitation|get_member_invite|log_client_error|promo_track|submit_quote|is_|my_|company_parent|company_root|company_group|plan_of|job_featured|profile_featured|stage_rank|fmt_cl|short_name|cl_end_of_day)'
           order by p.proname loop
    -- elegir candidatos de id según el nombre del parámetro
    ids := array[null::uuid]; any_data := false; sample := '';
    for k in 1..f.pronargs loop
      pn := coalesce(f.proargnames[k], ''); pt := f.types[k]::text;
      if pt = 'uuid' and pn ~ '(^p_id$|^id$)' then ids := array[(foreign_ids->>'offer')::uuid, (foreign_ids->>'interview')::uuid, (foreign_ids->>'request')::uuid, (foreign_ids->>'slot')::uuid, (foreign_ids->>'match')::uuid, (foreign_ids->>'post')::uuid]; end if;
    end loop;
    foreach i in array ids loop
      args := '{}';
      for k in 1..f.pronargs loop
        pn := coalesce(f.proargnames[k], ''); pt := f.types[k]::text;
        a := case
          when pt = 'uuid' and pn ~ '(^p_id$|^id$)' then quote_literal(i) || '::uuid'
          when pt = 'uuid' and pn ~ 'job' then quote_literal(foreign_ids->>'job') || '::uuid'
          when pt = 'uuid' and pn ~ '(company|cid)' then quote_literal(foreign_ids->>'company') || '::uuid'
          when pt = 'uuid' and pn ~ 'match' then quote_literal(foreign_ids->>'match') || '::uuid'
          when pt = 'uuid' and pn ~ 'offer' then quote_literal(foreign_ids->>'offer') || '::uuid'
          when pt = 'uuid' and pn ~ 'interview' then quote_literal(foreign_ids->>'interview') || '::uuid'
          when pt = 'uuid' and pn ~ 'slot' then quote_literal(foreign_ids->>'slot') || '::uuid'
          when pt = 'uuid' and pn ~ '(request|thread)' then quote_literal(foreign_ids->>'request') || '::uuid'
          when pt = 'uuid' and pn ~ 'post' then quote_literal(foreign_ids->>'post') || '::uuid'
          when pt = 'uuid' then quote_literal(foreign_ids->>'user') || '::uuid'
          when pt = 'uuid[]' then 'array[' || quote_literal(foreign_ids->>'user') || '::uuid]'
          when pt in ('integer', 'smallint', 'bigint', 'numeric') then '30'
          when pt = 'boolean' then 'false'
          when pt = 'jsonb' then '''{}''::jsonb'
          when pt = 'json' then '''{}''::json'
          when pt = 'text[]' then 'array[''x'']'
          when pt like 'timestamp%' then 'now()'
          when pt = 'date' then 'current_date'
          else quote_literal('prueba de auditoría') || '::' || pt end;
        args := args || a;
      end loop;
      call := 'public.' || quote_ident(f.proname) || '(' || array_to_string(args, ', ') || ')';
      perform set_config('request.jwt.claims', json_build_object('sub', actor.id, 'role', 'authenticated')::text, true);
      begin
        execute 'set local role authenticated';
        if f.proretset then execute 'select count(*) from ' || call into n; v := n::text;
        else execute 'select (' || call || ')::text' into v; end if;
        execute 'reset role';
        if v is null or v in ('', '0', '[]', '{}', 'null', 'false', 'f', '{"items": []}') or v ~ '^\{"items": \[\], ' then empty := empty + 1;
        else any_data := true; sample := left(v, 90); end if;
      exception when others then execute 'reset role'; errs := errs + 1; end;
    end loop;
    if any_data then flagged := flagged || E'\n• [' || actor.r || '] ' || f.proname || ' → ' || sample; else ok := ok + 1; end if;
  end loop;
  end loop;
  raise exception 'BARRIDO: % funciones sin datos ajenos, % llamadas bloqueadas con error, % vacías. Para revisar:%', ok, errs, empty, flagged;
end $t$;
