// Asistente de redacción de VINKA. Solo usuarios con sesión; límite diario por persona.
// Entrada: { task, mode, context }  ·  Salida: { text } o { items }
import { createClient } from 'npm:@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const clip = (s: unknown, n = 1500) => String(s ?? '').slice(0, n)

const RULES = `Eres el asistente de redacción de VINKA, una app chilena de empleo.
Reglas que siempre cumples:
- Español de Chile, claro, cálido y profesional. Tutea en textos para candidatos; usa "tú" también en avisos.
- No inventes datos: no agregues sueldos, beneficios, años de experiencia, logros, cifras ni nombres que no estén en el contexto. Si falta información, escribe en términos generales.
- Nunca incluyas requisitos o preferencias discriminatorias: edad, sexo, estado civil, apariencia física, nacionalidad, religión, embarazo, discapacidad, ideas políticas, sindicalización u orientación sexual (Ley 20.609 y Código del Trabajo, art. 2). Si el texto de la persona los trae, quítalos.
- Nada de emojis, mayúsculas sostenidas ni frases exageradas ("¡la oportunidad de tu vida!").
- Responde SOLO con el resultado pedido, sin introducciones, comillas ni explicaciones.`

const MODES: Record<string, string> = {
  write: 'Redacta una versión nueva a partir del contexto.',
  improve: 'Mejora el texto actual: corrige ortografía y redacción y hazlo más claro, manteniendo los hechos y la intención.',
  shorter: 'Haz el texto actual más breve y directo, sin perder lo importante.',
  formal: 'Reescribe el texto actual con un tono más formal y profesional.',
  friendly: 'Reescribe el texto actual con un tono más cercano y amable.',
}

