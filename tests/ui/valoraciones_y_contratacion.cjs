const { OUT, BASE } = require('./_config.cjs')
const { chromium, devices } = require('playwright')
const UID = '11111111-1111-1111-1111-111111111111', P1 = 'aaaaaaaa-0000-0000-0000-00000000000a', P2 = 'aaaaaaaa-0000-0000-0000-00000000000b'
const iso = (d) => new Date(Date.now() + d * 86400000).toISOString()
const svcs = [{ id: 'cv', name: 'Revisión de CV', price_clp: 14990, includes: ['CV mejorado'], summary: 'x', delivery: '3 días', active: true, sort: 1 }, { id: 'completa', name: 'Asesoría completa', price_clp: 49990, includes: ['Todo'], summary: 'y', delivery: '2 semanas', active: true, sort: 2 }]
const dir = [{ id: P1, display_name: 'Paula Reyes', headline: 'Reclutadora de retail', bio: 'Ocho años reclutando para retail y ventas en la Región del Maule.', years: 8, specialties: ['Retail', 'Ventas'], services: ['cv', 'completa'], service_names: ['Revisión de CV', 'Asesoría completa'], photo: null, available: true, ratings: 0 },
  { id: P2, display_name: 'Felipe Rojas', headline: 'Logística', bio: 'Especialista en logística y operaciones con foco en bodegas.', years: 5, specialties: ['Logística'], services: ['cv'], service_names: ['Revisión de CV'], photo: null, available: false, ratings: 0 }]
