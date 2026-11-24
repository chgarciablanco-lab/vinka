// Direcciones propias: vinka-ats.vercel.app muestra la portada ATS, vinka-empleo.vercel.app la de Empleo y la dirección principal la de siempre;
// cada una con su ícono y nombre al agregarla a la pantalla de inicio.
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
    { const k = host === 'vinka-ats.vercel.app' ? 'ats' : host === 'vinka-empleo.vercel.app' ? 'empleo' : null
      const br = await p.evaluate(() => ({ apple: document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href'), man: document.querySelector('link[rel="manifest"]').getAttribute('href'), name: document.querySelector('meta[name="apple-mobile-web-app-title"]').content }))
      const files = await p.evaluate(async (u) => { for (const x of u) { const r = await fetch(x); if (!r.ok) return false } return true }, [br.apple, br.man])
      const mf = await p.evaluate(async (u) => (await fetch(u)).json(), br.man)
      const want = k ? { apple: `/icons/${k}-180.png`, man: `/manifest-${k}.webmanifest`, name: k === 'ats' ? 'VINKA ATS' : 'VINKA Empleo' } : { apple: '/icon-192.png', man: '/manifest.webmanifest', name: 'VINKA' }
      out.push(`${host}: ícono y nombre propios al agregar a la pantalla de inicio (${want.name}): ` + (br.apple === want.apple && br.man === want.man && br.name === want.name && mf.name === want.name && files)) }
    if (host !== 'vinka-alpha.vercel.app') {
      await p.goto(`https://${host}/ingresar`, { waitUntil: 'networkidle' }); await p.waitForTimeout(500)
      out.push(`${host}/ingresar sigue llevando al ingreso: ` + /Ingresar|Contraseña/i.test(await p.locator('body').innerText()))
    }
    await ctx.close()
  }
  out.push('errores JS: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'none'))
  console.log(out.join('\n')); await b.close()
})()
