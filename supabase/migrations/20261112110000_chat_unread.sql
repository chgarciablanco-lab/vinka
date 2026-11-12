-- Mensajes no leídos: «hasta cuándo leí» cada conversación (por vacante), por persona. Se guarda en el servidor,
-- así funciona igual en todos los dispositivos. Solo cuentan los mensajes del otro lado:
--   persona → mensajes de la empresa; empresa → mensajes de la persona (los de un colega no cuentan).
-- El historial anterior a esta mejora no se cuenta como no leído.
create table if not exists public.chat_reads (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null,
  primary key (match_id, user_id)
);
create index if not exists chat_reads_user_idx on public.chat_reads (user_id);
alter table public.chat_reads enable row level security;
drop policy if exists chat_reads_own on public.chat_reads;
create policy chat_reads_own on public.chat_reads for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.chat_reads from anon, authenticated;
grant select on public.chat_reads to authenticated;

-- En vivo entre dispositivos (cada persona solo recibe sus propias filas por la regla de arriba)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_reads') then
    alter publication supabase_realtime add table public.chat_reads;
  end if;
end $$;

-- Desde cuándo se cuentan los no leídos (fijo: el momento en que se activó esta mejora)
do $m$ begin
  execute format($f$create or replace function public.chat_unread_since() returns timestamptz language sql immutable as $q$ select %L::timestamptz $q$$f$, now());
end $m$;

create or replace function public.my_unread()
returns table (match_id uuid, unread int, first_unread_at timestamptz)
language sql stable security definer set search_path = public as $$
  with mine as (
    select m.id, m.candidate_id, (m.candidate_id = auth.uid()) as cand
    from matches m
    where m.candidate_id = auth.uid() or is_company_member(m.company_id)
  )
  select x.id, count(*)::int, min(g.created_at)
  from mine x
  left join chat_reads cr on cr.match_id = x.id and cr.user_id = auth.uid()
  join messages g on g.match_id = x.id
   and g.created_at > greatest(coalesce(cr.read_at, '-infinity'::timestamptz), chat_unread_since())
   and case when x.cand then g.sender_id is distinct from auth.uid() else g.sender_id = x.candidate_id end
  group by x.id
$$;
revoke execute on function public.my_unread() from public, anon;
grant execute on function public.my_unread() to authenticated;

-- Marca como leído hasta un momento concreto (el último mensaje que se mostró en pantalla), nunca más allá de ahora
-- y nunca hacia atrás. También marca como leídos los avisos «Mensaje de…» de la campana de esas conversaciones.
create or replace function public.mark_chat_read(p_matches uuid[], p_until timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_until timestamptz := least(coalesce(p_until, now()), now()); v_ids uuid[];
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  if coalesce(array_length(p_matches, 1), 0) > 50 then raise exception 'Demasiadas conversaciones'; end if;
  select array_agg(m.id) into v_ids from matches m
   where m.id = any(p_matches) and (m.candidate_id = auth.uid() or is_company_member(m.company_id));
  if v_ids is null then return; end if;
  insert into chat_reads (match_id, user_id, read_at)
  select unnest(v_ids), auth.uid(), v_until
  on conflict (match_id, user_id) do update set read_at = greatest(chat_reads.read_at, excluded.read_at);
  update notifications set read_at = now()
   where user_id = auth.uid() and kind = 'message' and read_at is null and created_at <= v_until
     and url = any (select '/chats/' || i from unnest(v_ids) i);
end $$;
revoke execute on function public.mark_chat_read(uuid[], timestamptz) from public, anon;
grant execute on function public.mark_chat_read(uuid[], timestamptz) to authenticated;
