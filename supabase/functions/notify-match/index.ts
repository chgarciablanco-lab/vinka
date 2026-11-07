// Despacha avisos de VINKA: push a cada teléfono del usuario y correo con diseño (Resend).
// Lo llama un trigger de la tabla notifications con un secreto compartido: { kind: 'notification', id }
// También acepta { kind: 'samples', to } para enviar correos de muestra con datos de prueba.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

/* ---------- utilidades ---------- */
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const TZ = 'America/Santiago'
const clp = (n?: number | null) => (n == null ? '' : '$' + Number(n).toLocaleString('es-CL'))
const salary = (j: any) => {
  if (!j?.salary_min && !j?.salary_max) return 'A convenir'
  const t = j.salary_type === 'bruto' ? 'bruto' : 'líquido'
  return j.salary_min && j.salary_max && j.salary_min !== j.salary_max ? `${clp(j.salary_min)} – ${clp(j.salary_max)} ${t}` : `${clp(j.salary_max || j.salary_min)} ${t}`
}
const part = (d: string, o: Intl.DateTimeFormatOptions) => new Date(d).toLocaleString('es-CL', { timeZone: TZ, ...o })
const hhmm = (d: string) => part(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const initials = (s: string) => (s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

/* ---------- piezas del correo (tablas e estilos en línea para Gmail/Outlook) ---------- */
const F = "font-family:Poppins,'Segoe UI',Arial,Helvetica,sans-serif"
const B = "font-family:Inter,'Segoe UI',Arial,Helvetica,sans-serif"
const PINK = '#D02E72', DARK = '#302538'

function shell(inner: string, foot: string, label = 'VINKA Talent', preheader = '') {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>VINKA</title></head>
<body style="margin:0;padding:0;background:#F6EEF2">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6EEF2"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #F0DDE7;border-radius:20px;overflow:hidden">
<tr><td style="padding:22px 28px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="${F};font-size:24px;font-weight:700;letter-spacing:2px;color:#17131A">VINKA<div style="${B};font-size:12px;font-weight:400;letter-spacing:0;color:#6B5F6E">Tu próximo <b style="color:#B0245F">match</b> empieza aquí.</div></td>
    <td align="right" style="${B};font-size:12px;font-weight:700;color:${label.includes('Company') ? '#B85F00' : '#6B5F6E'}">${esc(label)}</td>
  </tr></table>
</td></tr>
${inner}
<tr><td style="padding:22px 28px;background:#FAF6F8;border-top:1px solid #F0DDE7;${B};font-size:12px;line-height:1.6;color:#6B5F6E">${foot}</td></tr>
</table></td></tr></table></body></html>`
}
const FOOT = (prefs: string) => `VINKA nunca te pedirá pagar para postular ni ser contratado/a. Si alguien lo hace, denúncialo desde el chat.<br>Recibes este correo porque tienes una cuenta en VINKA. <a href="${prefs}" style="color:#B0245F">Preferencias de avisos</a>`
const body = (html: string) => `<tr><td style="padding:28px 28px 8px;${B};color:#17131A">${html}</td></tr>`
const p = (t: string, extra = '') => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2E2532;${extra}">${t}</p>`
const h1 = (t: string) => `<h1 style="margin:0 0 16px;${F};font-size:26px;line-height:1.25;color:#17131A">${t}</h1>`
const btn = (href: string, label: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 16px"><tr><td align="center" style="background:${PINK};border-radius:14px"><a href="${href}" style="display:block;padding:16px;${B};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none">${esc(label)}</a></td></tr></table>`
const btn2 = (a: [string, string][]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr>${a.map(([h, l], i) => `<td width="50%" style="padding-${i ? 'left' : 'right'}:5px"><a href="${h}" style="display:block;text-align:center;border:1px solid #D6CBD3;border-radius:12px;padding:12px;${B};font-size:14px;font-weight:600;color:#17131A;text-decoration:none">${esc(l)}</a></td>`).join('')}</tr></table>`
const rows = (r: [string, string][]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:#FFF9FB;border:1px solid #F0DDE7;border-radius:16px">${r.map(([k, v], i) => `<tr><td style="padding:12px 18px;${i ? 'border-top:1px solid #F1E7ED;' : ''}${B};font-size:14px;color:#6B5F6E">${esc(k)}</td><td align="right" style="padding:12px 18px;${i ? 'border-top:1px solid #F1E7ED;' : ''}${B};font-size:14px;font-weight:600;color:#17131A">${esc(v)}</td></tr>`).join('')}</table>`
const note = (html: string, bg = '#F6F1F4', color = '#2E2532') => `<div style="margin:0 0 16px;background:${bg};border-radius:14px;padding:14px 16px;font-size:14px;line-height:1.55;color:${color}">${html}</div>`
const list = (title: string, items: string[]) => `<div style="margin:0 0 18px;border:1px solid #F0DDE7;border-radius:16px;padding:16px 18px"><div style="font-weight:700;font-size:15px;margin-bottom:8px">${title}</div>${items.map((t) => `<div style="font-size:15px;line-height:1.55;color:#2E2532">• ${t}</div>`).join('')}</div>`
const circle = (t: string, bg: string) => `<td style="width:72px;height:72px;border-radius:36px;background:${bg};border:3px solid #ffffff;${F};font-size:24px;font-weight:700;color:#ffffff;text-align:center;vertical-align:middle">${esc(t)}</td>`

function heroMatch(left: string, right: string, rightColor: string) {
  return `<tr><td align="center" style="background:${DARK};padding:36px 28px">
  <div style="${B};font-size:12px;font-weight:700;letter-spacing:3px;color:#FFC2DD">INTERÉS MUTUO</div>
  <div style="${F};font-size:42px;font-weight:700;line-height:1.1;color:#ffffff;margin:10px 0 18px">¡Es <span style="color:#E83E83">match</span>!</div>
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>${circle(left, PINK)}<td style="width:14px"></td>
  <td style="width:34px;height:34px;border-radius:17px;background:#FF941E;text-align:center;vertical-align:middle;${B};font-weight:700;color:${DARK};font-size:18px">&#10003;</td>
  <td style="width:14px"></td>${circle(right, rightColor)}</tr></table></td></tr>`
}
function dateBlock(start: string, end: string, sub: string, mode: string, color = PINK) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border:1px solid #F0DDE7;border-radius:18px;overflow:hidden"><tr>
  <td width="116" align="center" style="background:${color};padding:16px 0;${B};color:#ffffff">
    <div style="font-size:13px;font-weight:700;letter-spacing:2px">${esc(part(start, { weekday: 'short' }).replace('.', '').toUpperCase())}</div>
    <div style="${F};font-size:44px;font-weight:700;line-height:1">${esc(part(start, { day: 'numeric' }))}</div>
    <div style="font-size:13px;font-weight:600">${esc(part(start, { month: 'long' }))}</div></td>
  <td style="padding:16px 18px;${B}">
    <div style="${F};font-size:22px;font-weight:700;color:#17131A">${hhmm(start)} – ${hhmm(end)}</div>
    <div style="font-size:15px;color:#4A3F4E;margin-top:4px">${esc(sub)}</div>
    <div style="font-size:15px;font-weight:600;color:${mode === 'online' ? '#B0245F' : '#B85F00'};margin-top:4px">${mode === 'online' ? 'Por videollamada' : 'Presencial'}</div></td></tr></table>`
}
function stepper(active: string) {
  const steps = ['Match', 'Contacto', 'Entrevista', 'Oferta']
  const idx = steps.indexOf(active)
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px"><tr>${steps.map((s, i) => `<td style="padding:5px 9px;border-radius:6px;background:${i < idx ? PINK : i === idx ? '#FF941E' : '#ffffff'};${B};font-size:12px;font-weight:700;color:${i < idx ? '#ffffff' : DARK}">${s}</td>${i < steps.length - 1 ? `<td style="padding:0 4px;color:#B85F00;font-size:12px">&rsaquo;</td>` : ''}`).join('')}</tr></table>`
}

/* ---------- contexto desde la base ---------- */
async function matchCtx(matchId: string) {
  const { data: m } = await sb.from('matches').select('id, candidate_id, company_id, job_id, jobs(title, comuna, region, modality, area, salary_min, salary_max, salary_type), companies(display_name)').eq('id', matchId).maybeSingle()
  if (!m) return null
  const { data: cand } = await sb.from('profiles').select('first_name, last_name').eq('id', m.candidate_id).single()
  const { data: cp } = await sb.from('candidate_profiles').select('headline, comuna, availability, areas').eq('user_id', m.candidate_id).single()
  const { data: iv } = await sb.from('interviews').select('*').eq('match_id', matchId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return { m, job: (m as any).jobs, company: (m as any).companies?.display_name || 'La empresa', cand, cp, iv }
}
const shortName = (p: any) => `${p?.first_name || ''} ${p?.last_name ? p.last_name[0] + '.' : ''}`.trim()

/* ---------- plantillas ---------- */
async function render(n: any, name: string, app: string): Promise<string> {
  const link = app + n.url
  const prefs = app + '/avisos'
  const matchId = (n.url.match(/\/chats\/([0-9a-f-]{36})/) || [])[1]
  const c = matchId ? await matchCtx(matchId) : null
  const hello = p(`Hola ${esc(name)},`, 'margin-bottom:12px')

  if (n.kind === 'match' && c) {
    const forCompany = n.title.startsWith('¡Nuevo')
    if (forCompany) {
      return shell(`<tr><td style="background:${DARK};padding:28px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${circle(initials(shortName(c.cand)), PINK)}<td style="padding-left:16px;${B}"><div style="font-size:12px;font-weight:700;letter-spacing:3px;color:#FFC2DD">NUEVO MATCH</div><div style="${F};font-size:26px;font-weight:700;line-height:1.2;color:#ffffff">${esc(shortName(c.cand))} también se interesó</div></td></tr></table></td></tr>` +
        body(hello + p(`${esc(shortName(c.cand))} aceptó tu interés para <b>${esc(c.job?.title)}</b>. Ya pueden conversar. Si tienes horarios publicados en tu Agenda, podrá reservar su entrevista directamente.`) +
          rows([['Candidato/a', shortName(c.cand)], ['Busca', c.cp?.headline || '—'], ['Comuna', c.cp?.comuna || '—'], ['Disponibilidad', c.cp?.availability || '—']]) +
          btn(link, 'Escribirle ahora') + note(`<b>¿Aún no publicas horarios?</b> <a href="${app}/agenda" style="color:#7A4100;font-weight:700">Abre tu Agenda</a> para que tus matches agenden sin ir y venir de mensajes.`, '#FFF4E8', '#4A2A00')),
        'El teléfono y correo del candidato se muestran solo si decide compartirlos.<br>' + `Recibes este correo como parte del equipo de ${esc(c.company)} en VINKA. <a href="${prefs}" style="color:#B0245F">Preferencias de avisos</a>`, 'VINKA Company', n.body)
    }
    return shell(heroMatch(initials(name), initials(c.company), '#3B5BA9') +
      body(hello + p(`<b>${esc(c.company)}</b> también se interesó en ti. Ahora pueden conversar en VINKA y, cuando quieras, elegir un horario para la entrevista.`) +
        rows([['Vacante', c.job?.title], ['Empresa', `${c.company} · verificada`], ['Lugar', c.job?.modality === 'Remota' ? 'Remoto · Chile' : `${c.job?.comuna || ''} · ${c.job?.modality || ''}`], ['Renta', salary(c.job)]]) +
        btn(link, 'Abrir el chat') + p(`o <a href="${app}/chats/${matchId}/agendar" style="color:#B0245F;font-weight:600">agenda tu entrevista</a> directamente`, 'text-align:center;font-size:14px') +
        note('<b>Tip:</b> responde dentro de las primeras 24 horas. Tu teléfono y correo siguen privados hasta que decidas compartirlos.', '#FFF4E8', '#4A2A00')),
      FOOT(prefs), 'VINKA Talent', n.body)
  }

  if ((n.kind === 'interview_booked' || n.kind === 'interview_reminder') && c?.iv && !n.url.startsWith('/agenda')) {
    const iv = c.iv
    const online = iv.mode === 'online'
    const place = [iv.address, iv.comuna].filter(Boolean).join(', ')
    const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`
    const action = online ? btn(iv.meeting_url, 'Unirse a la videollamada') + p(esc(iv.meeting_url.replace('https://', '')), 'text-align:center;font-size:13px;color:#6B5F6E;margin-top:-8px') :
      rows([['Dirección', iv.address], ['Comuna', iv.comuna || '—']]) + btn(maps, 'Cómo llegar')
    const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Entrevista VINKA · ' + c.company)}&dates=${new Date(iv.starts_at).toISOString().replace(/[-:]|\.\d{3}/g, '')}/${new Date(iv.ends_at).toISOString().replace(/[-:]|\.\d{3}/g, '')}&location=${encodeURIComponent(online ? iv.meeting_url : place)}`
    if (n.kind === 'interview_reminder') {
      return shell(`<tr><td style="background:#FFF0F6;padding:28px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:90px;height:90px;border-radius:45px;border:4px solid ${PINK};background:#ffffff;text-align:center;vertical-align:middle;${F};font-size:28px;font-weight:700;color:${PINK}">1 h</td><td style="padding-left:18px;${B}"><div style="${F};font-size:24px;font-weight:700;line-height:1.2;color:#17131A">Tu entrevista empieza pronto</div><div style="font-size:16px;color:#2E2532;margin-top:6px">Hoy a las <b>${hhmm(iv.starts_at)}</b> con <b>${esc(c.company)}</b> · ${online ? 'videollamada' : 'presencial'}</div></td></tr></table></td></tr>` +
        body(p(`Hola ${esc(name)}, todo listo para tu entrevista de <b>${esc(c.job?.title)}</b>.`) + action +
          list('Checklist rápido', online ? ['Prueba cámara y micrófono antes de la hora.', 'Busca un lugar tranquilo y con buena luz.', 'Prepara un logro concreto y una pregunta para el equipo.'] : ['Llega 10 minutos antes.', 'Lleva tu carnet de identidad.', 'Prepara un logro concreto y una pregunta para el equipo.']) +
          (iv.notes ? note(`<b>Indicaciones de la empresa:</b> ${esc(iv.notes)}`) : '') +
          p(`¿Tuviste un imprevisto? <a href="${link}" style="color:#B0245F;font-weight:600">Avísale a la empresa por el chat</a>`, 'text-align:center;font-size:14px')),
        FOOT(prefs), 'VINKA Talent', n.body)
    }
    return shell(body(hello + h1(`Tu entrevista con ${esc(c.company)} quedó agendada`) + dateBlock(iv.starts_at, iv.ends_at, `${c.job?.title || ''}`, iv.mode, online ? PINK : DARK) + action +
      (iv.notes ? note(`<b>Indicaciones de la empresa:</b> ${esc(iv.notes)}`) : '') +
      btn2([[gcal, 'Agregar a mi calendario'], [link, 'Cambiar horario']]) +
      p(`<b style="color:#17131A">Antes de la entrevista:</b> ${online ? 'prueba tu cámara y micrófono y conéctate 5 minutos antes.' : 'revisa cómo llegar y lleva tu carnet.'} Te enviaremos un recordatorio 1 hora antes.`, 'font-size:14px;color:#4A3F4E')),
      FOOT(prefs), 'VINKA Talent', n.body)
  }

  if (n.kind === 'stage_oferta' && c) {
    return shell(`<tr><td style="background:#FFF4E8;padding:28px;${B}">${stepper('Oferta')}<div style="${F};font-size:34px;font-weight:700;line-height:1.15;color:${DARK}">¡Tienes una oferta!</div><div style="font-size:16px;color:#4A2A00;margin-top:6px">${esc(c.company)} avanzó a la etapa de oferta contigo.</div></td></tr>` +
      body(hello + p(`<b>${esc(c.company)}</b> quiere ofrecerte el cargo de <b>${esc(c.job?.title)}</b>. Los detalles (renta, fecha de inicio y condiciones) te los comparte la empresa por el chat.`) +
        btn(link, 'Ver la oferta en el chat') + list('Antes de aceptar, revisa', ['Renta líquida o bruta, y si incluye bonos', 'Tipo de contrato y jornada', 'Fecha de inicio y lugar de trabajo'])),
      'VINKA nunca te pedirá pagar para postular ni ser contratado/a. Una oferta real nunca te pide dinero.<br>' + `Recibes este correo porque tienes una cuenta en VINKA. <a href="${prefs}" style="color:#B0245F">Preferencias de avisos</a>`, 'VINKA Talent', n.body)
  }

  if (n.kind === 'stage_contratado' && c) {
    return shell(`<tr><td align="center" style="background:${DARK};padding:40px 28px;${B}"><div style="font-size:22px;letter-spacing:10px;color:#FF941E">&#9733; &#9733; &#9733;</div><div style="${F};font-size:36px;font-weight:700;line-height:1.15;color:#ffffff;margin-top:10px">¡Felicitaciones, ${esc(name)}!</div><div style="font-size:17px;color:#FFC2DD;margin-top:6px">Tienes un nuevo trabajo.</div></td></tr>` +
      body(p(`<b>${esc(c.company)}</b> te marcó como contratado/a para el cargo de <b>${esc(c.job?.title)}</b>. Todo partió con un match: nos alegra mucho haber sido parte.`) +
        list('Próximos pasos', ['Coordina tu fecha de inicio y la firma de contrato por el chat.', 'Si ya no buscarás trabajo, puedes ocultar tu perfil desde Perfil → Privacidad.']) +
        btn(link, `Abrir el chat con ${c.company}`)),
      `Recibes este correo porque tienes una cuenta en VINKA. <a href="${prefs}" style="color:#B0245F">Preferencias de avisos</a>`, 'VINKA Talent', n.body)
  }

  if (n.kind === 'stage_descartado' && c) {
    const { data: sug } = await sb.from('jobs').select('id, title, comuna, modality, companies!inner(display_name, verification_status)')
      .eq('status', 'published').eq('companies.verification_status', 'verified').in('area', c.cp?.areas?.length ? c.cp.areas : ['__']).neq('id', c.m.job_id).limit(2)
    const sugHtml = (sug || []).length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border:1px solid #F0DDE7;border-radius:16px"><tr><td style="padding:12px 18px;background:#FFF9FB;font-size:14px;font-weight:700;border-radius:16px 16px 0 0">Vacantes que coinciden con tu perfil</td></tr>${(sug || []).map((j: any) => `<tr><td style="padding:12px 18px;border-top:1px solid #F1E7ED;font-size:15px"><b>${esc(j.title)}</b><br><span style="font-size:13px;color:#6B5F6E">${esc(j.companies.display_name)} · ${esc(j.modality === 'Remota' ? 'Remoto' : j.comuna)}</span></td></tr>`).join('')}</table>` : ''
    return shell(body(hello + h1(`Una actualización sobre tu proceso en ${esc(c.company)}`) +
      p(`${esc(c.company)} decidió avanzar con otras personas para <b>${esc(c.job?.title)}</b>. Sabemos que no es la noticia que esperabas, y queremos agradecerte el tiempo y el interés que pusiste.`) +
      p('Un proceso que no resulta no dice nada de lo que vales. Cada conversación te deja mejor preparado/a para la siguiente.') +
      sugHtml + btn(app + '/', 'Seguir explorando vacantes') +
      p(`¿Quieres más opciones? <a href="${app}/perfil/preferencias" style="color:#B0245F;font-weight:600">Amplía tus preferencias</a>`, 'text-align:center;font-size:14px')),
      `Recibes este correo porque tienes una cuenta en VINKA. <a href="${prefs}" style="color:#B0245F">Preferencias de avisos</a>`, 'VINKA Talent', n.body)
  }

  // Genérico: contacto, entrevista solicitada, cancelaciones, verificación, avisos a empresas
  const company = n.url === '/agenda' || n.kind.startsWith('company_')
  const cta = n.kind === 'stage_entrevista' ? 'Elegir horario' : n.kind === 'interview_cancelled' && !company ? 'Elegir otro horario' : company && n.url === '/agenda' ? 'Ver mi agenda' : 'Abrir VINKA'
  return shell(body(hello + h1(esc(n.title)) + p(esc(n.body)) + btn(link, cta)), FOOT(prefs), company ? 'VINKA Company' : 'VINKA Talent', n.body)
}

async function sendEmail(cfg: any, key: string, to: string, subject: string, html: string, text: string) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: cfg.email_from, to: [to], subject, html, text }),
  })
  if (!r.ok) console.error('resend', r.status, await r.text())
  return r.ok ? 'enviado' : `error_${r.status}`
}

