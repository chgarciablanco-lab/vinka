export const REGIONES = [
  'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo', 'Valparaíso', 'Metropolitana',
  "O'Higgins", 'Maule', 'Ñuble', 'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes',
]
export const JORNADAS = ['Completa', 'Parcial', 'Por turnos']
export const MODALIDADES = ['Presencial', 'Híbrida', 'Remota']
export const DISPONIBILIDAD = ['Inmediata', 'En 15 días', 'En 1 mes', 'A convenir']
export const AREAS = [
  'Administración', 'Ventas', 'Atención al cliente', 'Logística', 'Retail', 'Operaciones', 'Tecnología', 'Marketing',
  'Finanzas', 'Recursos humanos', 'Construcción', 'Salud', 'Educación', 'Gastronomía', 'Agroindustria', 'Minería',
  'Transporte', 'Manufactura', 'Legal', 'Diseño', 'Otro',
]
export const TRASLADO = ['Sí', 'No', 'Depende de la oferta']
export const NIVELES = ['Operativo', 'Primer empleo', 'Junior', 'Semi senior', 'Senior', 'Jefatura', 'Gerencia']
export const CONTRATOS = ['Indefinido', 'Plazo fijo', 'Por obra o faena', 'Honorarios', 'Práctica']
export const TAMANOS = ['1–10', '11–50', '51–200', '201+']
export const NIVEL_ESTUDIOS = ['Enseñanza media', 'Técnico', 'Universitario', 'Postgrado', 'Otro']
export const ESTADO_ESTUDIOS = ['En curso', 'Egresado/a', 'Titulado/a', 'Incompleto']
export const PREGUNTAS = [
  '¿Cuál es tu principal fortaleza?',
  '¿Qué te motiva de este tipo de cargo?',
  'Cuéntanos un logro del que estés orgulloso/a',
  '¿Por qué te gustaría trabajar con nosotros?',
]
export const ETAPAS = [
  ['match', 'Match'], ['contacto', 'Contacto'], ['entrevista', 'Entrevista'], ['oferta', 'Oferta'],
  ['contratado', 'Contratado/a'], ['descartado', 'Descartado/a'],
]

export const clp = (n) => (n == null || n === '' ? '' : '$' + Number(n).toLocaleString('es-CL'))
export const parseCLP = (s) => {
  const d = String(s || '').replace(/\D/g, '')
  return d ? parseInt(d, 10) : null
}
export function salaryText(j) {
  if (!j.salary_min && !j.salary_max) return 'Renta a convenir'
  const t = j.salary_type === 'bruto' ? 'bruto' : 'líquido'
  if (j.salary_min && j.salary_max && j.salary_min !== j.salary_max) return `${clp(j.salary_min)} – ${clp(j.salary_max)} ${t}`
  return `${clp(j.salary_max || j.salary_min)} ${t}`
}
export const initials = (s) => (s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
const PALETTE = ['#3B5BA9', '#2F7A4F', '#7A3FA0', '#9A4B1E', '#5A5F6E', '#1F6F78', '#A0365F']
export const colorFor = (s) => PALETTE[[...(s || 'x')].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length]
