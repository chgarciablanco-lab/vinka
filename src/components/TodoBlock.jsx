import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useUnread } from '../lib/unread'
import { Svg } from './ui'

const ICON = { interesados: 'user', chats: 'chat', entrevistas: 'calendar', ofertas_aprobar: 'doc', ofertas_vencen: 'doc', vacantes_aprobar: 'check' }

/** Pendientes de la empresa: solo lo que requiere acción, con cifras reales y un toque para resolverlo */
export function TodoBlock({ companyId, refresh = 0 }) {
  const [items, setItems] = useState(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const { total } = useUnread() // si cambian los no leídos, se recalcula
  useEffect(() => {
    if (!companyId) return undefined
    let alive = true
    // Si falla (sin red), se mantienen las últimas cifras conocidas y se ofrece reintentar
    const load = () => supabase.rpc('company_todo', { p_company: companyId }).then(({ data, error }) => {
      if (!alive) return
      if (error) return setFailed(true)
      setFailed(false); setItems(data || [])
    }, () => alive && setFailed(true))
    load()
    // También al volver a la app (por ejemplo, después de resolver algo en otra pestaña o en el teléfono)
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', load)
    const t = setInterval(load, 120000)
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', load) }
  }, [companyId, total, refresh, retry])
  const failBox = failed && (
    <div role="alert" className="flex items-center gap-2 rounded-2xl border border-[#F4C7C3] bg-[#FEF3F2] px-3.5 py-2.5 text-[13px] text-[#912018]">
      <span className="flex-1">{items ? 'No pudimos actualizar tus pendientes; estas cifras pueden estar desactualizadas.' : 'No pudimos cargar tus pendientes.'}</span>
      <button className="btn-sm shrink-0 border border-[#F4C7C3] bg-white" onClick={() => setRetry((n) => n + 1)}>Reintentar</button>
    </div>
  )
  if (items == null) return failBox || null
  if (items.length === 0) return failBox || (
    <div className="flex items-center gap-2 rounded-2xl bg-[#EFF9F2] px-3.5 py-2.5 text-[13px] font-semibold text-[#134A2B]">
      <Svg name="check" size={18} />Todo al día: no tienes pendientes.
    </div>
  )
  return (
    <div className="card flex flex-col gap-1 p-2">
      <span className="px-2 pb-1 pt-1.5 text-[15px] font-semibold">Pendientes</span>
      {failBox}
      {items.map((x) => {
        const body = (
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rosa-palido text-rosa-oscuro"><Svg name={ICON[x.key] || 'check'} size={18} /></span>
            <span className="flex-1 text-sm"><b className="font-display text-[17px]">{x.n}</b> {x.label}</span>
            <Svg name="chevron" size={18} className="text-tinta-suave" />
          </>
        )
        const cls = 'flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[#FAF7F9]'
        return x.url.startsWith('#')
          ? <a key={x.key} href={x.url} className={cls} onClick={(e) => { e.preventDefault(); document.getElementById(x.url.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>{body}</a>
          : <Link key={x.key} to={x.url} className={cls}>{body}</Link>
      })}
    </div>
  )
}
