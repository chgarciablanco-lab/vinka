-- Destacados: renovación y avisos de renovación.
-- · Se puede renovar desde 3 días antes de que termine: los días se suman al final del destacado actual (no se pierden días).
--   Con destacados del plan se aplica al tiro; si es compra, queda «solicitada» y al confirmar el pago VINKA extiende el actual.
-- · Avisos: 3 días antes (con precio, campana + correo) y el día que termina (campana + correo). No aplica a cortesías.
create table if not exists backup.promotions_20261111 as select * from public.promotions;
alter table public.promotions add column if not exists renews_id uuid references public.promotions(id) on delete set null;
alter table public.promotions add column if not exists ended_notified boolean not null default false;
-- Un solo destacado abierto por vacante/perfil, sin contar las renovaciones (que se suman al vigente); una renovación pendiente por destacado
drop index if exists public.promotions_one_open_job;
drop index if exists public.promotions_one_open_profile;
create unique index promotions_one_open_job on public.promotions (job_id) where target = 'job' and status in ('solicitada', 'activa', 'pausada') and renews_id is null;
create unique index promotions_one_open_profile on public.promotions (candidate_id) where target = 'profile' and status in ('solicitada', 'activa', 'pausada') and renews_id is null;
create unique index if not exists promotions_one_pending_renewal on public.promotions (renews_id) where renews_id is not null and status in ('solicitada', 'activa');
-- Lo que ya terminó antes de este cambio no recibe aviso de «terminó» retroactivo
update public.promotions set ended_notified = true where status = 'finalizada' and not ended_notified;

-- Destacado vigente que se puede renovar (termina en 3 días o menos)
create or replace function public.promo_renewable(p_job uuid, p_candidate uuid) returns promotions
language sql stable security definer set search_path = public as $$
  select p.* from promotions p
  where ((p_job is not null and p.job_id = p_job) or (p_job is null and p.candidate_id = p_candidate))
    and p.status = 'activa' and p.ends_at > now() and p.ends_at <= now() + interval '3 days'
    and not exists (select 1 from promotions r where r.renews_id = p.id and r.status = 'solicitada')
  order by p.ends_at desc limit 1 $$;
revoke execute on function public.promo_renewable(uuid, uuid) from public, anon, authenticated;

