import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { presenceText, untilText } from '../lib/presence'
import { Sheet } from './ui'
import { atLocal, ymd } from '../lib/dates'

/** Punto de estado sobre un avatar: verde = en línea, gris = activo hace poco */
export function WithDot({ p, children, size = 12 }) {
  const on = p?.status === 'online'
  const recent = p?.status === 'recent'
  const away = p?.status === 'away'
  return (
    <span className="relative inline-flex shrink-0">
      {children}
      {(on || recent || away) && (
        <span aria-hidden="true" className={`absolute bottom-0 right-0 flex items-center justify-center rounded-full border-2 border-white ${away ? 'bg-[#D93636]' : on ? 'bg-[#22A55A]' : 'bg-[#C9BFC6]'}`} style={{ width: size, height: size }}>
          {away && <span className="block h-[2px] w-1/2 rounded bg-white" />}
        </span>
      )}
    </span>
  )
}

/** Texto corto de estado ("En línea", "Activo/a hace 5 min", "Activo/a hoy") */
export function PresenceLine({ p, company = false, className = '' }) {
  const t = presenceText(p, { company })
  if (!t) return null
  const on = p.status === 'online'
  const away = p.status === 'away'
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${away ? 'text-[#B42318]' : on ? 'text-[#1E7A45]' : 'text-tinta-suave'} ${className}`}>
      {(on || away) && <span aria-hidden="true" className={`h-2 w-2 rounded-full ${away ? 'bg-[#D93636]' : 'bg-[#22A55A]'}`} />}{t}
    </span>
  )
}

/** Ajuste de privacidad: mostrar u ocultar "en línea" */
export function OnlineToggle() {
  const { profile, refresh } = useAuth()
  const [on, setOn] = useState(profile?.show_online !== false)
  const [busy, setBusy] = useState(false)
  const change = async (v) => {
    setOn(v); setBusy(true)
    const { error } = await supabase.rpc('set_show_online', { p_on: v })
    if (error) setOn(!v)
    else { if (v) supabase.rpc('touch_presence').then(() => {}); await refresh() }
    setBusy(false)
  }
  return (
    <label className="card flex cursor-pointer items-start gap-3 p-4">
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-[15px] font-semibold"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${on ? 'bg-[#22A55A]' : 'bg-[#C9BFC6]'}`} />Mostrar cuando estoy en línea</span>
        <span className="text-[13px] leading-snug text-tinta-3">
          {on ? 'Los demás ven si estás conectado/a o hace cuánto. Ayuda a coordinar más rápido.' : 'Nadie ve tu estado. Mientras esté oculto, tú tampoco verás el estado de los demás.'}
        </span>
      </span>
      <span className="relative mt-0.5 inline-flex">
        <input type="checkbox" className="peer sr-only" checked={on} disabled={busy} onChange={(e) => change(e.target.checked)} />
        <span className="h-7 w-12 rounded-full bg-[#DDD3DA] transition peer-checked:bg-[#22A55A] peer-focus-visible:ring-2 peer-focus-visible:ring-[#22A55A]/40" />
        <span className="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  )
}

/** Aviso dentro del chat cuando la otra parte está "No disponible" */
export function AwayBanner({ p, name }) {
  if (p?.status !== 'away') return null
  const until = untilText(p.away_until)
  return (
    <div role="status" className="flex items-start gap-2.5 border-b border-[#F4C7C3] bg-[#FEF3F2] px-4 py-2.5 text-[13px] leading-snug text-[#7A1B12]">
      <span aria-hidden="true" className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#D93636]"><span className="block h-[2px] w-2 rounded bg-white" /></span>
      <span><b>{name} no está disponible{until ? ` ${until}` : ' por ahora'}.</b>{p.away_message ? ` «${p.away_message}»` : ''} Puedes escribir igual: verá tu mensaje al volver.</span>
    </div>
  )
}

