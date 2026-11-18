// Revisión automática de pantallas: accesibilidad (axe-core, reglas WCAG 2.0/2.1/2.2 A y AA),
// desborde horizontal y errores de JavaScript en 4 tamaños. Datos simulados (no es la app publicada).
const { OUT, BASE } = require('./_config.cjs')
const { chromium, devices } = require('playwright')
const fs = require('fs')
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const UID = '11111111-1111-1111-1111-111111111111', CO = '22222222-2222-2222-2222-222222222222'
const iso = (d) => new Date(Date.now() + d * 86400000).toISOString()
const svcs = [{ id: 'cv', name: 'Revisión de CV', price_clp: 14990, includes: ['CV mejorado'], summary: 'Mejoramos tu CV', delivery: '3 días', active: true, sort: 1 }]
const plans = [{ id: 'pyme', name: 'Pyme', price_clp: 29990, max_active_jobs: 5, max_members: 3, ai_monthly: 200, sort: 2, promo_credits: 1, promo_days: 7, public: true }]
const nova = { id: CO, display_name: 'Nova Retail', kind: 'empresa', parent_id: null, verification_status: 'verified', slug: 'nova', clients: 0, managed_by: null, comuna: 'Talca', region: 'Maule' }
const roles = {
  publico: { session: false, tables: {}, rpc: {}, paths: ['/', '/ingresar', '/registro', '/empresas-vinka'] },
  postulante: { tables: { profiles: { id: UID, role: 'candidate', first_name: 'Camila', last_name: 'R' }, candidate_profiles: { user_id: UID, onboarding_done: true, is_public: true, headline: 'Vendedora', comuna: 'Talca', region: 'Maule' }, career_services: svcs,
      service_requests: [{ id: 'r1', service_id: 'cv', service_name: 'Revisión de CV', price_clp: 14990, status: 'pago_pendiente', created_at: iso(-1), choice: 'vinka' }] }, rpc: {}, paths: ['/', '/perfil', '/asesoria', '/chats', '/visibilidad', '/cuenta', '/avisos', '/intereses'] },
  empresa: { pick: CO, tables: { profiles: { id: UID, role: 'company', first_name: 'Nova', last_name: 'T' }, plans }, rpc: { my_companies: [{ company_id: CO, role: 'owner', inherited: false, companies: nova }],
      company_plan: { plan: plans[0], status: 'trial', trial_ends_at: iso(10), usage: { jobs: 1, members: 1, ai: 0, promos: 0 }, plans } }, paths: ['/', '/vacantes/nueva', '/talento', '/agenda', '/chats', '/plan', '/vitrina', '/reportes', '/equipo-consultora'] },
  asesor: { tables: { profiles: { id: UID, role: 'advisor', first_name: 'Paula', last_name: 'R' }, advisors: { user_id: UID, active: true, terms_accepted_at: iso(-9) } }, rpc: {}, paths: ['/', '/asesorias', '/comunidad', '/chats', '/cuenta'] },
  admin: { desktopOnly: false, tables: { profiles: { id: UID, role: 'candidate', first_name: 'Admin', last_name: 'T' }, admins: { user_id: UID }, candidate_profiles: { user_id: UID, onboarding_done: true } }, rpc: { my_admin_level: 'total' }, paths: ['/', '/asesorias', '/asesores', '/postulantes', '/empresas'] },
}
const sizes = [['teléfono pequeño 320', { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }], ['iPhone 390', devices['iPhone 13']], ['tablet 768', { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true }], ['escritorio 1280', { viewport: { width: 1280, height: 800 } }]]
;(async () => {
  const browser = await chromium.launch(); const rows = []; const axeAll = {}
  for (const [rname, sc] of Object.entries(roles)) for (const [sname, dev] of sizes) {
    const ctx = await browser.newContext(dev)
    await ctx.addInitScript(([uid, pick, sess]) => { if (sess) localStorage.setItem('sb-jifhlhbntcfnvmcpbexo-auth-token', JSON.stringify({ access_token: 'x.eyJzdWIiOiIxIn0.x', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid, email: 't@example.com', aud: 'authenticated' } })); if (pick) localStorage.setItem('vinka-company', pick); localStorage.setItem('vinka-splash', '1') }, [UID, sc.pick, sc.session !== false])
    await ctx.route(/supabase\.co/, async (route) => {
      const r = route.request(); const path = new URL(r.url()).pathname
      const single = (r.headers()['accept'] || '').includes('vnd.pgrst.object')
      const send = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })
      if (path.startsWith('/auth/v1/user')) return sc.session === false ? route.fulfill({ status: 401, body: '{}' }) : send({ id: UID, email: 't@example.com', aud: 'authenticated' })
      if (path.startsWith('/auth/')) return send({})
      if (path.startsWith('/storage/')) return route.fulfill({ status: 404, body: '' })
      const rpc = path.startsWith('/rest/v1/rpc/') && path.split('/').pop()
      if (rpc) return send(sc.rpc[rpc] !== undefined ? sc.rpc[rpc] : rpc.startsWith('my_') || rpc.endsWith('s') ? [] : null)
      const t = path.split('/').pop(); const data = sc.tables[t]
      if (single) return data ? send(Array.isArray(data) ? data[0] : data) : route.fulfill({ status: 406, contentType: 'application/json', body: '{"code":"PGRST116","message":"no rows"}' })
      return send(data ? (Array.isArray(data) ? data : [data]) : [])
    })
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
    const page = await ctx.newPage()
    for (const p of sc.paths) {
      const errs = []; const onErr = (e) => errs.push(e.message); page.on('pageerror', onErr)
      const t0 = Date.now()
      await page.goto(BASE + p, { waitUntil: 'networkidle' }).catch(() => {})
      await page.waitForTimeout(700); await page.evaluate(() => document.getElementById('splash')?.remove())
      const ms = Date.now() - t0
      const ov = await page.evaluate(() => {
        const w = document.documentElement.clientWidth; const bad = []
        for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.width && r.right > w + 2 && getComputedStyle(el).position !== 'fixed' && !el.closest('[class*="overflow-x"],[class*="overflow-auto"],[class*="snap-x"]')) bad.push((el.tagName + '.' + (el.className?.baseVal ?? el.className)).slice(0, 70)) }
        return { scroll: document.documentElement.scrollWidth > w + 2, bad: bad.slice(0, 3) }
      })
      const small = await page.evaluate(() => [...document.querySelectorAll('button, a, input, select, [role=button]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24) && getComputedStyle(e).visibility !== 'hidden' }).length)
      let axe = []
      if (sname === 'iPhone 390' || sname === 'escritorio 1280') {
        await page.addScriptTag({ content: AXE })
        const res = await page.evaluate(async () => { const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }); return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, ex: v.nodes[0]?.target?.join(' ') })) })
        axe = res; for (const v of res) { const k = v.id; axeAll[k] = axeAll[k] || { impact: v.impact, help: v.help, where: new Set(), ex: v.ex }; axeAll[k].where.add(rname + ' ' + p) }
      }
      page.off('pageerror', onErr)
      rows.push({ rol: rname, tamaño: sname, ruta: p, ms, desborde: ov.scroll ? 'SÍ ' + ov.bad.join(' | ') : 'no', tactilesChicos: small, axe: axe.map((v) => `${v.id}(${v.impact},${v.n})`).join(' '), errores: errs.join(' | ').slice(0, 120) })
      if (sname !== 'escritorio 1280' || true) await page.screenshot({ path: OUT + `${rname}-${sname.split(' ').pop()}-${p.replace(/\W+/g, '_') || 'root'}.png` }).catch(() => {})
    }
    await ctx.close()
  }
  fs.writeFileSync(OUT + 'pantallas-resultado.json', JSON.stringify({ rows, axe: Object.fromEntries(Object.entries(axeAll).map(([k, v]) => [k, { ...v, where: [...v.where] }])) }, null, 1))
  const ovf = rows.filter((r) => r.desborde !== 'no'); const jsErr = rows.filter((r) => r.errores)
  console.log('pantallas revisadas:', rows.length, '· con desborde horizontal:', ovf.length, '· con errores JS:', jsErr.length)
  for (const r of ovf) console.log('DESBORDE', r.rol, r.tamaño, r.ruta, r.desborde)
  for (const r of jsErr) console.log('ERROR', r.rol, r.tamaño, r.ruta, r.errores)
  console.log('AXE (problemas únicos):'); for (const [k, v] of Object.entries(axeAll)) console.log(' ', k, v.impact, '-', v.help, '→', [...v.where].length, 'pantallas; ej:', v.ex)
  const slow = rows.filter((r) => r.ms > 2500); console.log('cargas > 2,5 s (simuladas):', slow.length)
  await browser.close()
})()
