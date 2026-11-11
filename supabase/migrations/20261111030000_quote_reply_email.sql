-- Responder cotizaciones por correo desde Administración (vía Resend, con respuesta a contacto@vinka.cl)
alter table public.quote_requests add column if not exists reply_subject text not null default '';
alter table public.quote_requests add column if not exists reply_body text not null default '';
alter table public.quote_requests add column if not exists replied_at timestamptz;
alter table public.quote_requests add column if not exists replied_by uuid references auth.users(id) on delete set null;
alter table public.quote_requests add column if not exists reply_status text not null default '';

create or replace function public.admin_reply_quote(p_id uuid, p_subject text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo administración de VINKA'; end if;
  if coalesce(trim(p_subject), '') = '' or length(trim(coalesce(p_body, ''))) < 20 then raise exception 'Escribe el asunto y el mensaje'; end if;
  if p_body ~ '\[[^\]]+\]' then raise exception 'Completa o borra las partes entre corchetes antes de enviar'; end if;
  if exists (select 1 from quote_requests where id = p_id and replied_at > now() - interval '2 minutes') then raise exception 'Acabas de responder esta cotización. Espera un momento.'; end if;
  update quote_requests set reply_subject = left(trim(p_subject), 200), reply_body = left(p_body, 8000), replied_at = now(), replied_by = auth.uid(),
    reply_status = 'enviando', status = case when status = 'nuevo' then 'contactado' else status end, updated_at = now()
  where id = p_id;
  if not found then raise exception 'Cotización no encontrada'; end if;
  perform notify_event('quote_reply', p_id);
end $$;
revoke execute on function public.admin_reply_quote(uuid, text, text) from public, anon;
grant execute on function public.admin_reply_quote(uuid, text, text) to authenticated;
