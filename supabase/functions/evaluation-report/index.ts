// Informe psicolaboral con IA (borrador). Solo administradores o reclutadores de la empresa dueña de la evaluación.
// Entrada: { candidate: <assessment_candidate_id>, mode: 'informe' | 'seccion', section?: string, instruction?: string }
//       o { evaluation: <assessment_id>, mode: 'comparativo' } (compara los informes de las personas de la evaluación)
//       o { disc: <disc_test_id>, mode: 'disc' } (reporte del test DISC VINKA)
// Salida:  { report_id } (informe), { section, value } (sección) o { comparison_id } (comparativo). La persona revisa, edita y cierra el informe en la app.
// Modo de prueba (sin base de datos ni cupo): cabecera x-eval-test con el secreto EVAL_TEST_TOKEN y { test: { profile, title, files: [...] } }.
import { createClient } from 'npm:@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-eval-test',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MODEL = 'claude-sonnet-5-5'
const PRICE_IN = 2 / 1e6, PRICE_OUT = 10 / 1e6 // US$ por token (Sonnet 5.5, 20-11-2026)
const MAX_PDF_BYTES = 18 * 1024 * 1024

const KINDS: Record<string, string> = { perfil: 'Perfil del cargo', cv: 'CV', transcripcion: 'Transcripción de entrevista', referencias: 'Referencias laborales', test: 'Reporte de test', otro: 'Documento de apoyo' }

const RULES = `Eres psicólogo/a laboral senior de una consultora chilena de selección. Redactas el borrador de un INFORME DE EVALUACIÓN PSICOLABORAL para la empresa que contrata, a partir de los documentos entregados (perfil del cargo, CV, transcripción de la entrevista, referencias, reportes de test y otros).

Estilo (igual a los informes de la consultora):
- Español de Chile, tercera persona, tono profesional, cercano y concreto. Te refieres a la persona por su primer nombre.
- Prosa clara, sin adornos ni frases vacías. Cada afirmación se apoya en un hecho, ejemplo o cita de los documentos.
- En «antecedentes», orden cronológico: formación (institución y años) y luego cada cargo con empresa, ciudad si se sabe, años, funciones, logros con cifras si las dijo, y motivo de salida. Destaca en negrita (**así**) el nombre de cada empresa y cargo principal. Un párrafo por etapa.
- Fortalezas (4 a 6) y oportunidades de mejora (3 a 4): cada una con un título breve y un texto que explica con evidencia de la entrevista, los tests o las referencias. En las oportunidades, incluye lo que la persona reconoce y lo que observan tests o referencias, y por qué importa para el cargo.
- Referencias: una por cada referencia documentada: nombre, cargo, relación (por ejemplo, «jefatura directa en …»), qué destaca, qué observa como mejora, si la recomienda y su sugerencia para la futura jefatura. Si la entrevista confirma algo de la referencia, menciónalo.
- Motivación de cambio: por qué busca el cargo y qué le interesa, según la persona.
- Recomendación: 2 párrafos. El primero resume el ajuste al cargo con lo más relevante; el segundo, los aspectos a considerar y sugerencias concretas para la futura jefatura (inducción, acompañamiento, forma de trabajo). Contrasta siempre con el perfil del cargo.
- Síntesis: UNA oración que empieza con «En síntesis,» y dice si se recomienda, se recomienda con observaciones (y cuáles) o no se recomienda.

Reglas que nunca rompes:
- Usa SOLO lo que está en los documentos. No inventes fechas, empresas, cifras, referencias ni opiniones. Si falta algo, dilo: por ejemplo, renta «No abordada en la entrevista». Lo que falte o se contradiga entre documentos va en «faltantes».
- NO incluyas datos personales protegidos aunque aparezcan en los documentos: edad o fecha de nacimiento, nacionalidad, país de origen o años viviendo en Chile, situación migratoria, estado civil, hijos o vida familiar, mascotas, salud, accidentes, licencias o reposos, embarazo, religión, ideas políticas, sindicalización, orientación sexual, apariencia física, comuna o dirección (Código del Trabajo art. 2, Ley 20.609 y Ley 21.719). Si la disponibilidad depende de un motivo de salud, escribe solo el plazo. Si una salida laboral se debió a salud, cansancio o agotamiento, no lo menciones: di solo que dejó el cargo. Un pasatiempo solo se menciona si la propia persona lo vincula con el trabajo.
- Los tests de personalidad (DISC u otros) describen estilo, no capacidad: úsalos junto con la entrevista y nunca como único fundamento.
- No uses frases de la IA («como modelo de lenguaje…»). Es un borrador: la persona que lo firma decidirá.
Entrega el resultado SOLO con la herramienta «entregar_informe».`

