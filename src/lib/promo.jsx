import { supabase } from './supabase'

/** Etiqueta visible de destacado (pagar solo cambia la posición, nunca la evaluación) */
export function FeaturedBadge({ kind = 'job', className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 self-start rounded-full bg-[#FFF4D6] px-2.5 py-1 text-[11px] font-bold text-[#7A5200] ${className}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" /></svg>
      {kind === 'job' ? 'Destacada' : 'Perfil destacado'}
    </span>
  )
}

// Cada aparición o clic se cuenta una vez por sesión del navegador
const seen = new Set()
export function trackPromo(ids, kind = 'impression') {
  const fresh = (ids || []).filter(Boolean).filter((id) => !seen.has(`${kind}:${id}`))
  if (!fresh.length) return
  fresh.forEach((id) => seen.add(`${kind}:${id}`))
  supabase.rpc('promo_track', { p_ids: fresh.slice(0, 30), p_kind: kind }).then(() => {})
}

export const clp = (v) => `$${Number(v || 0).toLocaleString('es-CL')}`
export const iva = (net) => Math.round(Number(net || 0) * 0.19)

export const PROMO_STATUS = {
  solicitada: ['Pendiente de pago', 'bg-[#FFF4D6] text-[#7A5200]'],
  activa: ['Activa', 'bg-[#EAF6EF] text-[#1E6B3F]'],
  pausada: ['Pausada', 'bg-[#F4EEF2] text-tinta-3'],
  finalizada: ['Terminada', 'bg-[#F4EEF2] text-tinta-3'],
  cancelada: ['Cancelada', 'bg-[#F4EEF2] text-tinta-3'],
}
export const SOURCE_TXT = { compra: 'Compra', plan: 'Incluido en el plan', cortesia: 'Cortesía VINKA' }
export const daysLeft = (end) => Math.max(0, Math.ceil((new Date(end) - Date.now()) / 86400000))
