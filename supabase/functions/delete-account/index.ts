// Baja de cuenta. Borra de verdad los archivos (videos, CV y archivos de asesorías) con la API de Storage
// y recién después elimina la cuenta. Si la persona es dueña de una empresa, no se borra nada.
// Entrada: POST con la sesión de la persona (Authorization: Bearer <token>) y { confirm: 'ELIMINAR' }.
// Prueba sin borrar (solo servidor): header x-notify-secret + { dry_run_user: '<uuid>' } devuelve lo que se borraría.
import { createClient } from 'npm:@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function plan(userId: string) {
  const [{ data: owned, error: e1 }, { data: objects, error: e2 }] = await Promise.all([
    sb.rpc('owned_companies', { p_user: userId }),
    sb.rpc('account_storage_objects', { p_user: userId }),
  ])
  if (e1 || e2) throw new Error((e1 || e2)!.message)
  return { owned: (owned || []) as { id: string; name: string; others: number }[], objects: (objects || []) as { bucket: string; path: string }[] }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  try {
    const body = await req.json().catch(() => ({}))

    // Prueba sin borrar, solo con el secreto del servidor
    if (body.dry_run_user) {
      const { data: cfg } = await sb.rpc('get_push_config')
      if (!cfg || req.headers.get('x-notify-secret') !== cfg.notify_secret) return json({ error: 'forbidden' }, 403)
      const p = await plan(String(body.dry_run_user))
      return json({ dry_run: true, blocked: p.owned.length > 0, owned: p.owned, files: p.objects.length, by_bucket: p.objects.reduce((a: Record<string, number>, o) => ({ ...a, [o.bucket]: (a[o.bucket] || 0) + 1 }), {}) })
    }

    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: u } = token ? await sb.auth.getUser(token) : { data: null as any }
    const user = u?.user
    if (!user) return json({ error: 'Tu sesión expiró. Vuelve a ingresar.' }, 401)
    if (body.confirm !== 'ELIMINAR') return json({ error: 'Escribe ELIMINAR para confirmar.' }, 400)

    const p = await plan(user.id)
    if (p.owned.length) {
      return json({ error: `Eres dueño/a de ${p.owned.map((c) => c.name).join(', ')}. Traspasa la empresa a otra persona del equipo antes de eliminar tu cuenta.`, owned: p.owned }, 409)
    }

    // 1) Archivos: se borran con la API de Storage (en grupos de 100). Si algo falla, la cuenta NO se borra y se puede reintentar.
    const byBucket: Record<string, string[]> = {}
    for (const o of p.objects) (byBucket[o.bucket] ||= []).push(o.path)
    for (const [bucket, paths] of Object.entries(byBucket)) {
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await sb.storage.from(bucket).remove(paths.slice(i, i + 100))
        if (error) {
          console.error('storage', bucket, error.message)
          return json({ error: 'No pudimos borrar todos tus archivos. Tu cuenta sigue activa: inténtalo de nuevo en unos minutos.' }, 502)
        }
      }
    }

    // 2) Cuenta y datos (la base vuelve a comprobar que no sea dueña y que no queden archivos)
    const { error } = await sb.rpc('delete_account_data', { p_user: user.id })
    if (error) {
      console.error('delete_account_data', error.message)
      return json({ error: error.message.includes('dueño') ? error.message : 'No pudimos terminar la eliminación. Inténtalo de nuevo; tus archivos ya fueron borrados.' }, 500)
    }
    return json({ deleted: true, files: p.objects.length })
  } catch (e) {
    console.error(e)
    return json({ error: 'Algo falló. Tu cuenta sigue activa; inténtalo de nuevo.' }, 500)
  }
})
