import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Screen, Svg, TopBar } from '../components/ui'

// Guías paso a paso. «to» lleva a la pantalla cuando la persona tiene el rol correspondiente.
const GUIDES = {
  postulantes: {
    label: 'Busco trabajo', video: '/media/tutorial-postulantes.mp4', poster: '/media/tutorial-postulantes.jpg',
    intro: 'VINKA es gratis para quienes buscan trabajo. Nunca te cobraremos por postular ni por ser contratado/a.',
    items: [
      { icon: 'user', title: 'Crea tu perfil en minutos', to: '/perfil', steps: ['Regístrate como persona con tu correo.', 'Toca «Completar con mi CV»: lo leemos y llenamos tu perfil laboral; tú revisas antes de guardar.', 'Indica tu renta esperada: las empresas solo ven un rango aproximado, nunca el monto exacto.', 'Elige si las empresas verificadas pueden encontrar tu perfil (Perfil → Privacidad).'], tip: 'Un perfil con presentación y habilidades aparece mejor ubicado.' },
      { icon: 'card', title: 'Explora vacantes y muestra interés', to: '/', steps: ['En Explorar ves vacantes acordes a tu cargo, nivel y comuna.', 'Desliza a la derecha o toca «Me interesa»; a la izquierda para pasar; hacia arriba para guardar.', 'Si la vacante tiene preguntas, respóndelas antes de enviar tu interés.', '«Ver otras vacantes» muestra las que calzan menos con tu perfil.'], tip: 'Toca la tarjeta para ver la descripción completa y los beneficios.' },
      { icon: 'chat', title: 'Match y conversación', to: '/chats', steps: ['Si la empresa también se interesa, hay match y te avisamos.', 'La empresa escribe primero; apenas lo haga, puedes responder.', 'Tu teléfono y correo solo se comparten si tú lo autorizas.'], tip: 'Revisa los Avisos: ahí llegan los matches y mensajes nuevos.' },
      { icon: 'calendar', title: 'Agenda tu entrevista', to: '/chats', steps: ['En el chat toca «Agendar entrevista» y elige un horario libre de la empresa.', 'Todas las horas están en hora de Chile.', 'Agrégala a tu calendario con un toque; te recordamos 30 minutos antes.', 'Si no puedes, cancélala desde el chat para liberar el horario.'] },
      { icon: 'doc', title: 'Responde la carta oferta', to: '/chats', steps: ['Si te ofrecen el cargo, recibirás un aviso con la carta oferta.', 'Revisa cargo, renta, contrato, jornada y fecha de inicio.', 'Acepta o indica que no aceptas; puedes escribirle a la empresa si tienes dudas.', 'Descárgala en PDF para guardarla.'], tip: 'Una oferta real nunca te pide dinero.' },
      { icon: 'swap', title: 'Sigue tus procesos', to: '/intereses', steps: ['En Intereses ves cada postulación y su etapa: en conversación, entrevista, oferta recibida, contratado/a o proceso cerrado.', 'Si una empresa elige a otra persona o cierra la vacante, también te lo mostramos.', 'Guarda vacantes para decidir después; la empresa no se entera.'] },
      { icon: 'star', title: 'Opcional: asesoría y perfil destacado', to: '/asesoria', steps: ['La asesoría con reclutador mejora tu CV y ordena tu búsqueda; al pedirla no pagas nada.', 'Al confirmar el pago, VINKA te escribe con el plazo y tu asesor/a te contacta dentro de 1 día hábil.', 'El perfil destacado te muestra entre los primeros donde ya calzas; no cambia cómo te evalúan.'] },
      { icon: 'shield', title: 'Tu privacidad y tu cuenta', to: '/perfil', steps: ['Puedes ocultar tu perfil cuando quieras.', 'Descarga una copia de tus datos o elimina tu cuenta desde Perfil.', 'Si algo no funciona, cuéntalo en Ayuda y lo revisamos.'] },
    ],
  },
  empresas: {
    label: 'Soy empresa', video: '/media/tutorial-empresas.mp4', poster: '/media/tutorial-empresas.jpg',
    intro: 'Publica, recibe personas que calzan y lleva todo el proceso de selección en un solo lugar.',
    items: [
      { icon: 'building', title: 'Registra y verifica tu empresa', to: '/vitrina', steps: ['Crea la cuenta con el RUT y la razón social.', 'VINKA verifica la empresa antes de que puedas publicar; te avisamos al aprobarla.', 'Sube tu logo y completa la vitrina: aparece en tus avisos y en la carta oferta.'], tip: 'Toda empresa nueva parte con 30 días del plan Pyme.' },
      { icon: 'plus', title: 'Publica una vacante', to: '/vacantes/nueva', steps: ['Completa cargo, nivel, comuna, modalidad, jornada y renta.', 'Usa la IA para redactar la descripción y los requisitos.', 'Revisa el aviso con «Detectar sesgos» antes de publicar.', 'Agrega preguntas de filtro; las eliminatorias marcan a quien no cumple.'] },
      { icon: 'people', title: 'Encuentra candidatos', to: '/', steps: ['En cada vacante toca «Buscar candidatos»: ves personas con cargo y nivel congruentes.', 'La tarjeta muestra lo esencial; toca «Ver más» para el perfil completo.', 'La renta esperada se ve como rango y te indicamos si calza con tu vacante.', '«Me interesa» crea el match si la persona ya postuló, o la invita si no.'] },
      { icon: 'columns', title: 'Lleva el proceso por etapas', to: '/', steps: ['En «Proceso de selección» mueves a cada persona entre etapas.', 'Evalúa con criterios, deja notas internas y compara hasta 4 personas.', 'Al descartar, la persona recibe un aviso amable.', 'Tu empresa escribe primero en el chat: así cada conversación parte con contexto.'] },
      { icon: 'calendar', title: 'Agenda entrevistas', to: '/agenda', steps: ['En Agenda publica tus horarios libres, por vacante o para cualquiera.', 'Las personas con match eligen uno; todo en hora de Chile.', 'Filtra la agenda por vacante y abre el chat desde cada entrevista.'] },
      { icon: 'doc', title: 'Envía la carta oferta', to: '/', steps: ['Desde la ficha de la persona, edita la carta: condiciones, mensaje y quién firma.', 'Envíala por la app y por correo, o descárgala en PDF con tu logo.', 'Ves el historial de versiones; si vence sin respuesta, te avisamos.', 'Si la acepta, queda como contratada automáticamente.'] },
      { icon: 'swap', title: 'Trabaja en equipo y automatiza', to: '/equipo', steps: ['Invita a tu equipo con roles: administrador, reclutador o solo lectura.', 'Crea plantillas de mensajes y automatizaciones por etapa.', 'Pide aprobación antes de publicar o de enviar ofertas, si lo necesitas.'] },
      { icon: 'chart', title: 'Página de empleos, reportes y plan', to: '/reportes', steps: ['Comparte tu página pública de empleos; se puede postular sin crear cuenta.', 'Importa vacantes y postulantes desde Excel.', 'Reportes muestra embudo, tiempos y fuentes en el período que elijas.', 'En Plan y uso ves tus límites; los destacados son opcionales.'] },
    ],
  },
}

