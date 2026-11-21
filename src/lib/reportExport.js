// Exporta el informe psicolaboral en Word (.docx) y PDF con el formato del informe de la consultora:
// logo de la empresa en el encabezado de cada página, portada, 1) Antecedentes, 2) Fortalezas, oportunidades y referencias,
// 3) Motivación, 4) Recomendación, renta, disponibilidad y anexo de tests. Hoja A4, letra Calibri 12 (Carlito en el PDF), texto justificado.

const MONTHS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']
export const VEREDICTOS = { recomendado: 'Se recomienda', con_observaciones: 'Se recomienda con observaciones', no_recomendado: 'No se recomienda' }

const paras = (t) => String(t || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
// «**texto**» → tramos en negrita
const runs = (t) => String(t || '').split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((s) => (s.startsWith('**') && s.endsWith('**') ? { t: s.slice(2, -2), b: true } : { t: s, b: false }))
const fileName = (r, ext) => `Informe Psicolaboral - ${r.person}`.replace(/[\\/:*?"<>|]/g, '').slice(0, 120) + '.' + ext
const AI_NOTE = (meta) => `Informe redactado con apoyo de inteligencia artificial y revisado${meta.signer ? ` por ${meta.signer}` : ''}. Uso confidencial para el proceso de selección.`
const refLead = (r, i) => `Referencia ${i + 1} – ${[r.nombre, r.cargo].filter(Boolean).join(', ')}${r.relacion ? ` (${r.relacion})` : ''}: `

/** meta: { person, title, client, company, logoPath, month, signer } — logo ({ data, w, h }) se agrega al exportar */
export function reportMeta({ person, title, client, company, logoPath, date, signer }) {
  const d = date ? new Date(date) : new Date()
  return { person, title, client, company, logoPath, month: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, signer }
}

export const AJUSTES = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo' }
const cmpName = (meta, ext) => `Informe Comparativo - ${meta.title}`.replace(/[\\/:*?"<>|]/g, '').slice(0, 120) + '.' + ext
const dataUrlBytes = (u) => Uint8Array.from(atob(String(u).split(',')[1] || ''), (c) => c.charCodeAt(0))

// Herramientas comunes del Word (A4, Calibri 12, logo en el encabezado de cada hoja)
async function docxKit(meta) {
  const D = await import('docx')
  const { Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, ShadingType } = D
  const FONT = 'Calibri', SIZE = 24
  const T = (text, o = {}) => new TextRun({ text, font: FONT, size: SIZE, ...o })
  const P = (children, opts = {}) => new Paragraph({ spacing: { after: 200, line: 276 }, ...opts, children })
  const J = (children, opts = {}) => P(children, { alignment: AlignmentType.JUSTIFIED, ...opts })
  const rich = (t, base = {}) => runs(t).map((r) => T(r.t, { ...base, bold: base.bold || r.b }))
  const H = (text, first = false) => P([T(text, { bold: true })], { pageBreakBefore: first, spacing: { before: first ? 0 : 240, after: 240 } })
  const SUB = (text) => P([T(text, { bold: true, underline: {} })], { spacing: { before: 200, after: 200 } })
  const bullet = (title, text) => new Paragraph({ numbering: { reference: 'vinetas', level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { after: 160, line: 276 },
    children: [...(title ? [T(`${title}: `, { bold: true })] : []), ...rich(text)] })
  const C = (text, o = {}) => P([T(text, { bold: true, size: 32, ...o })], { alignment: AlignmentType.CENTER, spacing: { after: 80 } })
  const cover = (title, lines) => [new Paragraph({ spacing: { before: 3600 }, children: [] }), C(title, { underline: {} }), new Paragraph({ spacing: { after: 160 }, children: [] }),
    ...lines.filter(Boolean).map((l) => C(l)), new Paragraph({ spacing: { after: 240 }, children: [] }), C(meta.month)]
  const table = (cols, rows) => {
    const total = 9026
    const cell = (t, i, head) => new TableCell({ width: { size: Math.round(cols[i].w * total), type: WidthType.DXA },
      shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: 'EDE7F0' } : undefined, margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: [T(String(t || ''), { size: 21, bold: head })] })] })
    return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: cols.map((c) => Math.round(c.w * total)),
      rows: [new TableRow({ tableHeader: true, children: cols.map((c, i) => cell(c.label, i, true)) }), ...rows.map((r) => new TableRow({ children: r.map((v, i) => cell(v, i, false)) }))] })
  }
  const note = () => P([T(AI_NOTE(meta), { italics: true, size: 16, color: '6B5F6E' })], { spacing: { before: 400 } })
  const pack = async (kids, title) => {
    const { Document, Packer, LevelFormat, Header, Footer, ImageRun, PageNumber } = D
    let headerKids = []
    if (meta.logo?.data) {
      const h = 56, w = Math.round(Math.min(220, h * (meta.logo.w / meta.logo.h)))
      headerKids = [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: dataUrlBytes(meta.logo.data), transformation: { width: w, height: Math.round(w / (meta.logo.w / meta.logo.h)) } })] })]
    } else if (meta.company) {
      headerKids = [new Paragraph({ alignment: AlignmentType.CENTER, children: [T(meta.company, { size: 18, color: '6B5F6E', bold: true })] })]
    }
    const doc = new Document({
      creator: meta.company || 'VINKA', title,
      styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
      numbering: { config: [{ reference: 'vinetas', levels: [{ level: 0, format: LevelFormat.BULLET, text: '●', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } }, run: { size: 16 } } }] }] },
      sections: [{
        properties: { titlePage: true, page: { size: { width: 11906, height: 16838 }, margin: { top: 1900, bottom: 1440, left: 1440, right: 1440, header: 708, footer: 708 } } },
        headers: { default: new Header({ children: headerKids }), first: new Header({ children: headerKids }) },
        footers: { first: new Footer({ children: [] }), default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '6B5F6E' })] })] }) },
        children: kids,
      }],
    })
    return Packer.toBlob(doc)
  }
  return { T, P, J, rich, H, SUB, bullet, cover, table, note, pack }
}

