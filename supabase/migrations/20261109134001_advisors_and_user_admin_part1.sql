-- Migración aplicada en Supabase (20261109134001). Exportada tal cual desde supabase_migrations.schema_migrations.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('candidate', 'company', 'advisor'));
alter table public.profiles add column if not exists suspended_at timestamptz;
alter table public.profiles add column if not exists suspended_reason text not null default '';
alter table public.profiles add column if not exists must_change_password boolean not null default false;

create table if not exists public.advisors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  specialty text not null default '',
  active boolean not null default true,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists idx_advisors_created_by on public.advisors (created_by);
alter table public.advisors enable row level security;
create policy "asesores: el propio y administración" on public.advisors for select to authenticated
  using (user_id = (select auth.uid()) or (select is_admin()));

create or replace function public.is_advisor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from advisors where user_id = auth.uid() and active)
$$;

create or replace function public.can_access_request(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from service_requests r where r.id = p
    and (r.candidate_id = auth.uid() or (r.assigned_to = auth.uid() and is_advisor()) or is_admin()))
$$;

drop policy if exists "asesorías: la persona ve las suyas" on public.service_requests;
create policy "asesorías: participantes y administración" on public.service_requests for select to authenticated
  using (candidate_id = (select auth.uid()) or (assigned_to = (select auth.uid()) and (select is_advisor())) or (select is_admin()));

create table if not exists public.service_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  body text not null default '',
  file_path text,
  file_name text,
  created_at timestamptz not null default now()
);
create index if not exists idx_service_messages_request on public.service_messages (request_id, created_at);
create index if not exists idx_service_messages_sender on public.service_messages (sender_id);
alter table public.service_messages enable row level security;
create policy "asesorías: mensajes para participantes" on public.service_messages for select to authenticated
  using ((select can_access_request(request_id)));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('asesorias', 'asesorias', false, 10485760,
  array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

create or replace function public.request_folder(p_name text) returns uuid
language plpgsql immutable as $$
begin return split_part(p_name, '/', 1)::uuid; exception when others then return null; end $$;

create policy "asesorías: leer archivos de la solicitud" on storage.objects for select to authenticated
  using (bucket_id = 'asesorias' and public.can_access_request(public.request_folder(name)));
create policy "asesorías: subir archivos a la solicitud" on storage.objects for insert to authenticated
  with check (bucket_id = 'asesorias' and public.can_access_request(public.request_folder(name)));

create or replace function public.has_contact_info(t text) returns boolean
language sql immutable as $$
  select coalesce(t, '') ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
      or coalesce(t, '') ~ '\d{8,}'
      or coalesce(t, '') ~ '(^|\D)9[\s.-]?\d{4}[\s.-]?\d{4}(\D|$)'
      or coalesce(t, '') ~ '\+\s*\d{2}[\s.-]*\d'
      or coalesce(t, '') ~* '(wa\.me|whatsapp\.com|api\.whatsapp|t\.me/|telegram|instagram\.com|facebook\.com|fb\.me|linkedin\.com/in|tiktok\.com)'
      or coalesce(t, '') ~* '(^|\s)@[a-z0-9._]{3,}'
$$;
