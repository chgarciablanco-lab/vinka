import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { presenceText } from '../lib/presence'

/** Punto de estado sobre un avatar: verde = en línea, gris = activo hace poco */
export function WithDot({ p, children, size = 12 }) {
  const on = p?.status === 'online'
  const recent = p?.status === 'recent'
  return (
    <span className="relative inline-flex shrink-0">
      {children}
      {(on || recent) && (
        <span aria-hidden="true" className={`absolute bottom-0 right-0 rounded-full border-2 border-white ${on ? 'bg-[#22A55A]' : 'bg-[#C9BFC6]'}`} style={{ width: size, height: size }} />
      )}
    </span>
  )
}

/** Texto corto de estado ("En línea", "Activo/a hace 5 min", "Activo/a hoy") */
export function PresenceLine({ p, company = false, className = '' }) {
  const t = presenceText(p, { company })
  if (!t) return null
  const on = p.status === 'online'
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${on ? 'text-[#1E7A45]' : 'text-tinta-suave'} ${className}`}>
      {on && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#22A55A]" />}{t}
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
