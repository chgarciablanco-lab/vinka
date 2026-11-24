// Primeros pasos guiados (datos simulados): tarjeta con avance, lista que lleva a cada pantalla, recorrido por el menú,
// ocultar y volver a mostrar, pasos de empresa (verificación en revisión) y de asesor (oportunidades se marca al visitar)
const { OUT, BASE } = require('./_config.cjs')
const { chromium, devices } = require('playwright')
const UID = '11111111-1111-1111-1111-111111111111', CO = '22222222-2222-2222-2222-222222222222'
async function ctxFor(b, tables, rpc, calls) {
  const ctx = await b.newContext(devices['iPhone 13'])
  await ctx.addInitScript(([uid, co]) => { localStorage.setItem('sb-jifhlhbntcfnvmcpbexo-auth-token', JSON.stringify({ access_token: 'x.eyJzdWIiOiIxIn0.x', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid, email: 't@example.com', aud: 'authenticated' } })); localStorage.setItem('vinka-splash', '1'); if (co) localStorage.setItem('vinka-company', co) }, [UID, tables.__company || null])
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
  await ctx.route(/supabase\.co/, async (route) => {
    const r = route.request(); const path = new URL(r.url()).pathname; const single = (r.headers()['accept'] || '').includes('vnd.pgrst.object')
    const send = (x) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) })
    if (path.startsWith('/auth/v1/user')) return send({ id: UID, email: 't@example.com', aud: 'authenticated' })
    if (path.startsWith('/auth/') || path.startsWith('/storage/')) return send({})
    const name = path.startsWith('/rest/v1/rpc/') && path.split('/').pop()
    if (name) { calls.push(name + ' ' + (r.postData() || '')); const v = rpc[name]; return send(typeof v === 'function' ? v(r.postData()) : v !== undefined ? v : name.startsWith('my_') || name.endsWith('s') ? [] : null) }
    const t = path.split('/').pop(); const d = tables[t]
    if (single) return d ? send(Array.isArray(d) ? d[0] : d) : route.fulfill({ status: 406, contentType: 'application/json', body: '{"code":"PGRST116"}' })
    return send(d ? (Array.isArray(d) ? d : [d]) : [])
  })
  return ctx
}
const company = { id: CO, display_name: 'Ferretería Sur', kind: 'empresa', parent_id: null, verification_status: 'pending', slug: 'fs', clients: 0, managed_by: null }
const ob = (role, steps, extra = {}) => ({ role, steps, done: steps.filter((s) => s.done).length, total: steps.length, hidden: false, tour: true, new: true, ...extra })
;(async () => {
  const b = await chromium.launch(); const out = []; const errs = []

  // 1) Postulante: recorrido la primera vez, tarjeta con avance y lista que lleva a cada pantalla
  { const calls = []
    let state = ob('candidate', [{ key: 'cv', done: true }, { key: 'experiencia', done: true }, { key: 'preferencias', done: false }, { key: 'presentacion', done: false }, { key: 'interes', done: false }, { key: 'avisos', done: false }], { tour: false })
    const ctx = await ctxFor(b, { profiles: { id: UID, role: 'candidate', first_name: 'Carla', last_name: 'P' }, candidate_profiles: { user_id: UID, onboarding_done: true, is_public: true, headline: 'Vendedora' } },
      { my_onboarding: () => state, onboarding_mark: (b) => { if (b.includes('recorrido')) state = { ...state, tour: true }; if (b.includes('ocultar')) state = { ...state, hidden: true }; if (b.includes('mostrar')) state = { ...state, hidden: false }; return null }, job_feed: [] }, calls)
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(900)
    const dlg = p.getByRole('dialog', { name: 'Recorrido por VINKA' })
    out.push('recorrido aparece la primera vez: ' + (await dlg.count() === 1 && /Bienvenida\/o a VINKA/.test(await dlg.innerText())))
    await p.screenshot({ path: OUT + 'pasos-bienvenida.png' })
    // La bienvenida no bloquea: la pantalla sigue usable (el botón «Actualizar» responde con la tarjeta abierta)
    const before = calls.filter((c) => c.startsWith('job_feed')).length
    await p.evaluate(() => document.getElementById('splash')?.remove()); await p.getByRole('button', { name: 'Actualizar' }).click({ timeout: 2000 }).catch(() => {}); await p.waitForTimeout(400)
    out.push('bienvenida no bloquea: la pantalla responde con la tarjeta abierta: ' + (calls.filter((c) => c.startsWith('job_feed')).length > before && await dlg.count() === 1))
    await dlg.getByRole('button', { name: 'Ver recorrido' }).click(); await p.waitForTimeout(300)
    const t1 = await dlg.innerText()
    await p.screenshot({ path: OUT + 'pasos-recorrido.png' })
    const inView = await dlg.locator('div.absolute.flex').evaluate((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight })
    out.push('recorrido señala el menú (Explorar) y la burbuja cabe en pantalla: ' + (/1 de 4/.test(t1) && /Explorar/.test(t1) && inView))
    for (let k = 0; k < 3; k++) { await dlg.getByRole('button', { name: 'Siguiente' }).click(); await p.waitForTimeout(150) }
    out.push('último paso del recorrido es Perfil: ' + /Perfil/.test(await dlg.innerText()))
    await dlg.getByRole('button', { name: 'Terminar' }).click(); await p.waitForTimeout(500)
    out.push('terminar guarda el recorrido como visto: ' + (calls.some((c) => c.startsWith('onboarding_mark') && c.includes('"recorrido"')) && await dlg.count() === 0))
    const card = p.getByLabel('Primeros pasos')
    const tc = await card.innerText()
    out.push('tarjeta con avance y siguiente paso: ' + (/2\/6/.test(tc) && /Siguiente: Indica tu renta/.test(tc)))
    await card.getByRole('button', { name: 'Ver' }).click(); await p.waitForTimeout(400)
    const sheet = await p.locator('body').innerText()
    out.push('lista: pasos hechos y pendientes con explicación: ' + (/Sube tu CV/.test(sheet) && /Listo\./.test(sheet) && /Muestra interés en una vacante/.test(sheet)))
    await p.screenshot({ path: OUT + 'pasos-lista.png' })
    await p.getByRole('link', { name: /Indica tu renta/ }).click(); await p.waitForTimeout(600)
    out.push('tocar un paso lleva a su pantalla: ' + p.url().endsWith('/perfil/preferencias'))
    await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(700)
    const w = await p.evaluate(() => document.documentElement.scrollWidth); await p.setViewportSize({ width: 320, height: 700 }); await p.waitForTimeout(200)
    const w320 = await p.evaluate(() => document.documentElement.scrollWidth); await p.setViewportSize({ width: 390, height: 844 })
    out.push('sin desborde a 320 px: ' + (w <= 390 && w320 <= 320))
    await p.getByLabel('Primeros pasos').getByRole('button', { name: 'Ver' }).click(); await p.waitForTimeout(300)
    await p.getByRole('button', { name: /Ocultar la guía/ }).click(); await p.waitForTimeout(500)
    out.push('ocultar la guía: ' + (calls.some((c) => c.includes('"ocultar"')) && await p.getByLabel('Primeros pasos').count() === 0))
    await p.goto(BASE + '/ayuda', { waitUntil: 'networkidle' }); await p.waitForTimeout(700)
    await p.getByRole('button', { name: 'Mostrar la guía' }).click(); await p.waitForTimeout(400)
    await p.getByRole('button', { name: 'Ver el recorrido otra vez' }).click(); await p.waitForTimeout(400)
    out.push('en Ayuda se puede mostrar la guía y repetir el recorrido: ' + (calls.some((c) => c.includes('"mostrar"')) && calls.some((c) => c.includes('"repetir_recorrido"'))))
    await ctx.close() }

  // 2) Empresa: verificación en revisión, pasos de la dueña
  { const calls = []
    const state = ob('company', [{ key: 'verificacion', done: false, pending: true, info: true }, { key: 'logo', done: false }, { key: 'vitrina', done: false }, { key: 'vacante', done: false }, { key: 'agenda', done: false }, { key: 'equipo', done: false, optional: true }, { key: 'avisos', done: false }])
    const ctx = await ctxFor(b, { __company: CO, profiles: { id: UID, role: 'company', first_name: 'Olga', last_name: 'D' }, jobs: [] },
      { my_companies: [{ company_id: CO, role: 'owner', inherited: false, companies: company }], company_plan: { plan: { id: 'pyme' }, status: 'active', usage: {} }, my_onboarding: (b) => (b.includes(CO) ? state : null), company_stats: [] }, calls)
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(900)
    const card = p.getByLabel('Primeros pasos')
    out.push('empresa: tarjeta con la empresa activa (0/7): ' + (await card.count() === 1 && /0\/7/.test(await card.innerText()) && calls.some((c) => c.startsWith('my_onboarding') && c.includes(CO))))
    out.push('siguiente paso salta la verificación en revisión: ' + /Siguiente: Sube el logo/.test(await card.innerText()))
    await card.getByRole('button', { name: 'Ver' }).click(); await p.waitForTimeout(400)
    const t = await p.locator('body').innerText()
    out.push('verificación «en revisión» y equipo opcional: ' + (/En revisión por VINKA/.test(t) && /Invita a tu equipo · opcional/.test(t)))
    await p.screenshot({ path: OUT + 'pasos-empresa.png' })
    await ctx.close() }

  // 3) Asesor: tarjeta en Inicio; visitar Oportunidades marca el paso
  { const calls = []
    const state = ob('advisor', [{ key: 'perfil_asesor', done: true }, { key: 'foto', done: false }, { key: 'oportunidades', done: false }, { key: 'comunidad', done: false }, { key: 'avisos', done: false }])
    const ctx = await ctxFor(b, { profiles: { id: UID, role: 'advisor', first_name: 'Paula', last_name: 'R' }, advisors: { user_id: UID, active: true, terms_accepted_at: new Date().toISOString() } },
      { my_onboarding: state, advisor_requests: [], network_opportunities: [] }, calls)
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(900)
    const card = p.getByLabel('Primeros pasos')
    out.push('asesor: tarjeta en Inicio (1/5): ' + (await card.count() === 1 && /1\/5/.test(await card.innerText())))
    await p.goto(BASE + '/oportunidades', { waitUntil: 'networkidle' }); await p.waitForTimeout(600)
    out.push('visitar Oportunidades marca el paso: ' + calls.some((c) => c.startsWith('onboarding_mark') && c.includes('visto:oportunidades')))
    await ctx.close() }

  // 4) Sin datos (función no disponible): no aparece nada ni rompe la pantalla
  { const ctx = await ctxFor(b, { profiles: { id: UID, role: 'candidate', first_name: 'Carla', last_name: 'P' }, candidate_profiles: { user_id: UID, onboarding_done: true } }, { job_feed: [] }, [])
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(700)
    out.push('si la guía no carga, la pantalla sigue normal: ' + (await p.getByLabel('Primeros pasos').count() === 0 && /Explorar/.test(await p.locator('body').innerText())))
    await ctx.close() }

  out.push('errores JS: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'none'))
  console.log(out.join('\n')); await b.close()
})()