/** Word editable */
export async function buildReportDocx(s, meta) {
  const { T, P, J, rich, H, SUB, bullet, cover, note, pack } = await docxKit(meta)
  const kids = [
    ...cover('EVALUACIÓN PSICOLABORAL', [`Candidato: ${meta.person}`, `Cargo: ${meta.title}`, meta.client ? `Empresa: ${meta.client}` : null]),
    H('1) Antecedentes y Experiencia Profesional:', true),
    ...paras(s.antecedentes).map((p) => J(rich(p))),
    H('2) Fortalezas, Oportunidades de Mejora y Referencias:', true),
    SUB('Fortalezas:'),
    ...(s.fortalezas || []).map((x) => bullet(x.titulo, x.texto)),
    SUB('Oportunidades de Mejora:'),
    ...(s.oportunidades || []).map((x) => bullet(x.titulo, x.texto)),
    SUB('Referencias Laborales:'),
    ...((s.referencias || []).length ? s.referencias.map((r, i) => J([T(refLead(r, i), { bold: true }), ...rich(r.texto)]))
      : [P([T('No se entregaron referencias laborales.')])]),
    H('3) Motivación de Cambio:', true),
    ...paras(s.motivacion).map((p) => J(rich(p))),
    H('4) Recomendación:'),
    ...paras(s.recomendacion).map((p) => J(rich(p))),
    ...(s.sintesis ? [J([T(s.sintesis.replace(/\*\*/g, ''), { bold: true })])] : []),
    J([T('Expectativa de Renta: ', { bold: true }), T(s.renta || 'No abordada en la entrevista.')], { spacing: { before: 120, after: 200 } }),
    J([T('Disponibilidad: ', { bold: true }), T(s.disponibilidad || 'No abordada en la entrevista.')]),
    ...((s.tests || []).length ? [H('ANEXO TEST:', true), ...s.tests.map((t, i) => J([T(`${i + 1}. ${t.nombre}: `, { bold: true }), ...rich(t.resumen)])),
      P([T('Los reportes completos de los tests se adjuntan por separado.', { italics: true, size: 20, color: '6B5F6E' })])] : []),
    note(),
  ]
  return { blob: await pack(kids, `Informe psicolaboral - ${meta.person}`), name: fileName(meta, 'docx') }
}

