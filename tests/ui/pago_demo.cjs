const { OUT, BASE } = require('./_config.cjs')
const { chromium, devices } = require('playwright')
const UID = '11111111-1111-1111-1111-111111111111', CO = '22222222-2222-2222-2222-222222222222', JOB = '33333333-3333-3333-3333-333333333333'
const iso = (d) => new Date(Date.now() + d * 86400000).toISOString()
const svcs = [{ id: 'cv', name: 'Revisión de CV', price_clp: 14990, includes: ['CV mejorado'], summary: 'x', delivery: '3 días', active: true, sort: 1 }]
const plans = [{ id: 'pyme', name: 'Pyme', price_clp: 29990, max_active_jobs: 5, max_members: 3, ai_monthly: 200, sort: 2, promo_credits: 1, promo_days: 7 },
  { id: 'empresa', name: 'Empresa', price_clp: null, max_active_jobs: null, max_members: null, ai_monthly: 5000, sort: 5, promo_credits: 5, promo_days: 15 }]
const nova = { id: CO, display_name: 'Nova Retail', kind: 'empresa', parent_id: null, verification_status: 'verified', slug: 'nova', clients: 0, managed_by: null }
const quote = (t) => ({ title: t, detail: 'detalle', net: 12597, iva: 2393, total: 14990, reason: null, merchant: 'VINKA SpA (demostración)', demo: true })
const receipt = (st) => ({ status: st, reason: st === 'aprobado' ? '' : 'Transacción rechazada por el banco emisor', order: 'VK-261112-ABC123', auth_code: st === 'aprobado' ? '123456' : null, amount: 14990, net: 12597, iva: 2393, title: 'Revisión de CV', brand: st === 'aprobado' ? 'Visa' : 'Mastercard', last4: st === 'aprobado' ? '6623' : '0568', type: 'credito', installments: 3, paid_at: new Date().toISOString(), merchant: 'VINKA SpA (demostración)' })
const scen = {
  asesoria: { path: '/asesoria', tables: { profiles: { id: UID, role: 'candidate', first_name: 'Diego', last_name: 'M' }, candidate_profiles: { user_id: UID, onboarding_done: true }, career_services: svcs,
    service_requests: [{ id: 'r1', service_id: 'cv', service_name: 'Revisión de CV', price_clp: 14990, status: 'pago_pendiente', created_at: iso(-1), choice: 'vinka', assigned_to: null }] } },
  plan: { path: '/plan', pick: CO, tables: { profiles: { id: UID, role: 'company', first_name: 'Nova', last_name: 'T' } },
    rpc: { my_companies: [{ company_id: CO, role: 'owner', inherited: false, companies: nova }], company_plan: { plan: plans[0], status: 'trial', trial_ends_at: iso(10), usage: { jobs: 1, members: 1, ai: 0, promos: 0 }, plans } } },
}
;(async () => {
  const browser = await chromium.launch(); const out = []
  for (const [name, sc] of Object.entries(scen)) {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
    await ctx.addInitScript(([uid, pick]) => { localStorage.setItem('sb-jifhlhbntcfnvmcpbexo-auth-token', JSON.stringify({ access_token: 'x.eyJzdWIiOiIxIn0.x', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid, email: 't@example.com', aud: 'authenticated' } })); if (pick) localStorage.setItem('vinka-company', pick); localStorage.setItem('vinka-splash', '1') }, [UID, sc.pick])
    const calls = []; let tries = 0
    await ctx.route(/supabase\.co/, async (route) => {
      const r = route.request(); const path = new URL(r.url()).pathname
      const single = (r.headers()['accept'] || '').includes('vnd.pgrst.object')
      const send = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })
      if (path.startsWith('/auth/v1/user')) return send({ id: UID, email: 't@example.com', aud: 'authenticated' })
      if (path.startsWith('/auth/')) return send({})
      const rpc = path.startsWith('/rest/v1/rpc/') && path.split('/').pop()
      if (rpc) calls.push(rpc + ' ' + (r.postData() || ''))
      if (rpc === 'checkout_quote') { const b = JSON.parse(r.postData()); return send(b.p_kind === 'plan' ? { ...quote(`Plan Pyme × ${b.p_months} meses`), net: 29990 * b.p_months, iva: Math.round(29990 * b.p_months * 0.19), total: Math.round(29990 * b.p_months * 1.19) } : quote('Revisión de CV')) }
      if (rpc === 'checkout_pay') { tries++; return send(receipt(tries === 1 ? 'rechazado' : 'aprobado')) }
      if (rpc === 'my_payment_receipts') return send([])
      if (rpc && sc.rpc?.[rpc] !== undefined) return send(sc.rpc[rpc])
      if (rpc) return send(rpc.startsWith('my_') ? [] : null)
      const t = path.split('/').pop(); let data = t === 'plans' ? plans : sc.tables[t]
      if (single) return data ? send(Array.isArray(data) ? data[0] : data) : route.fulfill({ status: 406, contentType: 'application/json', body: '{"code":"PGRST116","message":"no rows"}' })
      return send(data ? (Array.isArray(data) ? data : [data]) : [])
    })
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message))
    await page.goto(BASE + sc.path, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200)
    await page.evaluate(() => document.getElementById('splash')?.remove())
    const dlg = page.locator('[role=dialog]')
    const has = (c) => calls.some((x) => x.startsWith(c))
    try {
      if (name === 'asesoria') {
        await page.getByRole('button', { name: /Pagar \$14\.990 con tarjeta/ }).click(); await page.waitForTimeout(500)
        let t = await dlg.innerText()
        out.push('1 · hoja de pago: ' + /Modo demostración/.test(t) + ' · resumen: ' + /Neto \$12\.597 \+ IVA \$2\.393/.test(t))
        await page.screenshot({ path: OUT + 'pay-form.png' })
        await dlg.locator('input[name=vinka-demo-card]').fill('4111 1111 1111 1111'); await dlg.locator('input[name=vinka-demo-exp]').fill('1229'); await dlg.locator('input[name=vinka-demo-cvv]').fill('123'); await dlg.locator('input[name=vinka-demo-name]').fill('Diego M')
        await dlg.getByRole('button', { name: /^Pagar \$14\.990$/ }).click(); await page.waitForTimeout(300)
        out.push('2 · tarjeta real rechazada en el teléfono: ' + /No ingreses una tarjeta real/.test(await dlg.innerText()) + ' · no se envió: ' + !has('checkout_pay'))
        out.push('2b · sin autocompletar: ' + (await dlg.locator('input[name=vinka-demo-card]').getAttribute('autocomplete')))
        await dlg.getByText('Mastercard · rechazada por el banco').click()
        await dlg.locator('select').selectOption('3')
        await dlg.getByRole('button', { name: /^Pagar \$14\.990$/ }).click(); await page.waitForTimeout(800)
        out.push('3 · procesando: ' + /Procesando con tu banco/.test(await dlg.innerText()))
        await page.waitForTimeout(1800)
        t = await dlg.innerText()
        out.push('4 · rechazo: ' + /Pago rechazado/.test(t) + ' · motivo: ' + /rechazada por el banco emisor/.test(t) + ' · envió clave de prueba: ' + has('checkout_pay {"p_kind":"asesoria","p_ref":"r1","p_card":"mc_rechazo","p_type":"credito","p_installments":3'))
        out.push('4b · nunca envía el número: ' + !calls.some((c) => /5186|0568/.test(c)))
        await dlg.getByRole('button', { name: 'Intentar con otra tarjeta' }).click(); await page.waitForTimeout(200)
        await dlg.getByText('Visa crédito · aprobada').click()
        await dlg.getByRole('button', { name: /^Pagar \$14\.990$/ }).click(); await page.waitForTimeout(2300)
        t = await dlg.innerText()
        out.push('5 · aprobado con comprobante: ' + /¡Pago aprobado!/.test(t) + ' · orden: ' + /VK-261112-ABC123/.test(t) + ' · autorización: ' + /123456/.test(t) + ' · cuotas: ' + /3 cuotas sin interés/.test(t))
        await page.screenshot({ path: OUT + 'pay-ok.png' })
        await dlg.getByRole('button', { name: 'Listo' }).click(); await page.waitForTimeout(400)
        out.push('5b · cierra y recarga: ' + !(await dlg.count()))
      }
      if (name === 'plan') {
        await page.getByRole('button', { name: 'Pagar este plan' }).click(); await page.waitForTimeout(200)
        await page.getByRole('button', { name: /12 meses/ }).click()
        await page.getByRole('button', { name: 'Ir a pagar' }).click(); await page.waitForTimeout(500)
        out.push('6 · plan 12 meses: ' + has('checkout_quote {"p_kind":"plan","p_ref":"' + CO + '","p_plan":"pyme","p_months":12}') + ' · total: ' + /\$428\.257/.test(await dlg.innerText()))
        out.push('6b · plan a cotizar sin tarjeta: ' + !(await page.getByRole('button', { name: 'Contratar con tarjeta' }).count()) + ' · cotización: ' + (await page.getByRole('button', { name: 'Pedir cotización' }).count()))
        await page.screenshot({ path: OUT + 'pay-plan.png' })
      }
    } catch (e) { out.push(name + ' FALLÓ: ' + e.message.split('\n')[0]); await page.screenshot({ path: OUT + `pay-err-${name}.png`, fullPage: true }) }
    if (errs.length) out.push(name + ' errores: ' + errs.join(' | '))
    await ctx.close()
  }
  console.log(out.join('\n')); await browser.close()
})()
