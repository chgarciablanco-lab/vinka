// Calendario suscribible de VINKA (formato iCalendar).
// Google Calendar, Outlook y iPhone se suscriben a: /functions/v1/calendar?t=<token personal>
// El token es secreto y se puede regenerar desde la app.
import { createClient } from 'npm:@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

const esc = (s: unknown) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const stamp = (d: string) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
// Líneas de máximo 75 octetos (RFC 5545)
const fold = (line: string) => {
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 73) { out.push(cur); cur = ' ' + ch } else cur += ch
  }
  out.push(cur)
  return out.join('\r\n')
}

Deno.serve(async (req) => {
  const t = new URL(req.url).searchParams.get('t') || ''
  if (!/^[0-9a-f-]{36}$/i.test(t)) return new Response('Enlace no válido', { status: 404 })
  const { data, error } = await sb.rpc('calendar_feed', { p_token: t })
  if (error || !data) return new Response('Enlace no válido', { status: 404 })
  const { data: cfg } = await sb.rpc('get_push_config')
  const app = cfg?.app_url || 'https://vinka-alpha.vercel.app'
  const company = data.role === 'company'

  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VINKA//Entrevistas//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${company ? 'VINKA · Entrevistas' : 'VINKA · Mis entrevistas'}`, 'X-WR-TIMEZONE:America/Santiago',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ]
  for (const e of data.events || []) {
    const online = e.mode === 'online'
    const title = company ? `Entrevista: ${e.candidate} · ${e.job}` : `Entrevista con ${e.company} · ${e.job}`
    const desc = [
      company ? `Candidato/a: ${e.candidate}` : `Empresa: ${e.company}`,
      `Vacante: ${e.job}`,
      online ? `Videollamada: ${e.meeting_url}` : `Dirección: ${e.address}`,
      e.notes ? `Indicaciones: ${e.notes}` : '',
      `Chat en VINKA: ${app}/chats/${e.match_id}`,
    ].filter(Boolean).join('\n')
    lines.push('BEGIN:VEVENT', `UID:${e.id}@vinka`, `DTSTAMP:${stamp(e.created_at)}`, `DTSTART:${stamp(e.starts_at)}`, `DTEND:${stamp(e.ends_at)}`,
      `SUMMARY:${esc((e.status === 'cancelada' ? 'CANCELADA · ' : '') + title)}`, `DESCRIPTION:${esc(desc)}`,
      `LOCATION:${esc(online ? e.meeting_url : e.address)}`, `URL:${app}/chats/${e.match_id}`,
      `STATUS:${e.status === 'cancelada' ? 'CANCELLED' : 'CONFIRMED'}`)
    if (e.status !== 'cancelada') lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Entrevista en 30 minutos', 'TRIGGER:-PT30M', 'END:VALARM')
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="vinka.ics"', 'Cache-Control': 'private, max-age=900' },
  })
})
