import { DEFAULT_CLOSING, defaultIntro, logoUrl, offerRows } from '../components/OfferLetter'

const longDate = (d) => (d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
const safe = (s) => String(s || '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ•–—"'€]/g, '')

// Convierte el logo (png, jpg, webp o svg) en PNG para incrustarlo en el PDF
async function loadLogo(path) {
  const url = logoUrl(path)
  if (!url) return null
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = ko; i.src = url })
    const scale = Math.min(1, 600 / img.naturalWidth)
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.naturalWidth * scale)); c.height = Math.max(1, Math.round(img.naturalHeight * scale))
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    return { data: c.toDataURL('image/png'), w: c.width, h: c.height }
  } catch { return null }
}

/** Genera la carta oferta como archivo PDF (A4, texto real, con logo). Devuelve { blob, name }. */
export async function buildOfferPdf({ offer: o, company: c, candidate }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const L = o.letter || {}
  const W = 210, M = 20, CW = W - 2 * M, BOTTOM = 297 - 18
  const ink = [31, 26, 34], soft = [107, 95, 110], dark = [48, 37, 56]
  let y = 18
  const need = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = 20 } }
  const para = (text, { size = 10.5, style = 'normal', color = ink, gap = 3.2, lh = 1.4 } = {}) => {
    doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color)
    for (const block of safe(text).split(/\n{2,}/)) {
      const lines = doc.splitTextToSize(block, CW)
      const step = size * 0.3528 * lh
      for (const ln of lines) { need(step); doc.text(ln, M, y + step * 0.75); y += step }
      y += gap
    }
  }

  // Membrete
  const logo = await loadLogo(c?.logo_path)
  if (logo) {
    const ratio = logo.w / logo.h, w = Math.min(60, 14 * ratio)
    doc.addImage(logo.data, 'PNG', M, y, w, w / ratio)
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...dark); doc.text(safe(c?.display_name), M, y + 8)
  }
  const place = L.city || c?.comuna || ''
  const right = [c?.legal_name || c?.display_name, c?.rut ? `RUT ${c.rut}` : '', `${place}${place ? ', ' : ''}${longDate(o.created_at || new Date().toISOString())}`].filter(Boolean)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...soft)
  right.forEach((t, i) => doc.text(safe(t), W - M, y + 3.5 + i * 4.2, { align: 'right' }))
  y += 19
  doc.setDrawColor(...dark); doc.setLineWidth(0.6); doc.line(M, y, W - M, y); y += 8

  // Título
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(184, 95, 0); doc.setCharSpace(0.8); doc.text('CARTA OFERTA', M, y); doc.setCharSpace(0); y += 7
  para(o.position || 'Cargo', { size: 18, style: 'bold', color: dark, gap: 3, lh: 1.2 })

  // Cuerpo
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...ink)
  const greet = 'Estimado/a '; const gw = doc.getTextWidth(greet); doc.text(greet, M, y + 3.5); doc.setFont('helvetica', 'bold'); doc.text(safe(`${candidate?.name || ''}:`), M + gw, y + 3.5); y += 8
  para(L.intro || defaultIntro(o.position, c?.display_name))

  // Condiciones
  const rows = offerRows(o), kw = CW * 0.4
  y += 1
  doc.setFontSize(10)
  rows.forEach(([k, v], i) => {
    doc.setFont('helvetica', 'bold')
    const vl = doc.splitTextToSize(safe(v), CW - kw - 6)
    const h = Math.max(8, vl.length * 4.6 + 3.4)
    need(h)
    doc.setFillColor(251, 247, 249); doc.rect(M, y, kw, h, 'F')
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...soft); doc.text(safe(k), M + 3, y + 5.2)
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...ink); doc.text(vl, M + kw + 3, y + 5.2, { lineHeightFactor: 1.3 })
    if (i < rows.length - 1) { doc.setDrawColor(239, 230, 236); doc.setLineWidth(0.2); doc.line(M, y + h, W - M, y + h) }
    y += h
  })
  y += 6
  if (o.benefits) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5)
    const bl = doc.splitTextToSize(safe(o.benefits), CW - 8)
    const h = 10 + bl.length * 5.2
    need(h)
    doc.setFillColor(251, 247, 249); doc.roundedRect(M, y, CW, h, 2, 2, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...ink); doc.text('Beneficios', M + 4, y + 6)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.text(bl, M + 4, y + 11.5, { lineHeightFactor: 1.4 })
    y += h + 5
  }
  if (o.message) para(o.message)
  para(L.closing || DEFAULT_CLOSING)
  if (o.expires_on) para(`Te pedimos responder antes del ${longDate(o.expires_on)}.`, { style: 'bold' })

  // Firma (no se corta entre páginas)
  need(34)
  y += 2; para('Atentamente,', { gap: 0 }); y += 12
  doc.setDrawColor(...dark); doc.setLineWidth(0.3); doc.line(M, y, M + 62, y); y += 5
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...ink); doc.text(safe(L.signer_name || ''), M, y); y += 4.8
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(74, 63, 78)
  ;[L.signer_title, c?.legal_name || c?.display_name].filter(Boolean).forEach((t) => { doc.text(safe(t), M, y); y += 4.4 })

  // Pie en cada página
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setDrawColor(239, 230, 236); doc.setLineWidth(0.2); doc.line(M, 297 - 13, W - M, 297 - 13)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(138, 128, 144)
    doc.text('Carta emitida a través de VINKA. No reemplaza al contrato de trabajo. Una oferta real nunca te pide dinero.', M, 297 - 9)
    if (pages > 1) doc.text(`${p} / ${pages}`, W - M, 297 - 9, { align: 'right' })
  }
  doc.setProperties({ title: `Carta oferta · ${safe(o.position)}`, author: safe(c?.display_name), creator: 'VINKA' })
  const name = `Carta oferta - ${safe(o.position)} - ${safe(candidate?.name || c?.display_name)}.pdf`.replace(/\//g, '-').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w .-]/g, '').replace(/\s+/g, ' ')
  return { blob: doc.output('blob'), name }
}

/** Descarga el PDF; en celulares abre el menú para guardarlo en Archivos o adjuntarlo a un correo o WhatsApp. */
export async function downloadOfferPdf(data) {
  const { blob, name } = await buildOfferPdf(data)
  const file = typeof File !== 'undefined' ? new File([blob], name, { type: 'application/pdf' }) : null
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))
  if (mobile && file && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name.replace(/\.pdf$/, '') }); return 'shared' } catch (e) { if (e?.name === 'AbortError') return 'cancel' }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none'; document.body.appendChild(a); a.click()
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url) }, 60000)
  return 'downloaded'
}