/** Word del informe comparativo */
export async function buildComparisonDocx(c, meta) {
  const { P, J, T, rich, H, bullet, cover, table, pack } = await docxKit(meta)
  const people = c.candidatos || []
  const kids = [
    ...cover('INFORME COMPARATIVO', [`Cargo: ${meta.title}`, meta.client ? `Empresa: ${meta.client}` : null, `${people.length} personas evaluadas`]),
    H('1) Resumen:', true), ...paras(c.resumen).map((p) => J(rich(p))),
    H('2) Cuadro comparativo:'),
    table([{ label: 'Candidato', w: 0.34 }, { label: 'Ajuste al cargo', w: 0.2 }, { label: 'Recomendación del informe', w: 0.46 }],
      people.map((p, i) => [`${i + 1}. ${p.nombre}`, AJUSTES[p.ajuste] || '—', VEREDICTOS[p.veredicto] || '—'])),
    H('3) Detalle por persona:', true),
    ...people.flatMap((p, i) => [P([T(`${i + 1}. ${p.nombre}`, { bold: true }), T(` — ajuste ${String(AJUSTES[p.ajuste] || '—').toLowerCase()}`)], { spacing: { before: 160, after: 120 } }),
      bullet('Fortalezas', p.fortalezas), bullet('Aspectos a considerar', p.riesgos)]),
    H('4) Conclusión:'), ...paras(c.conclusion).map((p) => J(rich(p))),
    P([T(AI_NOTE(meta).replace('Informe redactado', 'Comparativo redactado'), { italics: true, size: 16, color: '6B5F6E' })], { spacing: { before: 400 } }),
  ]
  return { blob: await pack(kids, `Informe comparativo - ${meta.title}`), name: cmpName(meta, 'docx') }
}

// Carlito: misma medida que Calibri (licencia OFL, /public/fonts). Si no carga, se usa Helvetica.
let fontCache = null
async function loadFonts() {
  if (fontCache) return fontCache
  const get = async (f) => {
    const r = await fetch(`/fonts/${f}`); if (!r.ok) throw new Error('font')
    const u8 = new Uint8Array(await r.arrayBuffer()); let s = ''
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
    return btoa(s)
  }
  try { fontCache = { regular: await get('carlito-regular.ttf'), bold: await get('carlito-bold.ttf') } } catch { fontCache = null }
  return fontCache
}

