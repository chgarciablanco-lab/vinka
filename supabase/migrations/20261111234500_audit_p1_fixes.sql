-- Auditoría 11-11-2026, hallazgos P1.
-- F02  Quien es dueño/a de una empresa no puede borrar su cuenta: primero traspasa la empresa (traspaso nuevo).
--      La regla queda en la base: borrar el perfil de un dueño/a se rechaza (antes borraba la empresa en cascada).
-- F03  La baja de cuenta pasa a una función de servidor que borra los archivos con la API de Storage
--      (videos, CV y archivos de asesorías). La baja directa por SQL deja de estar disponible para la app.
-- F04  La contraseña temporal solo se libera si cambió de verdad (se compara con la temporal guardada).
-- F05  Matriz de estados de asesorías: «Cancelada» solo se reabre a «Solicitada»; activar exige admin total y deja pago.
-- F01  Destacados del plan, IA, integrantes y estado se cuentan por grupo (matriz + clientes).
create table if not exists backup.companies_20261111c as select id, owner_id, parent_id from public.companies;
create table if not exists backup.profiles_flags_20261111 as select id, must_change_password from public.profiles where must_change_password;

---------------------------------------------------------------- F02
alter table public.companies drop constraint companies_owner_id_fkey;
alter table public.companies add constraint companies_owner_id_fkey foreign key (owner_id) references public.profiles(id) on delete restrict;

-- Empresas que bloquean la baja de una persona (la matriz y sus clientes de las que es dueña)
create or replace function public.owned_companies(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.display_name, 'client', c.parent_id is not null,
      'others', (select count(*) from company_members m where m.company_id = company_root(c.id) and m.user_id <> p_user and m.role in ('admin', 'recruiter', 'viewer')))
    order by c.parent_id nulls first, c.display_name), '[]'::jsonb)
  from companies c where c.owner_id = p_user $$;
revoke execute on function public.owned_companies(uuid) from public, anon, authenticated;

create or replace function public.my_deletion_check() returns jsonb
language sql stable security definer set search_path = public as $$ select jsonb_build_object('owned', owned_companies(auth.uid())) $$;
revoke execute on function public.my_deletion_check() from public, anon;
grant execute on function public.my_deletion_check() to authenticated;

-- Traspaso de la empresa (y sus clientes) a otra persona del equipo
create or replace function public.transfer_company_ownership(p_company uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_root uuid := company_root(p_company); v_name text;
begin
  if v_root is null or (select owner_id from companies where id = v_root) is distinct from auth.uid() then
    raise exception 'Solo quien es dueño/a de la empresa puede traspasarla'; end if;
  if p_user = auth.uid() then raise exception 'Elige a otra persona del equipo'; end if;
  if not exists (select 1 from company_members where company_id = v_root and user_id = p_user and role in ('admin', 'recruiter', 'viewer')) then
    raise exception 'La empresa solo se puede traspasar a alguien de su equipo'; end if;
  update companies set owner_id = p_user where (id = v_root or parent_id = v_root) and owner_id = auth.uid();
  update company_members set role = 'owner' where company_id = v_root and user_id = p_user;
  update company_members set role = 'admin' where company_id = v_root and user_id = auth.uid();
  select display_name into v_name from companies where id = v_root;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'company_transfer', 'company', v_root, jsonb_build_object('to', p_user));
  perform notify_users(array[p_user], 'team_joined', 'Ahora eres dueño/a de ' || v_name,
    short_name(auth.uid()) || ' te traspasó la empresa. Puedes administrar el plan, el equipo y la vitrina.', '/equipo', true);
end $$;
revoke execute on function public.transfer_company_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_company_ownership(uuid, uuid) to authenticated;

-- set_member_role ya no permite tocar a quien es dueño/a (se mantiene) ni convertir a alguien en dueño/a por esa vía.

