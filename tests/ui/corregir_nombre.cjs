// Cuenta: corregir el propio nombre (datos simulados)
const { OUT, BASE } = require('./_config.cjs')
const { chromium, devices } = require('playwright')
const UID = '11111111-1111-1111-1111-111111111111'
;(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(devices['iPhone 13']); const calls = []
  await ctx.addInitScript((uid) => { localStorage.setItem('sb-jifhlhbntcfnvmcpbexo-auth-token', JSON.stringify({ access_token: 'x.eyJzdWIiOiIxIn0.x', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid, email: 't@example.com', aud: 'authenticated' } })); localStorage.setItem('vinka-splash', '1') }, UID)
  await ctx.route(/supabase\.co/, async (route) => {
    const r = route.request(); const path = new URL(r.url()).pathname; const single = (r.headers()['accept'] || '').includes('vnd.pgrst.object')
    const send = (x) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) })
    if (path.startsWith('/auth/v1/user')) return send({ id: UID, email: 't@example.com', aud: 'authenticated' })
    if (path.startsWith('/auth/')) return send({})
    const rpc = path.startsWith('/rest/v1/rpc/') && path.split('/').pop()
    if (rpc) { calls.push(rpc + ' ' + (r.postData() || '')); return send(rpc.startsWith('my_') ? [] : null) }
    const t = path.split('/').pop(); const tables = { profiles: { id: UID, role: 'candidate', first_name: 'Camila', last_name: 'Rojs' }, candidate_profiles: { user_id: UID, onboarding_done: true } }
    const d = tables[t]; if (single) return d ? send(d) : route.fulfill({ status: 406, contentType: 'application/json', body: '{"code":"PGRST116"}' })
    return send(d ? [d] : [])
  })
  const p = await ctx.newPage(); const out = []
  await p.goto(BASE + '/perfil', { waitUntil: 'networkidle' }); await p.waitForTimeout(800)
  out.push('muestra nombre: ' + /Camila Rojs/.test(await p.locator('body').innerText()))
  await p.screenshot({ path: OUT + 'myname.png', fullPage: true }); console.log((await p.locator('body').innerText()).slice(0, 400)); await p.getByRole('button', { name: 'Corregir' }).click({ timeout: 3000 })
  await p.getByLabel('Apellido').fill('Rojas'); await p.getByRole('button', { name: 'Guardar', exact: true }).click(); await p.waitForTimeout(400)
  out.push('guarda: ' + calls.some((c) => c.startsWith('update_my_name {"p_first":"Camila","p_last":"Rojas"}')))
  console.log(out.join(' · ')); await b.close()
})()
