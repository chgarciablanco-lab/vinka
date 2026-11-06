import { createClient } from '@supabase/supabase-js'

// Valores públicos del proyecto Supabase "vinka" (la clave publicable está hecha para ir en la app).
// Se pueden reemplazar con variables de entorno en Vercel si algún día cambian.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://jifhlhbntcfnvmcpbexo.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_4F67pH3PTxjsnDzTzLPyIQ_KHVl2Vqn'

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export function errMsg(e) {
  const m = e?.message || String(e || '')
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.'
  if (/Email not confirmed/i.test(m)) return 'Aún no confirmas tu correo. Revisa tu bandeja de entrada.'
  if (/already registered|already been registered/i.test(m)) return 'Ese correo ya tiene una cuenta. Inicia sesión.'
  if (/rate limit/i.test(m)) return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'
  if (/Password should be/i.test(m)) return 'La contraseña debe tener al menos 8 caracteres.'
  return m || 'Ocurrió un error. Inténtalo de nuevo.'
}
