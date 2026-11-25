#!/bin/bash
# Dos personas del mismo equipo publican a la vez cuando queda UN cupo del plan (base AISLADA).
# Se usan dos sesiones reales en paralelo; los datos se crean con un prefijo propio y se borran al final.
# Resultado esperado: una publica, la otra recibe «Tu plan ... permite ... a la vez». Falla (código 1) si ambas publican.
set -u
PSQL="psql -h localhost -p 54329 -U postgres -d vinka -At -v ON_ERROR_STOP=1"
OWN=$(cat /proc/sys/kernel/random/uuid); TAG="cupo-$(date +%s)"
$PSQL -q <<SQL >/dev/null
insert into auth.users (id, email, raw_user_meta_data) values ('$OWN', '$TAG@cupo.test', '{"role":"company","first_name":"Olga","last_name":"Cupo"}');
insert into companies (owner_id, display_name, legal_name, rut, verification_status) values ('$OWN', '$TAG', '$TAG SpA', '76.555.123-4', 'verified');
insert into jobs (company_id, title, area, level, description, modality, schedule, contract, region, comuna, status)
select c.id, 'Vacante ' || g, 'ventas', 'junior', 'Atención de clientes en sala de ventas, jornada completa y turnos.', 'presencial', 'completa', 'indefinido', 'Maule', 'Talca',
       case when g <= (plan_of(c.id)).max_active_jobs - 1 then 'published' else 'draft' end
from companies c, generate_series(1, (select (plan_of(id)).max_active_jobs + 1 from companies where display_name = '$TAG')) g where c.display_name = '$TAG';
SQL
read -r J1 J2 <<<"$($PSQL -c "select string_agg(j.id::text, ' ' order by j.title) from jobs j join companies c on c.id = j.company_id where c.display_name = '$TAG' and j.status = 'draft'")"
pub() { $PSQL 2>&1 <<SQL
begin;
select set_config('request.jwt.claims', json_build_object('sub', '$OWN', 'role', 'authenticated')::text, true);
set local role authenticated;
update jobs set status = 'published' where id = '$1';
select pg_sleep(1.5);
commit;
SQL
}
pub "$J1" > /tmp/cupo_a.txt & pub "$J2" > /tmp/cupo_b.txt & wait
LIM=$($PSQL -c "select (plan_of(id)).max_active_jobs from companies where display_name = '$TAG'")
N=$($PSQL -c "select count(*) from jobs j join companies c on c.id = j.company_id where c.display_name = '$TAG' and j.status = 'published'")
REJ=$(cat /tmp/cupo_a.txt /tmp/cupo_b.txt | grep -c 'a la vez')
$PSQL -q -c "delete from jobs where company_id in (select id from companies where display_name = '$TAG'); delete from companies where display_name = '$TAG'; delete from auth.users where id = '$OWN';" >/dev/null 2>&1
rm -f /tmp/cupo_a.txt /tmp/cupo_b.txt
OK=$([ "$N" = "$LIM" ] && [ "$REJ" = 1 ] && echo true || echo false)
echo "1 dos publicaciones simultáneas con 1 cupo libre (límite $LIM): quedan $N publicadas y $REJ rechazada con mensaje del plan: $OK"
[ "$OK" = true ]
