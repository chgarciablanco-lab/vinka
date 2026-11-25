#!/bin/bash
# Consultora (matriz) y su cliente comparten el cupo del plan. Dos personas distintas publican a la vez cuando queda UN cupo (base AISLADA):
# la dueña de la consultora publica en la matriz y una administradora del cliente publica en el cliente.
# Datos con prefijo propio, borrados al final. Falla (código 1) si ambas publican o si el mensaje no dice cómo liberar un cupo.
set -u
PSQL="psql -h localhost -p 54329 -U postgres -d vinka -At -v ON_ERROR_STOP=1"
OWN=$(cat /proc/sys/kernel/random/uuid); ADM=$(cat /proc/sys/kernel/random/uuid); TAG="mc-$(date +%s)"
$PSQL -q <<SQL >/dev/null
insert into auth.users (id, email, raw_user_meta_data) values
  ('$OWN', '$TAG-o@cupo.test', '{"role":"company","first_name":"Olga","last_name":"Matriz"}'),
  ('$ADM', '$TAG-a@cupo.test', '{"role":"company","first_name":"Ada","last_name":"Cliente"}');
insert into companies (owner_id, display_name, legal_name, rut, verification_status, kind) values ('$OWN', '$TAG', '$TAG SpA', '76.111.222-8', 'verified', 'consultora');
insert into companies (owner_id, parent_id, display_name, legal_name, rut, verification_status, kind)
  select '$OWN', id, '$TAG-cli', '$TAG Cliente SpA', '76.333.444-9', 'verified', 'empresa' from companies where display_name = '$TAG';
insert into company_members (company_id, user_id, role) select id, '$ADM', 'admin' from companies where display_name = '$TAG-cli' on conflict do nothing;
-- La matriz ocupa todos los cupos menos uno; queda un borrador en la matriz y otro en el cliente
insert into jobs (company_id, title, area, level, description, modality, schedule, contract, region, comuna, status)
select c.id, 'Vacante ' || g, 'ventas', 'junior', 'Atención de clientes en sala de ventas, jornada completa y turnos.', 'presencial', 'completa', 'indefinido', 'Maule', 'Talca', 'published'
from companies c, generate_series(1, (select (plan_of(id)).max_active_jobs - 1 from companies where display_name = '$TAG')) g where c.display_name = '$TAG';
insert into jobs (company_id, title, area, level, description, modality, schedule, contract, region, comuna, status)
select c.id, 'Borrador ' || c.display_name, 'ventas', 'junior', 'Atención de clientes en sala de ventas, jornada completa y turnos.', 'presencial', 'completa', 'indefinido', 'Maule', 'Talca', 'draft'
from companies c where c.display_name in ('$TAG', '$TAG-cli');
SQL
J1=$($PSQL -c "select j.id from jobs j join companies c on c.id = j.company_id where c.display_name = '$TAG' and j.status = 'draft'")
J2=$($PSQL -c "select j.id from jobs j join companies c on c.id = j.company_id where c.display_name = '$TAG-cli' and j.status = 'draft'")
pub() { $PSQL 2>&1 <<SQL
begin;
select set_config('request.jwt.claims', json_build_object('sub', '$1', 'role', 'authenticated')::text, true);
set local role authenticated;
update jobs set status = 'published' where id = '$2';
select pg_sleep(1.5);
commit;
SQL
}
pub "$OWN" "$J1" > /tmp/mc_a.txt & pub "$ADM" "$J2" > /tmp/mc_b.txt & wait
LIM=$($PSQL -c "select (plan_of(id)).max_active_jobs from companies where display_name = '$TAG'")
N=$($PSQL -c "select count(*) from jobs j join companies c on c.id = j.company_id where c.display_name like '$TAG%' and j.status = 'published'")
REJ=$(cat /tmp/mc_a.txt /tmp/mc_b.txt | grep -c 'a la vez')
MSG=$(cat /tmp/mc_a.txt /tmp/mc_b.txt | grep -o 'Tu plan.*' | head -1)
$PSQL -q -c "delete from jobs where company_id in (select id from companies where display_name like '$TAG%'); delete from company_members where company_id in (select id from companies where display_name like '$TAG%'); delete from companies where display_name = '$TAG-cli'; delete from companies where display_name = '$TAG'; delete from auth.users where id in ('$OWN', '$ADM');" >/dev/null 2>&1
LEFT=$($PSQL -c "select count(*) from companies where display_name like '$TAG%'")
rm -f /tmp/mc_a.txt /tmp/mc_b.txt
OK=$([ "$N" = "$LIM" ] && [ "$REJ" = 1 ] && echo "$MSG" | grep -q 'Pausa o cierra' && echo true || echo false)
echo "1 matriz y cliente publican a la vez con 1 cupo compartido (límite $LIM): quedan $N publicadas, $REJ rechazada; mensaje: «$MSG»: $OK"
echo "  datos de prueba borrados: $([ "$LEFT" = 0 ] && echo sí || echo NO)"
[ "$OK" = true ]
