// Colaboración de asesores (datos simulados): espacio propio, Oportunidades, captaciones, autorizaciones, propuestas, ficha de atribución y embudo
const { OUT, BASE } = require('./_config.cjs')
const { chromium, devices } = require('playwright')
const UID = '11111111-1111-1111-1111-111111111111', CO = '22222222-2222-2222-2222-222222222222', JOB = '33333333-3333-3333-3333-333333333333', CAND = '44444444-4444-4444-4444-444444444444'
const funnel = { days: 90, companies_publishing: 3, jobs_published: 4, relevant_candidates: 18, interviews_done: 6, hires: 2, hires_external: 0, hires_with_advisor_proposal: 1, avg_days_to_hire: 21.5, hires_credited: 1 }
async function ctxFor(b, tables, rpc, calls) {
  const ctx = await b.newContext(devices['iPhone 13'])
  await ctx.addInitScript(([uid, co]) => { localStorage.setItem('sb-jifhlhbntcfnvmcpbexo-auth-token', JSON.stringify({ access_token: 'x.eyJzdWIiOiIxIn0.x', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid, email: 't@example.com', aud: 'authenticated' } })); localStorage.setItem('vinka-splash', '1'); if (co) localStorage.setItem('vinka-company', co) }, [UID, tables.__company || null])
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
  await ctx.route(/supabase\.co/, async (route) => {
    const r = route.request(); const path = new URL(r.url()).pathname; const single = (r.headers()['accept'] || '').includes('vnd.pgrst.object')
    const send = (x) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) })
    if (path.startsWith('/auth/v1/user')) return send({ id: UID, email: 't@example.com', aud: 'authenticated' })
    if (path.startsWith('/auth/') || path.startsWith('/storage/')) return send({})
    const name = path.startsWith('/rest/v1/rpc/') && path.split('/').pop()
    if (name) { calls.push(name + ' ' + (r.postData() || '')); const v = rpc[name]; return send(typeof v === 'function' ? v(r.postData()) : v !== undefined ? v : name.startsWith('my_') || name.endsWith('s') ? [] : null) }
    const t = path.split('/').pop(); const d = tables[t]
    if (single) return d ? send(Array.isArray(d) ? d[0] : d) : route.fulfill({ status: 406, contentType: 'application/json', body: '{"code":"PGRST116"}' })
    return send(d ? (Array.isArray(d) ? d : [d]) : [])
  })
  return ctx
}
;(async () => {
  const b = await chromium.launch(); const out = []; const errs = []
  // 1) Asesor sin espacio: botón para crearlo + sus resultados
  { const calls = []
    const ctx = await ctxFor(b, { profiles: { id: UID, role: 'advisor', first_name: 'Paula', last_name: 'R' }, advisors: { user_id: UID, active: true, terms_accepted_at: new Date().toISOString() } },
      { funnel_metrics: funnel, my_contributions: { hires_confirmed: 1, hires_pending: 1, companies_captured: 2, captures_open: 1, authorizations: 2, proposals_accepted: 3, items: [{ match_id: 'm', job: 'Vendedor/a', candidate: 'Carla P.', role: 'propuso_candidato', label: 'Aportó al candidato', status: 'confirmada', created_at: new Date().toISOString() }] } }, calls)
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(900)
    const t = await p.locator('body').innerText()
    out.push('asesor ve «Crear mi espacio»: ' + /Crear mi espacio de reclutamiento/.test(t))
    out.push('asesor ve sus resultados (embudo y acreditadas): ' + (/Candidatos pertinentes/.test(t) && /Contrataciones acreditadas/.test(t)))
    await p.evaluate(() => document.getElementById('splash')?.remove())
    await p.screenshot({ path: OUT + 'fase1-asesor.png', fullPage: true })
    await p.getByRole('button', { name: 'Crear mi espacio de reclutamiento' }).click(); await p.waitForTimeout(400)
    out.push('crear espacio llama a la base: ' + calls.some((c) => c.startsWith('advisor_create_workspace')))
    await ctx.close() }
  // 2) Postulante: aviso de propuesta en Explorar y página de propuestas
  { const calls = []
    const prop = { id: 'p1', status: 'enviada', note: 'Tienes experiencia en ventas', created_at: new Date().toISOString(), advisor: 'Bruno A.', job_id: JOB, job: 'Vendedor/a de ferretería', company: 'Ferretería Sur', comuna: 'Talca', modality: 'presencial', open: true }
    const ctx = await ctxFor(b, { profiles: { id: UID, role: 'candidate', first_name: 'Carla', last_name: 'P' }, candidate_profiles: { user_id: UID, onboarding_done: true, is_public: true, headline: 'Vendedora' } },
      { my_proposals: { received: [prop], sent: [] }, job_feed: [], my_authorizations: { role: 'candidate', items: [{ id: 'au1', advisor: 'Bruno A.', status: 'solicitada', requested_at: new Date().toISOString() }, { id: 'au2', advisor: 'Paula R.', status: 'vigente', expires_at: new Date(Date.now() + 300 * 864e5).toISOString() }] } }, calls)
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(800)
    const te = await p.locator('body').innerText()
    out.push('Explorar avisa la propuesta: ' + /te propone para «Vendedor\/a de ferretería»/.test(te))
    out.push('Explorar avisa el pedido de autorización: ' + /Bruno A\. pide autorización para presentarte/.test(te))
    await p.goto(BASE + '/propuestas', { waitUntil: 'networkidle' }); await p.waitForTimeout(600)
    const t = await p.locator('body').innerText()
    out.push('página de propuestas explica el consentimiento: ' + /solo ve tu perfil si eliges postular/.test(t))
    await p.screenshot({ path: OUT + 'fase1-propuestas.png', fullPage: true })
    await p.getByRole('button', { name: 'Me interesa, postular' }).click(); await p.waitForTimeout(400)
    out.push('aceptar llama a la base: ' + calls.some((c) => c.startsWith('proposal_answer') && c.includes('"p_accept":true')))
    out.push('página muestra autorizaciones (pedida y vigente): ' + (/Autorizar/.test(t) && /Retirar autorización/.test(t)))
    await p.getByRole('button', { name: 'Autorizar' }).click(); await p.waitForTimeout(400)
    out.push('autorizar llama a la base: ' + calls.some((c) => c.startsWith('rep_auth_answer') && c.includes('"p_accept":true')))
    await p.getByRole('button', { name: 'Retirar autorización' }).first().click(); await p.waitForTimeout(300)
    await p.locator('[role=dialog] button.btn').click(); await p.waitForTimeout(400)
    out.push('retirar llama a la base: ' + calls.some((c) => c.startsWith('rep_auth_revoke')))
    await ctx.close() }
  // 3) Ficha de atribución en un postulante contratado (empresa)
  { const calls = []
    const nova = { id: CO, display_name: 'Ferretería Sur', kind: 'empresa', parent_id: null, verification_status: 'verified', slug: 'fs', clients: 0, managed_by: null }
    const r = (confirm, dispute) => ({ confirm, dispute })
    const attribution = { match_id: 'm1', stage: 'contratado', items: [
      { id: 'h1', role: 'capto_empresa', label: 'Captó la empresa', advisor: 'Ana A.', evidence: { rut: '760864285', registered_at: '2026-11-01T10:00:00Z', activated_at: '2026-11-05T10:00:00Z' }, source: 'sistema', status: 'por_confirmar', auto_confirm_at: new Date(Date.now() + 6 * 864e5).toISOString(), rights: r(true, true) },
      { id: 'h2', role: 'propuso_candidato', label: 'Aportó al candidato', advisor: 'Bruno A.', evidence: { proposed_at: '2026-11-08T10:00:00Z', accepted_at: '2026-11-09T10:00:00Z' }, source: 'sistema', status: 'confirmada', rights: r(false, false) },
      { id: 'h3', role: 'colaboro', label: 'Colaboró', advisor: 'Elías C.', evidence: { approved_suggestions: 2, done_tasks: 1 }, source: 'manual', status: 'por_confirmar', rights: r(true, true) }] }
    const detail = {"ai": {}, "job": {"id": "6cb39af4-46f2-4a16-8abe-6feb2941cb55", "area": "logistica", "level": "junior", "title": "Bodeguero/a 1", "questions": [], "company_id": "04cf5e84-58a9-457c-a533-3b5300a4e72f"}, "kind": "match", "tags": [], "team": [{"id": "0b47b61a-c60c-4390-b9fa-1d64d2cff7bc", "name": "Emp76 Vol"}], "match": {"id": "m1", "stage": "contratado", "closed": false, "created_at": "2026-11-18T00:47:04.656414-03:00", "contact_shared": false}, "my_id": "0b47b61a-c60c-4390-b9fa-1d64d2cff7bc", "notes": [], "offer": null, "events": [{"at": "2026-11-18T00:47:04.656414-03:00", "kind": "match", "actor": null, "detail": {}}, {"at": "2026-11-18T00:47:03.775076-03:00", "kind": "applied", "actor": null, "detail": {}}], "answers": [], "candidate": {"id": "08343631-b352-465c-b581-f1d324253c69", "bio": "Perfil ficticio de volumen", "name": "Post894 Vol", "email": null, "phone": null, "comuna": "Linares", "region": "Maule", "skills": ["excel", "atención al cliente", "ventas"], "headline": "Bodeguero", "education": [], "has_video": false, "schedules": ["completa"], "modalities": ["presencial"], "experiences": [], "availability": "", "has_experience": true}, "applied_at": "2026-11-18T00:47:03.775076-03:00", "can_manage": true, "interviews": [], "evaluations": [], "knocked_out": false} // forma real tomada de la copia aislada
    const ctx = await ctxFor(b, { __company: CO, profiles: { id: UID, role: 'company', first_name: 'Rosa', last_name: 'E' } },
      { my_companies: [{ company_id: CO, role: 'owner', inherited: false, companies: nova }], subject_detail: detail, hire_attribution: attribution, company_plan: { plan: { id: 'pyme' }, status: 'active', usage: {} } }, calls)
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(BASE + `/vacantes/${JOB}/candidato/${CAND}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1000)
    const t = await p.locator('body').innerText()
    const shown = /Quién ayudó en esta contratación/.test(t)
    out.push('ficha de atribución visible en un contratado: ' + (shown ? true : 'no verificable con estos datos simulados'))
    if (shown) {
      await p.screenshot({ path: OUT + 'fase1-ficha.png', fullPage: true })
      out.push('ficha avisa la confirmación automática: ' + /Se confirma solo el/.test(t))
      await p.getByRole('button', { name: '✓ Confirmar' }).first().click(); await p.waitForTimeout(400)
      out.push('confirmar un aporte llama a la base: ' + calls.some((c) => c.startsWith('contribution_confirm') && c.includes('"p_id":"h1"')))
    }
    await ctx.close() }
  // 4) Asesor: Oportunidades, Captaciones y Autorizaciones
  { const calls = []
    const opps = [{ id: JOB, title: 'Vendedor/a de ferretería', company: 'Ferretería Sur', comuna: 'Talca', modality: 'presencial', opened_at: new Date().toISOString(), collaborating: false, request: null, proposable: 2 },
      { id: 'j2', title: 'Cajero/a', company: 'Confidencial', comuna: 'Linares', modality: 'presencial', opened_at: new Date().toISOString(), collaborating: false, request: 'pendiente', proposable: 0 }]
    const caps = [{ id: 'k1', status: 'contactada', via: 'empresa_propia', rut: '77222222K', name: 'Maderas del Sur SpA', contact_email: 'rrhh@maderasdelsur.cl', token: 'tok', registered_at: new Date().toISOString(), reserved_until: new Date(Date.now() + 20 * 864e5).toISOString(), activate_by: new Date(Date.now() + 50 * 864e5).toISOString() },
      { id: 'k2', status: 'activada', via: 'cliente_gestionado', rut: '760864285', name: 'Ferretería Sur', registered_at: new Date().toISOString(), activated_at: new Date().toISOString(), reserved_until: new Date().toISOString(), activate_by: new Date().toISOString() }]
    const ctx = await ctxFor(b, { profiles: { id: UID, role: 'advisor', first_name: 'Paula', last_name: 'R' }, advisors: { user_id: UID, active: true, terms_accepted_at: new Date().toISOString() } },
      { network_opportunities: opps, my_captures: caps, my_authorizations: { role: 'advisor', items: [{ id: 'a1', name: 'Carla P.', status: 'vigente', expires_at: new Date(Date.now() + 300 * 864e5).toISOString() }], requestable: [{ candidate_id: CAND, name: 'Dario O.' }] },
        my_proposable_candidates: [{ candidate_id: CAND, name: 'Carla P.', headline: 'Vendedora', comuna: 'Talca', state: 'disponible' }] }, calls)
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(BASE + '/oportunidades', { waitUntil: 'networkidle' }); await p.waitForTimeout(700)
    let t = await p.locator('body').innerText()
    out.push('Oportunidades lista vacantes abiertas con 3 acciones: ' + (/Vendedor\/a de ferretería/.test(t) && /Proponer candidato \(2\)/.test(t) && /Pedir colaborar/.test(t) && /Ocultar/.test(t)))
    await p.evaluate(() => document.getElementById('splash')?.remove())
    await p.screenshot({ path: OUT + 'red-oportunidades.png', fullPage: true })
    await p.getByRole('button', { name: 'Pedir colaborar' }).click(); await p.waitForTimeout(300)
    await p.getByRole('button', { name: 'Enviar solicitud' }).click(); await p.waitForTimeout(400)
    out.push('pedir colaborar llama a la base: ' + calls.some((c) => c.startsWith('collab_request_create')))
    await p.getByRole('button', { name: 'Proponer candidato (2)' }).click(); await p.waitForTimeout(500)
    await p.getByText('Carla P.').click(); await p.getByRole('button', { name: 'Enviar propuesta' }).click(); await p.waitForTimeout(400)
    out.push('proponer desde Oportunidades llama a la base: ' + calls.some((c) => c.startsWith('proposal_create')))
    await p.goto(BASE + '/captaciones', { waitUntil: 'networkidle' }); await p.waitForTimeout(700)
    t = await p.locator('body').innerText()
    out.push('Captaciones muestra estado y plazo: ' + (/Contactada/.test(t) && /Quedan 20 días para que acepte/.test(t) && /Activada/.test(t)))
    await p.screenshot({ path: OUT + 'red-captaciones.png', fullPage: true })
    await p.getByRole('button', { name: 'Registrar', exact: true }).click(); await p.waitForTimeout(300)
    await p.getByPlaceholder('RUT (76.123.456-7)').fill('77.222.222-K'); await p.getByPlaceholder('Razón social').fill('Maderas del Sur SpA'); await p.getByPlaceholder('Correo de tu contacto en la empresa').fill('rrhh@maderasdelsur.cl')
    await p.getByRole('button', { name: 'Registrar y copiar enlace' }).click(); await p.waitForTimeout(400)
    out.push('registrar captación llama a la base: ' + calls.some((c) => c.startsWith('capture_register_prospect')))
    await p.goto(BASE + '/autorizaciones', { waitUntil: 'networkidle' }); await p.waitForTimeout(700)
    t = await p.locator('body').innerText()
    out.push('Autorizaciones muestra vigentes y a quién pedir: ' + (/Vigente hasta el/.test(t) && /Dario O\./.test(t)))
    await p.screenshot({ path: OUT + 'red-autorizaciones.png', fullPage: true })
    await p.getByRole('button', { name: 'Pedir autorización' }).click(); await p.waitForTimeout(400)
    out.push('pedir autorización llama a la base: ' + calls.some((c) => c.startsWith('rep_auth_request')))
    await p.goto(BASE + '/beneficios', { waitUntil: 'networkidle' }); await p.waitForTimeout(600)
    t = await p.locator('body').innerText()
    out.push('Tus beneficios explica sin prometer montos: ' + (/Aún no hay pagos/.test(t) && /Nadie confirma su propio aporte/.test(t)))
    await p.screenshot({ path: OUT + 'red-beneficios.png', fullPage: true })
    await ctx.close() }
  // 5) Registro de empresa con el enlace del asesor (sin sesión): precarga RUT, razón social y correo
  { const ctx = await b.newContext(devices['iPhone 13']); const calls = []
    await ctx.addInitScript(() => { localStorage.setItem('vinka-splash', '1'); sessionStorage.setItem('vinka-splash-seen', '1') })
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
    await ctx.route(/supabase\.co/, (route) => { const path = new URL(route.request().url()).pathname; calls.push(path)
      const body = path.endsWith('/rpc/get_capture_invite') ? { legal_name: 'Maderas del Sur SpA', rut: '77222222K', email: 'rrhh@maderasdelsur.cl', advisor: 'Ana A.' } : path.startsWith('/auth/') ? {} : []
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }) })
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(BASE + '/registro/empresa?captacion=11111111-2222-3333-4444-555555555555', { waitUntil: 'networkidle' }); await p.waitForTimeout(700)
    const t = await p.locator('body').innerText()
    const rut = await p.getByPlaceholder('76.123.456-7').inputValue(), legal = await p.getByPlaceholder('Comercial Ejemplo SpA').inputValue()
    out.push('registro con enlace: aviso y datos precargados: ' + (/Ana A\., asesor\/a de VINKA, te invitó/.test(t) && rut === '77.222.222-K' && legal === 'Maderas del Sur SpA'))
    out.push('registro pide sitio web (opcional): ' + /Sitio web \(opcional\)/.test(t))
    await p.screenshot({ path: OUT + 'red-registro-enlace.png', fullPage: true })
    await ctx.close() }
  out.push('errores JS: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'none'))
  console.log(out.join('\n')); await b.close()
})()
