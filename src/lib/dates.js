// Fechas y horas siempre en hora de Chile (America/Santiago), sin importar la zona del navegador.
// Antes se usaba la zona del dispositivo: un computador en otra zona veía la entrevista a otra hora que el mensaje del servidor.
export const TZ = 'America/Santiago'
export const pad = (n) => String(n).padStart(2, '0')
const PARTS = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const parts = (d) => Object.fromEntries(PARTS.formatToParts(new Date(d)).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]))
/** Diferencia en ms entre la hora de Chile y UTC en ese instante */
const offsetAt = (ms) => { const p = parts(ms); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ms }
export const ymd = (d) => { const p = parts(d); return `${p.year}-${p.month}-${p.day}` }
export const hm = (d) => { const p = parts(d); return `${pad(+p.hour % 24)}:${p.minute}` }
export const dayNum = (d) => Number(parts(d).day)
/** Día 'YYYY-MM-DD' + hora 'HH:MM' en hora de Chile → instante real */
export const atLocal = (day, time) => {
  const [y, m, d] = day.split('-').map(Number); const [h, mi] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h, mi)
  let t = guess - offsetAt(guess)
  const o2 = offsetAt(t); if (guess - o2 !== t) t = guess - o2
  return new Date(t)
}
/** Valor para un <input type="datetime-local"> en hora de Chile, y su vuelta */
export const toInputLocal = (d) => `${ymd(d)}T${hm(d)}`
export const fromInputLocal = (v) => (v ? atLocal(v.slice(0, 10), v.slice(11, 16)) : null)
/** true si el dispositivo no está en hora de Chile (para avisar en pantallas de agenda) */
export const outsideChile = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone !== TZ && offsetAt(Date.now()) !== -new Date().getTimezoneOffset() * 60000 } catch { return false } }
export const fmtTime = (d) => new Date(d).toLocaleTimeString('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
export const fmtDayLong = (d) => {
  const s = new Date(d).toLocaleDateString('es-CL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
export const fmtDayShort = (d) => new Date(typeof d === 'string' && d.length === 10 ? d + 'T12:00:00-04:00' : d).toLocaleDateString('es-CL', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })

/** Toda la app formatea en hora de Chile salvo que se pida otra zona (cubre los toLocale* repartidos en las pantallas) */
export function installChileTime() {
  if (Date.prototype.__vinkaTz) return
  for (const k of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']) {
    const orig = Date.prototype[k]
    Date.prototype[k] = function (loc, opts) { return orig.call(this, loc, { timeZone: TZ, ...(opts || {}) }) }
  }
  Object.defineProperty(Date.prototype, '__vinkaTz', { value: true })
}
export const minutes = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000)
export const isToday = (d) => ymd(d) === ymd(new Date())

const icsDate = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const esc = (s) => String(s || '').replace(/[\\;,]/g, (m) => '\\' + m).replace(/\n/g, '\\n')

export function calendarLinks({ title, start, end, location, details }) {
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VINKA//Entrevistas//ES', 'BEGIN:VEVENT',
    `UID:${icsDate(start)}-${Math.random().toString(36).slice(2)}@vinka`, `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`, `SUMMARY:${esc(title)}`, `LOCATION:${esc(location)}`, `DESCRIPTION:${esc(details)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Entrevista VINKA', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
  const google = 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    `&text=${encodeURIComponent(title)}&dates=${icsDate(start)}/${icsDate(end)}` +
    `&details=${encodeURIComponent(details || '')}&location=${encodeURIComponent(location || '')}`
  return { ics: 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics), google }
}