function prompt(task: string, mode: string, c: any): { text: string; list?: boolean; max: number } {
  const m = MODES[mode] || MODES.write
  const current = clip(c.current, 3000)
  const cur = current ? `\nTexto actual:\n"""${current}"""` : ''
  switch (task) {
    case 'candidate_bio':
      return { max: 350, text: `${m}
Escribe la presentación personal de una persona que busca trabajo, en primera persona, de 2 a 4 frases y máximo 400 caracteres. Debe decir qué busca, su experiencia o formación y una fortaleza. Si no tiene experiencia, destaca ganas de aprender y habilidades.
Pregunta guía elegida: ${clip(c.question, 200)}
Cargo buscado: ${clip(c.headline, 120)}
Experiencia: ${clip(JSON.stringify(c.experiences || []), 800)}
Estudios: ${clip(JSON.stringify(c.education || []), 400)}
Habilidades: ${clip((c.skills || []).join(', '), 300)}${cur}` }
    case 'candidate_skills':
      return { list: true, max: 300, text: `Sugiere hasta 8 habilidades laborales concretas (máximo 3 palabras cada una) relevantes para esta persona. Incluye habilidades técnicas y blandas. No repitas las que ya tiene.
Cargo buscado: ${clip(c.headline, 120)}
Experiencia: ${clip(JSON.stringify(c.experiences || []), 800)}
Estudios: ${clip(JSON.stringify(c.education || []), 400)}
Ya tiene: ${clip((c.skills || []).join(', '), 300)}
Responde solo con un arreglo JSON de textos, por ejemplo ["Excel","Atención al cliente"].` }
    case 'job_description':
      return { max: 900, text: `${m}
Redacta la descripción de un aviso de empleo, máximo 1.400 caracteres, con esta estructura en texto plano (sin markdown, sin asteriscos):
Un párrafo breve sobre el cargo y el equipo.
"Tus funciones:" seguido de 3 a 6 líneas que empiezan con "- ".
"Te ofrecemos:" seguido de 2 a 4 líneas con "- " SOLO con lo que aparezca en el contexto (modalidad, jornada, contrato, beneficios de la empresa); si no hay datos, omite esta sección.
Empresa: ${clip(c.company, 120)} — ${clip(c.company_description, 500)}
Beneficios de la empresa: ${clip(c.benefits, 400)}
Cargo: ${clip(c.title, 120)} · Área: ${clip(c.area, 60)} · Nivel: ${clip(c.level, 40)}
Modalidad: ${clip(c.modality, 30)} · Jornada: ${clip(c.schedule, 30)} · Contrato: ${clip(c.contract, 40)} · Comuna: ${clip(c.comuna, 60)}${cur}` }
    case 'job_requirements':
      return { list: true, max: 400, text: `Sugiere de 4 a 7 requisitos para este cargo. Cada uno breve (máximo 8 palabras), concreto y medible cuando sea posible (formación, experiencia, licencias, herramientas, disponibilidad). Marca como esenciales solo los indispensables. Sin requisitos discriminatorios.
Cargo: ${clip(c.title, 120)} · Área: ${clip(c.area, 60)} · Nivel: ${clip(c.level, 40)}
Descripción: ${clip(c.description, 1200)}
Ya tiene: ${clip(JSON.stringify(c.existing || []), 400)}
Responde solo con un arreglo JSON de objetos, por ejemplo [{"text":"Licencia clase B","essential":true}].` }
    case 'company_description':
      return { max: 450, text: `${m}
Redacta el texto "Quiénes somos" de la vitrina de una empresa para candidatos: 3 a 5 frases, máximo 700 caracteres, qué hace la empresa, dónde está y cómo es trabajar ahí, sin inventar cifras ni premios.
Empresa: ${clip(c.company, 120)} · Rubro: ${clip(c.sector, 60)} · Tamaño: ${clip(c.size, 20)} personas · Ubicación: ${clip(c.comuna, 60)}, ${clip(c.region, 60)}${cur}` }
    case 'company_benefits':
      return { max: 300, text: `${m}
Ordena y redacta los beneficios que la empresa ofrece como una lista breve separada por comas o en líneas cortas, máximo 400 caracteres. Si el texto actual está vacío, NO inventes beneficios: responde exactamente "Escribe primero los beneficios que ofrecen y los ordeno por ti."${cur}` }
    case 'chat_message':
      return { max: 300, text: `${m}
Mejora este mensaje de chat entre una empresa y una persona candidata (quien escribe es: ${c.role === 'company' ? 'la empresa' : 'la persona candidata'}). Mantén el sentido, que sea cordial, breve (máximo 3 frases) y sin datos nuevos.${cur}` }
    case 'message_template':
      return { max: 400, text: `${m}
Redacta una plantilla de mensaje de una empresa a candidatos en un proceso de selección. Tipo: ${clip(c.kind, 30)}. Máximo 600 caracteres, cordial y claro. Puedes usar las variables {nombre}, {cargo} y {empresa} tal cual, entre llaves.${cur}` }
    default:
      return { max: 300, text: '' }
  }
}

