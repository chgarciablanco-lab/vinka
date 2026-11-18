const { OUT, BASE } = require('./_config.cjs')
const { chromium, devices } = require('playwright')
const UID = '11111111-1111-1111-1111-111111111111', P1 = 'aaaaaaaa-0000-0000-0000-00000000000a', P2 = 'aaaaaaaa-0000-0000-0000-00000000000b'
const iso = (d) => new Date(Date.now() + d * 86400000).toISOString()
const svcs = [{ id: 'cv', name: 'Revisión de CV', price_clp: 14990, includes: ['CV mejorado'], summary: 'x', delivery: '3 días', active: true, sort: 1 }, { id: 'completa', name: 'Asesoría completa', price_clp: 49990, includes: ['Todo'], summary: 'y', delivery: '2 semanas', active: true, sort: 2 }]
const dir = [{ id: P1, display_name: 'Paula Reyes', headline: 'Reclutadora de retail', bio: 'Ocho años reclutando para retail y ventas en la Región del Maule.', years: 8, specialties: ['Retail', 'Ventas'], services: ['cv', 'completa'], service_names: ['Revisión de CV', 'Asesoría completa'], photo: null, available: true, ratings: 0 },
  { id: P2, display_name: 'Felipe Rojas', headline: 'Logística', bio: 'Especialista en logística y operaciones con foco en bodegas.', years: 5, specialties: ['Logística'], services: ['cv'], service_names: ['Revisión de CV'], photo: null, available: false, ratings: 0 }]
