// La cuenta de administración entra igual por vinka-ats y vinka-empleo (no solo por vinka-alpha):
// sin sesión ve la portada y «Ingresar»; con sesión, la raíz abre el panel de administración y no la portada.
const { BASE } = require('./_config.cjs')
const { chromium } = require('playwright')
const UID = '11111111-1111-1111-1111-111111111111'
;(async () => {
  const b = await chromium.launch(); const out = []; const errs = []
  for (const host of ['vinka-ats.vercel.app', 'vinka-empleo.vercel.app']) {
    for (const logged of [false, true]) {
      const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
      await ctx.addInitScript(([uid, logged]) => { try { localStorage.setItem('vinka-splash', '1'); sessionStorage.setItem('vinka-splash-seen', '1')
        if (logged) localStorage.setItem('sb-jifhlhbntcfnvmcpbexo-auth-token', JSON.stringify({ access_token: 'x.eyJzdWIiOiIxIn0.x', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid, email: 'admin@example.com', aud: 'authenticated', role: 'authenticated' } })) } catch { /* sin almacenamiento */ } }, [UID, logged])
      await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
      await ctx.route(/supabase\.co/, async (r) => {
        const u = new URL(r.request().url()), path = u.pathname, single = (r.request().headers()['accept'] || '').includes('vnd.pgrst.object')
        const send = (x, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(x) })
        if (path.startsWith('/auth/v1/user')) return logged ? send({ id: UID, email: 'admin@example.com', aud: 'authenticated' }) : send({}, 401)
        if (path.startsWith('/auth/') || path.startsWith('/storage') || path.startsWith('/realtime')) return send({})
        if (path.startsWith('/rest/v1/rpc/')) return send(path.endsWith('my_onboarding') ? { hidden: true, tour: true, steps: [] } : null)
        const t = path.split('/').pop()
        const rows = { profiles: [{ id: UID, role: 'candidate', first_name: 'Admin', last_name: 'VINKA' }], admins: [{ user_id: UID }], candidate_profiles: [{ user_id: UID, onboarding_done: true }] }[t] || []
        if (single) return rows.length ? send(rows[0]) : r.fulfill({ status: 406, contentType: 'application/json', body: '{"code":"PGRST116"}' })
        return send(rows) })
      await ctx.route(`https://${host}/**`, async (r) => { const u = new URL(r.request().url()); return r.fulfill({ response: await r.fetch({ url: BASE + u.pathname + u.search }) }) })
      const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`${host}: ${e.message}`))
      await p.goto(`https://${host}/`, { waitUntil: 'networkidle' }); await p.waitForTimeout(900); await p.evaluate(() => document.getElementById('splash')?.remove())
      const t = await p.locator('body').innerText()
      if (!logged) {
        await p.goto(`https://${host}/ingresar`, { waitUntil: 'networkidle' }); await p.waitForTimeout(500)
        out.push(`${host}: sin sesión muestra su portada y el ingreso funciona: ` + (/(Software de reclutamiento|calce contigo)/.test(t) && /Contraseña/i.test(await p.locator('body').innerText())))
      } else out.push(`${host}: con la cuenta de administración abre el panel (Negocio, Empresas, Usuarios), no la portada: ` + (/Negocio/.test(t) && /Empresas/.test(t) && /Usuarios/.test(t) && !/Software de reclutamiento|calce contigo/.test(t)))
      await ctx.close()
    }
  }
  out.push('errores JS: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'none'))
  console.log(out.join('\n')); await b.close()
})()
