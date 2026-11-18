const { OUT, BASE } = require('./_config.cjs')
const { chromium, devices } = require('playwright')
const UID = '11111111-1111-1111-1111-111111111111', P1 = 'aaaaaaaa-0000-0000-0000-00000000000a', P2 = 'aaaaaaaa-0000-0000-0000-00000000000b'
const iso = (d) => new Date(Date.now() + d * 86400000).toISOString()
const svcs = [{ id: 'cv', name: 'Revisión de CV', price_clp: 14990, includes: ['CV mejorado'], summary: 'x', delivery: '3 días', active: true, sort: 1 }, { id: 'completa', name: 'Asesoría completa', price_clp: 49990, includes: ['Todo'], summary: 'y', delivery: '2 semanas', active: true, sort: 2 }]
const dir = [{ id: P1, display_name: 'Paula Reyes', headline: 'Reclutadora de retail', bio: 'Ocho años reclutando para retail y ventas en la Región del Maule.', years: 8, specialties: ['Retail', 'Ventas'], services: ['cv', 'completa'], service_names: ['Revisión de CV', 'Asesoría completa'], photo: null, available: true, ratings: 0 },
  { id: P2, display_name: 'Felipe Rojas', headline: 'Logística', bio: 'Especialista en logística y operaciones con foco en bodegas.', years: 5, specialties: ['Logística'], services: ['cv'], service_names: ['Revisión de CV'], photo: null, available: false, ratings: 0 }]
