import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Sheet, Svg } from './ui'

// Primeros pasos guiados. Cada paso se marca solo con los datos de la cuenta (función my_onboarding).
// Lo ven las cuentas nuevas y las existentes a las que les falten pasos; se puede ocultar y volver a mostrar desde Ayuda.
const STEPS = {
  // Postulantes
  cv: ['doc', 'Sube tu CV', 'Lo guardamos en tu perfil y la IA puede completar tus datos laborales; tú revisas antes de guardar.', '/perfil'],
  experiencia: ['user', 'Completa tu experiencia y habilidades', 'Agrega al menos un trabajo y 3 habilidades: así te mostramos vacantes que calzan.', '/perfil/laboral'],
  preferencias: ['chart', 'Indica tu renta y cómo quieres trabajar', 'Renta esperada y modalidad. Las empresas solo ven un rango, nunca el monto exacto.', '/perfil/preferencias'],
  presentacion: ['edit', 'Preséntate', 'Unas líneas o un video corto sobre ti. Ayuda a que te elijan.', '/perfil/presentacion'],
  interes: ['card', 'Muestra interés en una vacante', 'En Explorar toca «Me interesa» o desliza a la derecha. Si la empresa también se interesa, hay match.', '/'],
  // Empresas
  verificacion: ['shield', 'Verificación de tu empresa', 'VINKA revisa la empresa antes de publicar avisos. Te avisamos al aprobarla.', '/vitrina'],
  logo: ['building', 'Sube el logo de tu empresa', 'Aparece en tus avisos, en la carta oferta y en los informes.', '/vitrina'],
  vitrina: ['building', 'Completa la vitrina', 'Rubro y una descripción breve: es lo que ven las personas antes de postular.', '/vitrina'],
  vacante: ['plus', 'Publica tu primera vacante', 'La IA te ayuda a redactar el aviso y a revisar sesgos.', '/vacantes/nueva'],
  agenda: ['calendar', 'Publica horarios de entrevista', 'Las personas eligen un horario libre desde el chat.', '/agenda'],
  equipo: ['people', 'Invita a tu equipo', 'Opcional. Suma reclutadores o evaluadores con el rol que corresponda.', '/equipo'],
  // Asesores
  perfil_asesor: ['user', 'Crea tu perfil público', 'Experiencia, especialidades y servicios. VINKA lo revisa antes de publicarlo.', '/cuenta'],
  foto: ['user', 'Sube tu foto', 'Las personas eligen con más confianza a un asesor con foto.', '/cuenta'],
  oportunidades: ['star', 'Conoce las oportunidades de la red', 'Vacantes abiertas a colaboración donde puedes proponer candidatos.', '/oportunidades'],
  comunidad: ['chat', 'Preséntate en la comunidad', 'Escribe una publicación o comenta la de otro asesor.', '/comunidad'],
  // Todos
  avisos: ['bell', 'Activa los avisos en tu teléfono', 'Te avisamos de mensajes, matches y entrevistas aunque no tengas VINKA abierta.', '/cuenta'],
}

const TOUR = {
  candidate: [
    ['/', 'Explorar', 'Aquí ves vacantes que calzan contigo. Toca «Me interesa» en las que te gusten.'],
    ['/intereses', 'Intereses', 'Sigue tus postulaciones y las invitaciones que te envían las empresas.'],
    ['/chats', 'Chats', 'Cuando hay match, la empresa te escribe aquí y puedes agendar la entrevista.'],
    ['/perfil', 'Perfil', 'Tu perfil, tu CV y tu privacidad. Mientras más completo, mejor te encuentran.'],
  ],
  company: [
    ['/', 'Panel', 'Tus vacantes y los pendientes del día: interesados nuevos, mensajes y entrevistas.'],
    ['/talento', 'Talento', 'Busca personas y guarda a quienes te interesan para futuras vacantes.'],
    ['/agenda', 'Agenda', 'Publica horarios libres para que las personas agenden su entrevista.'],
    ['/chats', 'Chats', 'Conversa con las personas que hicieron match con tus vacantes.'],
    ['/vitrina', 'Empresa', 'Logo, vitrina, equipo, plan y evaluaciones de tu empresa.'],
  ],
  advisor: [
    ['/', 'Inicio', 'Tus asesorías con plazos cercanos y las tareas de la red.'],
    ['/asesorias', 'Asesorías', 'Cada asesoría con su conversación, CV, sesiones y entregas.'],
    ['/vacantes', 'Vacantes', 'Tus procesos de selección, banco de talento y agenda.'],
    ['/comunidad', 'Comunidad', 'Comparte con otros asesores y colabora en búsquedas.'],
    ['/chats', 'Chats', 'Todos tus mensajes con postulantes y empresas.'],
  ],
}

