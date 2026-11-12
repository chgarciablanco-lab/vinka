// Limpieza diaria de archivos sin dueño (subidos pero nunca registrados en la base, o reemplazados).
// Solo borra archivos de más de 24 horas que ninguna tabla usa. La llama el cron con x-notify-secret.
// { dry_run: true } devuelve lo que borraría sin borrar nada.
import { createClient } from 'npm:@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  try {
    const { data: cfg } = await sb.rpc('get_push_config')
    if (!cfg || req.headers.get('x-notify-secret') !== cfg.notify_secret) return json({ error: 'forbidden' }, 403)
    const body = await req.json().catch(() => ({}))

    const { data, error } = await sb.rpc('orphan_storage_objects', { p_min_age: '24 hours', p_limit: 500 })
    if (error) throw new Error(error.message)
    const list = (data || []) as { bucket: string; path: string; size: number }[]
    const byBucket: Record<string, string[]> = {}
    for (const o of list) (byBucket[o.bucket] ||= []).push(o.path)
    const summary = Object.fromEntries(Object.entries(byBucket).map(([b, p]) => [b, p.length]))
    if (body.dry_run) return json({ dry_run: true, files: list.length, by_bucket: summary, paths: list.map((o) => `${o.bucket}/${o.path}`) })

    let removed = 0
    const failed: string[] = []
    for (const [bucket, paths] of Object.entries(byBucket)) {
      for (let i = 0; i < paths.length; i += 100) {
        const { error: e } = await sb.storage.from(bucket).remove(paths.slice(i, i + 100))
        if (e) { console.error('cleanup', bucket, e.message); failed.push(bucket) } else removed += paths.slice(i, i + 100).length
      }
    }
    console.log('cleanup-files', JSON.stringify({ removed, by_bucket: summary, failed }))
    return json({ removed, by_bucket: summary, failed })
  } catch (e) {
    console.error(e)
    return json({ error: 'cleanup failed' }, 500)
  }
})
