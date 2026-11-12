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
  if (/banned/i.test(m)) return 'Tu cuenta está suspendida. Escríbenos si crees que es un error.'
  if (/sending confirmation email|sending (recovery|magic link|invite) email|error sending/i.test(m)) return 'No pudimos enviar el correo de confirmación. Tu cuenta no se creó: inténtalo de nuevo más tarde o escríbenos a contacto@vinka.cl.'
  if (/rate limit/i.test(m)) return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'
  if (/Password should be/i.test(m)) return 'La contraseña debe tener al menos 8 caracteres.'
  return m || 'Ocurrió un error. Inténtalo de nuevo.'
}

/**
 * Reintenta una escritura si falló por la red (sin código de la base). Un rechazo real de la base no se reintenta.
 * Uso: const { error } = await withRetry(() => supabase.from('x').upsert(...))
 */
export async function withRetry(fn, tries = 3) {
  let res
  for (let k = 0; k < tries; k++) {
    try { res = await fn() } catch (e) { res = { error: { message: e?.message || 'Sin conexión', code: '' } } }
    if (!res?.error || res.error.code) return res
    if (k < tries - 1) await new Promise((r) => setTimeout(r, 700 * 2 ** k))
  }
  return res
}