const sectionItem = { type: 'object', properties: { titulo: { type: 'string' }, texto: { type: 'string' } }, required: ['titulo', 'texto'] }
const SCHEMA = {
  type: 'object',
  properties: {
    antecedentes: { type: 'string', description: 'Antecedentes y experiencia profesional. Párrafos separados por una línea en blanco.' },
    fortalezas: { type: 'array', items: sectionItem, minItems: 1, maxItems: 6 },
    oportunidades: { type: 'array', items: sectionItem, minItems: 1, maxItems: 5 },
    referencias: { type: 'array', maxItems: 6, items: { type: 'object', properties: { nombre: { type: 'string' }, cargo: { type: 'string' }, relacion: { type: 'string' }, texto: { type: 'string' } }, required: ['nombre', 'texto'] } },
    motivacion: { type: 'string' },
    recomendacion: { type: 'string', description: 'Dos párrafos separados por una línea en blanco.' },
    sintesis: { type: 'string', description: 'Una oración que empieza con «En síntesis,».' },
    veredicto: { type: 'string', enum: ['recomendado', 'con_observaciones', 'no_recomendado'] },
    renta: { type: 'string' },
    disponibilidad: { type: 'string' },
    tests: { type: 'array', maxItems: 6, items: { type: 'object', properties: { nombre: { type: 'string' }, resumen: { type: 'string' } }, required: ['nombre', 'resumen'] } },
    faltantes: { type: 'array', maxItems: 10, items: { type: 'string' }, description: 'Datos que faltan o contradicciones entre documentos, para quien revisa (no van al informe).' },
  },
  required: ['antecedentes', 'fortalezas', 'oportunidades', 'referencias', 'motivacion', 'recomendacion', 'sintesis', 'veredicto', 'renta', 'disponibilidad', 'tests', 'faltantes'],
}
const SECTION_KEYS = ['antecedentes', 'fortalezas', 'oportunidades', 'referencias', 'motivacion', 'recomendacion', 'sintesis', 'renta', 'disponibilidad']

