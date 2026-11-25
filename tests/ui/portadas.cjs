// Portadas VINKA Empleo y VINKA ATS (datos simulados, sin sesión): cada botón lleva al flujo correcto, avisos de demostración
// identificados, enlaces cruzados, menú móvil, sin desborde en celular y capturas para revisar el diseño
const { OUT, BASE } = require('./_config.cjs')
const { chromium, devices } = require('playwright')
const fs = require('fs')
const SP = process.env.PORTADAS_DATA || __dirname + '/fixtures'
const plans = JSON.parse(fs.readFileSync(SP + '/plans.json', 'utf8'))
const services = JSON.parse(fs.readFileSync(SP + '/services.json', 'utf8'))
const quoteReasons = []
const JOBS = [
  { id: 'a1111111-1111-1111-1111-111111111111', title: 'Ejecutivo/a de ventas', company: 'Nova Retail', comuna: 'Talca', modality: 'presencial', salary_min: 650000, salary_max: 800000, salary_type: 'liquido', demo: true },
  { id: 'a2222222-2222-2222-2222-222222222222', title: 'Cajero/a', company: 'Supermercado Sur', comuna: 'Curicó', modality: 'presencial', salary_min: 550000, salary_max: 600000, salary_type: 'liquido', demo: true },
  { id: 'a3333333-3333-3333-3333-333333333333', title: 'Analista contable', company: 'Agrícola Cliente', comuna: 'Talca', modality: 'hibrida', salary_min: 900000, salary_max: 1100000, salary_type: 'liquido', demo: false },
  { id: 'a4444444-4444-4444-4444-444444444444', title: 'Jefe/a de bodega', company: 'Ferretería Sur', comuna: 'Linares', modality: 'presencial', demo: true },
  { id: 'a5555555-5555-5555-5555-555555555555', title: 'Garzón/a', company: 'Restaurante del Lago', comuna: 'Puerto Varas', modality: 'presencial', salary_min: 500000, salary_max: 550000, salary_type: 'liquido', demo: true },
  { id: 'a6666666-6666-6666-6666-666666666666', title: 'Desarrollador/a web', company: 'Empresa confidencial', comuna: 'Santiago', modality: 'remota', salary_min: 1500000, salary_max: 1900000, salary_type: 'liquido', demo: true },
]

async function ctxFor(b, device, calls) {
  const ctx = await b.newContext(device)
  await ctx.addInitScript(() => { localStorage.setItem('vinka-splash', '1'); sessionStorage.setItem('vinka-splash-seen', '1') })
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
  await ctx.route(/supabase\.co/, async (route) => {
    const r = route.request(); const path = new URL(r.url()).pathname
    const send = (x, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(x) })
    if (path.startsWith('/auth/v1/user')) return send({}, 401)
    if (path.startsWith('/auth/') || path.startsWith('/storage/')) return send({})
    const name = path.startsWith('/rest/v1/rpc/') && path.split('/').pop()
    if (name) { calls.push(name); if (name === 'submit_quote') { try { quoteReasons.push(JSON.parse(r.postData()).p.reason) } catch { /* sin cuerpo */ } } if (name === 'public_recent_jobs') return send(JOBS); if (name === 'public_job') return send({ id: JOBS[0].id, title: JOBS[0].title, company: { display_name: 'Nova Retail' }, questions: [] }); return send(null) }
    const t = path.split('/').pop()
    if (t === 'plans') return send(plans)
    if (t === 'career_services') return send(services.slice(0, 3))
    return send([])
  })
  return ctx
}
const clean = async (p) => p.evaluate(() => document.getElementById('splash')?.remove())
// En capturas de página completa el encabezado fijo se dibuja a media página: se deja estático solo para la foto
const shot = async (p, path) => { await p.evaluate(() => { window.scrollTo(0, 0); document.querySelector('header')?.style.setProperty('position', 'static') }); await p.waitForTimeout(150); await p.screenshot({ path, fullPage: true }); await p.evaluate(() => document.querySelector('header')?.style.removeProperty('position')) }

