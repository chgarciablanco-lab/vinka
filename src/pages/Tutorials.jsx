import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Screen, Svg, TopBar } from '../components/ui'

// Guías paso a paso. «to» lleva a la pantalla cuando la persona tiene el rol correspondiente.
const GUIDES = {
  postulantes: {
    label: 'Busco trabajo', video: '/media/personas-movil.mp4?v=1', poster: '/media/personas-movil.jpg?v=1', videoWide: '/media/personas-escritorio.mp4?v=1', posterWide: '/media/personas-escritorio.jpg?v=1',
    intro: 'VINKA es gratis para quienes buscan trabajo. Nunca te cobraremos por postular ni por ser contratado/a. Las asesorías y el perfil destacado son opcionales.',
    items: [
      { icon: 'check', title: 'Primeros pasos guiados', to: '/', steps: ['Al entrar ves «Primeros pasos»: una lista con tu avance para dejar tu cuenta lista.', 'Toca un paso para ir a esa pantalla; se marca solo cuando lo completas.', 'Puedes ocultar la lista o repetir el recorrido por el menú desde Ayuda.'] },
      { icon: 'user', title: 'Crea tu perfil en minutos', to: '/perfil', imgs: ['c_perfil'], steps: ['Regístrate como persona con tu correo.', 'Toca «Completar con mi CV»: lo leemos y llenamos tu perfil laboral; tú revisas antes de guardar.', 'Indica tu renta esperada: las empresas solo ven un rango aproximado, nunca el monto exacto.', 'Elige si las empresas verificadas pueden encontrar tu perfil (Perfil → Privacidad).'], tip: 'Un perfil con presentación y habilidades aparece mejor ubicado.' },
      { icon: 'card', title: 'Explora vacantes y muestra interés', to: '/', imgs: ['c_explorar'], steps: ['En Explorar ves vacantes acordes a tu cargo, nivel y comuna. Elige verlas como tarjetas o como lista.', 'Desliza a la derecha o toca «Me interesa»; a la izquierda para pasar; hacia arriba para guardar.', '«Por qué te la mostramos» te dice en qué calza contigo: cargo, comuna y renta.', 'Si la vacante tiene preguntas, respóndelas antes de enviar tu interés.'], tip: 'Toca la tarjeta para ver la descripción completa, la empresa y sus beneficios.' },
      { icon: 'chat', title: 'Match y conversación', to: '/chats', imgs: ['c_chat'], steps: ['Si la empresa también se interesa, hay match y te avisamos.', 'La empresa escribe primero; apenas lo haga, puedes responder.', 'En Chats ves cuántos mensajes tienes sin leer.', 'Tu teléfono y correo solo se comparten si tú lo autorizas.'], tip: 'VINKA nunca te pedirá pagar para postular. Si alguien lo hace, denúncialo desde el chat.' },
      { icon: 'calendar', title: 'Agenda tu entrevista', to: '/chats', imgs: ['c_agendar'], steps: ['Cuando la empresa habilita la agenda, toca «Agendar entrevista» en el chat.', 'Elige un día marcado y luego un horario libre. Todas las horas están en hora de Chile.', 'Agrégala a tu calendario con un toque; te recordamos antes de que empiece.', 'Si no puedes, cancélala desde el chat para liberar el horario.'] },
      { icon: 'doc', title: 'Responde la carta oferta', to: '/chats', imgs: ['c_oferta'], steps: ['Si te ofrecen el cargo, recibirás un aviso con la carta oferta.', 'Revisa cargo, renta, contrato, jornada y fecha de inicio.', 'Acepta o indica que no aceptas; puedes escribirle a la empresa si tienes dudas.', 'Descárgala en PDF para guardarla.'], tip: 'Una oferta real nunca te pide dinero.' },
      { icon: 'swap', title: 'Sigue tus procesos', to: '/intereses', imgs: ['c_intereses'], steps: ['En Intereses ves cada postulación y su etapa: en conversación, entrevista, oferta recibida, contratado/a o proceso cerrado.', 'Las pestañas separan tus matches, las invitaciones de empresas, lo que enviaste y lo que guardaste.', 'Si una empresa elige a otra persona o cierra la vacante, también te lo mostramos.'] },
      { icon: 'chart', title: 'Si te envían un test DISC', steps: ['Una empresa o consultora puede enviarte un enlace para responder el test de estilo laboral de VINKA. No necesitas cuenta.', 'Son 24 grupos de 4 palabras: en cada uno eliges la que más te describe y la que menos.', 'Toma entre 8 y 15 minutos. Hazlo de una vez y en un solo dispositivo; no usa cámara.', 'Si el enlace venció, pide uno nuevo a quien te lo envió.'], tip: 'No hay respuestas buenas ni malas: responde como eres, no como crees que deberías ser.' },
      { icon: 'people', title: 'Asesoría: elige el servicio y a tu asesor/a', to: '/asesoria', imgs: ['c_elegir', 'c_asesorperfil'], steps: ['En Perfil → «Asesoría con reclutador» elige un servicio y toca «Solicitar».', 'Decide quién te atiende: «VINKA elige por mí» o «Quiero elegir a mi asesor/a».', 'En «Ver perfil» revisas su experiencia, especialidades y las valoraciones verificadas de otras personas.', 'Revisa el precio, lo que incluye y las condiciones, y confirma. Al solicitar no pagas nada.'], tip: 'Si la persona que elegiste se queda sin cupo, VINKA te propone a otra y nada cambia hasta que tú aceptes.' },
      { icon: 'shield', title: 'Paga con tarjeta y sigue tu asesoría', to: '/asesoria', imgs: ['c_seguir', 'c_pago'], steps: ['Cada solicitud muestra una barra de avance y el «Próximo paso»: Solicitada → Pago → En curso → Revisión → Finalizada.', 'Cuando VINKA confirma el servicio, aparece «Pagar con tarjeta»: crédito o débito, con cuotas.', 'Si el pago se aprueba, recibes un comprobante y tu asesoría empieza al instante con tu asesor/a.', 'Todo ocurre en la misma ficha: conversación, CV, sesiones, ofertas sugeridas y plazos.'], tip: 'Hoy el pago funciona en modo demostración: se usan las tarjetas de prueba que muestra la pantalla y no se cobra dinero.' },
      { icon: 'star', title: 'Valora tu asesoría', to: '/asesoria', imgs: ['c_valorar'], steps: ['Cuando VINKA aprueba la entrega, te avisamos y aparece «Valorar asesoría».', 'Pon de 1 a 5 estrellas en la nota general, puntualidad, calidad, comunicación y entregables.', 'El comentario es opcional. Tu nombre no se muestra: apareces como «Postulante verificado».', 'Solo puedes valorar una vez; tu asesor/a puede responderte.'], tip: 'Evalúa el servicio que recibiste, no si conseguiste empleo.' },
      { icon: 'chart', title: 'Opcional: perfil destacado', to: '/visibilidad', imgs: ['c_destacado'], steps: ['El perfil destacado te muestra entre los primeros cuando una empresa busca personas para una vacante que ya te calza.', 'Elige 7, 15 o 30 días, acepta la condición y toca «Continuar al pago».', 'Pagas con tarjeta y se activa al aprobarse; ves cuántas empresas te vieron y se interesaron.', 'Puedes desactivarlo cuando quieras o renovarlo sin perder días.'], tip: 'No cambia cómo te evalúan ni te muestra en vacantes que no corresponden a tu perfil.' },
      { icon: 'user', title: 'Tu privacidad y tu cuenta', to: '/cuenta', steps: ['Puedes ocultar tu perfil a las empresas cuando quieras desde Perfil → «Privacidad».', 'Toca el círculo con tus iniciales (arriba a la derecha) para abrir «Mi cuenta».', 'Ahí corriges tu nombre, activas los avisos en tu teléfono e instalas VINKA en tu pantalla de inicio.', 'En «Mi cuenta» también descargas una copia de tus datos, cierras sesión o eliminas tu cuenta.', 'Si algo no funciona, cuéntalo en Ayuda y lo revisamos.'] },
    ],
  },
  empresas: {
    label: 'Soy empresa', video: '/media/ats-movil.mp4?v=1', poster: '/media/ats-movil.jpg?v=1', videoWide: '/media/ats-escritorio.mp4?v=1', posterWide: '/media/ats-escritorio.jpg?v=1',
    intro: 'Publica, recibe personas que calzan, evalúa con informes y test DISC, y lleva todo el proceso de selección en un solo lugar.',
    items: [
      { icon: 'check', title: 'Primeros pasos guiados', to: '/', steps: ['Al entrar ves «Primeros pasos»: una lista con tu avance para dejar tu cuenta lista.', 'Toca un paso para ir a esa pantalla; se marca solo cuando lo completas.', 'Un recorrido corto te muestra dónde está cada sección del menú.', 'Puedes ocultar la lista o repetir el recorrido por el menú desde Ayuda.'] },
      { icon: 'building', title: 'Registra y verifica tu empresa', to: '/vitrina', steps: ['Crea la cuenta con el RUT y la razón social.', 'VINKA verifica la empresa antes de que puedas publicar; te avisamos al aprobarla.', 'Sube tu logo y completa la vitrina: aparece en tus avisos y en la carta oferta.', 'En Empresa → «Tu nombre» puedes corregir cómo apareces al firmar cartas y mensajes.'], tip: 'Toda empresa nueva parte con 30 días del plan Pyme.' },
      { icon: 'plus', title: 'Publica una vacante', to: '/vacantes/nueva', imgs: ['e_vacante'], steps: ['Completa cargo, nivel, comuna, modalidad, jornada y renta.', 'Usa la IA para redactar la descripción y los requisitos.', 'Revisa el aviso con «Detectar sesgos» antes de publicar.', 'Agrega preguntas de filtro; las eliminatorias marcan a quien no cumple.'], tip: 'Puedes guardar un borrador y publicarlo después, o marcar la vacante como confidencial.' },
      { icon: 'people', title: 'Encuentra candidatos', to: '/', imgs: ['e_candidatos'], steps: ['En cada vacante toca «Buscar candidatos»: ves personas con cargo y nivel congruentes.', 'La tarjeta muestra lo esencial; toca «Ver más» para el perfil completo.', 'La renta esperada se ve como rango y te indicamos si calza con tu vacante.', '«Me interesa» crea el match si la persona ya postuló, o la invita si no.'], tip: 'En Talento guardas a las personas que te interesan para futuras vacantes.' },
      { icon: 'columns', title: 'Lleva el proceso por etapas', to: '/', imgs: ['e_proceso'], steps: ['En «Proceso de selección» mueves a cada persona entre etapas.', 'Con «Seleccionar varios» mueves de etapa o escribes a varias personas a la vez.', 'Evalúa con criterios, deja notas internas y compara hasta 4 personas.', 'Tu empresa escribe primero en el chat; al descartar, la persona recibe un aviso amable.'], tip: 'El Panel te muestra tus pendientes del día: interesados nuevos, mensajes y entrevistas.' },
      { icon: 'doc', title: 'Informes psicolaborales con IA', to: '/evaluaciones', imgs: ['e_informe'], steps: ['En Evaluaciones crea una evaluación para el cargo y agrega el perfil del cargo: escríbelo o sube un documento.', 'Agrega a cada persona y sube su CV y la transcripción de la entrevista (PDF, Word o texto).', 'Confirma que la persona autorizó la evaluación y toca «Generar informe con IA»: en 1 a 2 minutos tienes un borrador por secciones.', 'Revisa y edita cada sección (o usa «Reescribir con IA») y toca «Cerrar informe». Descárgalo en Word o PDF con tu logo y el anexo de tests.'], tip: 'La IA prepara un borrador; la evaluación y la decisión son tuyas. El informe no incluye edad, nacionalidad, vida familiar ni salud.' },
      { icon: 'chart', title: 'Test DISC propio de VINKA', to: '/evaluaciones', imgs: ['e_disc'], steps: ['En la ficha de la persona toca «Enviar test DISC»: son 24 preguntas sobre estilo laboral, sin cámara.', 'Copia el enlace o envíalo por WhatsApp. La persona lo responde desde su teléfono, sin crear cuenta.', 'Al terminar ves sus 4 estilos en un gráfico, el calce con el cargo y si respondió con tiempo y en un solo dispositivo.', 'Con «Generar reporte con IA» obtienes el análisis y preguntas para la entrevista; descárgalo en PDF.'], tip: 'Por seguridad, el enlace se muestra solo una vez. Si lo pierdes, genera uno nuevo.' },
      { icon: 'swap', title: 'Compara a tus finalistas', to: '/evaluaciones', imgs: ['e_comparativo'], steps: ['Cuando dos o más personas de la evaluación tienen informe, toca «Generar comparativo con IA».', 'Recibes un resumen, las fortalezas y riesgos de cada una y un orden sugerido que puedes cambiar con «Subir» y «Bajar».', 'Edita la conclusión, cierra el comparativo y descárgalo en Word o PDF.'] },
      { icon: 'calendar', title: 'Agenda entrevistas', to: '/agenda', imgs: ['e_agenda'], steps: ['En Agenda publica tus horarios libres, por vacante o para cualquiera.', 'Desde el chat habilitas a la persona para que elija uno; todo en hora de Chile.', 'Filtra la agenda por vacante y abre el chat desde cada entrevista.'] },
      { icon: 'doc', title: 'Envía la carta oferta', to: '/', imgs: ['e_oferta'], steps: ['Desde la ficha de la persona, edita la carta: condiciones, mensaje y quién firma.', 'Envíala por la app y por correo, o descárgala en PDF con tu logo.', 'Ves el historial de versiones; si vence sin respuesta, te avisamos.', 'Si la acepta, queda como contratada automáticamente.'] },
      { icon: 'swap', title: 'Trabaja en equipo y automatiza', to: '/equipo', imgs: ['e_equipo'], steps: ['Invita a tu equipo con roles: administrador, reclutador o evaluador.', 'Crea plantillas de mensajes y automatizaciones por etapa.', 'Pide aprobación antes de publicar o de enviar ofertas, si lo necesitas.', 'Si eres consultora, administra las empresas de tus clientes desde «Clientes» con un solo plan.'] },
      { icon: 'star', title: 'Destaca una vacante', to: '/', imgs: ['e_destacar'], steps: ['En la vacante toca «Destacar»: aparece entre los primeros resultados, solo para quienes ya calza.', 'Usa los destacados incluidos en tu plan o compra uno de 7, 15 o 30 días.', 'Toca «Continuar al pago», paga con tarjeta y empieza a correr al aprobarse.', 'Ves apariciones, clics y postulaciones; puedes renovarlo sin perder días.'], tip: 'Destacar no cambia cómo se evalúa a nadie ni oculta las demás vacantes.' },
      { icon: 'shield', title: 'Plan y pago con tarjeta', to: '/plan', imgs: ['e_plan', 'e_pago'], steps: ['En «Plan y uso» ves tus límites y el consumo del mes.', 'Elige un plan, indica si pagas 1, 3, 6 o 12 meses y toca «Ir a pagar».', 'Paga con crédito o débito; al aprobarse, el plan se activa al instante y recibes el comprobante.', 'Si ya tenías ese plan pagado, los meses se suman al período. El plan Empresa es por cotización.'], tip: 'Hoy el pago funciona en modo demostración: se usan las tarjetas de prueba que muestra la pantalla y no se cobra dinero.' },
      { icon: 'chart', title: 'Página de empleos, importación y reportes', to: '/reportes', imgs: ['e_reportes'], steps: ['Comparte tu página pública de empleos; se puede postular sin crear cuenta.', 'Importa vacantes y postulantes desde Excel.', 'Reportes muestra embudo, tiempos y fuentes en el período que elijas, y se descarga.'] },
    ],
  },
  asesores: {
    label: 'Soy asesor/a', video: '/media/asesores-movil.mp4?v=1', poster: '/media/asesores-movil.jpg?v=1', videoWide: '/media/asesores-escritorio.mp4?v=1', posterWide: '/media/asesores-escritorio.jpg?v=1',
    intro: 'Como asesor/a de VINKA acompañas a postulantes en sus asesorías, reclutas para tus propias vacantes y colaboras con otros asesores. Tu cuenta la entrega VINKA.',
    items: [
      { icon: 'check', title: 'Primeros pasos guiados', to: '/', steps: ['Al entrar ves «Primeros pasos»: una lista con tu avance para dejar tu cuenta lista.', 'Toca un paso para ir a esa pantalla; se marca solo cuando lo completas.', 'Puedes ocultar la lista o repetir el recorrido por el menú desde Ayuda.'] },
      { icon: 'columns', title: 'Tu día en Inicio', to: '/', imgs: ['a_inicio'], steps: ['Inicio reúne lo urgente: los próximos hitos de tus asesorías, los pendientes de tus vacantes y lo que pasa en Comunidad.', 'El menú tiene cinco secciones: Inicio, Asesorías, Vacantes, Comunidad y Chats.', 'Arriba, junto a la campana de avisos, está tu cuenta.'] },
      { icon: 'user', title: 'Tu perfil público y tu disponibilidad', to: '/cuenta', imgs: ['a_perfil'], steps: ['En Cuenta → «Mi perfil público» escribe tu nombre profesional, especialidades, años de experiencia y tu presentación (al menos 40 caracteres), y sube tu foto.', 'Marca qué servicios realizas. Cada cambio lo revisa VINKA antes de publicarlo.', 'Con «Recibir nuevas solicitudes» pausas o reanudas; ves tu cupo de asesorías en curso.', '«Ver como lo ve el postulante» te muestra tu tarjeta tal como aparece al elegir asesor/a.'], tip: 'Sin perfil aprobado no apareces en el directorio y VINKA solo puede asignarte casos como excepción.' },
      { icon: 'people', title: 'Tus asesorías y sus plazos', to: '/asesorias', imgs: ['a_asesorias'], steps: ['En Asesorías ves solo los casos que te asignó VINKA o en los que el postulante te eligió.', 'Cada tarjeta muestra el próximo hito, quién es responsable y cuándo vence.', 'Filtra por estado o servicio y busca por nombre.', 'Te avisamos cuando se confirma el pago: desde ahí corren los plazos.'] },
      { icon: 'doc', title: 'Expediente y entrega', to: '/asesorias', imgs: ['a_expediente'], steps: ['Abre el caso para ver el objetivo de la persona y lo que incluye el servicio.', 'Conversa por el chat de la asesoría, agenda sesiones y sugiere ofertas. Todo ocurre dentro de VINKA.', 'Sube los entregables (por ejemplo, el CV mejorado en Word y en PDF); el avance se marca solo.', 'Con todo listo, toca «Marcar como entregada»: VINKA revisa y aprueba.'], tip: 'No compartas ni pidas teléfonos o correos: la asesoría se conversa dentro de la app.' },
      { icon: 'star', title: 'Tus valoraciones', to: '/cuenta', imgs: ['a_valoraciones'], steps: ['Cuando VINKA aprueba una asesoría, el postulante puede valorarte una vez.', 'En Cuenta → «Mis valoraciones» ves tu promedio y cada opinión con su detalle.', 'Puedes responder cada valoración; tu respuesta es pública.', 'Si una opinión es inapropiada, pide revisión a VINKA explicando el motivo.'], tip: 'Solo cuentan asesorías pagadas y aprobadas. Tus aportes en Comunidad no se mezclan con estas notas.' },
      { icon: 'building', title: 'Tus vacantes', to: '/vacantes', imgs: ['a_vacantes'], steps: ['En Vacantes administras tu espacio de reclutamiento: publicas, buscas talento y agendas entrevistas.', 'Funciona igual que para una empresa: proceso por etapas, chat, carta oferta y reportes.', 'Si aún no tienes tu espacio, pídeselo a VINKA.'] },
      { icon: 'doc', title: 'Informes, test DISC y comparativos', to: '/evaluaciones', imgs: ['e_informe'], steps: ['Si tienes consultora, en Evaluaciones preparas informes psicolaborales con IA a partir del CV y la entrevista.', 'Envía el test DISC de VINKA por enlace y genera su reporte con IA.', 'Compara a los finalistas y descarga todo en Word o PDF con tu logo.', 'Funciona igual que para una empresa: revisa el tutorial «Soy empresa» para el paso a paso.'], tip: 'La IA prepara borradores; tú revisas, corriges y cierras cada informe.' },
      { icon: 'chat', title: 'Comunidad de asesores', to: '/comunidad', imgs: ['a_comunidad'], steps: ['El muro es solo para asesores: publica lo que buscas o responde a otros.', 'Puedes ligar la publicación a una de tus vacantes.', 'Si un comentario te sirve, toca «Invitar al proceso»: esa persona podrá ver esa vacante contigo.', 'Arriba ves los procesos que otros compartieron contigo.'], tip: 'No escribas nombres, RUT ni datos de contacto de candidatos: el muro lo ven todos los asesores.' },
      { icon: 'swap', title: 'Colabora en un proceso', to: '/comunidad', imgs: ['a_colab', 'a_colabchat'], steps: ['Quien es invitado ve el proceso y el perfil de los candidatos, pero no decide.', 'El invitado sugiere avanzar o descartar a alguien; el responsable aprueba con su ✓ o lo rechaza.', 'En el chat del proceso conversan y se reparten tareas con fecha.', 'Cada sugerencia y decisión queda registrada en el historial del candidato.'] },
      { icon: 'calendar', title: 'Chats y avisos', to: '/chats', imgs: ['a_chats'], steps: ['Chats reúne tres conversaciones: Candidatos, Asesorías y Asesores.', 'El número rojo indica cuántos mensajes tienes sin leer en cada una.', 'Activa los avisos del teléfono para enterarte al instante.'] },
    ],
  },
}