const P3 = 'aaaaaaaa-0000-0000-0000-00000000000c'
const cand = (reqs) => ({ profiles: { id: UID, role: 'candidate', first_name: 'Camila', last_name: 'R' }, candidate_profiles: { user_id: UID, onboarding_done: true }, career_services: svcs, service_requests: reqs })
const adm = { profiles: { id: UID, role: 'candidate', first_name: 'Admin', last_name: 'T' }, admins: { user_id: UID }, candidate_profiles: { user_id: UID, onboarding_done: true } }
const scen = {
  sinElegir: { tables: cand([]), path: '/asesoria' },
  dirFalla: { tables: cand([]), path: '/asesoria', dirFail: true },
  enviarFalla: { tables: cand([]), path: '/asesoria', sendFail: true },
  propuesta: { tables: cand([{ id: 'r1', service_id: 'completa', service_name: 'Asesoría completa', price_clp: 49990, status: 'en_curso', created_at: iso(-3), choice: 'asesor', preferred_advisor: P2, assigned_to: P2, proposed_advisor: P1, proposal_note: 'Felipe dejó de atender; Paula conoce tu rubro.' }]), path: '/asesoria' },
  adminReq: { tables: adm, path: '/asesorias', desktop: true },
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
      if (rpc === 'advisor_directory') { if (sc.dirFail && !sc._retried) { sc._retried = 1; return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"fallo"}' }) } return send(dir) }
      if (rpc === 'request_career_service' && sc.sendFail) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'Paula Reyes no está disponible ahora (cupo lleno, 8 de 8). Elige a otra persona o deja que VINKA elija.' }) })
      if (rpc === 'admin_assign_check') { const b = JSON.parse(r.postData()); return send(b.p_advisor === P3 ? { reason: 'sin perfil aprobado', consent: false } : { reason: null, consent: false }) }
      if (rpc === 'my_advisor_profile') return send({ pub: null, draft: null, review_status: 'sin_cambios', review_note: '', hidden: false, accepting: true, max_active: 8, load: 5, available: false, services: svcs.map((s) => ({ id: s.id, name: s.name })) })
      if (rpc === 'admin_advisors') return send([{ id: P1, name: 'Paula Reyes', email: 'p@example.com', active: true, open: 5, delivered: 0, open_demo: 0, delivered_demo: 0 }, { id: P2, name: 'Felipe Rojas', email: 'f@example.com', active: true, open: 2, delivered: 0, open_demo: 0, delivered_demo: 0 }, { id: P3, name: 'Javiera Soto', email: 'j@example.com', active: true, open: 0, delivered: 0, open_demo: 0, delivered_demo: 0 }])
      if (rpc === 'admin_advisor_profiles') return send({ [P1]: { pub: null, draft: dir[0], review_status: 'en_revision', review_note: '', hidden: false, accepting: true, max_active: 8, load: 5, available: false } })
      if (rpc === 'admin_service_requests') return send([
        { id: 'q1', service_id: 'cv', service: 'Revisión de CV', price: 14990, status: 'pago_pendiente', created_at: iso(-1), name: 'Camila R', candidate_id: 'c1', advisor_id: null, choice: 'asesor', preferred_id: P1, preferred: 'Paula Reyes', preferred_available: false, preferred_issue: 'cupo lleno (8 de 8)', suggested_id: P2, next: null, messages: 0 },
        { id: 'q2', service_id: 'cv', service: 'Revisión de CV', price: 14990, status: 'en_curso', created_at: iso(-4), name: 'Diego M', candidate_id: 'c2', advisor_id: P2, advisor: 'Felipe Rojas', advisor_inactive: true, choice: 'vinka', suggested_id: P1, proposed_id: P1, proposed: 'Paula Reyes', next: null, messages: 0 }])
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
      const dlg = page.locator('[role=dialog]')
      const openReq = async () => { await page.getByRole('button', { name: 'Solicitar' }).first().click(); await page.waitForTimeout(400) }
      if (name === 'sinElegir') {
        await openReq(); await page.getByText('Quiero elegir a mi asesor/a').click(); await page.waitForTimeout(200)
        await dlg.locator('input[type=checkbox]').last().check()
        await page.getByRole('button', { name: 'Confirmar solicitud' }).click(); await page.waitForTimeout(400)
        out.push('1 · «Quiero elegir» sin elegir → aviso: ' + /Elige a una persona o vuelve a «VINKA elige por mí»/.test(await dlg.innerText()) + ' · no envía: ' + !has('request_career_service'))
        await page.screenshot({ path: OUT + 'p1-sin-elegir.png' })
        await page.getByText('VINKA elige por mí').first().click(); await page.waitForTimeout(200)
        await page.getByRole('button', { name: 'Confirmar solicitud' }).click(); await page.waitForTimeout(400)
        out.push('1 · luego VINKA elige → envía sin asesor: ' + has('request_career_service {"p_service":"cv","p_goal":"","p_contact":"chat","p_consent":true,"p_advisor":null}'))
      }
      if (name === 'dirFalla') {
        await openReq()
        out.push('2 · directorio caído → aviso: ' + /No pudimos cargar a los asesores/.test(await dlg.innerText()))
        await page.screenshot({ path: OUT + 'p1-dir-falla.png' })
        await page.getByRole('button', { name: 'Reintentar' }).click(); await page.waitForTimeout(500)
        out.push('2 · reintentar → aparecen asesores: ' + /Quiero elegir a mi asesor\/a/.test(await dlg.innerText()))
      }
      if (name === 'enviarFalla') {
        await openReq(); await page.getByText('Quiero elegir a mi asesor/a').click(); await page.waitForTimeout(200)
        await dlg.getByRole('button', { name: 'Elegir' }).first().click(); await page.waitForTimeout(200)
        await dlg.locator('input[type=checkbox]').last().check()
        await page.getByRole('button', { name: 'Confirmar solicitud' }).click(); await page.waitForTimeout(500)
        const t = await dlg.innerText()
        out.push('3 · elegido se quedó sin cupo → mensaje: ' + /no está disponible ahora/.test(t) + ' · botones: ' + (/Elegir a otra persona/.test(t) && /Que VINKA elija/.test(t)))
        await page.screenshot({ path: OUT + 'p1-sin-cupo.png' })
        await dlg.getByRole('button', { name: 'Que VINKA elija' }).click(); await page.waitForTimeout(200)
        out.push('3 · «Que VINKA elija» limpia el error: ' + !/no está disponible ahora/.test(await dlg.innerText()))
      }
      if (name === 'propuesta') {
        const t = await txt()
        out.push('4 · propuesta visible: ' + /VINKA te propone a Paula Reyes/.test(t) + ' · motivo: ' + /Paula conoce tu rubro/.test(t) + ' · «nada cambia»: ' + /Nada cambia hasta que respondas/.test(t))
        await page.screenshot({ path: OUT + 'p1-propuesta.png', fullPage: true })
        await page.getByRole('button', { name: 'Aceptar' }).click(); await page.waitForTimeout(400)
        out.push('4 · aceptar → ' + has('request_answer_proposal {"p_id":"r1","p_accept":true}'))
      }
      if (name === 'adminReq') {
        const t = await txt()
        out.push('5 · elegido no disponible marcado: ' + /ahora no disponible: cupo lleno/.test(t) + ' · sin botón «Asignar a Paula»: ' + !(await page.locator('#caso-q1').getByRole('button', { name: 'Asignar a Paula' }).count()))
        out.push('5 · aviso asesor inactivo: ' + /Asesor\/a inactivo\/a:/.test(t) + ' · propuesta pendiente: ' + /Propuesta enviada: Paula Reyes/.test(t))
        await page.screenshot({ path: OUT + 'p1-admin.png', fullPage: true })
        const sel = page.locator('select').filter({ has: page.locator('option', { hasText: 'Sin asignar' }) })
        await sel.nth(1).selectOption(P2); await page.waitForTimeout(400)
        out.push('6 · asignar sin acuerdo → hoja: ' + has('admin_assign_check') + ' · no asigna directo: ' + !has('admin_assign_request'))
        await page.screenshot({ path: OUT + 'p1-admin-hoja.png' })
        out.push('6 · botón deshabilitado con texto corto: ' + await dlg.getByRole('button', { name: 'Enviar propuesta' }).isDisabled())
        await dlg.locator('textarea').fill('Felipe tiene experiencia en tu área.')
        await dlg.getByRole('button', { name: 'Enviar propuesta' }).click(); await page.waitForTimeout(400)
        out.push('6 · propuesta enviada: ' + has(`admin_propose_advisor {"p_id":"q1","p_advisor":"${P2}","p_note":"Felipe tiene experiencia en tu área."}`))
        await sel.nth(1).selectOption(P3); await page.waitForTimeout(400)
        out.push('7 · sin perfil → «Proponer» deshabilitado: ' + await dlg.getByRole('button', { name: 'Proponer al postulante' }).isDisabled() + ' · motivo: ' + /sin perfil aprobado/.test(await dlg.innerText()))
        await dlg.locator('textarea').fill('Caso urgente y Javiera ya conoce a la persona.')
        await dlg.getByRole('button', { name: 'Asignar como excepción' }).last().click(); await page.waitForTimeout(400)
        out.push('7 · excepción con motivo: ' + has(`admin_assign_request {"p_id":"q1","p_advisor":"${P3}","p_exception":"Caso urgente y Javiera ya conoce a la persona."}`))
        await page.locator('select').filter({ has: page.locator('option', { hasText: 'Sin asignar' }) }).nth(1).selectOption(''); await page.waitForTimeout(300)
        out.push('8 · desasignar no pasa por la hoja: ' + has('admin_assign_request {"p_id":"q1","p_advisor":null}'))
      }
    } catch (e) { out.push(name + ' FALLÓ: ' + e.message.split('\n')[0]); await page.screenshot({ path: OUT + `p1-err-${name}.png`, fullPage: true }) }
    if (errs.length) out.push(name + ' errores: ' + errs.join(' | '))
    await ctx.close()
  }
  console.log(out.join('\n')); await browser.close()
})()
