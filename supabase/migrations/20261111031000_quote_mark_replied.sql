-- Cotizaciones: registrar una respuesta enviada desde el correo propio (no pasa por VINKA, así que se marca a mano)
create or replace function public.admin_mark_quote_replied(p_id uuid, p_subject text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  update quote_requests set reply_subject = left(coalesce(trim(p_subject), ''), 200), reply_body = left(coalesce(p_body, ''), 8000), replied_at = now(), replied_by = auth.uid(),
    reply_status = 'correo_propio', status = case when status = 'nuevo' then 'contactado' else status end, updated_at = now()
  where id = p_id;
  if not found then raise exception 'Cotización no encontrada'; end if;
end $$;
revoke execute on function public.admin_mark_quote_replied(uuid, text, text) from public, anon;
grant execute on function public.admin_mark_quote_replied(uuid, text, text) to authenticated;
