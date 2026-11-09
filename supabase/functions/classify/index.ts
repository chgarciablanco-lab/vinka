// Clasifica vacantes y perfiles por familia de cargo y nivel, para sugerir solo lo congruente.
// La llaman los triggers de la base (secreto compartido): { kind: 'job' | 'candidate', id } o { kind: 'backfill' }.
// Las afinidades entre familias NO las decide la IA: están definidas a mano en la tabla role_family_links.
import { createClient } from 'npm:@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

const FAMILIES: Record<string, string> = {
  ventas_tienda: 'Venta en tienda o retail (vendedor/a, promotor/a, reponedor/a)',
  cajero: 'Caja y cobro en local',
  comercial: 'Venta B2B o en terreno, ejecutivo/a comercial, key account',
  atencion_cliente: 'Atención al cliente en call center o mesón de servicio, reclamos y postventa (NO incluye ventas en tienda, caja ni turismo)',
  gestion_tienda: 'Administración o jefatura de tienda o local',
  bodega_logistica: 'Bodega, inventario, despacho, logística, abastecimiento',
  conduccion: 'Conducción y transporte (choferes, repartidores)',
  maquinaria: 'Operación de maquinaria (grúa horquilla, maquinaria pesada)',
  produccion: 'Operario/a de producción, packing, planta',
  agro: 'Trabajo agrícola y agroindustria',
  mineria: 'Minería',
  construccion_oficios: 'Oficios de construcción (maestro/a, ayudante, jornal)',
  construccion_gestion: 'Gestión de obras (jefe/a de obra, ITO, ingeniería en construcción)',
  mantencion: 'Mantención, técnicos eléctricos o mecánicos',
  aseo: 'Aseo, limpieza y servicios generales',
  seguridad: 'Guardias y seguridad',
  cocina: 'Cocina (cocinero/a, ayudante de cocina, chef)',
  servicio_mesa: 'Servicio en sala, garzón/garzona, barista, bartender',
  turismo_hoteleria: 'Turismo y hotelería (guías turísticos, recepción de hotel, reservas, agencias de viaje)',
  administracion: 'Administrativos/as y asistentes de oficina',
  recepcion_secretaria: 'Recepción y secretaría',
  contabilidad: 'Contabilidad, tesorería, cobranza administrativa',
  finanzas: 'Análisis financiero, control de gestión, finanzas corporativas',
  rrhh: 'Recursos humanos, selección, remuneraciones',
  marketing: 'Marketing, comunicaciones, community manager',
  diseno: 'Diseño gráfico, UX/UI, audiovisual',
  desarrollo_software: 'Desarrollo de software',
  soporte_ti: 'Soporte técnico e infraestructura TI',
  datos: 'Análisis de datos y BI',
  salud_tecnico: 'Salud técnico (TENS, auxiliares, paramédicos)',
  salud_profesional: 'Salud profesional (enfermería, kinesiología, medicina, psicología clínica)',
  educacion: 'Educación y docencia (profesores/as, educadores/as)',
  legal: 'Legal (abogados/as, procuradores/as)',
  ingenieria: 'Ingeniería y procesos (industrial, calidad, prevención de riesgos)',
  direccion: 'Gerencia y dirección general',
  otro: 'Otro',
}
const KEYS = Object.keys(FAMILIES)

const PROMPT = `Clasifica cada elemento (vacantes de empleo y perfiles de personas que buscan trabajo en Chile) según:
1) "family": la familia de funciones del cargo, una de estas claves:
${KEYS.map((k) => `- ${k}: ${FAMILIES[k]}`).join('\n')}
2) "level": la jerarquía del CARGO dentro de una empresa, de 1 a 6. Depende del puesto, NO de los años de experiencia: un maestro de primera con 15 años sigue siendo nivel 2; solo sube si su cargo es de supervisión o jefatura.
   1 = Operativo o ayudante: cajero/a, bodeguero/a, garzón/garzona, barista, operario/a, guardia, auxiliar de aseo, ayudante de cocina, reponedor/a, práctica
   2 = Oficio o técnico/a: vendedor/a, maestro/a, conductor/a, TENS, administrativo/a, asistente, recepcionista, técnico/a, cocinero/a, guía turístico/a
   3 = Profesional: analista, ejecutivo/a, profesor/a, desarrollador/a, enfermero/a, contador/a, diseñador/a, prevencionista
   4 = Senior o supervisión: profesional senior, especialista, supervisor/a, encargado/a, coordinador/a, jefe/a de turno, administrador/a de obra
   5 = Jefatura que lidera un área o un local: jefe/a de tienda, de obra, de área, de departamento
   6 = Gerencia, subgerencia o dirección
   Para una vacante, usa el título y los requisitos (el "nivel indicado" por la empresa es solo una referencia). Para una persona, usa el cargo que busca y el último cargo que ocupó.
3) "label": nombre corto y normalizado del cargo (máximo 50 caracteres).
No uses nunca edad, sexo, nacionalidad ni datos personales.
Elige la familia por las FUNCIONES principales del cargo, no por habilidades compartidas (por ejemplo, un guía turístico es turismo aunque atienda personas; una vendedora es venta en tienda aunque atienda clientes).
Responde SOLO con un arreglo JSON: [{"id": "...", "family": "...", "level": n, "label": "..."}]`

