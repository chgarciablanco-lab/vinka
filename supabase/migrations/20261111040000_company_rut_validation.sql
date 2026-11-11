-- RUT de empresas: dígito verificador obligatorio en la base y RUT repetido solo con autorización de VINKA.
create table if not exists backup.companies_20261111 as select * from public.companies;

create or replace function public.rut_clean(p text) returns text language sql immutable as $$ select upper(regexp_replace(coalesce(p, ''), '[^0-9kK]', '', 'g')) $$;
create or replace function public.rut_valid(p text) returns boolean language plpgsql immutable as $$
declare c text := rut_clean(p); body text; s int := 0; m int := 2; r int; dv text;
begin
  if c !~ '^[0-9]{7,8}[0-9K]$' then return false; end if;
  body := left(c, -1);
  for i in reverse length(body)..1 loop
    s := s + substr(body, i, 1)::int * m; m := case when m = 7 then 2 else m + 1 end;
  end loop;
  r := 11 - s % 11;
  dv := case r when 11 then '0' when 10 then 'K' else r::text end;
  return dv = right(c, 1);
end $$;

alter table public.companies add column if not exists rut_duplicate_of uuid references public.companies(id) on delete set null;
alter table public.companies add column if not exists rut_dup_ok boolean not null default false;

create or replace function public.company_rut_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or rut_clean(new.rut) is distinct from rut_clean(old.rut) then
    if not rut_valid(new.rut) then raise exception 'El RUT % no es válido: revisa el dígito verificador', new.rut; end if;
    new.rut_duplicate_of := (select id from companies c where rut_clean(c.rut) = rut_clean(new.rut) and c.id <> new.id order by c.created_at limit 1);
    if tg_op = 'UPDATE' then new.rut_dup_ok := false; end if;
  end if;
  if new.rut_duplicate_of is not null and not new.rut_dup_ok and new.verification_status = 'verified'
     and (tg_op = 'INSERT' or old.verification_status is distinct from 'verified' or rut_clean(new.rut) is distinct from rut_clean(old.rut)) then
    raise exception 'Este RUT ya está registrado en otra empresa. Autoriza el RUT repetido antes de verificarla.';
  end if;
  if tg_op = 'UPDATE' and new.rut_dup_ok is distinct from old.rut_dup_ok and coalesce(auth.role(), '') in ('authenticated', 'anon') and not is_admin() then
    new.rut_dup_ok := old.rut_dup_ok;
  end if;
  return new;
end $$;
drop trigger if exists company_rut_check on public.companies;
create trigger company_rut_check before insert or update on public.companies for each row execute function public.company_rut_check();

-- Aviso a VINKA cuando una empresa nueva usa un RUT que ya existe
create or replace function public.company_rut_dup_notice() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.rut_duplicate_of is not null and (tg_op = 'INSERT' or old.rut_duplicate_of is distinct from new.rut_duplicate_of) then
    perform notify_users(array(select user_id from admins), 'verification', 'RUT repetido por revisar',
      new.display_name || ' se registró con el RUT ' || new.rut || ', que ya usa ' || coalesce((select display_name from companies where id = new.rut_duplicate_of), 'otra empresa') || '. Autorízalo o recházalo antes de verificar.', '/', false);
  end if;
  return new;
end $$;
drop trigger if exists company_rut_dup_notice on public.companies;
create trigger company_rut_dup_notice after insert or update of rut on public.companies for each row execute function public.company_rut_dup_notice();

create or replace function public.admin_authorize_rut(p_company uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  update companies set rut_dup_ok = true where id = p_company and rut_duplicate_of is not null;
  if not found then raise exception 'Esta empresa no tiene un RUT repetido'; end if;
  insert into audit_logs (actor_id, action, entity, entity_id, detail) values (auth.uid(), 'rut_duplicate_authorized', 'company', p_company,
    jsonb_build_object('rut', (select rut from companies where id = p_company), 'other', (select rut_duplicate_of from companies where id = p_company)));
end $$;
revoke execute on function public.admin_authorize_rut(uuid) from public, anon;
grant execute on function public.admin_authorize_rut(uuid) to authenticated;

-- Empresas existentes: marcar repetidos (hoy no hay) sin bloquear a las ya verificadas
update public.companies c set rut_duplicate_of = d.id, rut_dup_ok = (c.verification_status = 'verified')
from public.companies d where rut_clean(d.rut) = rut_clean(c.rut) and d.id <> c.id and d.created_at < c.created_at and c.rut_duplicate_of is null;

-- Cotizaciones: dígito verificador si se indica RUT
do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.submit_quote'::regproc);
  n := replace(d, 'if v_rut <> '''' and v_rut !~ ''^[0-9]{7,8}-[0-9K]$'' then', 'if v_rut <> '''' and not rut_valid(v_rut) then');
  if n = d then raise exception 'submit_quote'; end if; execute n;
  d := pg_get_functiondef('public.create_client_company'::regproc);
  n := replace(d, 'if v_rut !~ ''^[0-9]{7,8}-[0-9K]$'' then', 'if not rut_valid(v_rut) then');
  if n = d then raise exception 'create_client_company'; end if; execute n;
  d := pg_get_functiondef('public.admin_overview'::regproc);
  n := replace(d, '''demo'', exists (select 1 from seed.companies d where d.id = c.id))', '''demo'', exists (select 1 from seed.companies d where d.id = c.id), ''rut_duplicate_of'', c.rut_duplicate_of, ''rut_dup_ok'', c.rut_dup_ok)');
  if n = d then raise exception 'admin_overview'; end if; execute n;
end $mig$;
