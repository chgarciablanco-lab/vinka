-- Las invitaciones también aceptan el rol «cliente» (solo se usa en empresas clientes de una consultora)
do $mig$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.company_invites'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%viewer%' loop
    execute format('alter table public.company_invites drop constraint %I', c);
  end loop;
end $mig$;
alter table public.company_invites add constraint company_invites_role_check check (role in ('admin', 'recruiter', 'viewer', 'client'));
