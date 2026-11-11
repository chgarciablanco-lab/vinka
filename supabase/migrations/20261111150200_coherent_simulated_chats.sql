-- Chats simulados coherentes (solo procesos donde la persona y todo el equipo de la empresa son cuentas @example.com).
-- 1) Género neutro en mensajes simulados («¡Bienvenido, Camila!», «Muy contento», «quedo atento»).
-- 2) «Te dejé horarios» ahora coincide con la regla nueva: la empresa invitó a agendar (agenda habilitada) y el texto lo dice.
-- 3) «Ya reservé un horario» no puede ser anterior a la reserva: la entrevista queda creada 1 minuto antes del mensaje.
-- 4) «Gracias por la entrevista» cuando todas las entrevistas se cancelaron → agradecimiento sin mencionar entrevista.
-- 5) Matches creados después de sus primeros mensajes → el match queda 10 minutos antes del primer mensaje.
create temp table sim on commit drop as
  select m.id from matches m join auth.users cu on cu.id = m.candidate_id
  where cu.email like '%example.com'
    and not exists (select 1 from company_members cm join auth.users u on u.id = cm.user_id where cm.company_id = m.company_id and u.email not like '%example.com');

create table if not exists backup.messages_chats_20261111 as
  select x.* from messages x where x.match_id in (select id from sim) and (
    x.body ~ '^(¡Bienvenido, |¡Acepté la oferta! Muy contento|Gracias a ustedes, quedo atento|Muchas gracias por avisarme. Quedo atento|Perfecto. Te dejé horarios)'
    or (x.body like 'Gracias por la entrevista,%' and not exists (select 1 from interviews i where i.match_id = x.match_id and i.status <> 'cancelada')));
create table if not exists backup.matches_chats_20261111 as select m.* from matches m where m.id in (select id from sim);
create table if not exists backup.interviews_chats_20261111 as select i.* from interviews i where i.match_id in (select id from sim);

-- 1) Género neutro
update messages set body = regexp_replace(body, '^¡Bienvenido, ([^!]+)!', '¡Te damos la bienvenida al equipo, \1!')
  where match_id in (select id from sim) and body like '¡Bienvenido, %';
update messages set body = replace(body, 'Muy contento de sumarme', 'Me alegra mucho sumarme')
  where match_id in (select id from sim) and body like '¡Acepté la oferta! Muy contento%';
update messages set body = 'Gracias a ustedes, quedo a la espera de sus comentarios.'
  where match_id in (select id from sim) and body = 'Gracias a ustedes, quedo atento a sus comentarios.';
update messages set body = 'Muchas gracias por avisarme. Me encantaría que me consideren en futuras oportunidades.'
  where match_id in (select id from sim) and body = 'Muchas gracias por avisarme. Quedo atento a futuras oportunidades.';

-- 2) Invitación a agendar coherente con la agenda habilitada
update matches m set can_schedule = true,
  schedule_invited_at = (select min(x.created_at) from messages x where x.match_id = m.id and x.body like 'Perfecto. Te dejé horarios%')
  where m.id in (select id from sim) and not m.can_schedule
    and exists (select 1 from messages x where x.match_id = m.id and x.body like 'Perfecto. Te dejé horarios%');
update messages set body = 'Perfecto. Te invité a agendar: elige en VINKA el horario que más te acomode para la entrevista.'
  where match_id in (select id from sim) and body = 'Perfecto. Te dejé horarios disponibles en VINKA para que elijas el que más te acomode para la entrevista.';

-- 3) La reserva existe antes del «ya reservé»
update interviews i set created_at = x.created_at - interval '1 minute'
  from messages x
  where x.match_id = i.match_id and i.match_id in (select id from sim)
    and x.body like 'Listo, ya reservé%' and x.created_at < i.created_at - interval '5 minutes';

-- 4) Agradecimiento sin entrevista realizada
update messages x set body = regexp_replace(body, '^Gracias por la entrevista, ([^.]+)\. Fue un gusto conocerte; ', 'Gracias por tu tiempo, \1. ')
  where x.match_id in (select id from sim) and x.body like 'Gracias por la entrevista,%'
    and not exists (select 1 from interviews i where i.match_id = x.match_id and i.status <> 'cancelada');

-- 5) El match existe antes de su chat
update matches m set created_at = (select min(x.created_at) from messages x where x.match_id = m.id) - interval '10 minutes'
  where m.id in (select id from sim) and exists (select 1 from messages x where x.match_id = m.id and x.created_at < m.created_at);
