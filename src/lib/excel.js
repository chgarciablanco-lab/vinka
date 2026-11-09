// Lectura y escritura de planillas sin la librería xlsx (que tenía una vulnerabilidad sin parche).
// Ambas librerías se cargan solo cuando se usan, para no agrandar la carga inicial de la app.

/** Convierte una celda a texto (fechas en formato dd-mm-aaaa) */
const cellText = (v) => {
  if (v == null) return ''
  if (v instanceof Date) return isNaN(v) ? '' : `${String(v.getUTCDate()).padStart(2, '0')}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${v.getUTCFullYear()}`
  return String(v).trim()
}

/** CSV con comillas, separador , o ; (Excel en español usa ;) */
function parseCsv(text) {
  text = text.replace(/^﻿/, '')
  const first = text.split(/\r?\n/, 1)[0] || ''
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ','
  const rows = []
  let row = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false }
      else cur += c
    } else if (c === '"') q = true
    else if (c === sep) { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cur); rows.push(row); row = []; cur = ''
    } else cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows
}

/** Devuelve { headers, rows } con rows como objetos { encabezado: texto } */
export async function readTable(file) {
  const name = (file.name || '').toLowerCase()
  let matrix
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    matrix = parseCsv(await file.text())
  } else if (name.endsWith('.xls')) {
    throw new Error('El formato .xls antiguo no es compatible. Ábrelo en Excel y guárdalo como .xlsx o .csv.')
  } else {
    const { readSheet } = await import('read-excel-file/universal')
    matrix = await readSheet(file)
  }
  matrix = (matrix || []).map((r) => r.map(cellText))
  while (matrix.length && matrix[0].every((c) => !c)) matrix.shift()
  if (!matrix.length) return { headers: [], rows: [] }
  const headers = matrix[0].map((h, i) => h || `Columna ${i + 1}`)
  const rows = matrix.slice(1)
    .filter((r) => r.some((c) => c))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])))
  return { headers, rows }
}

/** sheets: [{ name, rows: [objeto, ...] }] → descarga un .xlsx */
export async function downloadXlsx(filename, sheets) {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const data = sheets.map((s) => {
    const headers = [...new Set(s.rows.flatMap((r) => Object.keys(r)))]
    const matrix = [
      headers.map((h) => ({ value: h, fontWeight: 'bold' })),
      ...s.rows.map((r) => headers.map((h) => (r[h] === '' || r[h] == null ? null : r[h]))),
    ]
    return { data: matrix, sheet: s.name.slice(0, 31), columns: headers.map(() => ({ width: 18 })), dateFormat: 'dd/mm/yyyy' }
  })
  await writeExcelFile(data).toFile(filename)
}