function encodeBase64(u8: Uint8Array) {
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  return btoa(s)
}
const str = (v: unknown, n: number) => String(v ?? '').replace(/\u0000/g, '').replace(/\\+"/g, '"').trim().slice(0, n)
function clean(o: any) {
  const items = (a: any, n: number) => (Array.isArray(a) ? a : []).slice(0, n).map((x: any) => ({ titulo: str(x?.titulo, 160), texto: str(x?.texto, 2500) })).filter((x) => x.texto)
  return {
    antecedentes: str(o?.antecedentes, 12000),
    fortalezas: items(o?.fortalezas, 6),
    oportunidades: items(o?.oportunidades, 5),
    referencias: (Array.isArray(o?.referencias) ? o.referencias : []).slice(0, 6).map((r: any) => ({ nombre: str(r?.nombre, 120), cargo: str(r?.cargo, 160), relacion: str(r?.relacion, 200), texto: str(r?.texto, 2500) })).filter((r: any) => r.texto),
    motivacion: str(o?.motivacion, 3000),
    recomendacion: str(o?.recomendacion, 5000),
    sintesis: str(o?.sintesis, 800),
    veredicto: ['recomendado', 'con_observaciones', 'no_recomendado'].includes(o?.veredicto) ? o.veredicto : '',
    renta: str(o?.renta, 300) || 'No abordada en la entrevista.',
    disponibilidad: str(o?.disponibilidad, 300) || 'No abordada en la entrevista.',
    tests: (Array.isArray(o?.tests) ? o.tests : []).slice(0, 6).map((t: any) => ({ nombre: str(t?.nombre, 120), resumen: str(t?.resumen, 1500) })).filter((t: any) => t.resumen),
    faltantes: (Array.isArray(o?.faltantes) ? o.faltantes : []).slice(0, 10).map((x: any) => str(x, 400)).filter(Boolean),
  }
}

type FileIn = { kind: string; name: string; path?: string | null; mime?: string; text?: string | null; base64?: string }

async function buildContent(ctx: { title: string; client: string; profile: string; person: string }, files: FileIn[]) {
  const blocks: any[] = []
  blocks.push({ type: 'text', text: `Cargo evaluado: ${str(ctx.title, 160)}\nEmpresa: ${str(ctx.client, 160) || 'No indicada'}\nPersona evaluada: ${str(ctx.person, 120)}\n\nPerfil del cargo:\n<<<\n${str(ctx.profile, 20000) || 'No entregado; usa el nombre del cargo y los documentos.'}\n>>>` })
  let pdfBytes = 0
  for (const f of files) {
    const label = `${KINDS[f.kind] || 'Documento'}: ${str(f.name, 200)}`
    if (f.text && f.text.trim()) {
      blocks.push({ type: 'text', text: `<documento tipo="${label}">\n${str(f.text, 200000)}\n</documento>` })
      continue
    }
    let data = f.base64 || ''
    if (!data && f.path) {
      const { data: blob, error } = await sb.storage.from('evaluaciones').download(f.path)
      if (error || !blob) throw new Error(`No pudimos leer el archivo «${f.name}».`)
      const buf = new Uint8Array(await blob.arrayBuffer())
      pdfBytes += buf.byteLength
      if (pdfBytes > MAX_PDF_BYTES) throw new Error('Los PDF de esta persona suman más de 18 MB. Quita alguno o súbelo como texto.')
      data = encodeBase64(buf)
    }
    if (!data) continue
    blocks.push({ type: 'text', text: `A continuación: ${label}` })
    blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data }, title: label.slice(0, 200) })
  }
  return blocks
}

async function callClaude(key: string, system: string, content: any[], tool: any, maxTokens: number) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: system + `\n\nEntrega tu respuesta únicamente llamando a la herramienta ${tool.name}.`, tools: [tool], tool_choice: { type: 'auto' }, messages: [{ role: 'user', content }] }),
  })
  if (!r.ok) { console.error('anthropic', r.status, (await r.text()).slice(0, 500)); throw new Error('La IA no respondió. Inténtalo de nuevo en un momento.') }
  const out = await r.json()
  const use = (out.content || []).find((b: any) => b.type === 'tool_use')
  if (!use) { console.error('anthropic sin herramienta', out.stop_reason); throw new Error('La IA no entregó el informe. Inténtalo de nuevo.') }
  const inT = out.usage?.input_tokens || 0, outT = out.usage?.output_tokens || 0
  return { input: use.input, inT, outT, cost: Math.round((inT * PRICE_IN + outT * PRICE_OUT) * 10000) / 10000 }
}

const REPORT_TOOL = { name: 'entregar_informe', description: 'Entrega el borrador del informe psicolaboral.', input_schema: SCHEMA }

