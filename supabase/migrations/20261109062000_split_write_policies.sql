-- Las políticas "escribir" eran FOR ALL y se sumaban a "leer" en cada SELECT.
-- Se dividen en insert/update/delete con exactamente las mismas condiciones; la lectura queda en "leer".
drop policy "acciones empresa: escribir" on public.company_candidate_actions;
create policy "acciones empresa: crear" on public.company_candidate_actions for insert to authenticated
  with check (created_by = (select auth.uid()) and exists (select 1 from jobs j join companies c on c.id = j.company_id
    where j.id = company_candidate_actions.job_id and can_manage(j.company_id) and c.verification_status = 'verified' and j.status = 'published'));
create policy "acciones empresa: editar" on public.company_candidate_actions for update to authenticated
  using (exists (select 1 from jobs j where j.id = company_candidate_actions.job_id and can_manage(j.company_id)))
  with check (created_by = (select auth.uid()) and exists (select 1 from jobs j join companies c on c.id = j.company_id
    where j.id = company_candidate_actions.job_id and can_manage(j.company_id) and c.verification_status = 'verified' and j.status = 'published'));
create policy "acciones empresa: borrar" on public.company_candidate_actions for delete to authenticated
  using (exists (select 1 from jobs j where j.id = company_candidate_actions.job_id and can_manage(j.company_id)));

drop policy "externos: escribir" on public.external_applicants;
create policy "externos: crear" on public.external_applicants for insert to authenticated
  with check (can_manage(company_id) and exists (select 1 from jobs j where j.id = external_applicants.job_id and j.company_id = external_applicants.company_id));
create policy "externos: editar" on public.external_applicants for update to authenticated
  using (can_manage(company_id))
  with check (can_manage(company_id) and exists (select 1 from jobs j where j.id = external_applicants.job_id and j.company_id = external_applicants.company_id));
create policy "externos: borrar" on public.external_applicants for delete to authenticated using (can_manage(company_id));

drop policy "plantillas: escribir" on public.message_templates;
create policy "plantillas: crear" on public.message_templates for insert to authenticated with check (can_manage(company_id));
create policy "plantillas: editar" on public.message_templates for update to authenticated using (can_manage(company_id)) with check (can_manage(company_id));
create policy "plantillas: borrar" on public.message_templates for delete to authenticated using (can_manage(company_id));
