-- Fotos de la empresa: las sube quien administra la empresa y los postulantes las ven en el detalle de cada vacante
-- (no en vacantes confidenciales, para no revelar la empresa).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-photos', 'company-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "fotos empresa: subir (admin de la empresa)" on storage.objects;
create policy "fotos empresa: subir (admin de la empresa)" on storage.objects for insert to authenticated
  with check (bucket_id = 'company-photos' and is_company_admin(request_folder(name)));
drop policy if exists "fotos empresa: borrar (admin de la empresa)" on storage.objects;
create policy "fotos empresa: borrar (admin de la empresa)" on storage.objects for delete to authenticated
  using (bucket_id = 'company-photos' and (is_company_admin(request_folder(name)) or is_admin()));

alter table public.companies add column if not exists photos jsonb not null default '[]'::jsonb;

create or replace function public.set_company_photos(p_company uuid, p_photos jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare x jsonb;
begin
  if not (is_company_admin(p_company) or is_admin()) then raise exception 'Solo quien administra la empresa puede cambiar las fotos'; end if;
  if jsonb_typeof(p_photos) <> 'array' or jsonb_array_length(p_photos) > 8 then raise exception 'Puedes tener hasta 8 fotos'; end if;
  for x in select * from jsonb_array_elements(p_photos) loop
    if coalesce(x->>'path', '') not like p_company::text || '/%' then raise exception 'Foto no válida'; end if;
  end loop;
  update companies set photos = (select coalesce(jsonb_agg(jsonb_build_object('path', e->>'path', 'caption', left(coalesce(e->>'caption', ''), 120))), '[]'::jsonb) from jsonb_array_elements(p_photos) e)
  where id = p_company;
end $$;
revoke execute on function public.set_company_photos(uuid, jsonb) from public, anon;
grant execute on function public.set_company_photos(uuid, jsonb) to authenticated;

-- Fotos para el detalle de una vacante (también sin sesión, en la página pública)
create or replace function public.job_photos(p_job uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select c.photos from jobs j join companies c on c.id = j.company_id
    where j.id = p_job and not coalesce(j.confidential, false) and c.verification_status = 'verified'
      and (j.status = 'published' or is_company_member(j.company_id) or exists (select 1 from matches m where m.job_id = j.id and m.candidate_id = auth.uid()))), '[]'::jsonb) $$;
grant execute on function public.job_photos(uuid) to anon, authenticated;