// ───────── Comparativo ─────────
const COMPARE_RULES = `Eres psicólogo/a laboral senior de una consultora chilena de selección. Redactas el borrador de un INFORME COMPARATIVO para la empresa que contrata, a partir de los informes psicolaborales de cada persona evaluada para el mismo cargo y del perfil del cargo.

- Español de Chile, tercera persona, tono profesional y concreto. Te refieres a cada persona por su nombre y apellido.
- Usa SOLO lo que dicen los informes y el perfil. No inventes hechos, cifras ni opiniones. Si un informe está en borrador, trátalo igual pero menciónalo en «faltantes».
- Compara siempre contra el perfil del cargo: experiencia pertinente, competencias clave, riesgos u observaciones, motivación, renta y disponibilidad.
- «candidatos»: una fila por persona, en el orden de ajuste que sugieres (de mayor a menor). «ajuste» es alto, medio o bajo. «fortalezas» y «riesgos» son 1 o 2 oraciones cada uno. «veredicto» es el del informe de esa persona.
- «resumen»: 1 párrafo con el panorama general del grupo frente al perfil.
- «conclusion»: 1 o 2 párrafos con el orden sugerido y por qué, y qué confirmar antes de decidir (referencias, tests, renta, disponibilidad). Es una sugerencia: la decisión es de la empresa.
- NO incluyas datos personales protegidos aunque aparezcan: edad, nacionalidad u origen, situación migratoria, estado civil, hijos, salud, embarazo, religión, ideas políticas, sindicalización, orientación sexual, apariencia física o domicilio. Nunca compares a las personas por esos datos.
Entrega el resultado SOLO con la herramienta «entregar_comparativo».`
const COMPARE_TOOL = {
  name: 'entregar_comparativo', description: 'Entrega el borrador del informe comparativo.',
  input_schema: {
    type: 'object',
    properties: {
      resumen: { type: 'string' },
      candidatos: { type: 'array', minItems: 2, maxItems: 15, items: { type: 'object', properties: {
        nombre: { type: 'string' }, ajuste: { type: 'string', enum: ['alto', 'medio', 'bajo'] }, veredicto: { type: 'string', enum: ['recomendado', 'con_observaciones', 'no_recomendado', ''] },
        fortalezas: { type: 'string' }, riesgos: { type: 'string' } }, required: ['nombre', 'ajuste', 'fortalezas', 'riesgos'] } },
      conclusion: { type: 'string' },
      faltantes: { type: 'array', maxItems: 10, items: { type: 'string' } },
    },
    required: ['resumen', 'candidatos', 'conclusion', 'faltantes'],
  },
}
// ───────── Reporte del test DISC VINKA ─────────
const DISC_RULES = `Eres psicólogo/a laboral senior. Redactas el reporte de un test DISC (cuestionario propio de VINKA) para quien selecciona personal.
Recibes los puntajes (escala 0 a 100, 50 = promedio): «compuesto» (estilo general), «natural» (lo que aflora bajo presión) y «adaptado» (cómo se ajusta al trabajo), el perfil principal y secundario, los indicadores de integridad y el cargo con su perfil.
D = Dominante (directo, orientado a resultados), I = Influyente (sociable, persuasivo), S = Estable (paciente, constante, cooperador), C = Cauteloso (preciso, analítico, ordenado).
- Español de Chile, tercera persona, tono profesional y prudente («suele», «tiende a», «podría»). Te refieres a la persona por su primer nombre.
- El DISC describe estilo, no capacidad: nunca concluyas que la persona sirve o no para el cargo; señala aportes probables y qué validar en la entrevista.
- Relaciona siempre el estilo con las exigencias del cargo y su perfil.
- «ideal»: tu estimación del estilo que el cargo suele requerir, con un valor de 0 a 100 por factor. Es orientativa.
- Si algún indicador de integridad no se cumplió, menciónalo en «analisis» como algo a considerar.
- No uses ni infieras edad, nacionalidad, género, familia, salud ni otros datos personales.
Entrega el resultado SOLO con la herramienta «entregar_reporte_disc».`
const DISC_TOOL = {
  name: 'entregar_reporte_disc', description: 'Entrega el reporte del test DISC.',
  input_schema: {
    type: 'object',
    properties: {
      analisis: { type: 'string', description: 'Dos párrafos: el estilo y cómo podría aportar o desafiarle en el cargo. Separados por una línea en blanco.' },
      fortalezas: { type: 'array', minItems: 3, maxItems: 4, items: { type: 'string' } },
      desarrollo: { type: 'array', minItems: 3, maxItems: 4, items: { type: 'string' } },
      bajo_presion: { type: 'string' },
      recomendaciones: { type: 'array', minItems: 3, maxItems: 4, items: { type: 'string' } },
      conclusion: { type: 'string', description: 'Uno o dos párrafos.' },
      ideal: { type: 'object', properties: { D: { type: 'integer' }, I: { type: 'integer' }, S: { type: 'integer' }, C: { type: 'integer' } }, required: ['D', 'I', 'S', 'C'] },
      preguntas: { type: 'array', minItems: 3, maxItems: 4, items: { type: 'string' }, description: 'Preguntas para la entrevista que exploren las áreas a validar.' },
    },
    required: ['analisis', 'fortalezas', 'desarrollo', 'bajo_presion', 'recomendaciones', 'conclusion', 'ideal', 'preguntas'],
  },
}
const FACT = ['D', 'I', 'S', 'C'] as const
const FNAME: Record<string, string> = { D: 'Dominancia (D)', I: 'Influencia (I)', S: 'Estabilidad (S)', C: 'Cautela (C)' }
function cleanDisc(o: any, scores: any) {
  const list = (a: any, n: number) => (Array.isArray(a) ? a : []).slice(0, n).map((x: any) => str(x, 600)).filter(Boolean)
  const ideal: Record<string, number> = {}
  for (const f of FACT) ideal[f] = Math.max(0, Math.min(100, Math.round(Number(o?.ideal?.[f]) || 50)))
  const comp = scores?.compuesto || {}
  const diff = FACT.map((f) => Math.abs((Number(comp[f]) || 50) - ideal[f]))
  const calce = Math.max(0, Math.round(100 - diff.reduce((a, b) => a + b, 0) / 4 * 1.6))
  const brechas = FACT.filter((f, i) => diff[i] >= 20).map((f) => {
    const p = Number(comp[f]) || 50
    return `${FNAME[f]}: la persona muestra ${p} y el cargo suele requerir cerca de ${ideal[f]}; conviene validarlo en la entrevista.`
  })
  return {
    analisis: str(o?.analisis, 4000), fortalezas: list(o?.fortalezas, 4), desarrollo: list(o?.desarrollo, 4), bajo_presion: str(o?.bajo_presion, 1500),
    recomendaciones: list(o?.recomendaciones, 4), conclusion: str(o?.conclusion, 4000), ideal, calce, brechas, preguntas: list(o?.preguntas, 4),
  }
}

