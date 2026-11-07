// Lectura de planillas (Excel/CSV) exportadas desde otros portales y normalización de datos
import * as XLSX from 'xlsx'

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export async function parseFile(file) {
  if (file.size > 5 * 1024 * 1024) throw new Error('El archivo pesa más de 5 MB. Divide la planilla en partes.')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })
  if (!rows.length) throw new Error('La planilla está vacía o la primera hoja no tiene datos.')
  if (rows.length > 500) throw new Error(`La planilla tiene ${rows.length} filas. El máximo por carga es 500.`)
  const headers = Object.keys(rows[0])
  return { headers, rows }
}

/** Asigna columnas automáticamente comparando encabezados con sinónimos */
export function autoMap(headers, fields) {
  const map = {}
  for (const f of fields) {
    const hit = headers.find((h) => f.synonyms.some((s) => norm(h) === s)) || headers.find((h) => f.synonyms.some((s) => norm(h).includes(s)))
    map[f.key] = hit || ''
  }
  return map
}

export function downloadTemplate(filename, rows) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Datos')
  XLSX.writeFile(wb, filename)
}

/* ---------- normalizadores ---------- */
const nums = (s) => (String(s ?? '').match(/\d[\d.,]*/g) || []).map((x) => parseInt(x.replace(/[.,]/g, ''), 10)).filter((n) => n >= 1000)
export const toModality = (s) => { const v = norm(s); return v.includes('hibri') || v.includes('mixt') || v.includes('parcial') ? 'Híbrida' : v.includes('remot') || v.includes('teletrab') ? 'Remota' : v ? 'Presencial' : '' }
export const toSchedule = (s) => { const v = norm(s); return v.includes('parcial') || v.includes('part') || v.includes('media') ? 'Parcial' : v.includes('turno') ? 'Por turnos' : v ? 'Completa' : '' }
export const toContract = (s) => {
  const v = norm(s)
  if (!v) return ''
  if (v.includes('indefin')) return 'Indefinido'
  if (v.includes('plazo')) return 'Plazo fijo'
  if (v.includes('obra') || v.includes('faena') || v.includes('tempor')) return 'Por obra o faena'
  if (v.includes('honor') || v.includes('boleta')) return 'Honorarios'
  if (v.includes('practic')) return 'Práctica'
  return ''
}
export const toStage = (s) => {
  const v = norm(s)
  if (v.includes('preselec') || v.includes('contact') || v.includes('revis')) return 'contactado'
  if (v.includes('contrat') || v.includes('seleccionad')) return 'contratado'
  if (v.includes('ofert')) return 'oferta'
  if (v.includes('entrev')) return 'entrevista'
  if (v.includes('descart') || v.includes('rechaz') || v.includes('no apto') || v.includes('finaliz')) return 'descartado'
  if (v.includes('contact') || v.includes('revis') || v.includes('preselec')) return 'contactado'
  return 'nuevo'
}
export function toSalary(minRaw, maxRaw, typeRaw) {
  const a = nums(minRaw), b = nums(maxRaw)
  let min = a[0] ?? null, max = b[0] ?? a[1] ?? null
  if (min && !max) max = min
  if (min && max && min > max) [min, max] = [max, min]
  const t = norm(typeRaw) + ' ' + norm(minRaw)
  return { salary_min: min, salary_max: max, salary_type: t.includes('brut') ? 'bruto' : 'liquido' }
}
export const cleanEmail = (s) => { const v = String(s ?? '').trim().toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : '' }
export const cleanPhone = (s) => String(s ?? '').replace(/[^\d+]/g, '').slice(0, 16)

/* ---------- campos ---------- */
export const JOB_FIELDS = [
  { key: 'title', label: 'Título del cargo', required: true, synonyms: ['titulo', 'cargo', 'puesto', 'nombre del aviso', 'aviso', 'title', 'position'] },
  { key: 'description', label: 'Descripción', synonyms: ['descripcion', 'detalle', 'funciones', 'description'] },
  { key: 'requirements', label: 'Requisitos', synonyms: ['requisitos', 'requerimientos', 'perfil'] },
  { key: 'area', label: 'Área', synonyms: ['area', 'categoria', 'rubro', 'departamento'] },
  { key: 'comuna', label: 'Comuna o ciudad', synonyms: ['comuna', 'ciudad', 'localidad', 'ubicacion', 'lugar'] },
  { key: 'region', label: 'Región', synonyms: ['region'] },
  { key: 'modality', label: 'Modalidad', synonyms: ['modalidad', 'remoto', 'teletrabajo', 'tipo de trabajo'] },
  { key: 'schedule', label: 'Jornada', synonyms: ['jornada', 'horario', 'tipo de jornada'] },
  { key: 'contract', label: 'Tipo de contrato', synonyms: ['contrato', 'tipo de contrato'] },
  { key: 'salary_min', label: 'Sueldo (o desde)', synonyms: ['sueldo', 'renta', 'salario', 'remuneracion', 'sueldo desde', 'renta desde'] },
  { key: 'salary_max', label: 'Sueldo hasta', synonyms: ['sueldo hasta', 'renta hasta', 'hasta'] },
  { key: 'external_ref', label: 'Código en el otro portal', synonyms: ['id', 'codigo', 'id aviso', 'referencia'] },
]
export const APPLICANT_FIELDS = [
  { key: 'full_name', label: 'Nombre completo', required: true, synonyms: ['nombre completo', 'nombre y apellido', 'postulante', 'candidato', 'nombre'] },
  { key: 'last_name', label: 'Apellido (si viene aparte)', synonyms: ['apellido', 'apellidos'] },
  { key: 'email', label: 'Correo', synonyms: ['correo', 'email', 'e-mail', 'mail'] },
  { key: 'phone', label: 'Teléfono', synonyms: ['telefono', 'celular', 'movil', 'fono', 'phone'] },
  { key: 'headline', label: 'Cargo o profesión', synonyms: ['profesion', 'cargo actual', 'titulo', 'ocupacion', 'cargo'] },
  { key: 'stage', label: 'Estado o etapa', synonyms: ['estado', 'etapa', 'status', 'fase'] },
  { key: 'notes', label: 'Notas', synonyms: ['notas', 'comentario', 'observacion', 'observaciones'] },
]
