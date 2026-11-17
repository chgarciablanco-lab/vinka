-- Auditoría comercial 17-11-2026 · P1
-- F02: el traspaso de empresa cambiaba los roles pero la regla de la tabla reponía al dueño anterior.
-- C01: el pago demo podía asignar a otro asesor sin el acuerdo del postulante, y sin bloquear el cupo.
create schema if not exists backup;
create table if not exists backup.fn_company_guard_20261117 as select now() saved_at, pg_get_functiondef('public.company_guard()'::regprocedure) def;
create table if not exists backup.fn_transfer_company_ownership_20261117 as select now() saved_at, pg_get_functiondef('public.transfer_company_ownership(uuid, uuid)'::regprocedure) def;
create table if not exists backup.fn_checkout_quote_20261117 as select now() saved_at, pg_get_functiondef('public.checkout_quote(text, uuid, text, integer)'::regprocedure) def;
create table if not exists backup.fn_checkout_pay_20261117 as select now() saved_at, pg_get_functiondef('public.checkout_pay(text, uuid, text, text, integer, text, integer)'::regprocedure) def;

-- F02 · 1) La regla de la tabla solo deja cambiar al dueño cuando lo hace la función de traspaso (o administración)
do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.company_guard()'::regprocedure);
  n := replace(d, 'new.owner_id := old.owner_id;',
    'if not (coalesce(current_setting(''vinka.company_transfer'', true), '''') = ''1'' or (not api) or is_admin()) then new.owner_id := old.owner_id; end if;');
  if n = d then raise exception 'company_guard: no se encontró la línea del dueño'; end if;
  execute n;
end $m$;

-- F02 · 2) Traspaso en un solo paso: matriz y clientes quedan con el mismo dueño, o no cambia nada
create or replace function public.transfer_company_ownership(p_company uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_root uuid := company_root(p_company); v_name text; v_n int; v_bad int;
begin
  perform 1 from companies where id = v_root for update;
  if v_root is null or (select owner_id from companies where id = v_root) is distinct from auth.uid() then
    raise exception 'Solo quien es dueño/a de la empresa puede traspasarla'; end if;
  if p_user = auth.uid() then raise exception 'Elige a otra persona del equipo'; end if;
  if not exists (select 1 from company_members where company_id = v_root and user_id = p_user and role in ('admin', 'recruiter', 'viewer')) then
    raise exception 'La empresa solo se puede traspasar a alguien de su equipo'; end if;
  if exists (select 1 from profiles where id = p_user and suspended_at is not null) then raise exception 'Esa cuenta está suspendida'; end if;
  perform set_config('vinka.company_transfer', '1', true);
  update companies set owner_id = p_user where id = v_root or parent_id = v_root;
  get diagnostics v_n = row_count;
  perform set_config('vinka.company_transfer', '', true);
  select count(*) into v_bad from companies where (id = v_root or parent_id = v_root) and owner_id is distinct from p_user;
  if v_n = 0 or v_bad > 0 then raise exception 'No se pudo completar el traspaso. No se cambió nada; inténtalo de nuevo.'; end if;
  update company_members set role = 'owner' where company_id = v_root and user_id = p_user;
  update company_members set role = 'admin' where company_id = v_root and user_id = auth.uid();
  select display_name into v_name from companies where id = v_root;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'company_transfer', 'company', v_root, jsonb_build_object('to', p_user, 'companies', v_n));
  perform notify_users(array[p_user], 'team_joined', 'Ahora eres dueño/a de ' || v_name,
    short_name(auth.uid()) || ' te traspasó la empresa. Puedes administrar el plan, el equipo y la vitrina.', '/equipo', true);
end $$;

-- C01 · 1) Antes de pagar: se respeta la elección. Si el elegido no está disponible, no se paga hasta que la persona decida.
do $m$
declare d text; n text; old text; new text;
begin
  d := pg_get_functiondef('public.checkout_quote(text, uuid, text, integer)'::regprocedure);
  old := 'elsif r.assigned_to is null and coalesce(case when r.choice = ''asesor'' and advisor_unavailable_reason(r.preferred_advisor, r.service_id) is null then r.preferred_advisor end, advisor_suggest(r.service_id)) is null then';
  new := 'elsif r.proposed_advisor is not null then v_reason := ''VINKA te propuso un cambio de asesor/a. Respóndelo antes de pagar.'';
    elsif r.assigned_to is not null and not exists (select 1 from advisors where user_id = r.assigned_to and active) then v_reason := ''Tu asesor/a ya no está activo/a. VINKA te propondrá a otra persona antes de que pagues.'';
    elsif r.assigned_to is null and r.choice = ''asesor'' and advisor_unavailable_reason(r.preferred_advisor, r.service_id) is not null then
      v_reason := ''La persona que elegiste no está disponible ahora ('' || advisor_unavailable_reason(r.preferred_advisor, r.service_id) || ''). Elige a otra o deja que VINKA elija, y luego paga.'';
    elsif r.assigned_to is null and r.choice <> ''asesor'' and advisor_suggest(r.service_id) is null then';
  n := replace(d, old, new);
  if n = d then raise exception 'checkout_quote: no se encontró la regla de asignación'; end if;
  execute n;

  -- C01 · 2) Al pagar: el cupo se bloquea y se vuelve a comprobar; nunca se cambia de asesor en silencio ni se excede el cupo
  d := pg_get_functiondef('public.checkout_pay(text, uuid, text, text, integer, text, integer)'::regprocedure);
  old := 'v_adv := coalesce(case when r.choice = ''asesor'' and advisor_unavailable_reason(r.preferred_advisor, r.service_id) is null then r.preferred_advisor end, advisor_suggest(r.service_id));
        perform service_do_assign(r.id, v_adv, null, ''pago'');';
  new := 'v_adv := case when r.choice = ''asesor'' then r.preferred_advisor else advisor_suggest(r.service_id) end;
        perform 1 from advisor_profiles where user_id = v_adv for update;
        if v_adv is null or advisor_unavailable_reason(v_adv, r.service_id) is not null then
          raise exception ''Tu asesor/a se quedó sin cupo justo ahora. No se hizo ningún cobro: vuelve a intentarlo o elige a otra persona.''; end if;
        perform service_do_assign(r.id, v_adv, null, ''pago'');';
  n := replace(d, old, new);
  if n = d then raise exception 'checkout_pay: no se encontró la asignación'; end if;
  execute n;
end $m$;
