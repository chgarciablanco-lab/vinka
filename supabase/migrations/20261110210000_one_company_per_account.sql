-- Una cuenta pertenece a una sola empresa. Solo una consultora (matriz) maneja varias: sus empresas clientes.
-- Se respalda y se quita la única membresía que rompía la regla (nova.test como reclutadora en Agrícola Copihue, dato de prueba).
create table if not exists backup.company_members_20261110b as select * from public.company_members;

delete from public.company_members m
using auth.users u, public.companies c
where u.id = m.user_id and c.id = m.company_id
  and u.email = 'nova.test@example.com' and c.display_name = 'Agrícola Copihue' and m.role = 'recruiter';

create or replace function public.member_single_company() returns trigger
language plpgsql security definer set search_path = public as $$
declare other text;
begin
  select c.display_name into other from company_members m join companies c on c.id = m.company_id
  where m.user_id = new.user_id and m.company_id <> new.company_id and company_root(m.company_id) <> company_root(new.company_id) limit 1;
  if other is not null then
    raise exception 'Esta cuenta ya pertenece a %. Una cuenta solo puede estar en una empresa; las consultoras manejan a sus clientes desde la matriz.', other;
  end if;
  return new;
end $$;
drop trigger if exists member_single_company on public.company_members;
create trigger member_single_company before insert or update of company_id on public.company_members
  for each row execute function public.member_single_company();

do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.invite_member'::regproc);
  n := replace(d, 'if company_parent(p_company) is not null and p_role <> ''client'' then',
    'if exists (select 1 from auth.users u join company_members m on m.user_id = u.id
               where lower(u.email) = lower(trim(p_email)) and company_root(m.company_id) <> company_root(p_company)) then
    raise exception ''Ese correo ya pertenece a otra empresa en VINKA. Una cuenta solo puede estar en una empresa.''; end if;
  if company_parent(p_company) is not null and p_role <> ''client'' then');
  if n = d then raise exception 'invite_member'; end if; execute n;
end $mig$;