/* ---------- Tareas de selección: el contexto se arma en el servidor (sin nombre ni datos sensibles) ---------- */
const FIT = new Set(['candidate_fit', 'interview_questions'])
async function selectionPrompt(task: string, userId: string, c: any) {
  const { data: job } = await sb.from('jobs').select('id, company_id, title, area, level, description, requirements, modality, schedule, comuna, questions').eq('id', c.job_id).maybeSingle()
  if (!job) throw new Error('Vacante no encontrada.')
  const { data: mem } = await sb.from('company_members').select('role').eq('company_id', job.company_id).eq('user_id', userId).maybeSingle()
  if (!mem) throw new Error('No tienes acceso a esta vacante.')
  const [{ data: cp }, { data: act }, { data: m }] = await Promise.all([
    sb.from('candidate_profiles').select('headline, has_experience, experiences, education, skills, availability, modalities, schedules, comuna, region, bio').eq('user_id', c.candidate_id).maybeSingle(),
    sb.from('candidate_job_actions').select('action, answers').eq('job_id', job.id).eq('candidate_id', c.candidate_id).maybeSingle(),
    sb.from('matches').select('id').eq('job_id', job.id).eq('candidate_id', c.candidate_id).maybeSingle(),
  ])
  const { data: cca } = await sb.from('company_candidate_actions').select('action').eq('job_id', job.id).eq('candidate_id', c.candidate_id).maybeSingle()
  if (!cp || (!m && act?.action !== 'interest' && !cca)) throw new Error('Este candidato no participa en la vacante.')
  const answers = (job.questions || []).map((q: any) => `- ${q.text}: ${act?.answers?.[q.id] ?? 'sin respuesta'}`).join('\n')
  const exps = (cp.experiences || []).map((x: any) => `- ${x.role || ''} en ${x.company || ''} (${x.from || '?'} a ${x.current ? 'hoy' : x.to || '?'})${x.description ? ': ' + clip(x.description, 200) : ''}`).join('\n')
  const edu = (cp.education || []).map((x: any) => `- ${x.title || ''} ${x.level || ''} ${x.institution || ''} (${x.status || ''})`).join('\n')
  const ctx = `VACANTE
Cargo: ${job.title} · Área: ${job.area} · Nivel: ${job.level || '—'} · Modalidad: ${job.modality} · Jornada: ${job.schedule} · Comuna: ${job.comuna || '—'}
Descripción: ${clip(job.description, 1500)}
Requisitos: ${(job.requirements || []).map((r: any) => `${r.text} (${r.essential ? 'esencial' : 'deseable'})`).join('; ') || '—'}

PERFIL DE LA PERSONA CANDIDATA (sin datos personales)
Busca: ${cp.headline || '—'} · Ubicación: ${cp.comuna || '—'}, ${cp.region || '—'} · Disponibilidad: ${cp.availability || '—'}
Modalidades: ${(cp.modalities || []).join(', ') || '—'} · Jornadas: ${(cp.schedules || []).join(', ') || '—'}
Experiencia: ${cp.has_experience ? '\n' + (exps || '—') : 'busca su primer empleo'}
Estudios:\n${edu || '—'}
Habilidades: ${(cp.skills || []).join(', ') || '—'}
Presentación: ${clip(cp.bio, 500) || '—'}
${answers ? 'Respuestas a preguntas de filtro:\n' + answers : ''}`
  const BASE = `Ayudas a un equipo de selección a revisar candidaturas. Evalúa SOLO criterios relacionados con el trabajo (experiencia, estudios, habilidades, disponibilidad, ubicación y respuestas). Nunca consideres ni infieras edad, sexo, nacionalidad, estado civil, salud, apariencia ni otros motivos protegidos. Si falta información, dilo; no la inventes ni castigues por ella. Tu resultado es una sugerencia: la decisión es siempre de una persona.`
  if (task === 'candidate_fit') return { job, kind: 'fit', max: 700, text: `${BASE}

${ctx}

Responde SOLO con un objeto JSON con esta forma:
{"score": número de 0 a 100 que indica cuánto calza el perfil con la vacante,
 "summary": "resumen en máximo 3 frases cortas",
 "meets": ["requisito o fortaleza que cumple", ...] (máximo 5),
 "missing": ["requisito que no se ve en el perfil", ...] (máximo 4),
 "check": ["punto a confirmar en la entrevista", ...] (máximo 3)}` }
  return { job, kind: 'questions', max: 700, text: `${BASE}

${ctx}

Sugiere 6 preguntas de entrevista para esta persona y este cargo: 2 sobre experiencia concreta, 2 de situaciones (qué harías si...), 1 sobre motivación y 1 para confirmar algo que no esté claro en el perfil. Preguntas legales, sin temas personales.
Responde SOLO con un arreglo JSON de objetos: [{"q":"pregunta","why":"qué buscas evaluar, en pocas palabras"}]` }
}