dir[0] = { ...dir[0], ratings: 3, rating: 4.7, punctuality: 4.3, quality: 5, communication: 4.7, deliverables: 4.7 }
const cand = (reqs) => ({ profiles: { id: UID, role: 'candidate', first_name: 'Camila', last_name: 'R' }, candidate_profiles: { user_id: UID, onboarding_done: true }, career_services: svcs, service_requests: reqs })
const adm = { profiles: { id: UID, role: 'candidate', first_name: 'Admin', last_name: 'T' }, admins: { user_id: UID }, candidate_profiles: { user_id: UID, onboarding_done: true } }
const item = { id: 'v1', overall: 2, punctuality: 3, quality: 2, communication: 2, deliverables: 3, comment: 'No respondió a tiempo', reply: '', status: 'visible', report_reason: '', moderation_note: '', service: 'Revisión de CV', created_at: iso(-2) }
const scen = {
  cand: { tables: cand([{ id: 'r1', service_id: 'cv', service_name: 'Revisión de CV', price_clp: 14990, status: 'aprobada', created_at: iso(-9), assigned_to: P1, assigned_name: 'Paula' },
    { id: 'r2', service_id: 'completa', service_name: 'Asesoría completa', price_clp: 49990, status: 'pago_pendiente', created_at: iso(-1), choice: 'vinka', assigned_to: null }]), path: '/asesoria' },
  candHecha: { tables: cand([{ id: 'r1', service_id: 'cv', service_name: 'Revisión de CV', price_clp: 14990, status: 'aprobada', created_at: iso(-9), assigned_to: P1, assigned_name: 'Paula' }]), path: '/asesoria', mine: { r1: { overall: 4, reply: 'Gracias Camila', status: 'visible' } } },
  asesor: { tables: { profiles: { id: UID, role: 'advisor', first_name: 'Paula', last_name: 'Reyes' }, advisors: { user_id: UID, active: true, terms_accepted_at: iso(-9) } }, path: '/cuenta' },
  admin: { tables: adm, path: '/asesores', desktop: true },
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
      if (rpc === 'my_reviews') return send(sc.mine || {})
      if (rpc === 'advisor_reviews_public') return send([{ id: 'v9', overall: 5, punctuality: 5, quality: 5, communication: 5, deliverables: 5, comment: 'Me ayudó muchísimo con mi CV', reply: 'Gracias a ti', service: 'Revisión de CV', created_at: '2026-10-01T00:00:00Z' }])
      if (rpc === 'my_advisor_reviews') return send({ summary: { ratings: 1, rating: 2, punctuality: 3, quality: 2, communication: 2, deliverables: 3 }, items: [item] })
      if (rpc === 'admin_reviews') return send({ items: [{ ...item, status: 'reportada', report_reason: 'Incluye datos personales', advisor: 'Paula Reyes', advisor_id: P1, candidate: 'Camila R' }, { ...item, id: 'v2', overall: 5, advisor: 'Paula Reyes', candidate: 'Diego M' }], advisors: { [P1]: { ratings: 2, rating: 3.5, punctuality: 3, quality: 3.5, communication: 3.5, deliverables: 4 } } })
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
      const dlg = page.locator('[role=dialog]')
      if (name === 'cand') {
        let t = await txt()
        out.push('1 · pasos y próximo paso: ' + /Próximo paso:.*Paga con tarjeta/.test(t) + ' · pide valorar: ' + /valora a tu asesor\/a/.test(t))
        await page.screenshot({ path: OUT + 'p2-cand.png', fullPage: true })
        await page.getByRole('button', { name: 'Valorar asesoría' }).click(); await page.waitForTimeout(300)
        await dlg.getByRole('button', { name: 'Enviar valoración' }).click(); await page.waitForTimeout(200)
        out.push('2 · sin estrellas → aviso: ' + /Marca de 1 a 5 estrellas/.test(await dlg.innerText()) + ' · no envía: ' + !has('review_submit'))
        const groups = dlg.locator('[role=radiogroup]')
        const pickStars = [5, 4, 5, 5, 4]
        for (let i = 0; i < 5; i++) await groups.nth(i).locator('[role=radio]').nth(pickStars[i] - 1).click()
        await dlg.locator('textarea').fill('Muy clara')
        await page.screenshot({ path: OUT + 'p2-valorar.png' })
        await dlg.getByRole('button', { name: 'Enviar valoración' }).click(); await page.waitForTimeout(400)
        out.push('2 · envía valoración: ' + has('review_submit {"p_request":"r1","p_overall":5,"p_punctuality":4,"p_quality":5,"p_communication":5,"p_deliverables":4,"p_comment":"Muy clara"}'))
        await page.getByRole('button', { name: 'Solicitar' }).first().click(); await page.waitForTimeout(400)
        t = await dlg.innerText()
        out.push('3 · resumen antes de confirmar: ' + /2 · Revisa y confirma/i.test(t) + ' · precio: ' + /\$14\.990/.test(t) + ' · alcance: ' + /CV mejorado/.test(t) + ' · condiciones: ' + /no garantiza un empleo/.test(t))
        await page.screenshot({ path: OUT + 'p3-solicitud.png', fullPage: true })
        await page.getByText('Quiero elegir a mi asesor/a').click(); await page.waitForTimeout(200)
        t = await dlg.innerText(); out.push('1 · tarjeta con nota real: ' + /4,7/.test(t) + ' / ' + /3 valoraciones/.test(t) + ' · nuevo sin nota: ' + /Sin valoraciones todavía/.test(t))
        await dlg.getByRole('button', { name: 'Ver perfil' }).first().click(); await page.waitForTimeout(500)
        t = await txt()
        out.push('4 · perfil con opiniones verificadas: ' + /Valoraciones verificadas/.test(t) + ' · comentario: ' + /Me ayudó muchísimo/.test(t) + ' · anónimo: ' + /Postulante verificado/.test(t) + ' · criterio: ' + /Puntualidad/.test(t))
        await page.screenshot({ path: OUT + 'p2-perfil.png', fullPage: true })
      }
      if (name === 'candHecha') {
        const t = await txt()
        out.push('5 · ya valorada: ' + /Tu valoración/.test(t) + ' · respuesta visible: ' + /Gracias Camila/.test(t) + ' · sin botón: ' + !(await page.getByRole('button', { name: 'Valorar asesoría' }).count()))
      }
      if (name === 'asesor') {
        const t = await txt()
        out.push('6 · asesor ve sus valoraciones: ' + /Mis valoraciones/.test(t) + ' · comentario: ' + /No respondió a tiempo/.test(t))
        await page.getByRole('button', { name: 'Responder' }).click(); await page.waitForTimeout(200)
        await page.locator('textarea').last().fill('Lamento la demora, ya lo ajusté')
        await page.getByRole('button', { name: 'Publicar respuesta' }).click(); await page.waitForTimeout(400)
        out.push('6 · responder: ' + has('review_reply {"p_id":"v1","p_reply":"Lamento la demora, ya lo ajusté"}'))
        await page.getByRole('button', { name: 'Pedir revisión a VINKA' }).click(); await page.waitForTimeout(200)
        await page.locator('textarea').last().fill('Contiene información falsa sobre plazos')
        await page.getByRole('button', { name: 'Pedir revisión' }).last().click(); await page.waitForTimeout(400)
        out.push('6 · pedir revisión: ' + has('review_report {"p_id":"v1","p_reason":"Contiene información falsa sobre plazos"}'))
        await page.screenshot({ path: OUT + 'p2-asesor.png', fullPage: true })
      }
      if (name === 'admin') {
        const t = await txt()
        out.push('7 · admin: por revisar: ' + /1 por revisar/.test(t) + ' · indicadores: ' + /3,5 general/.test(t) + ' · denuncia: ' + /Incluye datos personales/.test(t))
        await page.getByRole('button', { name: 'Ocultar', exact: true }).first().click(); await page.waitForTimeout(200)
        out.push('7 · botón deshabilitado sin motivo: ' + await page.getByRole('button', { name: 'Ocultar valoración' }).isDisabled())
        await page.locator('textarea').first().fill('Contiene datos personales del postulante')
        await page.getByRole('button', { name: 'Ocultar valoración' }).click(); await page.waitForTimeout(400)
        out.push('7 · moderar: ' + has('admin_review_moderate {"p_id":"v1","p_hide":true,"p_note":"Contiene datos personales del postulante"}'))
        await page.screenshot({ path: OUT + 'p2-admin.png', fullPage: true })
      }
    } catch (e) { out.push(name + ' FALLÓ: ' + e.message.split('\n')[0]); await page.screenshot({ path: OUT + `p2-err-${name}.png`, fullPage: true }) }
    if (errs.length) out.push(name + ' errores: ' + errs.join(' | '))
    await ctx.close()
  }
  console.log(out.join('\n')); await browser.close()
})()