// Herramientas comunes del PDF (A4, Carlito/Calibri 12, logo en cada hoja, texto justificado)
async function pdfKit(meta, fonts) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const f = fonts === undefined ? await loadFonts() : fonts
  let FAM = 'helvetica'
  if (f) {
    doc.addFileToVFS('Carlito-Regular.ttf', f.regular); doc.addFont('Carlito-Regular.ttf', 'Carlito', 'normal')
    doc.addFileToVFS('Carlito-Bold.ttf', f.bold); doc.addFont('Carlito-Bold.ttf', 'Carlito', 'bold')
    FAM = 'Carlito'
  }
  const W = 210, H = 297, M = 25.4, CW = W - 2 * M, TOP = 38, BOTTOM = H - 22
  const ink = [0, 0, 0], soft = [107, 95, 110]
  const SIZE = f ? 12 : 11
  const safe = (t) => {
    let x = String(t || '').replace(/…/g, '...')
    if (!f) x = x.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-')
    return x.replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ•●–—“”‘’]/g, '')
  }
  const k = { doc, W, H, M, CW, SIZE, y: TOP }
  k.newPage = () => { doc.addPage(); k.y = TOP }
  k.need = (h) => { if (k.y + h > BOTTOM) k.newPage() }
  // Párrafo justificado con tramos en negrita y sangría opcional
  k.rich = (text, { size = SIZE, indent = 0, gap = 3.5, lead = null, justify = true, underline = false, color = ink } = {}) => {
    const step = size * 0.3528 * 1.32
    const words = []
    if (lead) for (const w of safe(lead).split(/(\s+)/)) if (w) words.push({ w, b: true })
    for (const r of runs(text)) for (const w of safe(r.t).split(/(\s+)/)) if (w) words.push({ w, b: r.b })
    doc.setFontSize(size); doc.setTextColor(...color)
    const width = (it) => { doc.setFont(FAM, it.b ? 'bold' : 'normal'); return doc.getTextWidth(/^\s+$/.test(it.w) ? ' ' : it.w) }
    const lines = []; let line = [], x = 0
    for (const it of words) {
      const sp = /^\s+$/.test(it.w)
      if (sp) { if (line.length) { line.push({ ...it, w: ' ' }); x += width(it) } continue }
      const wd = width(it)
      if (x + wd > CW - indent && line.length) { while (line.length && line.at(-1).w === ' ') line.pop(); lines.push(line); line = []; x = 0 }
      line.push(it); x += wd
    }
    if (line.length) lines.push(line)
    lines.forEach((ln, li) => {
      k.need(step)
      const natural = ln.reduce((acc, it) => acc + width(it), 0)
      const spaces = ln.filter((it) => it.w === ' ').length
      const extra = justify && li < lines.length - 1 && spaces ? (CW - indent - natural) / spaces : 0
      let cx = M + indent
      doc.setTextColor(...color)
      for (const it of ln) {
        doc.setFont(FAM, it.b ? 'bold' : 'normal')
        if (it.w !== ' ') doc.text(it.w, cx, k.y + step * 0.78)
        cx += width(it) + (it.w === ' ' ? extra : 0)
      }
      if (underline) { doc.setDrawColor(...ink); doc.setLineWidth(0.25); doc.line(M + indent, k.y + step * 0.9, M + indent + natural, k.y + step * 0.9) }
      k.y += step
    })
    k.y += gap
  }
  k.head = (t, first = false) => { if (first) k.newPage(); else { k.need(18); k.y += 2 } k.rich(`**${t}**`, { justify: false, gap: 4 }) }
  k.sub = (t) => { k.need(16); k.y += 1.5; k.rich(`**${t}**`, { justify: false, underline: true, gap: 3.5 }) }
  k.bullet = (title, text) => {
    k.need(8)
    doc.setFillColor(...ink)
    doc.circle(M + 8.5, k.y + SIZE * 0.3528 * 0.62, 0.85, 'F')
    k.rich(text, { indent: 12.7, lead: title ? `${title}: ` : null, gap: 3 })
  }
  k.center = (t, size = 16, underline = false) => {
    doc.setFont(FAM, 'bold'); doc.setFontSize(size); doc.setTextColor(...ink)
    const tx = safe(t); doc.text(tx, W / 2, k.y, { align: 'center' })
    if (underline) { const w = doc.getTextWidth(tx); doc.setLineWidth(0.35); doc.line(W / 2 - w / 2, k.y + 1.3, W / 2 + w / 2, k.y + 1.3) }
    k.y += size * 0.3528 * 1.35
  }
  k.cover = (title, lines) => {
    k.y = H / 2 - 30
    k.center(title, 17, true); k.y += 6
    for (const l of lines.filter(Boolean)) k.center(l)
    k.y += 8; k.center(meta.month)
  }
  // Tabla simple con encabezado y bordes finos
  k.table = (cols, rows) => {
    const pad = 1.8, size = SIZE - 1.5, step = size * 0.3528 * 1.25
    const widths = cols.map((c) => c.w * CW)
    const cell = (t, w, b) => { doc.setFont(FAM, b ? 'bold' : 'normal'); doc.setFontSize(size); return doc.splitTextToSize(safe(t), w - 2 * pad) }
    const draw = (vals, b, fill) => {
      const parts = vals.map((v, i) => cell(v, widths[i], b))
      const h = Math.max(...parts.map((p) => p.length)) * step + 2 * pad
      k.need(h)
      let x = M
      parts.forEach((p, i) => {
        if (fill) { doc.setFillColor(...fill); doc.rect(x, k.y, widths[i], h, 'F') }
        doc.setDrawColor(190, 180, 192); doc.setLineWidth(0.2); doc.rect(x, k.y, widths[i], h)
        doc.setFont(FAM, b ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...ink)
        p.forEach((ln, j) => doc.text(ln, x + pad, k.y + pad + step * (j + 0.78)))
        x += widths[i]
      })
      k.y += h
    }
    draw(cols.map((c) => c.label), true, [237, 231, 240])
    for (const r of rows) draw(r, false, null)
    k.y += 5
  }
  k.note = (t) => { k.y += 4; k.need(10); doc.setFont(FAM, 'normal'); doc.setFontSize(8); doc.setTextColor(...soft); doc.text(doc.splitTextToSize(safe(t), CW), M, k.y + 3) }
  // Encabezado (logo o nombre de la empresa) y número de página en todas las hojas
  k.finish = () => {
    const pages = doc.getNumberOfPages()
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i)
      if (meta.logo?.data) {
        const ratio = meta.logo.w / meta.logo.h, h = 15, w = Math.min(60, h * ratio)
        doc.addImage(meta.logo.data, 'PNG', W / 2 - w / 2, 10, w, w / ratio)
      } else if (meta.company) {
        doc.setFont(FAM, 'bold'); doc.setFontSize(10); doc.setTextColor(...soft); doc.text(safe(meta.company), W / 2, 17, { align: 'center' })
      }
      if (i > 1) { doc.setFont(FAM, 'normal'); doc.setFontSize(8.5); doc.setTextColor(...soft); doc.text(`${i - 1} / ${pages - 1}`, W - M, H - 12, { align: 'right' }) }
    }
    return doc.output('arraybuffer')
  }
  return k
}

// Agrega al final las páginas de los reportes de test (PDF) como anexo
async function appendPdfs(bytes, extra) {
  if (!extra?.length) return bytes
  const { PDFDocument } = await import('pdf-lib')
  const out = await PDFDocument.load(bytes)
  for (const x of extra) {
    try {
      const src = await PDFDocument.load(x, { ignoreEncryption: true })
      const pages = await out.copyPages(src, src.getPageIndices())
      pages.forEach((pg) => out.addPage(pg))
    } catch { /* un PDF dañado no impide el informe */ }
  }
  return out.save()
}

