import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { disablePush, enablePush, pushStatus } from '../lib/push'
import { errMsg } from '../lib/supabase'

const MOBILE = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

/** Tarjeta para activar las notificaciones de match en este teléfono. */
export function NotifyCard({ compact = false }) {
  const { user } = useAuth()
  const [st, setSt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { pushStatus().then(setSt) }, [])

  if (st == null || (compact && (st === 'on' || st === 'unsupported'))) return null

  const on = async () => {
    setErr(''); setBusy(true)
    try { await enablePush(user.id); setSt('on') } catch (e) { setErr(errMsg(e)); setSt(await pushStatus()) } finally { setBusy(false) }
  }
  const off = async () => { setBusy(true); await disablePush(); setSt('off'); setBusy(false) }

  return (
    <div className="card flex flex-col gap-2 p-4">
      <span className="label">Notificaciones de match</span>
      {st === 'on' && <>
        <span className="text-sm text-[#134A2B]">Activadas en este teléfono. Te avisaremos cuando alguien haga match contigo.</span>
        {!compact && <button className="btn-sm self-start border border-linea bg-white" disabled={busy} onClick={off}>Desactivar</button>}
      </>}
      {st === 'off' && <>
        <span className="text-sm leading-snug text-tinta-3">Recibe un aviso en este dispositivo cuando alguien haga match contigo, aunque la app esté cerrada.</span>
        <button className="btn-sm self-start bg-rosa-accion text-white" disabled={busy} onClick={on}>{busy ? 'Activando…' : 'Activar notificaciones'}</button>
      </>}
      {st === 'needs-install' && (
        <span className="text-sm leading-snug text-tinta-3">
          En iPhone, primero agrega VINKA a tu pantalla de inicio: en Safari toca <b>Compartir</b> → <b>Agregar a pantalla de inicio</b>. Luego abre VINKA desde ese ícono y vuelve aquí para activarlas.
        </span>
      )}
      {st === 'denied' && <span className="text-sm leading-snug text-tinta-3">{MOBILE ? 'Las notificaciones están bloqueadas. Actívalas en Ajustes del teléfono → Notificaciones → VINKA.' : 'Las notificaciones están bloqueadas en este navegador. Actívalas desde el candado junto a la dirección de la página → Notificaciones → Permitir.'}</span>}
      {st === 'unsupported' && <span className="text-sm text-tinta-3">Este navegador no permite notificaciones. Igual verás tus matches al abrir la app.</span>}
      {err && <span className="text-xs font-medium text-[#B42318]">{err}</span>}
    </div>
  )
}
