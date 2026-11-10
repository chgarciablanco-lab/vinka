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

/* ---------- ATS ---------- */
// Columnas del tablero de selección (las etapas de postulantes externos se adaptan a estas)
export const COLUMNAS = [
  ['postulante', 'Postulantes', '#6B5F6E'], ['match', 'Nuevo match', '#D02E72'], ['contacto', 'Contacto', '#7A3FA0'],
  ['entrevista', 'Entrevista', '#1F6F78'], ['oferta', 'Oferta', '#B85F00'], ['contratado', 'Contratado/a', '#2F7A4F'], ['descartado', 'Descartado/a', '#8A8090'],
]
export const colLabel = (k) => (COLUMNAS.find((c) => c[0] === k) || [k, k])[1]
export const ROLES = {
  owner: ['Dueño/a', 'Control total de la cuenta'],
  admin: ['Administrador/a', 'Vacantes, candidatos, equipo y vitrina'],
  recruiter: ['Reclutador/a', 'Vacantes y candidatos'],
  viewer: ['Evaluador/a', 'Ve candidatos, evalúa y comenta'],
  client: ['Cliente', 'Ve los procesos de su empresa, evalúa y aprueba ofertas (empresas clientes de una consultora)'],
}
export const CRITERIOS = [['experiencia', 'Experiencia'], ['habilidades', 'Habilidades técnicas'], ['comunicacion', 'Comunicación'], ['motivacion', 'Motivación'], ['ajuste', 'Ajuste al cargo']]
export const RECOMENDACION = { si: ['Avanzar', 'bg-[#EAF6EF] text-[#134A2B]'], tal_vez: ['Con dudas', 'bg-naranja-palido text-naranja-texto'], no: ['No avanzar', 'bg-[#FEF3F2] text-[#912018]'] }
export const TIPOS_PLANTILLA = [['general', 'General'], ['contacto', 'Contacto'], ['entrevista', 'Entrevista'], ['oferta', 'Oferta'], ['rechazo', 'Cierre de proceso']]
// Plantillas sugeridas mientras la empresa no crea las suyas
export const PLANTILLAS_BASE = [
  { id: 'b1', kind: 'contacto', name: 'Primer contacto', body: 'Hola {nombre}, gracias por tu interés en {cargo}. Nos gustó tu perfil y queremos conocerte un poco más. ¿Te acomoda conversar esta semana?' },
  { id: 'b2', kind: 'entrevista', name: 'Invitar a entrevista', body: 'Hola {nombre}, queremos invitarte a una entrevista para {cargo} en {empresa}. Puedes elegir el horario que más te acomode desde el botón "Agendar entrevista" en este chat.' },
  { id: 'b3', kind: 'rechazo', name: 'Cierre amable', body: 'Hola {nombre}, gracias por el tiempo y el interés que pusiste en el proceso de {cargo}. En esta ocasión decidimos avanzar con otras personas, pero tu perfil quedará en nuestro banco de talento para futuras vacantes. ¡Mucho éxito!' },
  { id: 'b4', kind: 'oferta', name: 'Aviso de oferta', body: 'Hola {nombre}, ¡tenemos buenas noticias! Te enviamos la carta oferta para {cargo}. Revísala con calma y cuéntanos si tienes dudas.' },
]
export const fillVars = (t, v) => String(t || '').replace(/\{nombre\}/g, v.nombre || '').replace(/\{cargo\}/g, v.cargo || '').replace(/\{empresa\}/g, v.empresa || '')
export const daysAgo = (d) => {
  const n = Math.floor((Date.now() - new Date(d)) / 864e5)
  return n <= 0 ? 'hoy' : n === 1 ? 'hace 1 día' : `hace ${n} días`
}
