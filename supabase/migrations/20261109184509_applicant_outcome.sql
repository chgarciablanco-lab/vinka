-- Migración aplicada en Supabase (20261109184509). Exportada tal cual desde supabase_migrations.schema_migrations.

create or replace function public.notify_applicant_declined() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jobs; co text;
begin
  if new.action <> 'pass' or (tg_op = 'UPDATE' and old.action = 'pass') then return new; end if;
  if not exists (select 1 from candidate_job_actions a where a.job_id = new.job_id and a.candidate_id = new.candidate_id and a.action = 'interest') then return new; end if;
  if exists (select 1 from matches m where m.job_id = new.job_id and m.candidate_id = new.candidate_id) then return new; end if;
  select * into j from jobs where id = new.job_id;
  select display_name into co from companies where id = j.company_id;
  perform notify_users(array[new.candidate_id], 'applicant_declined', 'Actualización de tu postulación',
    co || ' decidió avanzar con otras personas para «' || j.title || '». Gracias por tu interés: sigue explorando, hay más vacantes para ti.', '/intereses', true);
  return new;
end $$;
revoke execute on function public.notify_applicant_declined() from public, anon, authenticated;
drop trigger if exists notify_applicant_declined on public.company_candidate_actions;
create trigger notify_applicant_declined after insert or update of action on public.company_candidate_actions
  for each row execute function public.notify_applicant_declined();

drop function if exists public.my_interests();
create function public.my_interests()
 returns table(kind text, job_id uuid, title text, company_name text, comuna text, modality text, created_at timestamptz, status text)
 language sql stable security definer set search_path to 'public'
as $function$
  select case a.action when 'interest' then 'sent' else 'saved' end, j.id, j.title, co.display_name, j.comuna, j.modality, a.created_at,
    case when a.action = 'interest' and exists (select 1 from company_candidate_actions x where x.job_id = j.id and x.candidate_id = a.candidate_id and x.action = 'pass') then 'no_seleccionado'
         when j.status <> 'published' then 'cerrada'
         else 'pendiente' end
  from candidate_job_actions a join jobs j on j.id = a.job_id join companies co on co.id = j.company_id
  where a.candidate_id = auth.uid() and a.action in ('interest', 'save')
    and not exists (select 1 from matches m where m.job_id = j.id and m.candidate_id = auth.uid())
  union all
  select 'invited', j.id, j.title, co.display_name, j.comuna, j.modality, x.created_at, 'pendiente'
  from company_candidate_actions x join jobs j on j.id = x.job_id join companies co on co.id = j.company_id
  where x.candidate_id = auth.uid() and x.action = 'interest' and j.status = 'published'
    and not exists (select 1 from candidate_job_actions a where a.job_id = j.id and a.candidate_id = auth.uid())
  order by 7 desc;
$function$;
revoke execute on function public.my_interests() from public, anon;
grant execute on function public.my_interests() to authenticated;
