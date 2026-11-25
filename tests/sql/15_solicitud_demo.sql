-- «Solicitar demo» (migración 20261124030000): se registra con motivo «demo» y avisa a VINKA. Todo se deshace con rollback.
begin;
do $t$
declare v_id uuid; ok boolean; msg text; out text;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon';
  v_id := submit_quote('{"company_name":"Ferretería Prueba","contact_name":"Rosa Prueba","email":"rosa.demo@example.com","reason":"demo","consent":true}'::jsonb);
  execute 'reset role';
  ok := (select reason from quote_requests where id = v_id) = 'demo' and exists (select 1 from notifications where title = 'Nueva solicitud de demo' and created_at > now() - interval '1 minute');
  begin perform submit_quote('{"company_name":"X","contact_name":"Y","email":"y@example.com","reason":"demo","consent":false}'::jsonb); msg := 'aceptó'; exception when others then msg := sqlerrm; end;
  out := E'\n1 demo sin cuenta: queda con motivo «demo» y VINKA recibe «Nueva solicitud de demo»: ' || ok
    || E'\n2 sin autorizar el uso de datos no se envía: ' || (msg like 'Para responderte%');
  raise notice '%', out;
  -- Si alguna comprobación da «false», la prueba FALLA (no solo lo imprime)
  if out ~ ': false' then raise exception 'PRUEBA FALLIDA:%', out; end if;
end $t$;
rollback;