---------------------------------------------------------------- F03
-- Archivos a borrar en la baja (los borra la función de servidor «delete-account» con la API de Storage)
create or replace function public.account_storage_objects(p_user uuid) returns table(bucket text, path text)
language sql stable security definer set search_path = public, storage as $$
  select o.bucket_id::text, o.name from storage.objects o
  where (o.bucket_id in ('videos', 'cvs') and (storage.foldername(o.name))[1] = p_user::text)
     or (o.bucket_id = 'asesorias' and public.request_folder(o.name) in (select id from public.service_requests where candidate_id = p_user)) $$;
revoke execute on function public.account_storage_objects(uuid) from public, anon, authenticated;

-- Último paso de la baja (solo servidor): se rechaza si es dueño/a o si aún quedan archivos
create or replace function public.delete_account_data(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if jsonb_array_length(owned_companies(p_user)) > 0 then
    raise exception 'Eres dueño/a de una empresa en VINKA. Traspásala a otra persona del equipo antes de eliminar tu cuenta.'; end if;
  if exists (select 1 from account_storage_objects(p_user)) then
    raise exception 'Aún quedan archivos por borrar. Inténtalo de nuevo.'; end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (null, 'account_deleted', 'user', p_user, '{}'::jsonb);
  delete from auth.users where id = p_user;
end $$;
revoke execute on function public.delete_account_data(uuid) from public, anon, authenticated;

-- La baja directa por SQL ya no se puede usar desde la app (Supabase además la rechaza por borrar archivos por SQL)
revoke execute on function public.delete_my_account() from public, anon, authenticated;

---------------------------------------------------------------- F04
create table if not exists public.temp_password_hashes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pw_hash text not null,
  set_at timestamptz not null default now());
alter table public.temp_password_hashes enable row level security;
revoke all on public.temp_password_hashes from public, anon, authenticated;
insert into public.temp_password_hashes (user_id, pw_hash)
  select u.id, u.encrypted_password from auth.users u join public.profiles p on p.id = u.id where p.must_change_password
  on conflict (user_id) do nothing;

create or replace function public.remember_temp_password(p_user uuid) returns void
language sql security definer set search_path = public as $$
  insert into temp_password_hashes (user_id, pw_hash, set_at) select id, encrypted_password, now() from auth.users where id = p_user
  on conflict (user_id) do update set pw_hash = excluded.pw_hash, set_at = now() $$;
revoke execute on function public.remember_temp_password(uuid) from public, anon, authenticated;

