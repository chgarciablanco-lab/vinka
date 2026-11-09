-- Migración aplicada en Supabase (20261105192447). Exportada tal cual desde supabase_migrations.schema_migrations.

do $$
declare f text;
begin
  foreach f in array array[
    'after_candidate_action()','after_company_action()','company_add_owner()','company_after_verify()',
    'company_guard()','handle_new_user()','job_guard()','try_match(uuid, uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'is_admin()','is_company_member(uuid)','is_verified_company_user()','is_match_participant(uuid)',
    'can_view_candidate_video(uuid)','candidate_video_path(uuid)','candidates_for_job(uuid)','company_stats(uuid)',
    'delete_my_account()','job_feed()','match_update(uuid, text, text)','my_interests()','my_matches()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
alter default privileges in schema public revoke execute on functions from public, anon;
