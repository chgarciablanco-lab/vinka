-- Migración aplicada en Supabase (20261105192337). Exportada tal cual desde supabase_migrations.schema_migrations.

-- ===== Tablas base =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('candidate','company')),
  first_name text not null default '',
  last_name text not null default '',
  phone text,
  marketing_opt_in boolean not null default false,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table public.candidate_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  headline text not null default '',
  has_experience boolean not null default true,
  experiences jsonb not null default '[]',
  education jsonb not null default '[]',
  skills text[] not null default '{}',
  region text not null default '',
  comuna text not null default '',
  salary_expectation integer check (salary_expectation is null or salary_expectation >= 0),
  schedules text[] not null default '{}',
  modalities text[] not null default '{}',
  availability text not null default '',
  areas text[] not null default '{}',
  locations text[] not null default '{}',
  relocate text not null default '',
  bio text not null default '' check (char_length(bio) <= 400),
  video_path text,
  intro_visibility text not null default 'all' check (intro_visibility in ('all','matches')),
  is_public boolean not null default true,
  onboarding_done boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  legal_name text not null,
  display_name text not null,
  rut text not null,
  sector text not null default '',
  size text not null default '',
  region text not null default '',
  comuna text not null default '',
  description text not null default '',
  benefits text not null default '',
  website text not null default '',
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected','suspended')),
  verification_note text not null default '',
  created_at timestamptz not null default now()
);

