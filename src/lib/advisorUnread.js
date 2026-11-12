import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabase'

/**
 * No leídos del asesor fuera de los chats con candidatos: sus asesorías, el chat con el equipo VINKA
 * y los chats de colaboración con otros asesores. El estado vive en el servidor (igual en todos sus dispositivos).
 */
const EMPTY = { asesorias: 0, equipo: 0, asesores: 0, by_request: {}, by_collab: {}, total: 0 }
let state = EMPTY
const subs = new Set()
const emit = () => subs.forEach((f) => f())
let inflight = null

export async function refreshAdvisorUnread() {
  if (inflight) return inflight
  inflight = (async () => {
    const { data, error } = await supabase.rpc('advisor_unread')
    if (error || !data) return // sin red: se mantiene lo último conocido
    const d = { ...EMPTY, ...data }
    state = { ...d, total: (d.asesorias || 0) + (d.equipo || 0) + (d.asesores || 0) }
    emit()
  })().finally(() => { inflight = null })
  return inflight
}

/** thread: 'team', 'req:<id de la asesoría>' o 'collab:<id vacante>:<id del invitado>'.
 *  force: la pantalla sabe que llegó algo nuevo aunque el contador aún no lo muestre */
export async function markAdvisorRead(thread, force = false) {
  if (!thread || document.visibilityState !== 'visible') return
  const has = thread === 'team' ? state.equipo : thread.startsWith('req:') ? state.by_request[thread.slice(4)] : state.by_collab[thread.slice(7)]
  if (!has && !force) return // nada nuevo: no hace falta escribir
  const { error } = await supabase.rpc('advisor_mark_read', { p_thread: thread })
  if (!error) refreshAdvisorUnread()
}

export function useAdvisorUnread() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => state)
}

/** Se monta una vez para el asesor: al entrar, al volver a la app y cada minuto */
export function useAdvisorUnreadSync(enabled) {
  useEffect(() => {
    if (!enabled) return undefined
    refreshAdvisorUnread()
    const onVis = () => { if (document.visibilityState === 'visible') refreshAdvisorUnread() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', refreshAdvisorUnread)
    const t = setInterval(refreshAdvisorUnread, 60000)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', refreshAdvisorUnread) }
  }, [enabled])
}
