// Direcciones propias: vinka-ats.vercel.app muestra la portada ATS, vinka-empleo.vercel.app la de Empleo y la dirección principal la de siempre.
// Se simula cada dirección desviando sus pedidos a la compilación local (sin tocar Vercel ni Supabase).
const { BASE } = require('./_config.cjs')
const { chromium } = require('playwright')
;(async () => {
  const b = await chromium.launch(); const out = []; const errs = []
  for (const [host, want, other] of [['vinka-ats.vercel.app', /Software de reclutamiento y selección/, /calce contigo/], ['vinka-empleo.vercel.app', /calce contigo/, /Software de reclutamiento/], ['vinka-alpha.vercel.app', /Tu próximo/, /Software de reclutamiento|calce contigo/]]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
    await ctx.addInitScript(() => { localStorage.setItem('vinka-splash', '1'); sessionStorage.setItem('vinka-splash-seen', '1') })
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
    await ctx.route(/supabase\.co/, (r) => { const p = new URL(r.request().url()).pathname; return r.fulfill({ status: p.startsWith('/auth/v1/user') ? 401 : 200, contentType: 'application/json', body: p.startsWith('/auth') ? '{}' : '[]' }) })
    await ctx.route(`https://${host}/**`, async (r) => { const u = new URL(r.request().url()); const res = await r.fetch({ url: BASE + u.pathname + u.search }); return r.fulfill({ response: res }) })
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`${host}: ${e.message}`))
    await p.goto(`https://${host}/`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800)
    const t = await p.locator('body').innerText()
    out.push(`${host}/ muestra su portada: ` + (want.test(t) && !other.test(t)))
    if (host !== 'vinka-alpha.vercel.app') {
      await p.goto(`https://${host}/ingresar`, { waitUntil: 'networkidle' }); await p.waitForTimeout(500)
      out.push(`${host}/ingresar sigue llevando al ingreso: ` + /Ingresar|Contraseña/i.test(await p.locator('body').innerText()))
    }
    await ctx.close()
  }
  out.push('errores JS: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'none'))
  console.log(out.join('\n')); await b.close()
})()