/** PDF del informe (A4). annex: contenido (ArrayBuffer/Uint8Array) de los reportes de test en PDF, que se agregan al final */
export async function buildReportPdf(s, meta, { fonts, annex = [] } = {}) {
  const k = await pdfKit(meta, fonts)
  k.cover('EVALUACIÓN PSICOLABORAL', [`Candidato: ${meta.person}`, `Cargo: ${meta.title}`, meta.client ? `Empresa: ${meta.client}` : null])
  k.head('1) Antecedentes y Experiencia Profesional:', true)
  for (const p of paras(s.antecedentes)) k.rich(p)
  k.head('2) Fortalezas, Oportunidades de Mejora y Referencias:', true)
  k.sub('Fortalezas:'); for (const x of s.fortalezas || []) k.bullet(x.titulo, x.texto)
  k.sub('Oportunidades de Mejora:'); for (const x of s.oportunidades || []) k.bullet(x.titulo, x.texto)
  k.sub('Referencias Laborales:')
  if ((s.referencias || []).length) s.referencias.forEach((r, i) => k.rich(r.texto, { lead: refLead(r, i) }))
  else k.rich('No se entregaron referencias laborales.')
  k.head('3) Motivación de Cambio:', true); for (const p of paras(s.motivacion)) k.rich(p)
  k.y += 4; k.head('4) Recomendación:'); for (const p of paras(s.recomendacion)) k.rich(p)
  if (s.sintesis) k.rich(`**${s.sintesis.replace(/\*\*/g, '')}**`)
  k.rich(s.renta || 'No abordada en la entrevista.', { lead: 'Expectativa de Renta:  ' })
  k.rich(s.disponibilidad || 'No abordada en la entrevista.', { lead: 'Disponibilidad:  ' })
  if ((s.tests || []).length || annex.length) {
    k.head('ANEXO TEST:', true); (s.tests || []).forEach((t, i) => k.rich(t.resumen, { lead: `${i + 1}. ${t.nombre}: ` }))
    k.rich(annex.length ? 'A continuación se adjuntan los reportes completos de los tests.' : 'Los reportes completos de los tests se adjuntan por separado.', { size: 9.5, justify: false })
  }
  k.note(AI_NOTE(meta))
  const bytes = await appendPdfs(k.finish(), annex)
  return { blob: new Blob([bytes], { type: 'application/pdf' }), name: fileName(meta, 'pdf') }
}


/** PDF del informe comparativo */
export async function buildComparisonPdf(c, meta, { fonts } = {}) {
  const k = await pdfKit(meta, fonts)
  const people = c.candidatos || []
  k.cover('INFORME COMPARATIVO', [`Cargo: ${meta.title}`, meta.client ? `Empresa: ${meta.client}` : null, `${people.length} personas evaluadas`])
  k.head('1) Resumen:', true); for (const p of paras(c.resumen)) k.rich(p)
  k.y += 2; k.head('2) Cuadro comparativo:')
  k.table([{ label: 'Candidato', w: 0.34 }, { label: 'Ajuste al cargo', w: 0.2 }, { label: 'Recomendación del informe', w: 0.46 }],
    people.map((p, i) => [`${i + 1}. ${p.nombre}`, AJUSTES[p.ajuste] || '—', VEREDICTOS[p.veredicto] || '—']))
  k.head('3) Detalle por persona:', true)
  people.forEach((p, i) => {
    k.need(30); k.rich(`**${i + 1}. ${p.nombre}** — ajuste ${String(AJUSTES[p.ajuste] || '—').toLowerCase()}`, { justify: false, gap: 2 })
    k.bullet('Fortalezas', p.fortalezas); k.bullet('Aspectos a considerar', p.riesgos); k.y += 2
  })
  k.y += 2; k.head('4) Conclusión:'); for (const p of paras(c.conclusion)) k.rich(p)
  k.note(AI_NOTE(meta).replace('Informe redactado', 'Comparativo redactado'))
  return { blob: new Blob([k.finish()], { type: 'application/pdf' }), name: cmpName(meta, 'pdf') }
}

/** Descarga el archivo; en celulares abre el menú para guardarlo en Archivos o enviarlo por correo o WhatsApp */
export async function download({ blob, name }) {
  const type = name.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  const file = typeof File !== 'undefined' ? new File([blob], name, { type }) : null
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))
  if (mobile && file && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name.replace(/\.(pdf|docx)$/, '') }); return } catch (e) { if (e?.name === 'AbortError') return }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none'; document.body.appendChild(a); a.click()
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url) }, 60000)
}
