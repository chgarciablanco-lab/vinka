// Correcciones de la auditoría (datos simulados): búsqueda vacía, agenda en procesos terminados, contadores del proceso y cupos de IA.
const { OUT, BASE } = require('./_config.cjs')
const { chromium, devices } = require('playwright')
const UID = '11111111-1111-1111-1111-111111111111', CO = '22222222-2222-2222-2222-222222222222'
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
const M = '33333333-3333-3333-3333-333333333333', JOB = '44444444-4444-4444-4444-444444444444'
const cand = { profiles: { id: UID, role: 'candidate', first_name: 'Carla', last_name: 'P' }, candidate_profiles: { user_id: UID, onboarding_done: true, is_public: true, headline: 'Vendedora' } }
const hidden = { hidden: true, tour: true, new: false, done: 6, total: 6, steps: [] }
const hired = { match_id: M, job_id: JOB, job_title: 'Ejecutivo/a de ventas', company_id: CO, company_name: 'Nova Retail', candidate_id: UID, stage: 'contratado', closed: false, can_schedule: true, created_at: new Date().toISOString(), last_message: '¡Bienvenida al equipo!' }
;(async () => {
  const b = await chromium.launch(); const out = []; const errs = []
  const page = async (ctx) => { const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); return p }
  const go = async (p, path) => { await p.goto(BASE + path, { waitUntil: 'networkidle' }); await p.waitForTimeout(700); await p.evaluate(() => document.getElementById('splash')?.remove()) }

  // 1) Búsqueda sin vacantes: no dice «Viste todas las vacantes» si nunca hubo una tarjeta
  { const ctx = await ctxFor(b, cand, { my_onboarding: hidden, job_feed: [] }, []); const p = await page(ctx)
    await go(p, '/')
    let t = await p.locator('body').innerText(); const first = /Aún no hay vacantes para tu perfil/.test(t)
    await p.getByRole('button', { name: 'Ver otras vacantes' }).click(); await p.waitForTimeout(600)
    t = await p.locator('body').innerText()
    out.push('búsqueda ampliada sin resultados: «Por ahora no hay vacantes abiertas», no «Viste todas»: ' + (first && /Por ahora no hay vacantes abiertas/.test(t) && !/Viste todas las vacantes/.test(t)))
    await ctx.close() }

  // 2) Proceso terminado (contratado/a, aunque el servidor antiguo dijera can_schedule): sin «Puedes agendar», ni en Intereses, ni en el chat, ni por el enlace
  { const ctx = await ctxFor(b, { ...cand, messages: [{ id: 'x1', match_id: M, sender_id: CO, body: '¡Bienvenida al equipo!', created_at: new Date().toISOString() }] }, { my_onboarding: hidden, my_matches: [hired], my_interviews: [], my_offers: [{ id: 'o1', match_id: M, status: 'aceptada' }], available_slots: [] }, []); const p = await page(ctx)
    await go(p, '/intereses')
    const t1 = await p.locator('body').innerText()
    await go(p, '/chats/' + M)
    const t2 = await p.locator('body').innerText()
    await go(p, '/chats/' + M + '/agendar')
    const t3 = await p.locator('body').innerText()
    out.push('contratado/a: sin «Puedes agendar» en Intereses: ' + !/Puedes agendar tu entrevista/.test(t1))
    out.push('contratado/a: el chat no ofrece «Agendar entrevista»: ' + !/Agendar entrevista/.test(t2))
    out.push('contratado/a: el chat conserva el historial: ' + /Bienvenida al equipo/.test(t2))
    out.push('contratado/a: el enlace de agenda anterior explica que el proceso terminó: ' + (/Este proceso ya no admite entrevistas/.test(t3) && /Felicitaciones/.test(t3)))
    await ctx.close() }

  // 2b) Carta oferta sin fecha límite: dice que está vigente hasta que la empresa la retire
  { const OF = '55555555-5555-5555-5555-555555555555'
    const ctx = await ctxFor(b, cand, { my_onboarding: hidden, offer_letter: { offer: { id: OF, match_id: M, status: 'enviada', position: 'Ejecutivo/a de ventas', salary: 700000, salary_type: 'liquido', contract: 'indefinido', schedule: 'completa', expires_on: null, created_at: '2026-11-11T12:00:00Z', letter: {} }, company: { display_name: 'Nova Retail' }, candidate: { first_name: 'Carla' }, is_candidate: true } }, []); const p = await page(ctx)
    await go(p, '/ofertas/' + OF)
    const t = await p.locator('body').innerText()
    out.push('oferta sin fecha límite: «vigente hasta que Nova Retail la retire» y fecha de envío: ' + (/vigente hasta que Nova Retail la retire/.test(t) && /11 de noviembre/.test(t)))
    await ctx.close() }

  // 3) Empresa: el acceso dice «postulaciones» y el tablero «personas en el tablero»; Plan y uso muestra los cupos por separado
  { const company = { id: CO, display_name: 'Nova Retail', kind: 'empresa', parent_id: null, verification_status: 'verified', slug: 'nova', clients: 0, managed_by: null }
    const plan = { id: 'pyme', name: 'Pyme', price_clp: 29990, max_active_jobs: 5, max_members: 3, ai_monthly: 200, promo_credits: 1, promo_days: 7, report_monthly: 10, disc_monthly: 30 }
    const ctx = await ctxFor(b, { __company: CO, profiles: { id: UID, role: 'company', first_name: 'Nova', last_name: 'R' }, jobs: [{ id: JOB, company_id: CO, title: 'Ejecutivo/a de ventas', status: 'paused', comuna: 'Talca', modality: 'presencial', created_at: new Date().toISOString() }], external_applicants: [{ job_id: JOB }, { job_id: JOB }] },
      { my_onboarding: hidden, my_companies: [{ company_id: CO, role: 'owner', inherited: false, companies: company }], company_stats: [{ job_id: JOB, interests: 4, matches: 2 }], company_todo: [],
        company_plan: { plan, status: 'trial', trial_ends_at: new Date(Date.now() + 10 * 864e5).toISOString(), usage: { jobs: 1, members: 1, ai: 12, promos: 0 }, plans: [plan] }, my_report_usage: { plan: 'Pyme', limit: 10, used: 3 },
        job_pipeline: { can_manage: true, job: { id: JOB, title: 'Ejecutivo/a de ventas', status: 'published', company_id: CO, questions: [] }, cards: [1, 2, 3, 4].map((i) => ({ kind: 'externo', id: 'e' + i, candidate_id: null, stage: 'postulante', since: new Date().toISOString(), name: 'Persona ' + i, headline: '', source: 'externo', tags: [] })), counts: { con_cuenta: 4, externas: 2, descartadas_antes: 2, invitadas: 0 } } }, []); const p = await page(ctx)
    await go(p, '/')
    const t1 = await p.locator('body').innerText()
    const pressed = await p.locator('button[aria-pressed="true"]').allInnerTexts()
    await go(p, `/vacantes/${JOB}/proceso`)
    const t2 = await p.locator('body').innerText()
    out.push('acceso «6 postulaciones» y tablero «4 personas en el tablero»: ' + (/Proceso de selección · 6 postulaciones/.test(t1) && /4 personas en el tablero/.test(t2)))
    out.push('el tablero explica la diferencia (6 recibidas, 2 descartadas antes del match): ' + /6 postulaciones recibidas \(4 por VINKA, 2 externas o importadas\) · 2 descartadas antes del match, no aparecen en el tablero/.test(t2))
    out.push('vacante pausada: pestaña «Pausadas · 1» elegida y sin la pestaña «Activas»: ' + (/Pausadas · 1/.test(t1) && !/Activas ·/.test(t1) && pressed.some((x) => /Pausadas/.test(x))))
    out.push('sin pendientes: «Todo al día» aclara que los avisos anteriores siguen en Avisos: ' + /Todo al día: no tienes pendientes ahora\. Los avisos anteriores siguen en Avisos/.test(t1))
    await go(p, '/plan')
    const t3 = await p.locator('body').innerText()
    out.push('Plan y uso: dice el límite que rige hoy (5 a la vez con Pyme de prueba) y qué pasa al terminar: ' + (/Hoy puedes tener 5 vacantes publicadas a la vez con tu plan Pyme de prueba/.test(t3)))
    out.push('Plan y uso: consultas de IA e informes como cupos distintos, con fecha de renovación: ' + (/Consultas de IA del mes/.test(t3) && /Informes psicolaborales con IA del mes/.test(t3) && /3 de 10/.test(t3) && /se renuevan el 1 de/.test(t3) && /Reportes DISC con IA: hasta 30 al mes/.test(t3)))
    await p.screenshot({ path: OUT + 'auditoria-plan.png', fullPage: true })
    await ctx.close() }

  out.push('errores JS: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'none'))
  console.log(out.join('\n')); await b.close()
})()