-- Aplica una renovación: extiende el destacado actual y deja la renovación registrada como finalizada (fusionada)
create or replace function public.promo_apply_renewal(p_new uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n promotions; o promotions;
begin
  select * into n from promotions where id = p_new;
  select * into o from promotions where id = n.renews_id for update;
  if o.id is null or o.status <> 'activa' or o.ends_at <= now() then
    -- el actual ya terminó: la renovación parte ahora como un destacado normal
    update promotions set status = 'activa', renews_id = null, starts_at = now(), ends_at = now() + make_interval(days => n.days), updated_at = now() where id = p_new;
    return;
  end if;
  update promotions set ends_at = ends_at + make_interval(days => n.days), days = days + n.days, ending_notified = false, updated_at = now(),
    note = left(trim(coalesce(note, '') || ' · Renovado +' || n.days || ' días'), 300) where id = o.id;
  update promotions set status = 'finalizada', starts_at = o.ends_at, ends_at = o.ends_at + make_interval(days => n.days), ended_notified = true,
    note = left('Renovación sumada al destacado vigente', 300), updated_at = now() where id = p_new;
end $$;
revoke execute on function public.promo_apply_renewal(uuid) from public, anon, authenticated;

create or replace function public.request_promotion(p_product text, p_job uuid default null, p_use_credit boolean default false, p_consent boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pr promo_products; j jobs; pl plans; used int; v_id uuid; v_net int; v_iva int; v_open int; st promo_settings; who text; ren promotions; v_end timestamptz;
begin
  select * into st from promo_settings;
  if p_job is not null then
    select * into j from jobs where id = p_job;
    if j.id is null or not can_manage(j.company_id) then raise exception 'No tienes permiso para destacar esta vacante'; end if;
    if j.status <> 'published' or not exists (select 1 from companies where id = j.company_id and verification_status = 'verified') then
      raise exception 'Solo se pueden destacar vacantes publicadas de empresas verificadas'; end if;
    ren := promo_renewable(p_job, null);
    if ren.id is null and exists (select 1 from promotions where job_id = p_job and status in ('solicitada', 'activa', 'pausada')) then
      raise exception 'Esta vacante ya tiene un destacado vigente o en trámite. Podrás renovarlo desde 3 días antes de que termine.'; end if;
    if p_use_credit then
      pl := plan_of(j.company_id);
      select count(*) into used from promotions where company_id = j.company_id and source = 'plan'
        and created_at >= date_trunc('month', now() at time zone 'America/Santiago') at time zone 'America/Santiago';
      if used >= pl.promo_credits then raise exception 'Ya usaste los destacados incluidos en tu plan este mes'; end if;
      if ren.id is null then
        select count(*) into v_open from promotions where target = 'job' and status = 'activa' and ends_at > now();
        if v_open >= st.max_jobs then raise exception 'Los espacios destacados están completos. Inténtalo en unos días.'; end if;
      end if;
      insert into promotions (target, job_id, company_id, status, source, days, starts_at, ends_at, requested_by, activated_by, renews_id)
      values ('job', j.id, j.company_id, 'activa', 'plan', pl.promo_days, now(), now() + make_interval(days => pl.promo_days), auth.uid(), auth.uid(), ren.id)
      returning id into v_id;
      if ren.id is not null then perform promo_apply_renewal(v_id); end if;
      perform log_event(j.company_id, j.id, null, null, case when ren.id is null then 'promo_started' else 'promo_renewed' end, jsonb_build_object('days', pl.promo_days, 'source', 'plan'));
      select ends_at into v_end from promotions where id = coalesce(ren.id, v_id);
      return jsonb_build_object('id', v_id, 'status', 'activa', 'days', pl.promo_days, 'renewed', ren.id is not null, 'ends_at', v_end);
    end if;
    select * into pr from promo_products where id = p_product and target = 'job' and active;
    if pr.id is null then raise exception 'Producto no disponible'; end if;
    v_net := pr.price_clp; v_iva := round(pr.price_clp * 0.19)::int;
    insert into promotions (product_id, target, job_id, company_id, status, source, days, net_clp, iva_clp, total_clp, requested_by, renews_id)
    values (pr.id, 'job', j.id, j.company_id, 'solicitada', 'compra', pr.days, v_net, v_iva, v_net + v_iva, auth.uid(), ren.id) returning id into v_id;
    select display_name into who from companies where id = j.company_id;
    perform notify_users(admin_ids(), 'promo_request', case when ren.id is null then 'Destacado solicitado' else 'Renovación de destacado solicitada' end,
      who || ' pidió ' || case when ren.id is null then 'destacar' else 'renovar el destacado de' end || ' «' || j.title || '» ' || pr.days || ' días ($' || to_char(v_net + v_iva, 'FM999G999G999') || ' con IVA).', '/promociones', false);
    return jsonb_build_object('id', v_id, 'status', 'solicitada', 'renewal', ren.id is not null);
  end if;

  if not exists (select 1 from candidate_profiles where user_id = auth.uid() and onboarding_done) then raise exception 'Completa tu perfil primero'; end if;
  if not coalesce((select is_public from candidate_profiles where user_id = auth.uid()), false) then
    raise exception 'Tu perfil está oculto para empresas. Hazlo visible para poder destacarlo.'; end if;
  if not coalesce(p_consent, false) then raise exception 'Debes aceptar que tu perfil se muestre con más frecuencia a empresas'; end if;
  ren := promo_renewable(null, auth.uid());
  if ren.id is null and exists (select 1 from promotions where candidate_id = auth.uid() and status in ('solicitada', 'activa', 'pausada')) then
    raise exception 'Ya tienes un perfil destacado vigente o en trámite. Podrás renovarlo desde 3 días antes de que termine.'; end if;
  select * into pr from promo_products where id = p_product and target = 'profile' and active;
  if pr.id is null then raise exception 'Producto no disponible'; end if;
  v_net := round(pr.price_clp / 1.19)::int; v_iva := pr.price_clp - v_net;
  insert into promotions (product_id, target, candidate_id, status, source, days, net_clp, iva_clp, total_clp, requested_by, consent_at, renews_id)
  values (pr.id, 'profile', auth.uid(), 'solicitada', 'compra', pr.days, v_net, v_iva, pr.price_clp, auth.uid(), now(), ren.id) returning id into v_id;
  perform notify_users(admin_ids(), 'promo_request', case when ren.id is null then 'Perfil destacado solicitado' else 'Renovación de perfil destacado' end,
    short_name(auth.uid()) || ' pidió ' || case when ren.id is null then 'destacar' else 'renovar' end || ' su perfil ' || pr.days || ' días ($' || to_char(pr.price_clp, 'FM999G999G999') || ').', '/promociones', false);
  return jsonb_build_object('id', v_id, 'status', 'solicitada', 'renewal', ren.id is not null);
end $$;

-- La pantalla recibe a qué destacado renueva cada solicitud
do $mig$
declare d text; n text; f text;
begin
  foreach f in array array['public.job_promotions', 'public.my_profile_promotion'] loop
    d := pg_get_functiondef(f::regproc);
    n := replace(d, '''paused_by'', p.paused_by,', '''paused_by'', p.paused_by, ''renews_id'', p.renews_id, ''product_id'', p.product_id, ''note'', p.note,');
    if n = d then raise exception '%', f; end if; execute n;
  end loop;
end $mig$;

-- Activación por VINKA: si es renovación, extiende el destacado vigente (no ocupa un cupo nuevo)
do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.admin_activate_promotion'::regproc);
  n := replace(d, '  if v_open >= v_max then raise exception',
    '  if v_open >= v_max and not exists (select 1 from promotions o where o.id = p.renews_id and o.status = ''activa'' and o.ends_at > now()) then raise exception');
  if n = d then raise exception 'admin_activate_promotion 1'; end if;
  d := n;
  n := replace(d, '  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), ''promo_activate''',
    '  if p.renews_id is not null then perform promo_apply_renewal(p_id); end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), ''promo_activate''');
  if n = d then raise exception 'admin_activate_promotion 2'; end if;
  execute n;
end $mig$;

-- Avisos de renovación: 3 días antes y al terminar
create or replace function public.promo_housekeeping() returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_users uuid[]; v_title text; v_price text; pl plans; v_left int;
begin
  for r in update promotions set ending_notified = true
    where status = 'activa' and not ending_notified and ends_at > now() and ends_at <= now() + interval '3 days' and source <> 'cortesia' returning * loop
    if r.target = 'job' then
      v_title := (select title from jobs where id = r.job_id);
      pl := plan_of(r.company_id);
      v_left := greatest(0, coalesce(pl.promo_credits, 0) - (select count(*) from promotions where company_id = r.company_id and source = 'plan'
        and created_at >= date_trunc('month', now() at time zone 'America/Santiago') at time zone 'America/Santiago'));
      v_price := coalesce((select '$' || replace(to_char(round(x.price_clp * 1.19), 'FM999G999G999'), ',', '.') || ' con IVA'
        from promo_products x where x.id = coalesce(r.product_id, (select id from promo_products where target = 'job' and active order by days limit 1))), '');
      v_users := array(select unnest(company_staff(r.company_id, array['owner', 'admin', 'recruiter', 'client'])));
      perform notify_users(v_users, 'promo', 'Renueva tu destacado: termina el ' || to_char(r.ends_at at time zone 'America/Santiago', 'DD-MM'),
        '«' || v_title || '» deja de estar destacada el ' || to_char(r.ends_at at time zone 'America/Santiago', 'DD-MM') || '. '
        || case when v_left > 0 then 'Puedes renovarla sin costo con un destacado de tu plan (te ' || case when v_left = 1 then 'queda 1' else 'quedan ' || v_left end || ' este mes).'
                else 'Renuévala por ' || r.days || ' días' || case when v_price <> '' then ' (' || v_price || ')' else '' end || '.' end
        || ' Los días se suman al final: no pierdes ninguno.', '/vacantes/' || r.job_id || '/destacar', true);
    else
      v_price := coalesce((select '$' || replace(to_char(x.price_clp, 'FM999G999G999'), ',', '.') from promo_products x where x.id = r.product_id), '');
      perform notify_users(array[r.candidate_id], 'promo', 'Renueva tu perfil destacado: termina el ' || to_char(r.ends_at at time zone 'America/Santiago', 'DD-MM'),
        'Puedes renovarlo' || case when v_price <> '' then ' por ' || v_price || ' (IVA incluido)' else '' end || '; los días se suman al final.', '/visibilidad', true);
    end if;
  end loop;

  for r in update promotions set status = 'finalizada', updated_at = now() where status = 'activa' and ends_at <= now() returning * loop
    if r.source = 'cortesia' or r.ended_notified then continue; end if;
    update promotions set ended_notified = true where id = r.id;
    if r.target = 'job' then
      if (select status from jobs where id = r.job_id) <> 'published' then continue; end if;
      perform notify_users(array(select unnest(company_staff(r.company_id, array['owner', 'admin', 'recruiter', 'client']))), 'promo', 'Tu destacado terminó',
        '«' || (select title from jobs where id = r.job_id) || '» ya no aparece entre los primeros resultados. Puedes renovarla cuando quieras.', '/vacantes/' || r.job_id || '/destacar', true);
    else
      perform notify_users(array[r.candidate_id], 'promo', 'Tu perfil destacado terminó', 'Puedes renovarlo cuando quieras desde Perfil destacado.', '/visibilidad', true);
    end if;
  end loop;
end $$;
revoke execute on function public.promo_housekeeping() from public, anon, authenticated;