const tomorrowAt9 = () => atLocal(ymd(Date.now() + 86400000), '09:00')
const nextMondayAt9 = () => { const dow = new Date(ymd(Date.now()) + 'T12:00:00Z').getUTCDay(); return atLocal(ymd(Date.now() + ((8 - dow) % 7 || 7) * 86400000), '09:00') }
const OPCIONES = [
  ['1 hora', () => new Date(Date.now() + 3600e3)],
  ['3 horas', () => new Date(Date.now() + 3 * 3600e3)],
  ['Hasta mañana 9:00', tomorrowAt9],
  ['Hasta el lunes 9:00', nextMondayAt9],
  ['Hasta que lo cambie', () => new Date(Date.now() + 59 * 864e5)],
]

/** Selector de disponibilidad: Disponible / No disponible (no molestar) */
export function AvailabilityPicker({ onDone }) {
  const { profile, refresh } = useAuth()
  const away = profile?.away_until && new Date(profile.away_until) > new Date()
  const [pick, setPick] = useState(2)
  const [msg, setMsg] = useState(profile?.away_message || '')
  const [busy, setBusy] = useState(false)
  const save = async (until) => {
    setBusy(true)
    await supabase.rpc('set_away', { p_until: until ? until.toISOString() : null, p_message: msg.trim() })
    await refresh(); setBusy(false); onDone?.()
  }
  return (
    <div className="flex flex-col gap-3">
      {away ? (
        <div className="rounded-xl border border-[#F4C7C3] bg-[#FEF3F2] p-3 text-sm text-[#7A1B12]">
          Estás como <b>No disponible</b> {untilText(profile.away_until) || 'hasta que lo cambies'}.{profile.away_message ? ` «${profile.away_message}»` : ''}
        </div>
      ) : (
        <p className="text-sm text-tinta-3">Mientras estés no disponible, no te llegarán notificaciones al teléfono (quedan en la campana) y quienes te escriban verán tu aviso.</p>
      )}
      {away && <button className="btn" disabled={busy} onClick={() => save(null)}><span aria-hidden="true" className="mr-1.5 h-2.5 w-2.5 rounded-full bg-[#22A55A]" />Volver a estar disponible</button>}
      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-2">{away ? 'Cambiar duración' : 'No disponible por'}</legend>
        <div className="grid grid-cols-2 gap-2">
          {OPCIONES.map(([l], i) => (
            <button key={l} type="button" aria-pressed={pick === i} onClick={() => setPick(i)}
              className={`h-11 rounded-xl border px-2 text-[13px] font-semibold ${pick === i ? 'border-[#D93636] bg-[#FEF3F2] text-[#B42318]' : 'border-linea bg-white'} ${i === OPCIONES.length - 1 ? 'col-span-2' : ''}`}>{l}</button>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1.5"><span className="label">Mensaje para quienes te escriban (opcional)</span>
        <input className="input" maxLength={140} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Ej.: En reuniones, respondo a las 16:00" /></label>
      <button className="btn h-12 bg-[#D93636]" disabled={busy} onClick={() => save(OPCIONES[pick][1]())}>{away ? 'Actualizar' : 'Ponerme como no disponible'}</button>
    </div>
  )
}

/** Botón de estado propio (para el encabezado): abre el selector */
export function StatusPill() {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const away = profile?.away_until && new Date(profile.away_until) > new Date()
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={away ? 'Estado: no disponible. Cambiar' : 'Estado: disponible. Cambiar'}
        className={`flex h-11 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold ${away ? 'border-[#F4C7C3] bg-[#FEF3F2] text-[#B42318]' : 'border-linea bg-white text-tinta-2'}`}>
        <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${away ? 'bg-[#D93636]' : 'bg-[#22A55A]'}`} />{away ? 'No disponible' : 'Disponible'}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Tu estado">
        <AvailabilityPicker onDone={() => setOpen(false)} />
      </Sheet>
    </>
  )
}