/** Tutoriales para personas, empresas y asesores (públicos: también se ven sin cuenta) */
export default function Tutorials() {
  const { who } = useParams()
  const nav = useNavigate()
  const { session, profile, actsAs } = useAuth()
  const def = profile?.role === 'advisor' ? 'asesores' : actsAs === 'company' ? 'empresas' : 'postulantes'
  const key = GUIDES[who] ? who : def
  const g = GUIDES[key]
  const [open, setOpen] = useState(0)
  const mine = session && ((key === 'asesores' && profile?.role === 'advisor') || (key === 'empresas' && actsAs === 'company' && profile?.role !== 'advisor') || (key === 'postulantes' && profile?.role === 'candidate'))
  return (
    <Screen className="bg-[#FAF7F9]" wide>
      <TopBar back title="Tutoriales" />
      <div className="flex flex-col gap-4 px-5 pb-28 lg:px-8 lg:pb-10">
        <div role="tablist" className="flex gap-1 rounded-xl bg-[#F4EEF2] p-[3px] lg:max-w-lg">
          {Object.entries(GUIDES).map(([k, x]) => (
            <button key={k} role="tab" aria-selected={k === key} onClick={() => { setOpen(0); nav(`/tutoriales/${k}`, { replace: true }) }}
              className={`h-[40px] flex-1 rounded-[9px] px-1 text-[13px] font-semibold sm:text-[14px] ${k === key ? 'bg-white text-tinta shadow-sm' : 'text-tinta-3'}`}>{x.label}</button>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <div className="flex flex-col gap-3 lg:sticky lg:top-4">
            <video key={g.video} src={g.video} poster={g.poster} controls playsInline preload="metadata" className={`aspect-[9/16] max-h-[70vh] w-full rounded-2xl bg-morado object-contain lg:max-h-[560px] ${g.videoWide ? 'lg:hidden' : ''}`} />
            {g.videoWide && <video key={g.videoWide} src={g.videoWide} poster={g.posterWide} controls playsInline preload="none" className="hidden aspect-video w-full rounded-2xl bg-morado object-contain lg:block" />}
            <p className="text-sm leading-relaxed text-tinta-2">{g.intro}</p>
            {!session && key !== 'asesores' && <Link to={key === 'empresas' ? '/registro/empresa' : '/registro/candidato'} className="btn">{key === 'empresas' ? 'Crear cuenta de empresa' : 'Crear mi cuenta gratis'}</Link>}
          </div>
          <div className="flex flex-col gap-2">
            {g.items.map((it, i) => (
              <div key={it.title} className="card overflow-hidden">
                <button className="flex w-full items-center gap-3 p-4 text-left" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rosa-palido text-rosa-oscuro"><Svg name={it.icon} size={19} /></span>
                  <span className="flex-1 text-[15px] font-semibold"><span className="mr-1.5 text-tinta-suave">{i + 1}.</span>{it.title}</span>
                  <Svg name="chevron" size={18} className={`text-tinta-suave transition ${open === i ? 'rotate-90' : ''}`} />
                </button>
                {open === i && (
                  <div className="flex flex-col gap-2.5 border-t border-[#F1E7ED] px-4 pb-4 pt-3">
                    <ol className="flex flex-col gap-2">
                      {it.steps.map((s, k) => <li key={k} className="flex gap-2.5 text-sm leading-snug"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-morado text-[11px] font-bold text-white">{k + 1}</span><span>{s}</span></li>)}
                    </ol>
                    {it.imgs?.length > 0 && (
                      <div className="flex justify-center gap-2.5 py-1">
                        {it.imgs.map((n) => <img key={n} src={`/media/tut/${n}.jpg`} alt={`Pantalla de VINKA: ${it.title}`} loading="lazy" width="480" height="960" className={`${it.imgs.length > 1 ? 'w-[calc(50%-5px)] max-w-[210px]' : 'w-[62%] max-w-[230px]'} rounded-2xl border border-linea shadow-sm`} />)}
                      </div>
                    )}
                    {it.tip && <span className="rounded-xl bg-[#FFF8E6] px-3 py-2 text-[13px] text-[#5C4300]"><b>Tip:</b> {it.tip}</span>}
                    {mine && it.to && <Link to={it.to} className="btn-sm self-start border border-rosa-accion bg-white text-rosa-texto">Ir a esta sección</Link>}
                  </div>
                )}
              </div>
            ))}
            <Link to="/ayuda" className="mt-1 text-center text-sm font-semibold text-rosa-texto">¿Te quedó una duda? Pregúntale al asistente ›</Link>
          </div>
        </div>
      </div>
    </Screen>
  )
}