/** Tutoriales para personas y empresas (públicos: también se ven sin cuenta) */
export default function Tutorials() {
  const { who } = useParams()
  const nav = useNavigate()
  const { session, profile } = useAuth()
  const def = profile?.role === 'company' ? 'empresas' : 'postulantes'
  const key = GUIDES[who] ? who : def
  const g = GUIDES[key]
  const [open, setOpen] = useState(0)
  const mine = session && ((key === 'empresas' && profile?.role === 'company') || (key === 'postulantes' && profile?.role === 'candidate'))
  return (
    <Screen className="bg-[#FAF7F9]" wide>
      <TopBar back title="Tutoriales" />
      <div className="flex flex-col gap-4 px-5 pb-28 lg:px-8 lg:pb-10">
        <div role="tablist" className="flex gap-1 rounded-xl bg-[#F4EEF2] p-[3px] lg:max-w-md">
          {Object.entries(GUIDES).map(([k, x]) => (
            <button key={k} role="tab" aria-selected={k === key} onClick={() => { setOpen(0); nav(`/tutoriales/${k}`, { replace: true }) }}
              className={`h-[40px] flex-1 rounded-[9px] text-[14px] font-semibold ${k === key ? 'bg-white text-tinta shadow-sm' : 'text-tinta-3'}`}>{x.label}</button>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <div className="flex flex-col gap-3 lg:sticky lg:top-4">
            <video key={g.video} src={g.video} poster={g.poster} controls playsInline preload="metadata" className="aspect-[9/16] max-h-[70vh] w-full rounded-2xl bg-morado object-contain lg:max-h-[560px]" />
            <p className="text-sm leading-relaxed text-tinta-2">{g.intro}</p>
            {!session && <Link to={key === 'empresas' ? '/registro/empresa' : '/registro/candidato'} className="btn">{key === 'empresas' ? 'Crear cuenta de empresa' : 'Crear mi cuenta gratis'}</Link>}
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
