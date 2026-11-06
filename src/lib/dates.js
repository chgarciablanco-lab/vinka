// Fechas en la hora local del teléfono (Chile)
export const pad = (n) => String(n).padStart(2, '0')
export const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}` }
export const hm = (d) => { const x = new Date(d); return `${pad(x.getHours())}:${pad(x.getMinutes())}` }
export const atLocal = (day, time) => new Date(`${day}T${time}:00`)
export const fmtTime = (d) => new Date(d).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
export const fmtDayLong = (d) => {
  const s = new Date(d).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
export const fmtDayShort = (d) => new Date(typeof d === 'string' && d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })
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
