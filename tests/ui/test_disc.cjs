// Test DISC VINKA (datos simulados): responder con el enlace sin cuenta, enviar el enlace desde la evaluación, ver el resultado,
// generar el reporte con IA, descargar su PDF y que el PDF del informe lo incluya como anexo
const { OUT, BASE } = require('./_config.cjs')
const { chromium, devices } = require('playwright')
const fs = require('fs')
const UID = '11111111-1111-1111-1111-111111111111', CO = '22222222-2222-2222-2222-222222222222', EV = '55555555-5555-5555-5555-555555555555', C1 = '66666666-6666-6666-6666-666666666666'
const TOKEN = 'a'.repeat(64)
const WORDS = ['Paciente', 'Decidido', 'Preciso', 'Entusiasta']
const blocks = Array.from({ length: 24 }, (_, i) => ({ block: i + 1, words: WORDS.map((w) => `${w} ${i + 1}`) }))
const company = { id: CO, display_name: 'Consultora Sur', kind: 'consultora', parent_id: null, verification_status: 'verified', slug: 'cs', clients: 0, managed_by: null }
const scores = { natural: { D: 33, I: 42, S: 83, C: 58 }, adaptado: { D: 25, I: 50, S: 75, C: 67 }, compuesto: { D: 29, I: 46, S: 79, C: 63 }, principal: 'S', secundario: 'C', bajo_presion: 'S', perfil: 'SC' }
const integrity = { minutos: 11.4, tiempo_valido: true, sin_interrupciones: true, pausa_mas_larga_min: 1.2, un_dispositivo: false, otros_dispositivos: 1, sin_patron_repetitivo: true }
const report = { analisis: 'Andrea muestra un estilo Estable.\n\nPodría aportar orden.', fortalezas: ['Aporta calma.', 'Cumple lo comprometido.', 'Escucha.'], desarrollo: ['Decidir rápido.', 'Expresar desacuerdos.', 'Delegar.'],
  bajo_presion: 'Puede replegarse.', recomendaciones: ['Anticipar cambios.', 'Dar espacios para opinar.', 'Acompañar.'], conclusion: 'Validar su respuesta a la presión.',
  ideal: { D: 60, I: 55, S: 50, C: 55 }, calce: 68, brechas: ['Dominancia (D): la persona muestra 29 y el cargo suele requerir cerca de 60.'], preguntas: ['¿Cómo decides con poca información?', '¿Un cambio de último momento?', '¿Un desacuerdo?'] }

async function ctxFor(b, rpc, calls, logged) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], acceptDownloads: true })
  await ctx.addInitScript(([uid, co, logged]) => {
    localStorage.setItem('vinka-splash', '1'); sessionStorage.setItem('vinka-splash-seen', '1')
    if (logged) { localStorage.setItem('sb-jifhlhbntcfnvmcpbexo-auth-token', JSON.stringify({ access_token: 'x.eyJzdWIiOiIxIn0.x', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid, email: 't@example.com', aud: 'authenticated' } })); localStorage.setItem('vinka-company', co) }
  }, [UID, CO, logged])
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
  await ctx.route(/supabase\.co/, async (route) => {
    const r = route.request(); const path = new URL(r.url()).pathname; const single = (r.headers()['accept'] || '').includes('vnd.pgrst.object')
    const send = (x, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(x) })
    if (path.startsWith('/auth/v1/user')) return logged ? send({ id: UID, email: 't@example.com', aud: 'authenticated' }) : send({}, 401)
    if (path.startsWith('/auth/')) return send({})
    if (path.startsWith('/storage/')) return send({ Key: 'x' })
    if (path.startsWith('/functions/v1/evaluation-report')) { const body = r.postData() || ''; calls.push('fn ' + body); await new Promise((ok) => setTimeout(ok, 300)); return send(body.includes('"disc"') ? { ok: true } : { report_id: 'r1' }) }
    const name = path.startsWith('/rest/v1/rpc/') && path.split('/').pop()
    if (name) { calls.push(name + ' ' + (r.postData() || '')); const v = rpc[name]; return send(typeof v === 'function' ? v(r.postData()) : v !== undefined ? v : null) }
    const t = path.split('/').pop()
    const tables = logged ? { profiles: { id: UID, role: 'company', first_name: 'Olga', last_name: 'Dueña' } } : {}
    const d = tables[t]
    if (single) return d ? send(d) : route.fulfill({ status: 406, contentType: 'application/json', body: '{"code":"PGRST116"}' })
    return send(d ? [d] : [])
  })
  return ctx
}

