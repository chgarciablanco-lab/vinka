// Tutoriales (sin sesión): cada pestaña con su video nuevo (horizontal en computador, vertical en celular), las guías nuevas (primeros pasos, informes, test DISC, comparativo)
// con sus imágenes, el video de empresas horizontal en computador y vertical en celular, y preguntas frecuentes nuevas.
const { BASE, OUT } = require('./_config.cjs')
const { chromium, devices } = require('playwright')
;(async () => {
  const b = await chromium.launch(); const out = []; const errs = []
  for (const [label, dev] of [['escritorio', { viewport: { width: 1366, height: 860 } }], ['celular', devices['iPhone 13']]]) {
    const mobile = label === 'celular'
    const ctx = await b.newContext(dev)
    await ctx.addInitScript(() => { localStorage.setItem('vinka-splash', '1'); sessionStorage.setItem('vinka-splash-seen', '1') })
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
    await ctx.route(/supabase\.co/, (r) => { const p = new URL(r.request().url()).pathname; return r.fulfill({ status: p.startsWith('/auth/v1/user') ? 401 : 200, contentType: 'application/json', body: p.startsWith('/auth') ? '{}' : '[]' }) })
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`${label}: ${e.message}`))
    const vidFmt = async (v) => { const w = `${v}-${mobile ? 'movil' : 'escritorio'}`, o = `${v}-${mobile ? 'escritorio' : 'movil'}`
      return await p.locator(`video[src*="${w}"]`).isVisible() && !(await p.locator(`video[src*="${o}"]`).isVisible()) && await p.evaluate(async (u) => (await fetch(u, { method: 'HEAD' })).ok, `/media/${w}.mp4`) }
    const imgOk = async (n) => p.evaluate(async (u) => (await fetch(u, { method: 'HEAD' })).ok, `/media/tut/${n}.jpg`)

    await p.goto(BASE + '/tutoriales/empresas', { waitUntil: 'networkidle' }); await p.waitForTimeout(600)
    let t = await p.locator('body').innerText()
    out.push(`[${label}] empresas: guías de primeros pasos, informes, DISC y comparativo: ` + ['Primeros pasos guiados', 'Informes psicolaborales con IA', 'Test DISC propio de VINKA', 'Compara a tus finalistas'].every((x) => t.includes(x)))
    const want = mobile ? 'ats-movil' : 'ats-escritorio', other = mobile ? 'ats-escritorio' : 'ats-movil'
    const vis = await p.locator(`video[src*="${want}"]`).isVisible(), hid = !(await p.locator(`video[src*="${other}"]`).isVisible())
    const vidOk = await p.evaluate(async (u) => (await fetch(u, { method: 'HEAD' })).ok, `/media/${want}.mp4`)
    out.push(`[${label}] empresas: video nuevo ${mobile ? 'vertical' : 'horizontal'} visible y el otro oculto: ` + (vis && hid && vidOk))
    await p.getByRole('button', { name: /Informes psicolaborales con IA/ }).click(); await p.waitForTimeout(300)
    t = await p.locator('body').innerText()
    out.push(`[${label}] guía de informes con sus pasos e imagen: ` + (/Generar informe con IA/.test(t) && /autorizó la evaluación/.test(t) && await p.locator('img[src*="e_informe"]').isVisible() && await imgOk('e_informe')))
    await p.getByRole('button', { name: /Test DISC propio/ }).click(); await p.waitForTimeout(300)
    out.push(`[${label}] guía de test DISC con imagen: ` + (/Enviar test DISC/.test(await p.locator('body').innerText()) && await p.locator('img[src*="e_disc"]').isVisible() && await imgOk('e_disc')))
    await p.getByRole('button', { name: /Compara a tus finalistas/ }).click(); await p.waitForTimeout(300)
    out.push(`[${label}] guía de comparativo con imagen: ` + (/Generar comparativo con IA/.test(await p.locator('body').innerText()) && await p.locator('img[src*="e_comparativo"]').isVisible() && await imgOk('e_comparativo')))
    if (!mobile) { await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: OUT + 'tutoriales-empresas-escritorio.png' }) }
    else await p.screenshot({ path: OUT + 'tutoriales-empresas-celular.png', fullPage: true })

    await p.getByRole('tab', { name: 'Busco trabajo' }).click(); await p.waitForTimeout(500)
    t = await p.locator('body').innerText()
    out.push(`[${label}] postulantes: primeros pasos y «Si te envían un test DISC»; su video nuevo en el formato correcto: ` + (t.includes('Primeros pasos guiados') && t.includes('Si te envían un test DISC') && await vidFmt('personas')))
    await p.getByRole('tab', { name: 'Soy asesor/a' }).click(); await p.waitForTimeout(500)
    t = await p.locator('body').innerText()
    out.push(`[${label}] asesores: primeros pasos e «Informes, test DISC y comparativos»: ` + (t.includes('Primeros pasos guiados') && t.includes('Informes, test DISC y comparativos') && await vidFmt('asesores')))
    if (!mobile) {
      const w = await p.evaluate(() => document.documentElement.scrollWidth)
      out.push(`[${label}] sin desborde horizontal: ` + (w <= 1366))
    } else {
      await p.setViewportSize({ width: 320, height: 700 }); await p.waitForTimeout(200)
      out.push(`[${label}] sin desborde a 320 px: ` + (await p.evaluate(() => document.documentElement.scrollWidth) <= 320))
    }
    await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(600)
    t = await p.locator('body').innerText()
    out.push(`[${label}] preguntas frecuentes nuevas en la portada: ` + (/¿La IA decide a quién contratar\?/.test(t) && /¿Qué es el test DISC de VINKA\?/.test(t)))
    await ctx.close()
  }
  out.push('errores JS: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'none'))
  console.log(out.join('\n')); await b.close()
})()
