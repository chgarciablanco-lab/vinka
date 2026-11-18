// C04 (error en inicio del asesor), C05 (contadores iguales), C07 (búsqueda ampliada)
const { OUT, BASE } = require('./_config.cjs')
const { chromium, devices } = require('playwright')
const D = require('./datos_simulados.cjs')
const UID = D.UID; const iso = D.iso
const cases = ['solicitada', 'pago_pendiente', 'en_curso', 'en_curso', 'entregada', 'aprobada'].map((st, k) => ({ id: 'c' + k, name: 'P' + k, service: 'Revisión de CV', service_id: 'cv', status: st, created_at: iso(-k), messages: 0, next: st === 'en_curso' ? { label: 'Entregar CV', due: iso(1), late: false } : null }))
const sess = (uid) => { localStorage.setItem('sb-jifhlhbntcfnvmcpbexo-auth-token', JSON.stringify({ access_token: 'x.eyJzdWIiOiIxIn0.x', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid, email: 't@example.com', aud: 'authenticated' } })); localStorage.setItem('vinka-splash', '1'); localStorage.setItem('vinka-install-dismissed', String(Date.now() + 9e9)) }
const run = async (b, tables, rpcs, path, fn, dev = devices['iPhone 13']) => {
  const ctx = await b.newContext(dev); await ctx.addInitScript(sess, UID); const state = { fail: !!rpcs.__fail }
  await ctx.route(/supabase\.co/, async (route) => {
    const r = route.request(); const p = new URL(r.url()).pathname; const single = (r.headers()['accept'] || '').includes('vnd.pgrst.object')
    const send = (x) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) })
    if (p.startsWith('/auth/v1/user')) return send({ id: UID, email: 't@example.com', aud: 'authenticated' })
    if (p.startsWith('/auth/')) return send({})
    const rpc = p.startsWith('/rest/v1/rpc/') && p.split('/').pop()
    if (rpc === 'advisor_requests' && state.fail) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"fallo"}' })
    if (rpc === 'job_feed') { const wide = JSON.parse(r.postData()).p_broad; return send(wide ? D.V.c_explorar.rpc.job_feed.concat(D.V.c_explorar.rpc.job_feed.map((j, k) => ({ ...j, id: 'x' + k, title: 'Cajero/a' }))) : []) }
    if (rpc) return send(rpcs[rpc] !== undefined ? rpcs[rpc] : rpc.startsWith('my_') || rpc.endsWith('s') ? [] : null)
    const t = p.split('/').pop(); const d = tables[t]
    if (single) return d ? send(Array.isArray(d) ? d[0] : d) : route.fulfill({ status: 406, contentType: 'application/json', body: '{"code":"PGRST116"}' })
    return send(d ? (Array.isArray(d) ? d : [d]) : [])
  })
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(BASE + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(900); await page.evaluate(() => document.getElementById('splash')?.remove())
  const out = await fn(page, state); await ctx.close(); return out + (errs.length ? ' · ERRORES: ' + errs.join('|') : '')
}
;(async () => {
  const b = await chromium.launch(); const out = []
  const adv = { profiles: { id: UID, role: 'advisor', first_name: 'Paula', last_name: 'R' }, advisors: { user_id: UID, active: true, terms_accepted_at: iso(-9) } }
  out.push(await run(b, adv, { advisor_requests: cases }, '/', async (p) => {
    const inicio = (await p.getByRole('link', { name: /Ver todas/ }).innerText()).match(/\d+/)[0]
    await p.goto(BASE + '/asesorias', { waitUntil: 'networkidle' }); await p.waitForTimeout(700)
    const bandeja = (await p.getByRole('button', { name: /Activas/ }).first().innerText()).match(/\d+/)[0]
    return `C05 contadores: Inicio ${inicio} · bandeja «Activas» ${bandeja} → iguales: ${inicio === bandeja}`
  }))
  out.push(await run(b, adv, { __fail: true, advisor_requests: cases }, '/', async (p, st) => {
    const t = await p.locator('body').innerText(); const aviso = /No pudimos cargar tus asesorías/.test(t); const vacio = /No tienes asesorías activas/.test(t)
    await p.screenshot({ path: OUT + 'c04.png' })
    st.fail = false; await p.getByRole('button', { name: 'Reintentar' }).click(); await p.waitForTimeout(1200)
    const t2 = await p.locator('body').innerText()
    return `C04 falla de carga: aviso=${aviso} · NO dice «sin asesorías»=${!vacio} · tras reintentar carga y quita aviso=${/Entregar CV/.test(t2) && !/No pudimos cargar/.test(t2)}`
  }))
  const cand = D.candP
  out.push(await run(b, cand, {}, '/', async (p) => {
    await p.getByRole('button', { name: 'Ver otras vacantes' }).click(); await p.waitForTimeout(700)
    const t = await p.locator('body').innerText(); const card = /búsqueda ampliada/.test(t) && /Volver a las mías/.test(t)
    await p.getByRole('button', { name: /Lista/ }).click(); await p.waitForTimeout(400)
    const t2 = await p.locator('body').innerText(); const list = /vacantes en búsqueda ampliada/.test(t2) && !/para ti/.test(t2) && /Volver a las mías/.test(t2)
    await p.screenshot({ path: OUT + 'c07.png' })
    await p.getByRole('button', { name: 'Volver a las mías' }).click(); await p.waitForTimeout(600)
    return `C07 ampliada: aviso en tarjetas=${card} · en lista=${list} · volver funciona=${!/búsqueda ampliada/.test(await p.locator('body').innerText())}`
  }))
  out.push(await run(b, cand, {}, '/', async (p) => {
    await p.getByRole('button', { name: 'Ver otras vacantes' }).click(); await p.waitForTimeout(600); await p.getByRole('button', { name: /Lista/ }).click(); await p.waitForTimeout(400)
    const w = await p.evaluate(() => Math.round(document.querySelector('[role=group]').getBoundingClientRect().width))
    return `C08 lista en escritorio: ancho ${w}px (antes ~410)`
  }, { viewport: { width: 1366, height: 900 } }))
  console.log(out.join('\n')); await b.close()
})()