async function callModel(key: string, cfg: any, text: string, max: number) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: cfg?.ai_model || 'claude-haiku-5-5', max_tokens: max, thinking: { type: 'disabled' }, system: RULES, messages: [{ role: 'user', content: text }] }),
  })
  if (!r.ok) { console.error('anthropic', r.status, await r.text()); return null }
  const out = await r.json()
  return (out.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: u } = await sb.auth.getUser(token)
    if (!u?.user) return json({ error: 'Inicia sesión para usar el asistente.' }, 401)

    const { data: cfg } = await sb.rpc('get_push_config')
    const key = Deno.env.get('ANTHROPIC_API_KEY') || cfg?.anthropic_key || ''
    if (!key) return json({ error: 'El asistente de IA aún no está activado.' }, 503)

    const { task, mode = 'write', context = {} } = await req.json()

    if (FIT.has(task)) {
      let sp
      try { sp = await selectionPrompt(task, u.user.id, context) } catch (e) { return json({ error: (e as Error).message }, 403) }
      const limit = parseInt(cfg?.ai_daily_limit || '40', 10)
      const { data: used } = await sb.rpc('ai_take', { p_user: u.user.id, p_limit: limit })
      if ((used || 0) > limit) return json({ error: `Llegaste al límite de ${limit} usos de IA por hoy. Vuelve mañana.` }, 429)
      const text = await callModel(key, cfg, sp.text, sp.max)
      if (text == null) return json({ error: 'El asistente no respondió. Inténtalo de nuevo en un momento.' }, 502)
      let data: any = null
      try {
        if (sp.kind === 'fit') {
          const o = JSON.parse((text.match(/\{[\s\S]*\}/) || ['null'])[0])
          const arr = (v: any, n: number) => (Array.isArray(v) ? v.map((x) => String(x).slice(0, 200)).slice(0, n) : [])
          data = { score: Math.max(0, Math.min(100, Math.round(Number(o.score) || 0))), summary: String(o.summary || '').slice(0, 600), meets: arr(o.meets, 5), missing: arr(o.missing, 4), check: arr(o.check, 3) }
        } else {
          const a = JSON.parse((text.match(/\[[\s\S]*\]/) || ['[]'])[0])
          data = { items: (Array.isArray(a) ? a : []).filter((x: any) => x?.q).slice(0, 8).map((x: any) => ({ q: String(x.q).slice(0, 300), why: String(x.why || '').slice(0, 160) })) }
        }
      } catch { data = null }
      if (!data || (sp.kind === 'questions' && !data.items.length)) return json({ error: 'No pude generar el resultado. Inténtalo de nuevo.' }, 502)
      await sb.from('ai_insights').upsert({ company_id: sp.job.company_id, job_id: sp.job.id, candidate_id: context.candidate_id, kind: sp.kind, data, created_by: u.user.id, created_at: new Date().toISOString() })
      return json({ data })
    }

    const p = prompt(task, mode, context)
    if (!p.text) return json({ error: 'Tarea no reconocida.' }, 400)
    if (mode !== 'write' && !String(context.current || '').trim() && !p.list) return json({ error: 'Escribe algo primero para poder mejorarlo.' }, 400)

    const limit = parseInt(cfg?.ai_daily_limit || '40', 10)
    const { data: used } = await sb.rpc('ai_take', { p_user: u.user.id, p_limit: limit })
    if ((used || 0) > limit) return json({ error: `Llegaste al límite de ${limit} usos de IA por hoy. Vuelve mañana.` }, 429)

    const text = await callModel(key, cfg, p.text, p.max)
    if (text == null) return json({ error: 'El asistente no respondió. Inténtalo de nuevo en un momento.' }, 502)
    if (p.list) {
      const m = text.match(/\[[\s\S]*\]/)
      let items: unknown[] = []
      try { items = m ? JSON.parse(m[0]) : [] } catch { items = [] }
      return json({ items: items.slice(0, 10) })
    }
    return json({ text: text.replace(/^["“]|["”]$/g, '').trim() })
  } catch (e) {
    console.error(e)
    return json({ error: 'Ocurrió un error con el asistente.' }, 500)
  }
})