create table public.company_members (
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','recruiter','collaborator')),
  primary key (company_id, user_id)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  area text not null default '',
  level text not null default '',
  description text not null default '',
  requirements jsonb not null default '[]',
  modality text not null default '',
  schedule text not null default '',
  contract text not null default '',
  region text not null default '',
  comuna text not null default '',
  salary_min integer,
  salary_max integer,
  salary_type text not null default 'liquido' check (salary_type in ('liquido','bruto')),
  status text not null default 'draft' check (status in ('draft','pending','published','paused','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (salary_min is null or salary_max is null or salary_min <= salary_max)
);

create table public.candidate_job_actions (
  candidate_id uuid references public.candidate_profiles(user_id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  action text not null check (action in ('interest','pass','save')),
  created_at timestamptz not null default now(),
  primary key (candidate_id, job_id)
);

create table public.company_candidate_actions (
  job_id uuid references public.jobs(id) on delete cascade,
  candidate_id uuid references public.candidate_profiles(user_id) on delete cascade,
  action text not null check (action in ('interest','pass','save')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (job_id, candidate_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  candidate_id uuid not null references public.candidate_profiles(user_id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  stage text not null default 'match' check (stage in ('match','contacto','entrevista','oferta','contratado','descartado')),
  contact_shared boolean not null default false,
  contact_requested boolean not null default false,
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (job_id, candidate_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on public.messages (match_id, created_at);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 1000),
  status text not null default 'open' check (status in ('open','reviewed')),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ===== Helpers (security definer, search_path fijo) =====
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

create or replace function public.is_company_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_members where company_id = cid and user_id = auth.uid());
$$;

create or replace function public.is_verified_company_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_members m join companies c on c.id = m.company_id
                 where m.user_id = auth.uid() and c.verification_status = 'verified');
$$;

create or replace function public.is_match_participant(mid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from matches m where m.id = mid and not m.closed and
    (m.candidate_id = auth.uid() or exists (select 1 from company_members cm where cm.company_id = m.company_id and cm.user_id = auth.uid())));
$$;

-- ===== Alta de usuario =====
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text := coalesce(new.raw_user_meta_data->>'role','candidate');
begin
  if r not in ('candidate','company') then r := 'candidate'; end if;
  insert into profiles (id, role, first_name, last_name, phone, marketing_opt_in, terms_accepted_at)
  values (new.id, r,
    coalesce(new.raw_user_meta_data->>'first_name',''),
    coalesce(new.raw_user_meta_data->>'last_name',''),
    nullif(new.raw_user_meta_data->>'phone',''),
    coalesce((new.raw_user_meta_data->>'marketing_opt_in')::boolean, false),
    case when (new.raw_user_meta_data->>'terms_accepted')::boolean then now() end);
  if r = 'candidate' then insert into candidate_profiles (user_id) values (new.id); end if;
  if lower(new.email) = 'chgarciablanco@gmail.com' then insert into admins (user_id) values (new.id) on conflict do nothing; end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Empresa: el creador queda como owner
create or replace function public.company_add_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into company_members (company_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;
create trigger company_after_insert after insert on public.companies for each row execute function public.company_add_owner();

-- Empresa: solo admin cambia la verificación; al verificar se publican vacantes pendientes
create or replace function public.company_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not is_admin() then new.verification_status := 'pending'; new.verification_note := ''; end if;
    return new;
  end if;
  if (new.verification_status is distinct from old.verification_status or new.verification_note is distinct from old.verification_note) then
    if not is_admin() then raise exception 'Solo administración puede cambiar la verificación'; end if;
    insert into audit_logs (actor_id, action, entity, entity_id, detail)
    values (auth.uid(), 'verification_change', 'company', new.id, jsonb_build_object('from', old.verification_status, 'to', new.verification_status, 'note', new.verification_note));
  end if;
  new.owner_id := old.owner_id;
  return new;
end $$;
create trigger company_guard before insert or update on public.companies for each row execute function public.company_guard();

create or replace function public.company_after_verify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.verification_status = 'verified' and old.verification_status <> 'verified' then
    update jobs set status = 'published', updated_at = now() where company_id = new.id and status = 'pending';
  elsif new.verification_status in ('rejected','suspended') then
    update jobs set status = 'paused', updated_at = now() where company_id = new.id and status = 'published';
  end if;
  return new;
end $$;
create trigger company_after_verify after update on public.companies for each row execute function public.company_after_verify();

-- Vacante: no se publica si la empresa no está verificada
create or replace function public.job_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'published' and not exists (select 1 from companies where id = new.company_id and verification_status = 'verified') then
    new.status := 'pending';
  end if;
  return new;
end $$;
create trigger job_guard before insert or update on public.jobs for each row execute function public.job_guard();

-- Match: solo con interés mutuo para la misma vacante
create or replace function public.try_match(p_job uuid, p_candidate uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if exists (select 1 from candidate_job_actions where job_id = p_job and candidate_id = p_candidate and action = 'interest')
     and exists (select 1 from company_candidate_actions where job_id = p_job and candidate_id = p_candidate and action = 'interest') then
    select company_id into cid from jobs where id = p_job;
    insert into matches (job_id, candidate_id, company_id) values (p_job, p_candidate, cid) on conflict do nothing;
  end if;
end $$;
revoke execute on function public.try_match(uuid, uuid) from public, anon, authenticated;

create or replace function public.after_candidate_action() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform try_match(new.job_id, new.candidate_id); return new; end $$;
create trigger after_candidate_action after insert or update on public.candidate_job_actions for each row execute function public.after_candidate_action();

create or replace function public.after_company_action() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform try_match(new.job_id, new.candidate_id); return new; end $$;
create trigger after_company_action after insert or update on public.company_candidate_actions for each row execute function public.after_company_action();

-- ===== RLS =====
alter table public.profiles enable row level security;
alter table public.admins enable row level security;
alter table public.candidate_profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.jobs enable row level security;
alter table public.candidate_job_actions enable row level security;
alter table public.company_candidate_actions enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;
alter table public.audit_logs enable row level security;

create policy "perfil propio: leer" on public.profiles for select to authenticated using (id = auth.uid() or is_admin());
create policy "perfil propio: editar" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));

create policy "admins: ver propio" on public.admins for select to authenticated using (user_id = auth.uid());

create policy "candidato: leer propio" on public.candidate_profiles for select to authenticated using (user_id = auth.uid());
create policy "candidato: editar propio" on public.candidate_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "empresa: leer" on public.companies for select to authenticated
  using (verification_status = 'verified' or is_company_member(id) or is_admin());
create policy "empresa: crear" on public.companies for insert to authenticated
  with check (owner_id = auth.uid() and (select role from public.profiles where id = auth.uid()) = 'company');
create policy "empresa: editar" on public.companies for update to authenticated
  using (is_company_member(id) or is_admin()) with check (is_company_member(id) or is_admin());

create policy "miembros: leer" on public.company_members for select to authenticated using (user_id = auth.uid() or is_company_member(company_id) or is_admin());

create policy "vacantes: leer" on public.jobs for select to authenticated
  using (status = 'published' or is_company_member(company_id) or is_admin());
create policy "vacantes: crear" on public.jobs for insert to authenticated with check (is_company_member(company_id));
create policy "vacantes: editar" on public.jobs for update to authenticated using (is_company_member(company_id)) with check (is_company_member(company_id));
create policy "vacantes: borrar" on public.jobs for delete to authenticated using (is_company_member(company_id) and status in ('draft','pending'));

create policy "acciones candidato: propias" on public.candidate_job_actions for all to authenticated
  using (candidate_id = auth.uid())
  with check (candidate_id = auth.uid() and exists (select 1 from public.jobs j where j.id = job_id and j.status = 'published'));

create policy "acciones empresa: propias" on public.company_candidate_actions for all to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id and is_company_member(j.company_id)))
  with check (created_by = auth.uid() and exists (select 1 from public.jobs j join public.companies c on c.id = j.company_id
    where j.id = job_id and is_company_member(j.company_id) and c.verification_status = 'verified' and j.status = 'published'));

create policy "matches: participantes" on public.matches for select to authenticated
  using (candidate_id = auth.uid() or is_company_member(company_id));

create policy "mensajes: leer" on public.messages for select to authenticated using (is_match_participant(match_id));
create policy "mensajes: enviar" on public.messages for insert to authenticated with check (sender_id = auth.uid() and is_match_participant(match_id));

create policy "denuncias: crear" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "denuncias: admin" on public.reports for select to authenticated using (is_admin() or reporter_id = auth.uid());
create policy "denuncias: admin editar" on public.reports for update to authenticated using (is_admin());

create policy "auditoria: admin" on public.audit_logs for select to authenticated using (is_admin());

-- Realtime para chat
alter publication supabase_realtime add table public.messages;
