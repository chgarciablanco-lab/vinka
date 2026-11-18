// Carga en conexión lenta simulada (perfil "3G rápido": 1,6 Mbps, 150 ms) sobre la compilación de producción local.
const { OUT, BASE } = require('./_config.cjs')
const { chromium, devices } = require('playwright')
;(async () => {
  const b = await chromium.launch(); const out = []
  for (const [name, net] of [['wifi', null], ['3G', { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 }]]) {
    const ctx = await b.newContext(devices['iPhone 13']); await ctx.addInitScript(() => localStorage.setItem('vinka-splash', '1'))
    await ctx.route(/supabase\.co|fonts\.(googleapis|gstatic)/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
    const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p)
    if (net) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, ...net }); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }) }
    let bytes = 0; p.on('response', async (r) => { try { bytes += (await r.body()).length } catch {} })
    const t0 = Date.now(); await p.goto(BASE + '/', { waitUntil: 'load' })
    await p.getByText('Tu próximo').first().waitFor({ timeout: 60000 }); const tText = Date.now() - t0
    await p.waitForLoadState('networkidle'); const tIdle = Date.now() - t0
    const lcp = await p.evaluate(() => new Promise((res) => new PerformanceObserver((l) => { const e = l.getEntries(); res(Math.round(e[e.length - 1].startTime)) }).observe({ type: 'largest-contentful-paint', buffered: true })))
    out.push(`${name}: texto visible ${tText} ms · LCP ${lcp} ms · todo cargado ${tIdle} ms · ${Math.round(bytes / 1024)} KB transferidos (sin comprimir)`)
    await ctx.close()
  }
  console.log(out.join('\n')); await b.close()
})()
