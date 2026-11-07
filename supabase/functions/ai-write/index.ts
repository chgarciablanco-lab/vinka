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
    default:
      return { max: 300, text: '' }
  }
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
    const p = prompt(task, mode, context)
    if (!p.text) return json({ error: 'Tarea no reconocida.' }, 400)
    if (mode !== 'write' && !String(context.current || '').trim() && !p.list) return json({ error: 'Escribe algo primero para poder mejorarlo.' }, 400)

    const limit = parseInt(cfg?.ai_daily_limit || '40', 10)
    const { data: used } = await sb.rpc('ai_take', { p_user: u.user.id, p_limit: limit })
    if ((used || 0) > limit) return json({ error: `Llegaste al límite de ${limit} usos de IA por hoy. Vuelve mañana.` }, 429)

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg?.ai_model || 'claude-haiku-5-5', max_tokens: p.max, thinking: { type: 'disabled' }, system: RULES, messages: [{ role: 'user', content: p.text }] }),
    })
    if (!r.ok) { console.error('anthropic', r.status, await r.text()); return json({ error: 'El asistente no respondió. Inténtalo de nuevo en un momento.' }, 502) }
    const out = await r.json()
    const text = (out.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim()
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