;(async () => {
  const b = await chromium.launch(); const out = []; const errs = []

  // A) Responder el test con el enlace, sin cuenta
  { const calls = []
    const ctx = await ctxFor(b, { disc_open: { status: 'enviado', name: 'Andrea', title: 'Subadministrador', company: 'Consultora Sur', consent: false, answered: [], blocks },
      disc_begin: null, disc_answer: null, disc_submit: null }, calls, false)
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(BASE + '/test/' + TOKEN, { waitUntil: 'networkidle' }); await p.waitForTimeout(600)
    let t = await p.locator('body').innerText()
    const startBtn = p.getByRole('button', { name: 'Comenzar' })
    out.push('enlace sin cuenta: saludo, cargo y empresa; no empieza sin aceptar: ' + (/Hola Andrea/.test(t) && /Subadministrador/.test(t) && /Consultora Sur/.test(t) && await startBtn.isDisabled()))
    await p.screenshot({ path: OUT + 'disc-inicio.png', fullPage: true })
    await p.getByRole('checkbox').check(); await startBtn.click(); await p.waitForTimeout(400)
    const next = p.getByRole('button', { name: 'Siguiente' })
    out.push('empezar registra el inicio; sin elegir no avanza: ' + (calls.some((c) => c.startsWith('disc_begin') && c.includes(TOKEN)) && await next.isDisabled()))
    // elegir la misma palabra en «más» y «menos» la mueve
    await p.getByRole('button', { name: 'Decidido 1: me describe más' }).click()
    await p.getByRole('button', { name: 'Decidido 1: me describe menos' }).click()
    out.push('una palabra no puede ser «más» y «menos» a la vez: ' + ((await p.getByRole('button', { name: 'Decidido 1: me describe más' }).getAttribute('aria-pressed')) === 'false'))
    await p.getByRole('button', { name: 'Preciso 1: me describe más' }).click()
    await p.screenshot({ path: OUT + 'disc-pregunta.png', fullPage: true })
    const w = await p.evaluate(() => document.documentElement.scrollWidth); await p.setViewportSize({ width: 320, height: 700 })
    const w320 = await p.evaluate(() => document.documentElement.scrollWidth); await p.setViewportSize({ width: 390, height: 844 })
    out.push('sin desborde a 320 px: ' + (w <= 390 && w320 <= 320))
    await next.click(); await p.waitForTimeout(300)
    for (let i = 2; i <= 24; i++) {
      await p.getByRole('button', { name: `Paciente ${i}: me describe más` }).click()
      await p.getByRole('button', { name: `Entusiasta ${i}: me describe menos` }).click()
      await p.getByRole('button', { name: i < 24 ? 'Siguiente' : 'Enviar respuestas' }).click(); await p.waitForTimeout(120)
    }
    await p.waitForTimeout(500); t = await p.locator('body').innerText()
    const ans = calls.filter((c) => c.startsWith('disc_answer'))
    out.push('24 respuestas guardadas y enviadas: ' + (ans.length === 24 && ans[0].includes('"p_most":2') && ans[0].includes('"p_least":1') && calls.some((c) => c.startsWith('disc_submit')) && /Listo, gracias/.test(t)))
    out.push('la persona no ve resultados: ' + !/Dominante|Estable|puntaje/i.test(t))
    await ctx.close() }

  // A2) enlace vencido / respondido
  { const ctx = await ctxFor(b, { disc_open: { status: 'vencido' } }, [], false); const p = await ctx.newPage()
    await p.goto(BASE + '/test/' + TOKEN, { waitUntil: 'networkidle' }); await p.waitForTimeout(400)
    out.push('enlace vencido avisa: ' + /Enlace vencido/.test(await p.locator('body').innerText())); await ctx.close() }

  // B) Desde la evaluación: enviar, ver resultado, reporte con IA y PDF; el informe lo incluye como anexo
  { const calls = []
    let disc = null
    const cand = () => ({ id: C1, full_name: 'Andrea Pérez', email: '', candidate_id: null, consent_at: new Date().toISOString(), consent_by: 'Olga D.', files: [], disc,
      report: disc?.report ? { id: 'r1', version: 1, status: 'borrador', sections: { antecedentes: 'Texto.', fortalezas: [], oportunidades: [], referencias: [], veredicto: 'recomendado', tests: [] }, created_at: new Date().toISOString() } : null })
    const detail = () => ({ id: EV, title: 'Subadministrador', client_name: 'Restaurante', job_id: null, status: 'abierta', company_id: CO, company: 'Consultora Sur', job_profile: 'Perfil.', can_manage: true,
      usage: { plan: 'Pyme', limit: 10, used: 0 }, shared_files: [], candidates: [cand()], comparison: null })
    const ctx = await ctxFor(b, { my_companies: [{ company_id: CO, role: 'owner', inherited: false, companies: company }], company_plan: { plan: { id: 'pyme' }, status: 'active', usage: {} },
      eval_list: [], my_report_usage: { plan: 'Pyme', limit: 10, used: 0 }, eval_detail: () => detail(),
      disc_create: () => { disc = { id: 't1', status: 'enviado', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 864e5).toISOString(), progress: 0 }; return { id: 't1', token: TOKEN, expires_at: disc.expires_at } },
      disc_cancel: null }, calls, true)
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(BASE + '/evaluaciones/' + EV, { waitUntil: 'networkidle' }); await p.waitForTimeout(800)
    await p.getByRole('button', { name: 'Enviar test DISC' }).click(); await p.waitForTimeout(500)
    const link = await p.getByLabel('Enlace del test').innerText()
    const wa = await p.getByRole('link', { name: 'Enviar por WhatsApp' }).getAttribute('href')
    out.push('enviar test: enlace para copiar y por WhatsApp: ' + (calls.some((c) => c.startsWith('disc_create') && c.includes(C1)) && link.endsWith('/test/' + TOKEN) && wa.includes(encodeURIComponent('/test/' + TOKEN))))
    out.push('estado del test enviado: ' + /Enviado · aún no comienza/.test(await p.locator('body').innerText()))
    // completado
    disc = { ...disc, status: 'completado', completed_at: new Date().toISOString(), progress: 24, scores, integrity, report: null }
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(800)
    let t = await p.locator('body').innerText()
    out.push('resultado: gráfico, perfil y aviso de integridad: ' + (/Apoyo · Analítico \(SC\)/.test(t) && /integridad 3 de 4/.test(t) && /Se abrió en otro dispositivo/.test(t) && await p.getByRole('img', { name: /Estable 79/ }).count() === 1))
    disc = { ...disc, report }
    await p.getByRole('button', { name: /Generar reporte con IA/ }).click(); await p.waitForTimeout(1200)
    out.push('reporte con IA: llama a la función y muestra el calce: ' + (calls.some((c) => c.startsWith('fn ') && c.includes('"mode":"disc"') && c.includes('"disc":"t1"')) && /calce con el cargo 68%/.test(await p.locator('body').innerText())))
    await p.screenshot({ path: OUT + 'disc-resultado.png', fullPage: true })
    const [d1] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.locator('[aria-label="Test DISC"]').getByRole('button', { name: 'PDF', exact: true }).click()])
    const b1 = fs.readFileSync(await d1.path())
    const { PDFDocument } = require('pdf-lib'); const n1 = (await PDFDocument.load(b1)).getPageCount()
    out.push('PDF del test DISC con gráficos: ' + (b1.subarray(0, 4).toString() === '%PDF' && n1 >= 4))
    const [d2] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.getByRole('button', { name: 'PDF', exact: true }).last().click()])
    const n2 = (await PDFDocument.load(fs.readFileSync(await d2.path()))).getPageCount()
    out.push('el PDF del informe trae el test DISC como anexo: ' + (n2 >= n1 + 4))
    await ctx.close() }

  out.push('errores JS: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'none'))
  console.log(out.join('\n')); await b.close()
})()
