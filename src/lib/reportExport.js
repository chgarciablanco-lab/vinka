// Exporta el informe psicolaboral en Word (.docx) y PDF con el formato del informe de la consultora:
// encabezado, 1) Antecedentes, 2) Fortalezas, oportunidades y referencias, 3) Motivación, 4) Recomendación, renta, disponibilidad y anexo de tests.

const MONTHS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']
export const VEREDICTOS = { recomendado: 'Se recomienda', con_observaciones: 'Se recomienda con observaciones', no_recomendado: 'No se recomienda' }

const paras = (t) => String(t || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
// «**texto**» → tramos en negrita
const runs = (t) => String(t || '').split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((s) => (s.startsWith('**') && s.endsWith('**') ? { t: s.slice(2, -2), b: true } : { t: s, b: false }))
const fileName = (r, ext) => `Informe Psicolaboral - ${r.person}`.replace(/[\\/:*?"<>|]/g, '').slice(0, 120) + '.' + ext

export function reportMeta({ person, title, client, date, signer }) {
  const d = date ? new Date(date) : new Date()
  return { person, title, client, month: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, signer }
}

/** Word editable */
export async function buildReportDocx(s, meta) {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, LevelFormat } = await import('docx')
  const P = (children, opts = {}) => new Paragraph({ spacing: { after: 160, line: 300 }, ...opts, children })
  const T = (text, o = {}) => new TextRun({ text, font: 'Arial', size: 21, ...o })
  const rich = (t, base = {}) => runs(t).map((r) => T(r.t, { ...base, bold: base.bold || r.b }))
  const H = (text) => P([T(text, { bold: true, size: 22 })], { spacing: { before: 280, after: 160 } })
  const bullet = (title, text) => new Paragraph({ numbering: { reference: 'vinetas', level: 0 }, spacing: { after: 120, line: 300 },
    children: [...(title ? [T(`${title}: `, { bold: true })] : []), ...rich(text)] })
  const kids = [
    P([T('EVALUACIÓN PSICOLABORAL', { bold: true, size: 26 })], { alignment: AlignmentType.CENTER }),
    P([T(`Candidato: ${meta.person}`, { bold: true })], { alignment: AlignmentType.CENTER, spacing: { after: 60 } }),
    P([T(`Cargo: ${meta.title}`, { bold: true })], { alignment: AlignmentType.CENTER, spacing: { after: 60 } }),
    ...(meta.client ? [P([T(`Empresa: ${meta.client}`, { bold: true })], { alignment: AlignmentType.CENTER, spacing: { after: 60 } })] : []),
    P([T(meta.month, { bold: true })], { alignment: AlignmentType.CENTER, spacing: { after: 320 } }),
    H('1) Antecedentes y Experiencia Profesional:'),
    ...paras(s.antecedentes).map((p) => P(rich(p), { alignment: AlignmentType.JUSTIFIED })),
    H('2) Fortalezas, Oportunidades de Mejora y Referencias:'),
    P([T('Fortalezas:', { bold: true })]),
    ...(s.fortalezas || []).map((x) => bullet(x.titulo, x.texto)),
    P([T('Oportunidades de Mejora:', { bold: true })], { spacing: { before: 200, after: 160 } }),
    ...(s.oportunidades || []).map((x) => bullet(x.titulo, x.texto)),
    P([T('Referencias Laborales:', { bold: true })], { spacing: { before: 200, after: 160 } }),
    ...((s.referencias || []).length ? s.referencias.map((r, i) => P([T(`Referencia ${i + 1} – ${[r.nombre, r.cargo].filter(Boolean).join(', ')}${r.relacion ? ` (${r.relacion})` : ''}: `, { bold: true }), ...rich(r.texto)], { alignment: AlignmentType.JUSTIFIED }))
      : [P([T('No se entregaron referencias laborales.')])]),
    H('3) Motivación de Cambio:'),
    ...paras(s.motivacion).map((p) => P(rich(p), { alignment: AlignmentType.JUSTIFIED })),
    H('4) Recomendación:'),
    ...paras(s.recomendacion).map((p) => P(rich(p), { alignment: AlignmentType.JUSTIFIED })),
    ...(s.sintesis ? [P([T(s.sintesis.replace(/\*\*/g, ''), { bold: true })], { alignment: AlignmentType.JUSTIFIED })] : []),
    P([T('Expectativa de Renta: ', { bold: true }), T(s.renta || 'No abordada en la entrevista.')], { spacing: { before: 200, after: 120 } }),
    P([T('Disponibilidad: ', { bold: true }), T(s.disponibilidad || 'No abordada en la entrevista.')]),
    ...((s.tests || []).length ? [H('ANEXO TEST:'), ...s.tests.map((t, i) => P([T(`${i + 1}. ${t.nombre}: `, { bold: true }), ...rich(t.resumen)], { alignment: AlignmentType.JUSTIFIED })),
      P([T('Los reportes completos de los tests se adjuntan por separado.', { italics: true, size: 18, color: '6B5F6E' })])] : []),
    P([T(`Informe redactado con apoyo de inteligencia artificial y revisado${meta.signer ? ` por ${meta.signer}` : ''}. Uso confidencial para el proceso de selección.`, { italics: true, size: 16, color: '6B5F6E' })], { spacing: { before: 400 } }),
  ]
  const doc = new Document({
    creator: 'VINKA', title: `Informe psicolaboral - ${meta.person}`,
    numbering: { config: [{ reference: 'vinetas', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
    sections: [{ properties: { page: { margin: { top: 1300, bottom: 1300, left: 1400, right: 1400 } } }, children: kids }],
  })
  return { blob: await Packer.toBlob(doc), name: fileName(meta, 'docx') }
}

/** PDF con el mismo contenido (Carta) */
export async function buildReportPdf(s, meta) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const W = 215.9, M = 22, CW = W - 2 * M, BOTTOM = 279.4 - 18
  const ink = [31, 26, 34], soft = [107, 95, 110]
  const safe = (t) => String(t || '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[–—]/g, '-').replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ•]/g, '')
  let y = 22
  const need = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = 20 } }
  // Párrafo con tramos en negrita, justificado a la izquierda y con sangría opcional
  const rich = (text, { size = 10.5, indent = 0, gap = 3, lead = null } = {}) => {
    const step = size * 0.3528 * 1.45
    const words = []
    if (lead) for (const w of safe(lead).split(/(\s+)/)) if (w) words.push({ w, b: true })
    for (const r of runs(text)) for (const w of safe(r.t).split(/(\s+)/)) if (w) words.push({ w, b: r.b })
    let x = M + indent; need(step); let line = []
    const flush = () => { let cx = M + indent; for (const it of line) { doc.setFont('helvetica', it.b ? 'bold' : 'normal'); doc.text(it.w, cx, y + step * 0.75); cx += doc.getTextWidth(it.w) } y += step; line = []; x = M + indent }
    doc.setFontSize(size); doc.setTextColor(...ink)
    for (const it of words) {
      doc.setFont('helvetica', it.b ? 'bold' : 'normal')
      const wd = doc.getTextWidth(it.w)
      if (/^\s+$/.test(it.w)) { if (line.length) { line.push(it); x += wd } continue }
      if (x + wd > M + CW && line.length) { while (line.length && /^\s+$/.test(line.at(-1).w)) line.pop(); flush(); need(step) }
      line.push(it); x += wd
    }
    if (line.length) flush()
    y += gap
  }
  const head = (t) => { need(14); y += 3; doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...ink); doc.text(safe(t), M, y + 4); y += 9 }
  const center = (t, size = 11) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(size); doc.setTextColor(...ink); doc.text(safe(t), W / 2, y + 4, { align: 'center' }); y += size * 0.5 + 1.5 }
  const bullet = (title, text) => { need(6); doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.text('•', M + 2, y + 4); rich(text, { indent: 7, lead: title ? `${title}: ` : null, gap: 2.5 }) }

  center('EVALUACIÓN PSICOLABORAL', 14); y += 2
  center(`Candidato: ${meta.person}`); center(`Cargo: ${meta.title}`); if (meta.client) center(`Empresa: ${meta.client}`); center(meta.month); y += 6
  head('1) Antecedentes y Experiencia Profesional:')
  for (const p of paras(s.antecedentes)) rich(p)
  head('2) Fortalezas, Oportunidades de Mejora y Referencias:')
  rich('**Fortalezas:**'); for (const x of s.fortalezas || []) bullet(x.titulo, x.texto)
  y += 2; rich('**Oportunidades de Mejora:**'); for (const x of s.oportunidades || []) bullet(x.titulo, x.texto)
  y += 2; rich('**Referencias Laborales:**')
  if ((s.referencias || []).length) s.referencias.forEach((r, i) => rich(r.texto, { lead: `Referencia ${i + 1} – ${[r.nombre, r.cargo].filter(Boolean).join(', ')}${r.relacion ? ` (${r.relacion})` : ''}: ` }))
  else rich('No se entregaron referencias laborales.')
  head('3) Motivación de Cambio:'); for (const p of paras(s.motivacion)) rich(p)
  head('4) Recomendación:'); for (const p of paras(s.recomendacion)) rich(p)
  if (s.sintesis) rich(`**${s.sintesis.replace(/\*\*/g, '')}**`)
  y += 2; rich(s.renta || 'No abordada en la entrevista.', { lead: 'Expectativa de Renta: ' }); rich(s.disponibilidad || 'No abordada en la entrevista.', { lead: 'Disponibilidad: ' })
  if ((s.tests || []).length) { head('ANEXO TEST:'); s.tests.forEach((t, i) => rich(t.resumen, { lead: `${i + 1}. ${t.nombre}: ` })); rich('Los reportes completos de los tests se adjuntan por separado.', { size: 9 }) }
  y += 4; doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...soft)
  need(8); doc.text(doc.splitTextToSize(safe(`Informe redactado con apoyo de inteligencia artificial y revisado${meta.signer ? ` por ${meta.signer}` : ''}. Uso confidencial para el proceso de selección.`), CW), M, y + 3)
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...soft); doc.text(`${i} / ${pages}`, W - M, 279.4 - 10, { align: 'right' }) }
  return { blob: doc.output('blob'), name: fileName(meta, 'pdf') }
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