Deno.serve(async (req) => {
  try {
    const { data: cfg } = await sb.rpc('get_push_config')
    if (!cfg || req.headers.get('x-notify-secret') !== cfg.notify_secret) return new Response('forbidden', { status: 403 })
    const RESEND = Deno.env.get('RESEND_API_KEY') || cfg.resend_key || ''
    const payload = await req.json()

    /* Muestras: renderiza cada plantilla con avisos de prueba y las envía a una dirección */
    if (payload.kind === 'samples') {
      const { data: list } = await sb.from('notifications').select('*').in('id', payload.ids || [])
      const out: any[] = []
      for (const n of list || []) {
        const html = await render(n, payload.name || 'Christian', cfg.app_url)
        out.push({ kind: n.kind, status: RESEND ? await sendEmail(cfg, RESEND, payload.to, `[Muestra] ${n.title}`, html, n.body) : 'sin_clave' })
      }
      return Response.json(out)
    }
    /* Invitación a un postulante importado desde otro portal */
    if (payload.kind === 'invite') {
      const { data: e } = await sb.from('external_applicants').select('*, jobs(title, comuna, modality), companies(display_name)').eq('id', payload.id).single()
      if (!e) return new Response('not found', { status: 404 })
      const company = (e as any).companies?.display_name || 'Una empresa'
      const job = (e as any).jobs?.title || 'una vacante'
      const link = `${cfg.app_url}/invitacion/${e.invite_token}`
      const html = shell(body(p(`Hola ${esc(e.full_name.split(' ')[0])},`, 'margin-bottom:12px') +
        h1(`${esc(company)} te invita a continuar tu proceso en VINKA`) +
        p(`Postulaste a <b>${esc(job)}</b> y ${esc(company)} ahora gestiona sus procesos de selección en VINKA. Si aceptas, podrás conversar directamente con la empresa y elegir el horario de tu entrevista desde tu celular.`) +
        rows([['Vacante', job], ['Empresa', company], ['Lugar', (e as any).jobs?.modality === 'Remota' ? 'Remoto' : ((e as any).jobs?.comuna || '—')]]) +
        btn(link, 'Aceptar y continuar') +
        note('Crear tu cuenta es gratis. Si no te interesa, ignora este correo: no crearemos ninguna cuenta con tus datos.')),
        `Recibes este correo porque postulaste a una vacante de ${esc(company)}, que te invitó a VINKA.<br>VINKA nunca te pedirá pagar para postular ni ser contratado/a.`, 'VINKA Talent', `${company} te invita a continuar tu proceso`)
      const status = !e.email ? 'sin_correo' : e.email.endsWith('@example.com') ? 'cuenta_de_prueba' : !RESEND ? 'sin_configurar'
        : await sendEmail(cfg, RESEND, e.email, `${company} te invita a continuar tu proceso en VINKA`, html, `${company} te invita a continuar tu proceso para ${job} en VINKA: ${link}`)
      await sb.from('external_applicants').update({ invite_status: status }).eq('id', e.id)
      return Response.json({ invite: status })
    }
    if (payload.kind !== 'notification') return Response.json({ skipped: payload.kind })

    const { data: n } = await sb.from('notifications').select('*').eq('id', payload.id).single()
    if (!n) return new Response('not found', { status: 404 })

    // 1) Push
    let pushed = 0
    const { data: subs } = await sb.from('push_subscriptions').select('*').eq('user_id', n.user_id)
    if (subs?.length) {
      webpush.setVapidDetails(cfg.app_url, cfg.vapid_public, cfg.vapid_private)
      const pl = JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: `${n.kind}-${n.url}` })
      for (const s of subs) {
        try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, pl, { TTL: 86400, urgency: 'high' }); pushed++ }
        catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
          else console.error('push', e?.statusCode, e?.body)
        }
      }
    }

    // 2) Correo con diseño
    let emailStatus: string | null = null
    if (n.send_email) {
      const { data: prof } = await sb.from('profiles').select('first_name, email_notifications').eq('id', n.user_id).single()
      const { data: u } = await sb.auth.admin.getUserById(n.user_id)
      const to = u?.user?.email || ''
      if (!prof?.email_notifications) emailStatus = 'desactivado'
      else if (!to || to.endsWith('@example.com')) emailStatus = 'cuenta_de_prueba'
      else if (!RESEND) emailStatus = 'sin_configurar'
      else emailStatus = await sendEmail(cfg, RESEND, to, n.title, await render(n, prof?.first_name || '', cfg.app_url), `${n.title}\n\n${n.body}\n\n${cfg.app_url + n.url}`)
      await sb.from('notifications').update({ email_status: emailStatus }).eq('id', n.id)
    }
    return Response.json({ pushed, email: emailStatus })
  } catch (e) {
    console.error(e)
    return new Response('error', { status: 500 })
  }
})
