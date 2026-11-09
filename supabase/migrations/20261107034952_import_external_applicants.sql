-- Migración aplicada en Supabase (20261107034952). Exportada tal cual desde supabase_migrations.schema_migrations.

alter table public.jobs add column if not exists source text not null default 'vinka';
alter table public.jobs add column if not exists external_ref text not null default '';

create table public.external_applicants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 160),
  email text not null default '',
  phone text not null default '',
  headline text not null default '',
  notes text not null default '',
  stage text not null default 'nuevo' check (stage in ('nuevo','contactado','entrevista','oferta','contratado','descartado')),
  source text not null default '',
  invite_token uuid not null default gen_random_uuid() unique,
  invited_at timestamptz,
  invite_status text,
  linked_user_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.external_applicants (job_id);
create unique index external_applicants_job_email on public.external_applicants (job_id, lower(email)) where email <> '';
alter table public.external_applicants enable row level security;
create policy "externos: empresa" on public.external_applicants for all to authenticated
  using (is_company_member(company_id))
  with check (is_company_member(company_id) and exists (select 1 from jobs j where j.id = job_id and j.company_id = company_id));

-- Invitar a VINKA (envía correo con enlace único)
create or replace function public.invite_external(p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in update external_applicants set invited_at = now(), invite_status = 'enviando'
           where id = any(p_ids) and is_company_member(company_id) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and linked_user_id is null
           returning id loop
    perform notify_event('invite', r.id); n := n + 1;
  end loop;
  return n;
end $$;

-- Ver una invitación (sin sesión: solo datos mínimos)
create or replace function public.get_invitation(p_token uuid)
returns table (first_name text, company_name text, job_title text, comuna text, modality text, accepted boolean, email text)
language sql stable security definer set search_path = public as $$
  select split_part(e.full_name, ' ', 1), c.display_name, j.title, j.comuna, j.modality, e.linked_user_id is not null, e.email
  from external_applicants e join companies c on c.id = e.company_id join jobs j on j.id = e.job_id
  where e.invite_token = p_token and c.verification_status = 'verified';
$$;

-- Aceptar: conecta a la persona con la vacante y crea el match con su consentimiento
create or replace function public.accept_invitation(p_token uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare e external_applicants; owner uuid; mid uuid;
begin
  select * into e from external_applicants where invite_token = p_token;
  if e.id is null then raise exception 'Invitación no válida'; end if;
  if not exists (select 1 from candidate_profiles where user_id = auth.uid()) then raise exception 'Debes ingresar con una cuenta de candidato/a'; end if;
  if e.linked_user_id is not null and e.linked_user_id <> auth.uid() then raise exception 'Esta invitación ya fue aceptada por otra cuenta'; end if;
  update external_applicants set linked_user_id = auth.uid(), invite_status = 'aceptada' where id = e.id;
  select coalesce(e.created_by, (select user_id from company_members where company_id = e.company_id limit 1)) into owner;
  insert into company_candidate_actions (job_id, candidate_id, action, created_by) values (e.job_id, auth.uid(), 'interest', owner)
    on conflict (job_id, candidate_id) do update set action = 'interest';
  insert into candidate_job_actions (candidate_id, job_id, action) values (auth.uid(), e.job_id, 'interest')
    on conflict (candidate_id, job_id) do update set action = 'interest';
  select id into mid from matches where job_id = e.job_id and candidate_id = auth.uid();
  return mid;
end $$;

revoke execute on function public.invite_external(uuid[]) from public, anon;
grant execute on function public.invite_external(uuid[]) to authenticated;
revoke execute on function public.get_invitation(uuid) from public;
grant execute on function public.get_invitation(uuid) to anon, authenticated;
revoke execute on function public.accept_invitation(uuid) from public, anon;
grant execute on function public.accept_invitation(uuid) to authenticated;