const scen = {
  postulante: { tables: { profiles: { id: UID, role: 'candidate', first_name: 'Camila', last_name: 'R' }, candidate_profiles: { user_id: UID, onboarding_done: true }, career_services: svcs,
    service_requests: [{ id: 'r1', service_id: 'completa', service_name: 'Asesoría completa', price_clp: 49990, status: 'pago_pendiente', created_at: iso(-1), choice: 'asesor', preferred_advisor: P2, assigned_to: null }] }, path: '/asesoria' },
  asesor: { tables: { profiles: { id: UID, role: 'advisor', first_name: 'Paula', last_name: 'Reyes' }, advisors: { user_id: UID, active: true, terms_accepted_at: iso(-9) } }, path: '/cuenta' },
  admin: { tables: { profiles: { id: UID, role: 'candidate', first_name: 'Admin', last_name: 'T' }, admins: { user_id: UID }, candidate_profiles: { user_id: UID, onboarding_done: true } }, path: '/asesores', desktop: true },
  adminReq: { tables: { profiles: { id: UID, role: 'candidate', first_name: 'Admin', last_name: 'T' }, admins: { user_id: UID }, candidate_profiles: { user_id: UID, onboarding_done: true } }, path: '/asesorias', desktop: true },
}
;(async () => {
  const browser = await chromium.launch(); const out = []
  for (const [name, sc] of Object.entries(scen)) {
    const ctx = await browser.newContext(sc.desktop ? { viewport: { width: 1280, height: 900 } } : { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
    await ctx.addInitScript((uid) => { localStorage.setItem('sb-jifhlhbntcfnvmcpbexo-auth-token', JSON.stringify({ access_token: 'x.eyJzdWIiOiIxIn0.x', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid, email: 't@example.com', aud: 'authenticated' } })); localStorage.setItem('vinka-splash', '1') }, UID)
    const calls = []
    await ctx.route(/supabase\.co/, async (route) => {
      const r = route.request(); const u = new URL(r.url()); const path = u.pathname
      const single = (r.headers()['accept'] || '').includes('vnd.pgrst.object')
      const send = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })
      if (path.startsWith('/auth/v1/user')) return send({ id: UID, email: 't@example.com', aud: 'authenticated' })
      if (path.startsWith('/auth/')) return send({})
      const rpc = path.startsWith('/rest/v1/rpc/') && path.split('/').pop()
      if (rpc) calls.push(rpc + ' ' + (r.postData() || ''))
      if (rpc === 'advisor_directory') return send(dir)
      if (rpc === 'my_advisor_profile') return send({ pub: null, draft: null, review_status: 'sin_cambios', review_note: '', hidden: false, accepting: true, max_active: 8, load: 5, available: false, services: svcs.map((s) => ({ id: s.id, name: s.name })) })
      if (rpc === 'admin_advisors') return send([{ id: P1, name: 'Paula Reyes', email: 'p@example.com', active: true, open: 5, delivered: 0, open_demo: 0, delivered_demo: 0 }])
      if (rpc === 'admin_advisor_profiles') return send({ [P1]: { pub: null, draft: dir[0], review_status: 'en_revision', review_note: '', hidden: false, accepting: true, max_active: 8, load: 5, available: false } })
      if (rpc === 'admin_service_requests') return send([{ id: 'q1', service_id: 'cv', service: 'Revisión de CV', price: 14990, status: 'pago_pendiente', created_at: iso(-1), name: 'Camila R', candidate_id: 'c1', advisor_id: null, choice: 'asesor', preferred_id: P1, preferred: 'Paula Reyes', preferred_available: true, suggested_id: P1, next: null, messages: 0 }])
      if (rpc === 'admin_assign_check') return send({ reason: null, consent: true })
      if (rpc === 'my_admin_level') return send('total')
      if (rpc) return send(rpc.startsWith('my_') ? [] : null)
      if (r.method() !== 'GET') { calls.push(r.method() + ' ' + path.split('/').pop()); return send([]) }
      const t = path.split('/').pop(); const data = sc.tables[t]
      if (single) return data ? send(Array.isArray(data) ? data[0] : data) : route.fulfill({ status: 406, contentType: 'application/json', body: '{"code":"PGRST116","message":"no rows"}' })
      return send(data ? (Array.isArray(data) ? data : [data]) : [])
    })
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message))
    await page.goto(BASE + sc.path, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200)
    await page.evaluate(() => document.getElementById('splash')?.remove())
    const txt = async () => page.locator('body').innerText()
    const has = (c) => calls.some((x) => x.startsWith(c))
    try {
      if (name === 'postulante') {
        const t = await txt()
        out.push('postulante · elegido sin cupo: ' + /Felipe Rojas no tiene cupo ahora/.test(t))
        await page.screenshot({ path: OUT + 'elegir-tarjeta.png', fullPage: true })
        await page.getByRole('button', { name: 'Que VINKA elija' }).first().click(); await page.waitForTimeout(300)
        out.push('postulante · que VINKA elija: ' + has('request_change_advisor {"p_request":"r1","p_advisor":null}'))
        await page.getByRole('button', { name: 'Solicitar' }).first().click(); await page.waitForTimeout(400)
        out.push('postulante · paso quién te atiende: ' + /¿Quién te atiende\?/.test(await txt()))
        await page.getByText('Quiero elegir a mi asesor/a').click(); await page.waitForTimeout(200)
        out.push('postulante · Felipe sin cupo deshabilitado: ' + await page.locator('[role=dialog] button:has-text("Elegir")').nth(1).isDisabled())
        await page.locator('[role=dialog]').getByRole('button', { name: 'Ver perfil' }).first().click(); await page.waitForTimeout(300)
        out.push('postulante · perfil: ' + /Ocho años reclutando/.test(await txt()) + ' · sin valoraciones: ' + /Sin valoraciones todavía/.test(await txt()))
        await page.screenshot({ path: OUT + 'elegir-perfil.png' })
        await page.getByRole('button', { name: 'Elegir a Paula' }).click(); await page.waitForTimeout(300)
        await page.locator('[role=dialog] input[type=checkbox]').last().check()
        await page.screenshot({ path: OUT + 'elegir-solicitud.png', fullPage: true })
        await page.getByRole('button', { name: 'Confirmar solicitud' }).click(); await page.waitForTimeout(500)
        out.push('postulante · solicitud con asesora: ' + has(`request_career_service {"p_service":"cv","p_goal":"","p_contact":"chat","p_consent":true,"p_advisor":"${P1}"}`))
      }
      if (name === 'asesor') {
        const t = await txt()
        out.push('asesor · bloque perfil: ' + /Mi perfil público/.test(t) + ' · cupo: ' + /5 de 8 asesorías en curso/.test(t))
        await page.getByRole('switch').click(); await page.waitForTimeout(300)
        out.push('asesor · pausar: ' + has('advisor_set_accepting {"p_on":false}'))
        await page.getByRole('button', { name: 'Crear mi perfil' }).click(); await page.waitForTimeout(300)
        const d = page.locator('[role=dialog]')
        await d.locator('input.input').first().fill('Paula Reyes'); await d.locator('textarea').fill('Reclutadora con ocho años de experiencia en retail y ventas.')
        await d.getByText('Revisión de CV').click()
        await page.getByRole('button', { name: 'Enviar a revisión' }).click(); await page.waitForTimeout(400)
        out.push('asesor · enviar a revisión: ' + has('advisor_profile_save {"p":{"display_name":"Paula Reyes"'))
        await page.screenshot({ path: OUT + 'elegir-asesor.png', fullPage: true })
      }
      if (name === 'admin') {
        const t = await txt()
        out.push('admin · estado perfil: ' + /Cambios por revisar/.test(t))
        await page.getByRole('button', { name: 'Revisar cambios' }).click(); await page.waitForTimeout(300)
        await page.getByRole('button', { name: '✓ Aprobar y publicar' }).click(); await page.waitForTimeout(300)
        out.push('admin · aprobar: ' + has(`admin_advisor_profile_review {"p_user":"${P1}","p_approve":true`))
      }
      if (name === 'adminReq') {
        const t = await txt()
        out.push('admin solicitudes · elección: ' + /Eligió a Paula Reyes/.test(t))
        await page.getByRole('button', { name: 'Asignar a Paula' }).click(); await page.waitForTimeout(300)
        out.push('admin solicitudes · asignar con un toque: ' + has(`admin_assign_request {"p_id":"q1","p_advisor":"${P1}"}`))
      }
    } catch (e) { out.push(name + ' FALLÓ: ' + e.message.split('\n')[0]); await page.screenshot({ path: OUT + `elegir-err-${name}.png`, fullPage: true }) }
    if (errs.length) out.push(name + ' errores: ' + errs.join(' | '))
    await ctx.close()
  }
  console.log(out.join('\n')); await browser.close()
})()
