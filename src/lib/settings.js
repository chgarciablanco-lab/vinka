import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const cache = {}
/** Ajuste público de VINKA (por ahora, el WhatsApp oficial). Devuelve '' si no está configurado. */
export function useSetting(key) {
  const [v, setV] = useState(cache[key] ?? '')
  useEffect(() => {
    if (cache[key] !== undefined) return
    supabase.from('app_settings').select('value').eq('key', key).maybeSingle().then(({ data }) => { cache[key] = data?.value || ''; setV(cache[key]) })
  }, [key])
  return v
}
export const waLink = (num, text = '') => `https://wa.me/${String(num).replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`
export const fmtPhone = (num) => { const d = String(num || '').replace(/\D/g, ''); return d.length === 11 ? `+${d.slice(0, 2)} ${d[2]} ${d.slice(3, 7)} ${d.slice(7)}` : d }