const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const years = (x: any) => {
  const a = Date.parse((x.from || '') + '-01'), b = x.current || !x.to ? Date.now() : Date.parse(x.to + '-01')
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? Math.round(((b - a) / 3.15e10) * 10) / 10 : null
}

function describeJob(j: any) {
  return `VACANTE id=${j.id}\nTítulo: ${clip(j.title, 100)} · Nivel indicado: ${j.level || '—'} · Área: ${j.area || '—'}\nDescripción: ${clip(j.description, 500)}\nRequisitos: ${(j.requirements || []).map((r: any) => r.text).join('; ').slice(0, 300) || '—'}`
}
function describeCand(c: any) {
  const exps = (c.experiences || []).slice(0, 5).map((x: any) => `${clip(x.role, 60)} en ${clip(x.company, 40)}${years(x) != null ? ` (${years(x)} años${x.current ? ', actual' : ''})` : ''}`).join('; ')
  const edu = (c.education || []).slice(0, 3).map((x: any) => `${x.level || ''} ${clip(x.title, 60)} (${x.status || ''})`).join('; ')
  return `PERSONA id=${c.user_id}\nBusca: ${clip(c.headline, 80) || '—'}\nExperiencia: ${c.has_experience ? exps || '—' : 'busca su primer empleo'}\nEstudios: ${edu || '—'}\nHabilidades: ${(c.skills || []).slice(0, 10).join(', ') || '—'}`
}

async function classify(key: string, model: string, items: { id: string; text: string }[]) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 3000, thinking: { type: 'disabled' }, messages: [{ role: 'user', content: `${PROMPT}\n\n${items.map((i) => i.text).join('\n\n')}` }] }),
  })
  if (!r.ok) { console.error('anthropic', r.status, await r.text()); return [] }
  const out = await r.json()
  const text = (out.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
  try {
    const arr = JSON.parse((text.match(/\[[\s\S]*\]/) || ['[]'])[0])
    const ids = new Set(items.map((i) => i.id))
    return (Array.isArray(arr) ? arr : []).filter((x: any) => ids.has(String(x?.id)) && KEYS.includes(x?.family)).map((x: any) => ({
      id: String(x.id), role_family: x.family,
      role_level: Math.min(6, Math.max(1, Math.round(Number(x.level) || 0))) || null, role_label: clip(x.label, 50),
    }))
  } catch { return [] }
}

Deno.serve(async (req) => {
  try {
    const { data: cfg } = await sb.rpc('get_push_config')
    if (!cfg || req.headers.get('x-notify-secret') !== cfg.notify_secret) return new Response('forbidden', { status: 403 })
    const key = Deno.env.get('ANTHROPIC_API_KEY') || cfg.anthropic_key
    if (!key) return Response.json({ skipped: 'sin_clave' })
    const model = cfg.ai_model || 'claude-haiku-5-5'
    const p = await req.json()
    const JOB = 'id, title, level, area, description, requirements'
    const CAND = 'user_id, headline, has_experience, experiences, education, skills'

    let jobs: any[] = [], cands: any[] = []
    if (p.kind === 'job') jobs = (await sb.from('jobs').select(JOB).eq('id', p.id)).data || []
    else if (p.kind === 'candidate') cands = (await sb.from('candidate_profiles').select(CAND).eq('user_id', p.id).neq('headline', '')).data || []
    else if (p.kind === 'backfill') {
      const n = Math.min(Number(p.limit) || 30, 60)
      jobs = (await sb.from('jobs').select(JOB).is('role_family', null).limit(n)).data || []
      cands = (await sb.from('candidate_profiles').select(CAND).is('role_family', null).neq('headline', '').limit(n)).data || []
    } else return Response.json({ skipped: p.kind })

    const items = [...jobs.map((j) => ({ kind: 'job', id: j.id, text: describeJob(j) })), ...cands.map((c) => ({ kind: 'cand', id: c.user_id, text: describeCand(c) }))]
    const batches: typeof items[] = []
    for (let i = 0; i < items.length; i += 15) batches.push(items.slice(i, i + 15))
    const results = (await Promise.all(batches.map((b) => classify(key, model, b)))).flat()
    let done = 0
    for (const r of results) {
      const it = items.find((i) => i.id === r.id)!
      const { id, ...vals } = r
      const { error } = it.kind === 'job' ? await sb.from('jobs').update(vals).eq('id', id) : await sb.from('candidate_profiles').update(vals).eq('user_id', id)
      if (error) console.error('update', error.message); else done++
    }
    return Response.json({ items: items.length, classified: done })
  } catch (e) {
    console.error(e)
    return new Response('error', { status: 500 })
  }
})