do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.admin_create_advisor'::regproc);
  n := replace(d, 'must_change_password = true where id = uid;', 'must_change_password = true where id = uid;
  perform remember_temp_password(uid);');
  if n = d then raise exception 'admin_create_advisor'; end if; execute n;
  d := pg_get_functiondef('public.admin_add_staff'::regproc);
  n := replace(d, 'update profiles set must_change_password = true where id = uid;', 'update profiles set must_change_password = true where id = uid;
    perform remember_temp_password(uid);');
  if n = d then raise exception 'admin_add_staff'; end if; execute n;
  d := pg_get_functiondef('public.admin_reset_advisor_password'::regproc);
  n := replace(d, 'update profiles set must_change_password = true where id = p_user;', 'update profiles set must_change_password = true where id = p_user;
  perform remember_temp_password(p_user);');
  if n = d then raise exception 'admin_reset_advisor_password'; end if; execute n;
end $mig$;

-- La obligación solo se apaga si la contraseña ya no es la temporal (vale para la función y para editar el perfil directo)
create or replace function public.guard_temp_password() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.must_change_password and not new.must_change_password
     and exists (select 1 from temp_password_hashes t join auth.users u on u.id = t.user_id where t.user_id = new.id and u.encrypted_password = t.pw_hash) then
    raise exception 'Aún no cambias la contraseña temporal. Elige una nueva para continuar.';
  end if;
  if not new.must_change_password then delete from temp_password_hashes where user_id = new.id; end if;
  return new;
end $$;
drop trigger if exists guard_temp_password on public.profiles;
create trigger guard_temp_password before update of must_change_password on public.profiles for each row execute function public.guard_temp_password();

create or replace function public.password_changed() returns void
language plpgsql security definer set search_path = public as $$
begin
  update profiles set must_change_password = false where id = auth.uid() and must_change_password;
end $$;

---------------------------------------------------------------- F05
do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.admin_update_service_request'::regproc);
  n := replace(d, '  if p_status = ''en_curso'' and v_old in (''solicitada'', ''pago_pendiente'') and not is_admin_total() then
    raise exception ''Solo un administrador total confirma pagos''; end if;',
'  -- Transiciones permitidas (el mismo estado se acepta para actualizar la nota)
  if p_status is distinct from v_old and not (
       (v_old = ''solicitada''     and p_status in (''pago_pendiente'', ''en_curso'', ''cancelada''))
    or (v_old = ''pago_pendiente'' and p_status in (''solicitada'', ''en_curso'', ''cancelada''))
    or (v_old = ''en_curso''       and p_status in (''entregada'', ''cancelada''))
    or (v_old = ''entregada''      and p_status in (''en_curso''))
    or (v_old = ''cancelada''      and p_status in (''solicitada''))) then
    raise exception ''No se puede pasar de «%» a «%». Una asesoría cancelada se reabre como «Solicitada» y luego se confirma el pago.'', replace(v_old, ''_'', '' ''), replace(p_status, ''_'', '' ''); end if;
  if p_status = ''en_curso'' and v_old in (''solicitada'', ''pago_pendiente'') and not is_admin_total() then
    raise exception ''Solo un administrador total confirma pagos''; end if;');
  if n = d then raise exception 'admin_update_service_request'; end if; execute n;
end $mig$;

---------------------------------------------------------------- F01
do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.company_plan'::regproc);
  n := replace(d, 'select * into s from subscriptions where company_id = p_company;', 'select * into s from subscriptions where company_id = company_root(p_company);');
  n := replace(n, '''members'', (select count(*) from company_members where company_id = p_company),',
                  '''members'', (select count(*) from company_members where company_id in (select company_group(p_company)) and role <> ''client''),');
  n := replace(n, 'from ai_log where company_id = p_company and', 'from ai_log where company_id in (select company_group(p_company)) and');
  n := replace(n, 'from promotions where company_id = p_company and source = ''plan''', 'from promotions where company_id in (select company_group(p_company)) and source = ''plan''');
  if (length(d) - length(replace(d, 'p_company)', ''))) = (length(n) - length(replace(n, 'p_company)', ''))) then raise exception 'company_plan'; end if;
  if position('company_root(p_company);' in n) = 0 or position('from ai_log where company_id in' in n) = 0 or position('from promotions where company_id in' in n) = 0
     or position('and role <> ''client''' in n) = 0 then raise exception 'company_plan incompleto'; end if;
  execute n;

  d := pg_get_functiondef('public.ai_quota'::regproc);
  n := replace(d, 'from ai_log where company_id = v_company and', 'from ai_log where company_id in (select company_group(v_company)) and');
  if n = d then raise exception 'ai_quota'; end if; execute n;

  d := pg_get_functiondef('public.request_promotion'::regproc);
  n := replace(d, 'select count(*) into used from promotions where company_id = j.company_id and source = ''plan''',
                  'select count(*) into used from promotions where company_id in (select company_group(j.company_id)) and source = ''plan''');
  if n = d then raise exception 'request_promotion'; end if; execute n;

  d := pg_get_functiondef('public.job_promotions'::regproc);
  n := replace(d, 'select count(*) into used from promotions where company_id = j.company_id and source = ''plan''',
                  'select count(*) into used from promotions where company_id in (select company_group(j.company_id)) and source = ''plan''');
  if n = d then raise exception 'job_promotions'; end if; execute n;

  d := pg_get_functiondef('public.promo_housekeeping'::regproc);
  n := replace(d, '(select count(*) from promotions where company_id = r.company_id and source = ''plan''',
                  '(select count(*) from promotions where company_id in (select company_group(r.company_id)) and source = ''plan''');
  if n = d then raise exception 'promo_housekeeping'; end if; execute n;
end $mig$;