;(async () => {
  const b = await chromium.launch(); const out = []; const errs = []
  const desk = { viewport: { width: 1366, height: 860 } }

  for (const [label, device] of [['escritorio', desk], ['celular', devices['iPhone 13']]]) {
    const calls = []
    const ctx = await ctxFor(b, device, calls)
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`${label}: ${e.message}`))
    const mobile = label === 'celular'

    // ── VINKA Empleo
    await p.goto(BASE + '/portada/empleo', { waitUntil: 'networkidle' }); await p.waitForTimeout(700); await clean(p)
    let t = await p.locator('body').innerText()
    out.push(`[${label}] Empleo: título, vacantes recientes y aviso de demostración: ` + (/calce contigo/.test(t) && /Vacantes recientes/.test(t) && (t.match(/Aviso de demostración/gi) || []).length === 6 && /etapa piloto/.test(t)))
    out.push(`[${label}] Empleo: asesorías como servicio opcional y enlace a ATS: ` + (/Servicio opcional/i.test(t) && /¿Buscas contratar\?/.test(t)))
    await shot(p, OUT + `portada-empleo-${label}.png`)
    if (!mobile) {
      const menuTxt = await p.getByRole('navigation', { name: 'Menú principal' }).innerText()
      out.push(`[${label}] Empleo: menú Vacantes, Asesores, Ingresar: ` + (/Vacantes/.test(menuTxt) && /Asesores/.test(menuTxt) && /Ingresar/.test(menuTxt)))
    } else {
      await p.getByRole('button', { name: 'Abrir menú' }).click(); await p.waitForTimeout(200)
      const m = await p.getByRole('navigation', { name: 'Menú' }).innerText()
      out.push(`[${label}] Empleo: menú móvil con Vacantes, Asesores, Ingresar y ATS: ` + (/Vacantes/.test(m) && /Asesores/.test(m) && /Ingresar/.test(m) && /VINKA ATS/.test(m)))
      await p.getByRole('button', { name: 'Abrir menú' }).click()
      const w = await p.evaluate(() => document.documentElement.scrollWidth); await p.setViewportSize({ width: 320, height: 700 }); await p.waitForTimeout(200)
      const w320 = await p.evaluate(() => document.documentElement.scrollWidth); await p.setViewportSize({ width: 390, height: 844 })
      out.push(`[${label}] Empleo: sin desborde a 390 y 320 px: ` + (w <= 390 && w320 <= 320))
    }
    await p.getByRole('button', { name: 'Buscar trabajo' }).last().click(); await p.waitForTimeout(700)
    const vTop = await p.evaluate(() => document.getElementById('vacantes').getBoundingClientRect().top)
    out.push(`[${label}] «Buscar trabajo» lleva a las vacantes: ` + (vTop < 120 && vTop > -40))
    await p.getByRole('link', { name: /Ejecutivo\/a de ventas/ }).click(); await p.waitForTimeout(600)
    out.push(`[${label}] una vacante abre su página pública para postular: ` + p.url().endsWith('/empleo/' + JOBS[0].id))
    await p.goto(BASE + '/portada/empleo#asesores', { waitUntil: 'networkidle' }); await p.waitForTimeout(500); await clean(p)
    await p.getByRole('link', { name: 'Ingreso de asesores' }).click(); await p.waitForTimeout(500)
    out.push(`[${label}] «Ingreso de asesores» lleva al ingreso: ` + p.url().endsWith('/ingresar'))
    await p.goto(BASE + '/portada/empleo', { waitUntil: 'networkidle' }); await p.waitForTimeout(500); await clean(p)
    await p.getByRole('button', { name: 'Crear mi perfil gratis' }).click(); await p.waitForTimeout(500)
    out.push(`[${label}] «Crear mi perfil gratis» lleva al registro de personas: ` + p.url().endsWith('/registro/candidato'))
    await p.goto(BASE + '/portada/empleo', { waitUntil: 'networkidle' }); await p.waitForTimeout(500); await clean(p)
    await p.getByRole('link', { name: /Conoce VINKA ATS/ }).click(); await p.waitForTimeout(600)
    out.push(`[${label}] enlace «Conoce VINKA ATS» lleva a la portada ATS: ` + p.url().endsWith('/portada/ats'))

    // ── VINKA ATS
    await p.waitForTimeout(400); await clean(p)
    t = await p.locator('body').innerText()
    out.push(`[${label}] ATS: «Software de reclutamiento y selección», 4 funciones clave y capturas de demostración: ` + (/Software de reclutamiento y selección para empresas/.test(t)
      && /Publicación de vacantes/.test(t) && /Seguimiento de candidatos/.test(t) && /Agenda de entrevistas/.test(t) && /Trabajo en equipo/.test(t) && /datos de demostración/.test(t)
      && await p.locator('img[src*="/media/tut/e_proceso"]').count() >= 1))
    { const want = mobile ? 'ats-movil' : 'ats-escritorio', other = mobile ? 'ats-escritorio' : 'ats-movil'
      const vis = await p.locator(`video[src*="${want}"]`).isVisible(), hid = !(await p.locator(`video[src*="${other}"]`).isVisible())
      const ok = await p.evaluate(async (u) => (await fetch(u, { method: 'HEAD' })).ok, `/media/${want}.mp4`)
      out.push(`[${label}] ATS: video ${mobile ? 'vertical (celular)' : 'horizontal (computador)'} visible, el otro oculto, y 10 pasos: ` + (vis && hid && ok && /Mira cómo funciona VINKA ATS/.test(t) && /Test DISC propio/.test(t) && /Compara a tus finalistas/.test(t))) }
    await p.getByRole('link', { name: /Ver cómo funciona/ }).click(); await p.waitForTimeout(700)
    const vy = await p.evaluate(() => document.getElementById('video').getBoundingClientRect().top)
    out.push(`[${label}] ATS: «Ver cómo funciona» lleva al video: ` + (vy < 120 && vy > -40))
    await p.evaluate(() => window.scrollTo(0, 0))
    out.push(`[${label}] ATS: planes desde la base (sin el plan de asesores): ` + (/Pyme/.test(t) && /30 días gratis/i.test(t) && !/Plan Asesor/i.test(t)))
    await shot(p, OUT + `portada-ats-${label}.png`)
    if (!mobile) {
      const menuTxt = await p.getByRole('navigation', { name: 'Menú principal' }).innerText()
      out.push(`[${label}] ATS: menú Funciones, Planes, Asesores, Ingresar y VINKA Empleo: ` + (/Funciones/.test(menuTxt) && /Planes/.test(menuTxt) && /Asesores/.test(menuTxt) && /Ingresar/.test(menuTxt) && /VINKA Empleo/.test(menuTxt)))
    } else {
      const w = await p.evaluate(() => document.documentElement.scrollWidth); await p.setViewportSize({ width: 320, height: 700 }); await p.waitForTimeout(200)
      const w320 = await p.evaluate(() => document.documentElement.scrollWidth); await p.setViewportSize({ width: 390, height: 844 })
      out.push(`[${label}] ATS: sin desborde a 390 y 320 px: ` + (w <= 390 && w320 <= 320))
    }
    await p.getByRole('link', { name: 'Ingreso de asesores' }).click(); await p.waitForTimeout(500)
    out.push(`[${label}] ATS: «Ingreso de asesores» lleva al ingreso: ` + p.url().endsWith('/ingresar'))
    await p.goto(BASE + '/portada/ats', { waitUntil: 'networkidle' }); await p.waitForTimeout(500); await clean(p)
    await p.getByRole('button', { name: 'Solicitar demo' }).first().click(); await p.waitForTimeout(600)
    t = await p.locator('body').innerText()
    const inputs = await p.locator('form input:not([type=checkbox]), form select, form textarea').count()
    out.push(`[${label}] «Solicitar demo» abre un formulario corto (nombre, empresa, correo y consentimiento): ` + (p.url().includes('/cotizar?demo=1') && /Solicitar demo/.test(t) && inputs === 3 && !/Motivo/.test(t)))
    await p.getByLabel('Tu nombre').fill('Rosa Prueba'); await p.getByLabel('Empresa').fill('Ferretería Prueba'); await p.getByLabel('Correo').fill('rosa@example.com')
    await p.getByRole('checkbox').check(); await p.getByRole('button', { name: 'Enviar solicitud' }).click(); await p.waitForTimeout(600)
    out.push(`[${label}] «Solicitar demo» envía con motivo «demo» y confirma: ` + (calls.includes('submit_quote') && quoteReasons.includes('demo') && /coordinar la demo/.test(await p.locator('body').innerText())))
    await p.goto(BASE + '/portada/ats', { waitUntil: 'networkidle' }); await p.waitForTimeout(500); await clean(p)
    await p.getByRole('button', { name: 'Probar gratis 30 días' }).click(); await p.waitForTimeout(500)
    out.push(`[${label}] «Probar gratis» lleva al registro de empresas: ` + p.url().endsWith('/registro/empresa'))
    await p.goto(BASE + '/portada/ats', { waitUntil: 'networkidle' }); await p.waitForTimeout(500); await clean(p)
    await p.getByRole('link', { name: /VINKA Empleo/ }).last().click(); await p.waitForTimeout(500)
    out.push(`[${label}] enlace a VINKA Empleo: ` + p.url().endsWith('/portada/empleo'))
    // Captura de la app según el ancho: en computador la horizontal, en celular la vertical, y se descarga solo esa
    for (const [land, name] of [['ats', 'ATS'], ['empleo', 'Empleo']]) {
      const got = []; const onReq = (r) => { if (r.url().includes('/media/portada/')) got.push(r.url()) }; p.on('request', onReq)
      await p.goto(BASE + '/portada/' + land, { waitUntil: 'networkidle' }); await p.waitForTimeout(400); await clean(p)
      const img = p.locator('picture img').first(); await img.scrollIntoViewIfNeeded(); await p.waitForTimeout(800)
      const cur = await img.evaluate((e) => ({ src: e.currentSrc, ok: e.complete && e.naturalWidth > 0, w: e.getBoundingClientRect().width }))
      const want = mobile ? `${land}-movil` : `${land}-escritorio`, other = mobile ? `${land}-escritorio` : `${land}-movil`
      p.off('request', onReq)
      out.push(`[${label}] ${name}: muestra la captura ${mobile ? 'vertical' : 'horizontal'} (${Math.round(cur.w)} px de ancho), cargada, sin descargar la otra, con nota de demostración: `
        + (cur.src.includes(want) && cur.ok && got.some((u) => u.includes(want)) && !got.some((u) => u.includes(other)) && (mobile ? cur.w <= 270 : cur.w >= 800)
          && /con datos de demostración/.test(await p.locator('picture').first().locator('xpath=ancestor::figure').innerText())))
    }
    // La portada actual sigue igual
    await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(500)
    out.push(`[${label}] la portada actual (/) no cambia: ` + /Tu próximo/.test(await p.locator('body').innerText()))
    await ctx.close()
  }
  out.push('errores JS: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'none'))
  console.log(out.join('\n')); await b.close()
})()
