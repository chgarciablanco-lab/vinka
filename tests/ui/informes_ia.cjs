// Informes psicolaborales con IA (datos simulados): lista, evaluación, archivos, autorización, generar, editar, descargar (con anexo de tests), comparativo y pestaña «Informe»
const { OUT, BASE } = require('./_config.cjs')
const { chromium, devices } = require('playwright')
const UID = '11111111-1111-1111-1111-111111111111', CO = '22222222-2222-2222-2222-222222222222', EV = '55555555-5555-5555-5555-555555555555', C1 = '66666666-6666-6666-6666-666666666666'
const C2 = '77777777-7777-7777-7777-777777777777'
const JOB = '33333333-3333-3333-3333-333333333333', CAND = '44444444-4444-4444-4444-444444444444'
const sections = {
  antecedentes: 'Andrea es Contadora Pública.\n\nTrabajó en **Restaurante del Lago** (2017-2019).', fortalezas: [{ titulo: 'Liderazgo en terreno', texto: 'Ordenó la operación durante un corte de luz.' }],
  oportunidades: [{ titulo: 'Manejo del estrés', texto: 'Reconoce reacciones intensas.' }], referencias: [{ nombre: 'Rosa Díaz', cargo: 'Directora', relacion: 'jefatura directa', texto: 'La recomienda.' }],
  motivacion: 'Le motiva un formato nuevo.', recomendacion: 'Buen ajuste.\n\nAcompañar su inducción.', sintesis: 'En síntesis, se recomienda con observaciones.', veredicto: 'con_observaciones',
  renta: 'No abordada en la entrevista.', disponibilidad: 'Aproximadamente 20 días.', tests: [{ nombre: 'DISC', resumen: 'Perfil Estable.' }], faltantes: ['No se entregaron referencias de su último empleo.'],
}
const company = { id: CO, display_name: 'Consultora Sur', kind: 'consultora', parent_id: null, verification_status: 'verified', slug: 'cs', clients: 0, managed_by: null }
async function ctxFor(b, rpc, calls) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], acceptDownloads: true })
  await ctx.addInitScript(([uid, co]) => { localStorage.setItem('sb-jifhlhbntcfnvmcpbexo-auth-token', JSON.stringify({ access_token: 'x.eyJzdWIiOiIxIn0.x', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid, email: 't@example.com', aud: 'authenticated' } })); localStorage.setItem('vinka-splash', '1'); sessionStorage.setItem('vinka-splash-seen', '1'); localStorage.setItem('vinka-company', co) }, [UID, CO])
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
  await ctx.route(/supabase\.co/, async (route) => {
    const r = route.request(); const path = new URL(r.url()).pathname; const single = (r.headers()['accept'] || '').includes('vnd.pgrst.object')
    const send = (x, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(x) })
    if (path.startsWith('/auth/v1/user')) return send({ id: UID, email: 't@example.com', aud: 'authenticated' })
    if (path.startsWith('/auth/')) return send({})
    if (path.startsWith('/storage/')) {
      calls.push('storage ' + r.method() + ' ' + path)
      if (r.method() === 'GET' && path.endsWith('.pdf')) return route.fulfill({ status: 200, contentType: 'application/pdf', body: require('fs').readFileSync(__dirname + '/fixtures/test-disc.pdf') })
      return send({ Key: 'x', path: 'x' })
    }
    if (path.startsWith('/functions/v1/evaluation-report')) { const body = r.postData() || ''; calls.push('fn ' + body); await new Promise((ok) => setTimeout(ok, 300)); return send(body.includes('comparativo') ? { comparison_id: 'k1' } : body.includes('seccion') ? { section: 'motivacion', value: 'Motivación reescrita por la IA.' } : { report_id: 'r1' }) }
    const name = path.startsWith('/rest/v1/rpc/') && path.split('/').pop()
    if (name) { calls.push(name + ' ' + (r.postData() || '')); const v = rpc[name]; return send(typeof v === 'function' ? v(r.postData()) : v !== undefined ? v : null) }
    const t = path.split('/').pop()
    const tables = { profiles: { id: UID, role: 'company', first_name: 'Olga', last_name: 'Dueña' } }
    const d = tables[t]
    if (single) return d ? send(d) : route.fulfill({ status: 406, contentType: 'application/json', body: '{"code":"PGRST116"}' })
    return send(d ? [d] : [])
  })
  return ctx
}
;(async () => {
  const b = await chromium.launch(); const out = []; const errs = []
  const usage = { plan: 'Pyme', limit: 10, used: 3 }
  let consent = null, report = null, comparison = null
  const other = { id: C2, full_name: 'Bruno Soto', email: '', candidate_id: null, consent_at: new Date().toISOString(), consent_by: 'Olga D.', files: [],
    report: { id: 'r2', version: 1, status: 'final', sections: { ...sections, veredicto: 'recomendado' }, finalized_at: new Date().toISOString(), finalized_by_name: 'Olga D.' } }
  const detail = () => ({ id: EV, title: 'Subadministrador', client_name: 'Alemán Experto', job_id: null, status: 'abierta', company_id: CO, company: 'Consultora Sur', job_profile: 'Apoyar al administrador del local.', can_manage: true, usage,
    shared_files: [{ id: 'f0', kind: 'perfil', name: 'perfil.pdf', path: `${EV}/perfil.pdf`, size: 90000 }],
    candidates: [{ id: C1, full_name: 'Andrea Pérez', email: 'andrea@prueba.cl', candidate_id: null, consent_at: consent, consent_by: consent ? 'Olga D.' : null,
      files: [{ id: 'f1', kind: 'transcripcion', name: 'entrevista.docx', path: `${EV}/e.docx`, size: 40000, has_text: true }, { id: 'f2', kind: 'test', name: 'disc.pdf', path: `${EV}/disc.pdf`, size: 30000, has_text: false }], report }, other], comparison })
  const calls = []
  const ctx = await ctxFor(b, {
    my_companies: [{ company_id: CO, role: 'owner', inherited: false, companies: company }], company_plan: { plan: { id: 'pyme' }, status: 'active', usage: {} },
    eval_list: [{ id: EV, title: 'Subadministrador', client_name: 'Alemán Experto', job_id: null, status: 'abierta', company_id: CO, company: 'Consultora Sur', created_at: new Date().toISOString(), can_manage: true, candidates: 1, finals: 0 }],
    my_report_usage: usage, eval_detail: () => detail(), eval_set_consent: () => { consent = new Date().toISOString(); return null },
    eval_add_file: 'f9', eval_report_save: null, eval_report_finalize: null, eval_compare_save: null, eval_compare_finalize: null,
  }, calls)
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
  await p.goto(BASE + '/evaluaciones', { waitUntil: 'networkidle' }); await p.waitForTimeout(700)
  let t = await p.locator('body').innerText()
  out.push('lista de evaluaciones con cupo del mes: ' + (/Subadministrador/.test(t) && /Quedan 7 de 10 informes con IA este mes/.test(t)))
  await p.screenshot({ path: OUT + 'informes-lista.png', fullPage: true })
  await p.goto(BASE + '/evaluaciones/' + EV, { waitUntil: 'networkidle' }); await p.waitForTimeout(800)
  t = await p.locator('body').innerText()
  out.push('evaluación muestra perfil, archivos y persona: ' + (/Apoyar al administrador/.test(t) && /perfil\.pdf/.test(t) && /entrevista\.docx/.test(t)))
  const gen = p.getByRole('button', { name: /Generar informe con IA/ })
  out.push('sin autorización no se puede generar: ' + (await gen.isDisabled()))
  await p.screenshot({ path: OUT + 'informes-evaluacion.png', fullPage: true })
  // pegar texto
  await p.getByRole('button', { name: 'Pegar texto' }).nth(1).click()
  await p.getByPlaceholder(/Pega aquí la transcripción/).fill('Referencia de Rosa Díaz, directora de operaciones: la recomienda y destaca su orden.')
  await p.getByRole('button', { name: 'Guardar texto' }).click(); await p.waitForTimeout(400)
  out.push('pegar texto llama a la base: ' + calls.some((c) => c.startsWith('eval_add_file') && c.includes('Rosa D')))
  await p.getByRole('checkbox').first().check(); await p.waitForTimeout(500)
  out.push('autorización registrada: ' + (calls.some((c) => c.startsWith('eval_set_consent')) && /Autorización de la persona registrada/.test(await p.locator('body').innerText())))
  report = { id: 'r1', version: 1, status: 'borrador', sections, model: 'claude-sonnet-5-5', created_at: new Date().toISOString() }
  await p.getByRole('button', { name: /Generar informe con IA/ }).click(); await p.waitForTimeout(1200)
  t = await p.locator('body').innerText()
  const vals = await p.locator('input, textarea').evaluateAll((els) => els.map((e) => e.value).join(' | '))
  out.push('generar llama a la IA y muestra el borrador: ' + (calls.some((c) => c.startsWith('fn ') && c.includes('"mode":"informe"')) && /Antecedentes y experiencia/.test(t) && /Liderazgo en terreno/.test(vals)))
  out.push('muestra lo que falta revisar y el aviso de datos sensibles: ' + (/Para revisar antes de cerrar/.test(t) && /No incluye edad, nacionalidad/.test(t)))
  await p.screenshot({ path: OUT + 'informes-borrador.png', fullPage: true })
  // editar y escribir sin perder el foco
  const ta = p.getByRole('textbox', { name: '3) Motivación de cambio' })
  await ta.click(); await ta.press('End'); await ta.type(' Busca estabilidad.')
  out.push('editar no pierde el foco: ' + ((await ta.inputValue()).endsWith('Busca estabilidad.')))
  await p.getByRole('button', { name: 'Guardar cambios' }).click(); await p.waitForTimeout(400)
  out.push('guardar cambios llama a la base: ' + calls.some((c) => c.startsWith('eval_report_save') && c.includes('Busca estabilidad')))
  // reescribir una sección
  await p.getByRole('button', { name: 'Reescribir con IA' }).nth(3).click(); await p.waitForTimeout(300)
  await p.getByPlaceholder(/Indicación/).fill('más breve'); await p.locator('[role=dialog] button.btn').click(); await p.waitForTimeout(900)
  out.push('reescribir una sección llama a la IA: ' + (calls.some((c) => c.startsWith('fn ') && c.includes('"mode":"seccion"')) && /Motivación reescrita por la IA/.test(await p.locator('body').innerText()) || (await ta.inputValue()) === 'Motivación reescrita por la IA.'))
  // descargas
  const [d1] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.getByRole('button', { name: 'Word', exact: true }).click()])
  const [d2] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.getByRole('button', { name: 'PDF', exact: true }).click()])
  // (el Chromium sin pantalla de este entorno no conserva el nombre del archivo: se revisa el contenido)
  const fs = require('fs'); const b1 = fs.readFileSync(await d1.path()), b2 = fs.readFileSync(await d2.path())
  out.push('descarga Word y PDF: ' + (b1.subarray(0, 2).toString() === 'PK' && b2.subarray(0, 4).toString() === '%PDF' && b1.length > 3000 && b2.length > 3000))
  { const { PDFDocument } = require('pdf-lib'); const doc = await PDFDocument.load(b2); const pages = doc.getPages().map((x) => Math.round(x.getWidth()))
    out.push('PDF A4 con el reporte de test al final: ' + (calls.some((c) => c.includes('GET') && c.includes('disc.pdf')) && pages.length >= 6 && pages[0] === 595 && pages.at(-1) === 612)) }
  await p.getByRole('button', { name: 'Cerrar informe' }).click(); await p.waitForTimeout(400)
  out.push('cerrar informe llama a la base: ' + calls.some((c) => c.startsWith('eval_report_finalize') && c.includes('"p_final":true')))
  // Comparativo
  t = await p.locator('body').innerText()
  out.push('comparativo disponible con 2 personas con informe: ' + /Compara los informes de las 2 personas/.test(t))
  comparison = { id: 'k1', version: 1, status: 'borrador', created_at: new Date().toISOString(), content: { resumen: 'Dos personas con experiencia en gastronomía.',
    candidatos: [{ nombre: 'Andrea Pérez', ajuste: 'alto', veredicto: 'con_observaciones', fortalezas: 'Lidera equipos grandes.', riesgos: 'Primera vez como segunda.' },
      { nombre: 'Bruno Soto', ajuste: 'medio', veredicto: 'recomendado', fortalezas: 'Buen trato con clientes.', riesgos: 'Poca experiencia en costos.' }],
    conclusion: 'Avanzar primero con Andrea Pérez.', faltantes: ['El informe de Andrea está en borrador.'] } }
  p.once('dialog', (dg) => dg.accept())
  await p.getByRole('button', { name: /Generar comparativo con IA/ }).click(); await p.waitForTimeout(1200)
  t = await p.locator('body').innerText()
  out.push('generar comparativo llama a la IA y muestra el borrador: ' + (calls.some((c) => c.startsWith('fn ') && c.includes('"mode":"comparativo"') && c.includes(EV)) && /Orden sugerido/.test(t) && /Para revisar antes de cerrar/.test(t)))
  await p.getByRole('button', { name: '↓ Bajar' }).first().click()
  const conc = p.getByRole('textbox', { name: 'Conclusión' }); await conc.click(); await conc.press('End'); await conc.type(' Confirmar renta.')
  out.push('editar comparativo no pierde el foco: ' + (await conc.inputValue()).endsWith('Confirmar renta.'))
  await p.locator('[aria-label="Comparativo"]').getByRole('button', { name: 'Guardar cambios' }).click(); await p.waitForTimeout(400)
  const saved = calls.find((c) => c.startsWith('eval_compare_save')) || ''
  out.push('guardar comparativo con el nuevo orden: ' + (saved.includes('Confirmar renta') && saved.indexOf('Bruno Soto') < saved.indexOf('Andrea P')))
  await p.screenshot({ path: OUT + 'informes-comparativo.png', fullPage: true })
  const [d3] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.locator('[aria-label="Comparativo"]').getByRole('button', { name: 'PDF', exact: true }).click()])
  const [d4] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.locator('[aria-label="Comparativo"]').getByRole('button', { name: 'Word', exact: true }).click()])
  const b3 = fs.readFileSync(await d3.path()), b4 = fs.readFileSync(await d4.path())
  out.push('descarga comparativo en PDF y Word: ' + (b3.subarray(0, 4).toString() === '%PDF' && b4.subarray(0, 2).toString() === 'PK' && b3.length > 3000))
  await p.locator('[aria-label="Comparativo"]').getByRole('button', { name: 'Cerrar comparativo' }).click(); await p.waitForTimeout(400)
  out.push('cerrar comparativo llama a la base: ' + calls.some((c) => c.startsWith('eval_compare_finalize') && c.includes('"p_final":true')))
  await ctx.close()

  // Pestaña «Informe» en la ficha de un postulante de una vacante
  { const calls2 = []
    const detail2 = { ai: {}, job: { id: JOB, area: 'ventas', level: 'junior', title: 'Vendedor/a', questions: [], company_id: CO }, kind: 'match', tags: [], team: [{ id: UID, name: 'Olga Dueña' }],
      match: { id: 'm1', stage: 'entrevista', closed: false, created_at: new Date().toISOString(), contact_shared: false }, my_id: UID, notes: [], offer: null, events: [], answers: [],
      candidate: { id: CAND, bio: '', name: 'Pía Postulante', email: null, phone: null, comuna: 'Talca', region: 'Maule', skills: [], headline: 'Vendedora', education: [], has_video: false, schedules: [], modalities: [], experiences: [], availability: '', has_experience: true },
      applied_at: new Date().toISOString(), can_manage: true, interviews: [], evaluations: [], knocked_out: false }
    const c2 = await ctxFor(b, { my_companies: [{ company_id: CO, role: 'owner', inherited: false, companies: company }], company_plan: { plan: { id: 'pyme' }, status: 'active', usage: {} },
      subject_detail: detail2, eval_list: [], eval_for_applicant: { assessment_id: EV, assessment_candidate_id: C1 } }, calls2)
    const p2 = await c2.newPage(); p2.on('pageerror', (e) => errs.push(e.message))
    await p2.goto(BASE + `/vacantes/${JOB}/candidato/${CAND}`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(900)
    await p2.getByRole('button', { name: 'Informe', exact: true }).click(); await p2.waitForTimeout(500)
    t = await p2.locator('body').innerText()
    out.push('pestaña Informe en la ficha del postulante: ' + (/Informe psicolaboral con IA/.test(t) && /Preparar informe/.test(t)))
    await p2.screenshot({ path: OUT + 'informes-pestana.png', fullPage: true })
    await p2.getByRole('button', { name: 'Preparar informe' }).click(); await p2.waitForTimeout(400)
    out.push('preparar informe llama a la base: ' + calls2.some((c) => c.startsWith('eval_for_applicant')))
    await c2.close() }

  out.push('errores JS: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'none'))
  console.log(out.join('\n')); await b.close()
})()
