// Test DISC VINKA: textos fijos por estilo (redacción propia de VINKA) y utilidades.
// Escala 0–100 por factor, 50 = promedio esperado. Mide estilo de comportamiento, no capacidad.

export const FACTORS = ['D', 'I', 'S', 'C']
export const FACTOR_COLOR = { D: [200, 70, 60], I: [214, 150, 30], S: [60, 150, 90], C: [60, 110, 190] }

export const STYLE = {
  D: {
    nombre: 'Dominante', apodo: 'Impulsor',
    describe: 'Directo, orientado a resultados y a la acción. Decide con rapidez y asume desafíos.',
    motivadores: ['Desafíos y metas concretas.', 'Autonomía para decidir.', 'Resultados visibles.', 'Reconocimiento por sus logros.', 'Avanzar con rapidez.'],
    habituales: ['Tomar decisiones con rapidez.', 'Ir directo al punto.', 'Asumir el control en situaciones difíciles.', 'Buscar resultados concretos.', 'Enfrentar los problemas.'],
    dificil: ['Tener paciencia con procesos lentos.', 'Escuchar todos los puntos de vista.', 'Delegar sin controlar cada detalle.', 'Cuidar el tono al exigir.', 'Seguir reglas que no comparte.'],
    comunicar: ['Sé breve y directo.', 'Habla de metas y resultados.', 'Dale opciones y deja que decida.', 'Reconoce sus logros concretos.'],
    evitar: ['Rodeos y exceso de detalle.', 'Quitarle autonomía sin explicación.', 'La indecisión.', 'Imponerte sin argumentos.'],
  },
  I: {
    nombre: 'Influyente', apodo: 'Inspirador',
    describe: 'Sociable, entusiasta y persuasivo. Conecta con las personas y genera buen ambiente.',
    motivadores: ['Reconocimiento público.', 'Trabajar con personas.', 'Un ambiente positivo.', 'Variedad en las tareas.', 'Libertad para expresarse.'],
    habituales: ['Generar entusiasmo.', 'Conversar y conectar con otros.', 'Convencer y motivar.', 'Proponer ideas nuevas.', 'Trabajar en equipo.'],
    dificil: ['Cuidar los detalles.', 'Sostener rutinas largas.', 'Organizar su tiempo.', 'Decir que no.', 'Trabajar de forma aislada.'],
    comunicar: ['Usa un tono cercano y entusiasta.', 'Dale espacio para opinar.', 'Reconoce su aporte delante del equipo.', 'Deja por escrito plazos y detalles acordados.'],
    evitar: ['Ambientes fríos o aislados.', 'Críticas en público.', 'Reglas sin explicación.', 'Tareas rutinarias por mucho tiempo.'],
  },
  S: {
    nombre: 'Estable', apodo: 'Apoyo',
    describe: 'Paciente, leal y constante. Escucha, coopera y aporta calma y continuidad al equipo.',
    motivadores: ['Estabilidad y seguridad.', 'Un ambiente armonioso.', 'Aprecio sincero.', 'Rutinas claras.', 'Pertenecer a un equipo.'],
    habituales: ['Trabajar de forma constante.', 'Escuchar con paciencia.', 'Ayudar a los demás.', 'Cumplir lo comprometido.', 'Mantener la calma.'],
    dificil: ['Adaptarse a cambios repentinos.', 'Hacer varias cosas a la vez.', 'Expresar desacuerdos.', 'Destacar sus propios logros.', 'Trabajar con mucha incertidumbre.'],
    comunicar: ['Usa un tono calmado y respetuoso.', 'Anticipa los cambios y explica el porqué.', 'Da instrucciones claras.', 'Crea confianza para que exprese su opinión.'],
    evitar: ['Cambios bruscos sin aviso.', 'Conflictos y presión constante.', 'Exigir respuestas inmediatas.', 'La falta de reconocimiento.'],
  },
  C: {
    nombre: 'Cauteloso', apodo: 'Analítico',
    describe: 'Preciso, ordenado y analítico. Cuida la calidad y prefiere decidir con información.',
    motivadores: ['Hacer las cosas bien.', 'Criterios y normas claras.', 'Tiempo para analizar.', 'Calidad y precisión.', 'Trabajo planificado.'],
    habituales: ['Revisar los detalles.', 'Seguir procedimientos.', 'Analizar antes de decidir.', 'Mantener el orden.', 'Cuidar la calidad.'],
    dificil: ['Decidir con poca información.', 'Aceptar errores propios o ajenos.', 'Trabajar con plazos muy cortos.', 'Expresar sus emociones.', 'Improvisar.'],
    comunicar: ['Entrega información completa y ordenada.', 'Da tiempo para analizar.', 'Usa datos y argumentos.', 'Acuerda criterios de calidad desde el inicio.'],
    evitar: ['Presión sin datos.', 'Cambios sin justificación.', 'Críticas a su trabajo sin argumentos.', 'El desorden y la ambigüedad.'],
  },
}

export const profileName = (sc) => {
  if (!sc?.principal) return ''
  const a = STYLE[sc.principal], b = sc.secundario && STYLE[sc.secundario]
  return `${a.apodo}${b ? ` · ${b.apodo}` : ''} (${sc.principal}${sc.secundario || ''})`
}

export const INTEGRITY = [
  { key: 'tiempo_valido', ok: 'Tiempo válido', bad: 'Tiempo fuera de rango', detail: (i) => `Respondió en ${String(i.minutos).replace('.', ',')} minutos (válido entre 4 y 60).` },
  { key: 'sin_interrupciones', ok: 'Sin interrupciones', bad: 'Con pausas largas', detail: (i) => `Pausa más larga: ${String(i.pausa_mas_larga_min).replace('.', ',')} minutos.` },
  { key: 'un_dispositivo', ok: 'Un solo dispositivo', bad: 'Se abrió en otro dispositivo', detail: (i) => (i.otros_dispositivos ? `Se abrió en ${i.otros_dispositivos} dispositivo(s) más.` : 'Respondió desde un solo dispositivo.') },
  { key: 'sin_patron_repetitivo', ok: 'Respuestas variadas', bad: 'Patrón repetitivo', detail: (i) => (i.sin_patron_repetitivo ? 'No eligió siempre la misma posición en los bloques.' : 'Eligió casi siempre la misma posición: revisa si respondió con atención.') },
]
export const integrityCount = (i) => (i ? INTEGRITY.filter((x) => i[x.key]).length : 0)

export const RESPONSIBLE_USE = 'El DISC describe estilos de comportamiento, no capacidad, inteligencia ni valores. Este reporte es un apoyo: úsalo junto con la entrevista, las referencias y la evidencia del cargo, y nunca como único criterio de selección. Cuestionario propio de VINKA, en etapa de validación.'

export const discLink = (token) => `${window.location.origin}/test/${token}`
