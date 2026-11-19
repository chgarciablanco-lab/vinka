// «Mi cuenta» para postulantes y empresas: círculo con iniciales arriba a la derecha y espacio personal (datos simulados)
const { OUT, BASE } = require('./_config.cjs')
const { chromium, devices } = require('playwright')
const UID = '11111111-1111-1111-1111-111111111111', CO = '22222222-2222-2222-2222-222222222222'
async function ctxFor(b, tables, rpc) {
  const ctx = await b.newContext(devices['iPhone 13'])
  await ctx.addInitScript(([uid, co]) => { localStorage.setItem('sb-jifhlhbntcfnvmcpbexo-auth-token', JSON.stringify({ access_token: 'x.eyJzdWIiOiIxIn0.x', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid, email: 't@example.com', aud: 'authenticated' } })); localStorage.setItem('vinka-splash', '1'); sessionStorage.setItem('vinka-splash-seen', '1'); if (co) localStorage.setItem('vinka-company', co) }, [UID, tables.__company || null])
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
  await ctx.route(/supabase\.co/, async (route) => {
    const r = route.request(); const path = new URL(r.url()).pathname; const single = (r.headers()['accept'] || '').includes('vnd.pgrst.object')
    const send = (x) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) })
    if (path.startsWith('/auth/v1/user')) return send({ id: UID, email: 't@example.com', aud: 'authenticated' })
    if (path.startsWith('/auth/') || path.startsWith('/storage/')) return send({})
    const name = path.startsWith('/rest/v1/rpc/') && path.split('/').pop()
    if (name) { const v = rpc[name]; return send(v !== undefined ? v : name.startsWith('my_') || name.endsWith('s') ? [] : null) }
    const t = path.split('/').pop(); const d = tables[t]
    if (single) return d ? send(Array.isArray(d) ? d[0] : d) : route.fulfill({ status: 406, contentType: 'application/json', body: '{"code":"PGRST116"}' })
    return send(d ? (Array.isArray(d) ? d : [d]) : [])
  })
  return ctx
}
const personal = ['Tu nombre', 'Tu disponibilidad', 'Descargar mis datos', 'Cerrar sesión']
;(async () => {
  const b = await chromium.launch(); const out = []; const errs = []
  // Postulante
  { const ctx = await ctxFor(b, { profiles: { id: UID, role: 'candidate', first_name: 'Camila', last_name: 'Rojas' }, candidate_profiles: { user_id: UID, onboarding_done: true, is_public: true, headline: 'Vendedora' } }, { job_feed: [] })
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(800)
    const av = p.getByRole('link', { name: 'Mi cuenta' }).first()
    out.push('postulante ve sus iniciales en Explorar: ' + (await av.isVisible()))
    await p.screenshot({ path: OUT + 'cuenta-postulante-explorar.png' })
    await av.click(); await p.waitForTimeout(700)
    const t = await p.locator('body').innerText()
    out.push('postulante abre Mi cuenta: ' + (p.url().endsWith('/cuenta') && /Mi cuenta/.test(t)))
    out.push('Mi cuenta (postulante) tiene lo personal: ' + personal.every((x) => t.includes(x)))
    await p.screenshot({ path: OUT + 'cuenta-postulante.png', fullPage: true })
    await p.goto(BASE + '/perfil', { waitUntil: 'networkidle' }); await p.waitForTimeout(700)
    const tp = await p.locator('body').innerText()
    out.push('Perfil queda con lo laboral y sin lo personal: ' + (/Perfil laboral/.test(tp) && /Privacidad/.test(tp) && !/Cerrar sesión/.test(tp) && !/Descargar mis datos/.test(tp)))
    out.push('Perfil tiene acceso a Mi cuenta: ' + (await p.getByRole('link', { name: /Mi cuenta/ }).count() >= 1))
    await p.screenshot({ path: OUT + 'cuenta-postulante-perfil.png', fullPage: true })
    await ctx.close() }
  // Empresa
  { const co = { id: CO, display_name: 'Ferretería Sur', legal_name: 'Ferretería Sur SpA', rut: '76.086.428-5', kind: 'empresa', parent_id: null, verification_status: 'verified', slug: 'fs', clients: 0, managed_by: null }
    const ctx = await ctxFor(b, { __company: CO, profiles: { id: UID, role: 'company', first_name: 'Rosa', last_name: 'Espinoza' }, companies: co },
      { my_companies: [{ company_id: CO, role: 'owner', inherited: false, companies: co }], company_plan: { plan: { id: 'pyme' }, status: 'active', usage: {} } })
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(BASE + '/vitrina', { waitUntil: 'networkidle' }); await p.waitForTimeout(900)
    const av = p.getByRole('link', { name: 'Mi cuenta' }).first()
    out.push('empresa ve sus iniciales en Empresa: ' + (await av.isVisible()))
    const tv = await p.locator('body').innerText()
    out.push('Empresa queda con vitrina y herramientas, sin lo personal: ' + (/Guardar vitrina/.test(tv) && /Equipo/.test(tv) && !/Cerrar sesión/.test(tv)))
    await p.screenshot({ path: OUT + 'cuenta-empresa-vitrina.png', fullPage: true })
    await av.click(); await p.waitForTimeout(700)
    const t = await p.locator('body').innerText()
    out.push('empresa abre Mi cuenta: ' + (p.url().endsWith('/cuenta') && personal.every((x) => t.includes(x))))
    await p.screenshot({ path: OUT + 'cuenta-empresa.png', fullPage: true })
    await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(700)
    out.push('empresa ve sus iniciales en el Panel: ' + (await p.getByRole('link', { name: 'Mi cuenta' }).first().isVisible()))
    await ctx.close() }
  out.push('errores JS: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'none'))
  console.log(out.join('\n')); await b.close()
})()
