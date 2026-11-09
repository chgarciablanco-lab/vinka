import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

/** Latido: marca a la persona como "en línea" mientras la app está abierta y visible */
export function useHeartbeat(active) {
  useEffect(() => {
    if (!active) return
    const beat = () => { if (document.visibilityState === 'visible') supabase.rpc('touch_presence').then(() => {}) }
    const leave = () => supabase.rpc('touch_presence', { p_leaving: true }).then(() => {})
    const onVis = () => (document.visibilityState === 'visible' ? beat() : leave())
    beat()
    const t = setInterval(beat, 60_000)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', leave)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', leave) }
  }, [active])
}

/**
 * Estado de varias personas y/o empresas, actualizado cada 30 s.
 * Devuelve { [id]: { status: 'online'|'recent'|'today'|'week', last_seen } }
 */
export function usePresence({ users = [], companies = [] } = {}) {
  const [map, setMap] = useState({})
  const key = [...new Set(users.filter(Boolean))].sort().join(',') + '|' + [...new Set(companies.filter(Boolean))].sort().join(',')
  const ref = useRef(key)
  ref.current = key
  useEffect(() => {
    const [u, c] = key.split('|').map((s) => (s ? s.split(',') : []))
    if (!u.length && !c.length) { setMap({}); return }
    let alive = true
    const load = () => {
      if (document.visibilityState !== 'visible') return
      supabase.rpc('presence', { p_users: u, p_companies: c }).then(({ data }) => {
        if (alive && ref.current === key) setMap(Object.fromEntries((data || []).map((r) => [r.id, r])))
      })
    }
    load()
    const t = setInterval(load, 30_000)
    document.addEventListener('visibilitychange', load)
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', load) }
  }, [key])
  return map
}

export function presenceText(p, { company = false } = {}) {
  if (!p?.status) return ''
  if (p.status === 'online') return company ? 'Equipo en línea' : 'En línea'
  const who = company ? 'Activa' : 'Activo/a'
  if (p.status === 'recent' && p.last_seen) {
    const m = Math.max(1, Math.round((Date.now() - new Date(p.last_seen)) / 60000))
    return `${who} hace ${m} min`
  }
  if (p.status === 'recent' || p.status === 'today') return `${who} hoy`
  return `${who} esta semana`
}