function cleanCompare(o: any) {
  return {
    resumen: str(o?.resumen, 4000),
    candidatos: (Array.isArray(o?.candidatos) ? o.candidatos : []).slice(0, 15).map((c: any) => ({
      nombre: str(c?.nombre, 120), ajuste: ['alto', 'medio', 'bajo'].includes(c?.ajuste) ? c.ajuste : 'medio',
      veredicto: ['recomendado', 'con_observaciones', 'no_recomendado'].includes(c?.veredicto) ? c.veredicto : '',
      fortalezas: str(c?.fortalezas, 1200), riesgos: str(c?.riesgos, 1200) })).filter((c: any) => c.nombre),
    conclusion: str(o?.conclusion, 5000),
    faltantes: (Array.isArray(o?.faltantes) ? o.faltantes : []).slice(0, 10).map((x: any) => str(x, 400)).filter(Boolean),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  let begun: { company_id: string; month: string } | null = null
  try {
    const { data: cfg } = await sb.rpc('get_push_config')
    const key = Deno.env.get('ANTHROPIC_API_KEY') || cfg?.anthropic_key || ''
    if (!key) return json({ error: 'La IA aún no está activada.' }, 503)
    const body = await req.json().catch(() => ({}))

    // Modo de prueba: solo con el secreto temporal; no lee ni escribe la base
    const testToken = Deno.env.get('EVAL_TEST_TOKEN') || ''
    if (body.test) {
      if (!testToken || req.headers.get('x-eval-test') !== testToken) return json({ error: 'forbidden' }, 403)
      const t = body.test
      const content = await buildContent({ title: t.title, client: t.client, profile: t.profile, person: t.person }, (t.files || []).slice(0, 15))
      const r = await callClaude(key, RULES, content, REPORT_TOOL, 8000)
      return json({ sections: clean(r.input), usage: { input_tokens: r.inT, output_tokens: r.outT, cost_usd: r.cost } })
    }

    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: u } = await sb.auth.getUser(token)
    if (!u?.user) return json({ error: 'Inicia sesión para generar informes.' }, 401)
    if (body.mode === 'disc') {
      const id = String(body.disc || '')
      if (!UUID.test(id)) return json({ error: 'Test no encontrado.' }, 400)
      const { data: dx, error: de } = await sb.rpc('disc_ai_begin', { p_user: u.user.id, p_test: id })
      if (de) return json({ error: de.message }, 400)
      const release = async () => { await sb.rpc('disc_ai_release', { p_company: dx.company_id, p_month: dx.month }) }
      try {
        const text = `Persona: ${str(dx.name, 120)}\nCargo: ${str(dx.title, 160)}\n\nPerfil del cargo:\n<<<\n${str(dx.job_profile, 20000) || 'No entregado; usa el nombre del cargo.'}\n>>>\n\nPuntajes: ${JSON.stringify(dx.scores)}\nIntegridad: ${JSON.stringify(dx.integrity)}`
        const r = await callClaude(key, DISC_RULES, [{ type: 'text', text }], DISC_TOOL, 4000)
        const report = cleanDisc(r.input, dx.scores)
        if (!report.analisis || !report.conclusion) throw new Error('La IA entregó un reporte incompleto. Inténtalo de nuevo.')
        const { error: e2 } = await sb.rpc('disc_ai_store', { p_test: id, p_report: report, p_model: MODEL, p_in: r.inT, p_out: r.outT, p_cost: r.cost })
        if (e2) throw new Error('No pudimos guardar el reporte. Inténtalo de nuevo.')
        return json({ ok: true })
      } catch (e) { await release(); throw e }
    }
    if (body.mode === 'comparativo') {
      const ev = String(body.evaluation || '')
      if (!UUID.test(ev)) return json({ error: 'Evaluación no encontrada.' }, 400)
      const { data: cx, error: ce } = await sb.rpc('eval_compare_begin', { p_user: u.user.id, p_eval: ev })
      if (ce) return json({ error: ce.message }, 400)
      begun = { company_id: cx.company_id, month: cx.month }
      const text = `Cargo: ${str(cx.evaluation.title, 160)}\nEmpresa: ${str(cx.evaluation.client_name || cx.evaluation.company, 160)}\n\nPerfil del cargo:\n<<<\n${str(cx.evaluation.job_profile, 20000) || 'No entregado.'}\n>>>\n\n` +
        (cx.people || []).map((p: any, i: number) => `<informe persona="${i + 1}" nombre="${str(p.nombre, 120)}" estado="${p.estado}">\n${JSON.stringify(p.informe).slice(0, 30000)}\n</informe>`).join('\n\n')
      const r = await callClaude(key, COMPARE_RULES, [{ type: 'text', text }], COMPARE_TOOL, 6000)
      const content = cleanCompare(r.input)
      if (!content.resumen || content.candidatos.length < 2) throw new Error('La IA entregó un comparativo incompleto. Inténtalo de nuevo.')
      const { data: id, error: e2 } = await sb.rpc('eval_compare_store', { p_user: u.user.id, p_eval: ev, p_content: content, p_model: MODEL, p_in: r.inT, p_out: r.outT, p_cost: r.cost })
      if (e2) throw new Error('No pudimos guardar el comparativo. Inténtalo de nuevo.')
      begun = null
      return json({ comparison_id: id })
    }
    const cand = String(body.candidate || '')
    if (!UUID.test(cand)) return json({ error: 'Persona no encontrada.' }, 400)
    const mode = body.mode === 'seccion' ? 'seccion' : 'informe'
    const section = String(body.section || '')
    if (mode === 'seccion' && !SECTION_KEYS.includes(section)) return json({ error: 'Sección no válida.' }, 400)

    const { data: ctx, error: e1 } = await sb.rpc('eval_ai_begin', { p_user: u.user.id, p_cand: cand, p_kind: mode })
    if (e1) return json({ error: e1.message }, 400)
    if (mode === 'informe') begun = { company_id: ctx.company_id, month: ctx.month }

    const content = await buildContent({ title: ctx.evaluation.title, client: ctx.evaluation.client_name || ctx.evaluation.company, profile: ctx.evaluation.job_profile, person: ctx.candidate.full_name }, ctx.files || [])

    if (mode === 'informe') {
      const r = await callClaude(key, RULES, content, REPORT_TOOL, 8000)
      const sections = clean(r.input)
      if (!sections.antecedentes || !sections.recomendacion) throw new Error('La IA entregó un informe incompleto. Inténtalo de nuevo.')
      const { data: id, error: e2 } = await sb.rpc('eval_ai_store', { p_user: u.user.id, p_cand: cand, p_sections: sections, p_model: MODEL, p_in: r.inT, p_out: r.outT, p_cost: r.cost })
      if (e2) throw new Error('No pudimos guardar el informe. Inténtalo de nuevo.')
      begun = null
      return json({ report_id: id })
    }

    // Una sección: se reescribe con la indicación de la persona, manteniendo el resto del informe como contexto
    const { data: rep } = await sb.from('assessment_reports').select('sections').eq('assessment_candidate_id', cand).eq('status', 'borrador').order('version', { ascending: false }).limit(1).maybeSingle()
    const current = rep?.sections || {}
    const prop = (SCHEMA.properties as any)[section]
    const tool = { name: 'entregar_seccion', description: 'Entrega la sección reescrita.', input_schema: { type: 'object', properties: { valor: prop }, required: ['valor'] } }
    content.push({ type: 'text', text: `Informe actual (borrador):\n${JSON.stringify(current).slice(0, 40000)}\n\nReescribe SOLO la sección «${section}». Indicación de quien revisa: ${str(body.instruction, 500) || 'mejórala manteniendo los hechos'}.\nEntrega el resultado con la herramienta «entregar_seccion».` })
    const r = await callClaude(key, RULES.replace('Entrega el resultado SOLO con la herramienta «entregar_informe».', ''), content, tool, 4000)
    const value = (clean({ ...current, [section]: r.input?.valor }) as any)[section]
    const { error: e3 } = await sb.rpc('eval_ai_store_section', { p_user: u.user.id, p_cand: cand, p_key: section, p_value: value, p_in: r.inT, p_out: r.outT, p_cost: r.cost })
    if (e3) throw new Error('No pudimos guardar la sección. Inténtalo de nuevo.')
    return json({ section, value })
  } catch (e) {
    console.error('evaluation-report', (e as Error).message)
    if (begun) await sb.rpc('eval_ai_release', { p_company: begun.company_id, p_month: begun.month })
    return json({ error: (e as Error).message || 'Ocurrió un error con la IA.' }, 502)
  }
})