/** Carga los primeros pasos de la cuenta (null si no aplica o si falla: nunca bloquea la pantalla) */
export function useFirstSteps() {
  const { profile, company } = useAuth()
  const [d, setD] = useState(null)
  const cid = profile?.role === 'candidate' ? null : company?.id || null
  const load = useCallback(() => {
    if (!profile) return
    supabase.rpc('my_onboarding', { p_company: cid }).then(({ data, error }) => setD(error || !data?.steps ? null : data), () => setD(null))
  }, [profile, cid])
  useEffect(() => { load() }, [load])
  const mark = async (action) => { await supabase.rpc('onboarding_mark', { p_action: action }); load() }
  return { d, load, mark }
}

const Ring = ({ done, total }) => {
  const r = 15, c = 2 * Math.PI * r, pct = total ? done / total : 0
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" className="shrink-0">
      <circle cx="20" cy="20" r={r} fill="none" stroke="#F1E3EB" strokeWidth="4" />
      <circle cx="20" cy="20" r={r} fill="none" stroke="#D02E72" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 20 20)" />
      <text x="20" y="24" textAnchor="middle" fontSize="11" fontWeight="700" fill="#5A1236">{done}/{total}</text>
    </svg>
  )
}

/** Tarjeta compacta «Primeros pasos» para la pantalla de inicio; al tocarla abre la lista */
export function FirstSteps({ className = '' }) {
  const { d, mark } = useFirstSteps()
  const [open, setOpen] = useState(false)
  if (!d || d.hidden || !d.total) return null
  const all = d.done >= d.total
  const steps = d.steps.map((s) => ({ ...s, meta: STEPS[s.key] })).filter((s) => s.meta)
  const next = steps.find((s) => !s.done && !s.pending)
  return (
    <>
      <div className={`flex items-center gap-3 rounded-2xl border border-[#F1D5E3] bg-white p-3 shadow-sm ${className}`} aria-label="Primeros pasos">
        <Ring done={d.done} total={d.total} />
        <button className="flex min-w-0 flex-1 flex-col text-left" onClick={() => setOpen(true)}>
          <b className="text-[14px]">{all ? '¡Listo! Completaste los primeros pasos' : 'Primeros pasos'}</b>
          <span className="truncate text-[12px] text-tinta-3">{all ? 'Ya puedes ocultar esta guía.' : next ? `Siguiente: ${next.meta[1]}` : 'Estamos revisando tu cuenta.'}</span>
        </button>
        {all ? <button className="btn-sm h-9 shrink-0 bg-rosa-accion px-3 text-white" onClick={() => mark('ocultar')}>Ocultar</button>
          : <button className="btn-sm h-9 shrink-0 border border-linea bg-white px-3" onClick={() => setOpen(true)}>Ver</button>}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Primeros pasos">
        <div className="flex flex-col gap-2 pb-2">
          <p className="text-[13px] leading-snug text-tinta-3">Cada paso se marca solo cuando lo completas. Toca uno para ir a esa pantalla.</p>
          <ol className="flex flex-col gap-2">
            {steps.map((s) => (
              <li key={s.key}>
                <Link to={s.meta[3]} onClick={() => setOpen(false)} className={`flex items-start gap-3 rounded-xl border p-3 ${s.done ? 'border-[#CFE8D9] bg-[#F4FBF6]' : 'border-linea bg-white'}`}>
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${s.done ? 'bg-[#1E6B3F] text-white' : s.pending ? 'bg-naranja-palido text-naranja-texto' : 'bg-[#F7F0FB] text-[#4A2163]'}`}>
                    <Svg name={s.done ? 'check' : s.meta[0]} size={16} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <b className={`text-[14px] ${s.done ? 'text-[#134A2B]' : ''}`}>{s.meta[1]}{s.optional ? <span className="font-normal text-tinta-3"> · opcional</span> : null}</b>
                    <span className="text-[12px] leading-snug text-tinta-3">{s.done ? 'Listo.' : s.pending ? 'En revisión por VINKA. Te avisaremos.' : s.meta[2]}</span>
                  </span>
                  {!s.done && !s.pending && <Svg name="chevron" size={18} className="mt-1 shrink-0 text-tinta-suave" />}
                </Link>
              </li>
            ))}
          </ol>
          <button className="mt-1 self-start text-[13px] font-semibold text-tinta-3 underline" onClick={() => { setOpen(false); mark('ocultar') }}>Ocultar la guía (puedes verla de nuevo en Ayuda)</button>
        </div>
      </Sheet>
    </>
  )
}

/** Recorrido corto por el menú, la primera vez que la cuenta entra al inicio */
export function FirstTour() {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const { d, mark } = useFirstSteps()
  const [i, setI] = useState(-1)
  const [box, setBox] = useState(null)
  const steps = TOUR[profile?.role] || []
  const active = d && !d.tour && pathname === '/' && steps.length > 0
  useEffect(() => { if (active && i < 0) setI(0) }, [active, i])
  const step = i > 0 ? steps[i - 1] : null
  useLayoutEffect(() => {
    if (!step) { setBox(null); return }
    const find = () => {
      const el = [...document.querySelectorAll(`nav a[href="${step[0]}"]`)].find((e) => e.getClientRects().length && e.offsetParent !== null)
      setBox(el ? el.getBoundingClientRect() : null)
    }
    find(); window.addEventListener('resize', find)
    return () => window.removeEventListener('resize', find)
  }, [step])
  if (!active || i < 0) return null
  const end = () => { setI(-1); mark('recorrido') }
  const last = i === steps.length
  const pad = 6
  const vw = typeof window !== 'undefined' ? window.innerWidth : 390
  const bubbleTop = box ? (box.top > 220 ? undefined : box.bottom + 14) : undefined
  const bubbleBottom = box && box.top > 220 ? window.innerHeight - box.top + 14 : undefined
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Recorrido por VINKA">
      {box
        ? <div className="pointer-events-none absolute rounded-2xl transition-all" style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2, boxShadow: '0 0 0 9999px rgba(26,12,20,.62)' }} />
        : <div className="absolute inset-0 bg-[rgba(26,12,20,.62)]" />}
      <div className="absolute flex w-[min(340px,calc(100vw-32px))] flex-col gap-2 rounded-2xl bg-white p-4 shadow-xl"
        style={box ? { top: bubbleTop, bottom: bubbleBottom, left: Math.max(16, Math.min(vw - 356, box.left + box.width / 2 - 170)) } : { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
        {step ? <>
          <span className="text-[12px] font-semibold text-tinta-3">{i} de {steps.length}</span>
          <b className="text-[16px]">{step[1]}</b>
          <p className="text-[14px] leading-snug text-tinta-2">{step[2]}</p>
        </> : <>
          <b className="text-[18px]">¡Bienvenida/o a VINKA!</b>
          <p className="text-[14px] leading-snug text-tinta-2">Te mostramos en 1 minuto dónde está cada cosa. Después, la guía «Primeros pasos» te indica qué hacer primero.</p>
        </>}
        <div className="mt-1 flex items-center justify-between gap-2">
          <button className="text-[13px] font-semibold text-tinta-3 underline" onClick={end}>{step ? 'Saltar' : 'Ahora no'}</button>
          <span className="flex gap-2">
            {i > 0 && <button className="btn-sm h-10 border border-linea bg-white px-3" onClick={() => setI(i - 1)}>Atrás</button>}
            <button className="btn-sm h-10 bg-rosa-accion px-4 text-white" onClick={() => (last ? end() : setI(i + 1))}>{i === 0 ? 'Comenzar' : last ? 'Terminar' : 'Siguiente'}</button>
          </span>
        </div>
      </div>
    </div>
  )
}

/** En Ayuda: volver a mostrar la guía o repetir el recorrido */
export function FirstStepsControls() {
  const { d, mark } = useFirstSteps()
  const [msg, setMsg] = useState('')
  if (!d || !d.total) return null
  return (
    <div className="card flex flex-col gap-2 p-4" aria-label="Guía de primeros pasos">
      <b className="text-[15px]">Guía de primeros pasos</b>
      <span className="text-[13px] text-tinta-3">Llevas {d.done} de {d.total} pasos.{d.hidden ? ' La guía está oculta.' : ''}</span>
      <span className="flex flex-wrap gap-2">
        {d.hidden && <button className="btn-sm h-10 border border-rosa-accion bg-white px-3 text-rosa-texto" onClick={async () => { await mark('mostrar'); setMsg('Listo: la verás en tu pantalla de inicio.') }}>Mostrar la guía</button>}
        <button className="btn-sm h-10 border border-linea bg-white px-3" onClick={async () => { await mark('repetir_recorrido'); setMsg('Listo: el recorrido aparecerá al volver al inicio.') }}>Ver el recorrido otra vez</button>
      </span>
      {msg && <span className="text-[12px] text-[#134A2B]">{msg}</span>}
    </div>
  )
}
