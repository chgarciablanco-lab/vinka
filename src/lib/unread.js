import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabase'

/**
 * Mensajes no leídos: una sola fuente para toda la app (lista de chats, botones de vacante, menú e Intereses).
 * El estado vive en el servidor (cada persona tiene los suyos), así que coincide en todos los dispositivos.
 * Se actualiza en vivo (mensajes nuevos o lecturas hechas en otro dispositivo), al volver a la app y cada minuto.
 */
let state = { byMatch: {}, total: 0, ready: false }
const subs = new Set()
const emit = () => subs.forEach((f) => f())
let inflight = null

export async function refreshUnread() {
  if (inflight) return inflight
  inflight = (async () => {
    const { data, error } = await supabase.rpc('my_unread')
    if (error) return // sin red: se mantiene lo último conocido
    const byMatch = {}
    let total = 0
    for (const r of data || []) { byMatch[r.match_id] = { n: r.unread, first: r.first_unread_at }; total += r.unread }
    state = { byMatch, total, ready: true }
    emit()
  })().finally(() => { inflight = null })
  return inflight
}

/** Marca leídas esas conversaciones hasta el último mensaje mostrado (no «hasta ahora») */
export async function markRead(matchIds, until) {
  const ids = (matchIds || []).filter(Boolean)
  if (!ids.length || document.visibilityState !== 'visible') return
  // Optimista: baja el contador de inmediato; el servidor confirma con la recarga
  const byMatch = { ...state.byMatch }
  for (const id of ids) if (byMatch[id] && (!until || new Date(byMatch[id].first) <= new Date(until))) delete byMatch[id]
  state = { ...state, byMatch, total: Object.values(byMatch).reduce((a, x) => a + x.n, 0) }
  emit()
  await supabase.rpc('mark_chat_read', { p_matches: ids.slice(0, 50), p_until: until || null })
  refreshUnread()
}

export function useUnread() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => state)
}

/** Se monta una vez con la sesión abierta: escucha mensajes y lecturas en vivo */
export function useUnreadSync(userId) {
  useEffect(() => {
    if (!userId) return undefined
    refreshUnread()
    let t = null
    const soon = () => { clearTimeout(t); t = setTimeout(refreshUnread, 400) }
    const ch = supabase.channel(`unread-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads', filter: `user_id=eq.${userId}` }, soon)
      .subscribe()
    const onVis = () => { if (document.visibilityState === 'visible') refreshUnread() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    const iv = setInterval(refreshUnread, 60000)
    return () => {
      supabase.removeChannel(ch); clearInterval(iv); clearTimeout(t)
      document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis)
      state = { byMatch: {}, total: 0, ready: false }; emit()
    }
  }, [userId])
}
