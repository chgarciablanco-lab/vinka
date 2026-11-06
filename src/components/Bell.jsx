import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

/** Campana con la cantidad de avisos sin leer. */
export function Bell() {
  const { user } = useAuth()
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!user) return
    const load = () => supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null).neq('kind', 'message').then(({ count }) => setN(count || 0))
    load()
    const ch = supabase.channel(`bell-${user.id}-${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, load).subscribe()
    window.addEventListener('vinka-notifs-read', load)
    return () => { supabase.removeChannel(ch); window.removeEventListener('vinka-notifs-read', load) }
  }, [user])
  return (
    <Link to="/avisos" aria-label={n ? `Avisos, ${n} sin leer` : 'Avisos'} className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-linea bg-white">
      <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#17131A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 16V11a6 6 0 0112 0v5l2 2H4zM10 21h4" /></svg>
      {n > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rosa-accion px-1 text-[11px] font-bold text-white">{n > 9 ? '9+' : n}</span>}
    </Link>
  )
}
