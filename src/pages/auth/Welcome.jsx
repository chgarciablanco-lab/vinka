import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Svg } from '../../components/ui'
import { FeaturedBadge, trackPromo } from '../../lib/promo'
import { salaryText } from '../../lib/catalog'

const money = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`
/** Recuerda qué quería contratar la persona para llevarla ahí después de registrarse o ingresar */
export const setNext = (path) => { try { localStorage.setItem('vinka-next', path) } catch { /* sin almacenamiento */ } }

const PERSONAS = [
  ['user', 'Tu perfil en minutos', 'Sube tu CV y la IA te propone tus datos laborales. Tú confirmas qué se guarda.'],
  ['card', 'Vacantes que calzan contigo', 'Te mostramos ofertas según tu cargo, nivel y comuna, no avisos al azar.'],
  ['chat', 'Match y chat directo', 'Si a ti y a la empresa les interesa, conversan en VINKA y agendan la entrevista.'],
  ['check', 'Postular es gratis', 'Siempre. Nunca te cobraremos por postular ni por ser contratado/a.'],
  ['calendar', 'Alertas y seguimiento', 'Te avisamos de vacantes nuevas y ves en qué etapa va cada proceso.'],
  ['shield', 'Tú controlas tu privacidad', 'Tu teléfono y correo solo los ve quien tú autorices.'],
]
const EMPRESAS = [
  ['people', 'Candidatos que calzan', 'Publica tu vacante y recibe personas con el cargo y nivel que buscas, de tu zona.'],
  ['columns', 'Proceso de selección ordenado', 'Etapas, mensajes automáticos, plantillas y aviso a quienes no siguen.'],
  ['star', 'Evaluación en equipo', 'Evaluaciones a ciegas, comparación lado a lado y aprobaciones.'],
  ['calendar', 'Entrevistas y ofertas', 'Agenda con horarios disponibles, recordatorios y carta oferta digital.'],
  ['edit', 'IA que ayuda, tú decides', 'Redacta avisos, detecta sesgos y ordena tus apuntes de entrevista.'],
  ['chart', 'Página de empleos y reportes', 'Tu propia página para compartir vacantes, embudo, tiempos y fuentes.'],
]
const FAQ = [
  ['¿Cuánto cuesta para quienes buscan trabajo?', 'Nada. Crear tu perfil, postular, hacer match y conversar con empresas es gratis. La asesoría con reclutador es un servicio opcional.'],
  ['¿Cómo pago una asesoría?', 'Al solicitarla no pagas nada. Un reclutador de VINKA te contacta, confirma el servicio y te envía los datos para pagar por transferencia o tarjeta. La asesoría comienza al confirmar el pago.'],
  ['¿Qué es un perfil o una oferta destacada?', 'Es opcional: aparece entre los primeros resultados, con una etiqueta, solo donde ya calza. No cambia cómo se evalúa a nadie, no oculta a los demás y se puede desactivar cuando quieras.'],
  ['¿La asesoría me da ventaja ante las empresas?', 'No. Las empresas no saben si contrataste una asesoría y no cambia tus matches. Te ayuda a presentarte mejor y a buscar con un plan.'],
  ['¿Cómo funciona la prueba para empresas?', 'Toda empresa nueva parte con 30 días del plan Pyme. Si no eliges un plan, pasa al plan Gratis sin perder nada.'],
  ['¿Cómo verifican a las empresas?', 'Revisamos el RUT y la razón social antes de publicar. Así quienes postulan saben que la oferta es real.'],
  ['¿Qué pasa con mis datos?', 'Se guardan en servidores seguros y se usan solo para conectar personas y empresas, según la Ley 19.628 y la Ley 21.719. Puedes descargarlos o borrar tu cuenta cuando quieras.'],
]

function Feature({ icon, title, text, tone }) {
  return (
    <div className="flex gap-3.5 rounded-2xl border border-[#EFE4EA] bg-white p-4">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}><Svg name={icon} size={22} /></span>
      <span className="flex flex-col gap-1"><span className="font-display text-[15px] font-semibold">{title}</span><span className="text-sm leading-relaxed text-tinta-3">{text}</span></span>
    </div>
  )
}

export default function Welcome() {
  const nav = useNavigate()
  const [services, setServices] = useState(null)
  const [plans, setPlans] = useState(null)
  const [promo, setPromo] = useState([])
  const [featuredJobs, setFeaturedJobs] = useState([])
  useEffect(() => {
    supabase.from('promo_products').select('id, target, days, price_clp, price_mode').eq('active', true).order('sort').then(({ data }) => setPromo(data || []))
    supabase.rpc('public_featured_jobs', { p_limit: 6 }).then(({ data }) => { setFeaturedJobs(data || []); trackPromo((data || []).map((j) => j.promotion_id)) })
    supabase.from('career_services').select('id, name, summary, includes, price_clp, delivery').eq('active', true).order('sort').then(({ data }) => setServices(data || []))
    supabase.from('plans').select('*').order('sort').then(({ data }) => setPlans(data || []))
  }, [])
  const go = (to, next) => { if (next) setNext(next); nav(to) }

  return (
    <div className="min-h-full bg-rosa-fondo text-tinta">
      {/* Encabezado */}
      <header className="sticky top-0 z-30 border-b border-[#F1E4EB] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5">
          <span className="font-display text-[22px] font-bold tracking-wide">VINKA</span>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-tinta-2 md:flex" aria-label="Secciones">
            <a href="#personas" className="hover:text-rosa-texto">Para personas</a>
            <a href="#empresas" className="hover:text-rosa-texto">Para empresas</a>
            <a href="#precios" className="hover:text-rosa-texto">Precios</a>
            <a href="#preguntas" className="hover:text-rosa-texto">Preguntas</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/ingresar" className="btn-sm h-10 border border-linea bg-white px-4">Ingresar</Link>
            <a href="#empezar" className="btn-sm hidden h-10 bg-rosa-accion px-4 text-white sm:inline-flex">Crear cuenta</a>
          </div>
        </div>
      </header>

      {/* Portada */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-14 pt-10 md:grid-cols-[1.1fr_1fr] md:pt-16">
        <div className="flex flex-col gap-5">
          <span className="self-start rounded-full bg-rosa-palido px-3 py-1 text-[13px] font-semibold text-rosa-texto">Empleo y selección para todo Chile</span>
          <h1 className="font-display text-[34px] font-bold leading-[1.1] md:text-[48px]">Tu próximo <span className="text-rosa-accion">match</span> laboral empieza aquí.</h1>
          <p className="max-w-xl text-[17px] leading-relaxed text-tinta-3">VINKA conecta a personas que buscan trabajo con empresas verificadas. Match por cargo y nivel, chat directo y procesos de selección ordenados, desde el teléfono o el computador.</p>
          <div id="empezar" className="grid gap-3 sm:grid-cols-2">
            <button onClick={() => go('/registro/candidato')} className="flex items-center gap-3 rounded-2xl border-2 border-rosa-accion bg-white p-4 text-left shadow-[0_6px_18px_rgba(208,46,114,0.12)]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rosa-palido text-rosa-accion"><Svg name="user" size={22} /></span>
              <span className="flex flex-col"><span className="font-display text-[16px] font-semibold">Busco trabajo</span><span className="text-[13px] text-tinta-3">Gratis, con o sin experiencia</span></span>
            </button>
            <button onClick={() => go('/registro/empresa')} className="flex items-center gap-3 rounded-2xl border border-[#E6DCE3] bg-white p-4 text-left">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-naranja-palido text-[#B85F00]"><Svg name="building" size={22} /></span>
              <span className="flex flex-col"><span className="font-display text-[16px] font-semibold">Busco talento</span><span className="text-[13px] text-tinta-3">30 días de prueba gratis</span></span>
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {['Postular siempre es gratis', 'Empresas verificadas', 'Datos protegidos', 'Todo Chile'].map((t) => (
              <span key={t} className="flex items-center gap-1.5 rounded-full border border-[#E6DCE3] bg-white px-3 py-1.5 text-[13px] text-tinta-3"><Svg name="check" size={14} className="text-[#2F7A4F]" />{t}</span>
            ))}
          </div>
        </div>
        {/* Ilustración: así se ve un match */}
        <div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
          <div className="absolute -right-4 -top-4 h-40 w-40 rounded-full bg-naranja-palido" />
          <div className="absolute -bottom-6 -left-6 h-32 w-32 rounded-full bg-rosa-palido" />
          <div className="relative flex flex-col gap-3 rounded-[28px] border border-[#F1E4EB] bg-white p-5 shadow-[0_20px_50px_rgba(48,37,56,0.12)]">
            <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">Vacante sugerida</span><span className="rounded-full bg-[#EAF6EF] px-2 py-0.5 text-[11px] font-semibold text-[#134A2B]">Empresa verificada</span></div>
            <span className="font-display text-xl font-semibold">Ejecutivo/a de ventas</span>
            <span className="text-sm text-tinta-3">Talca · Jornada completa · Presencial</span>
            <span className="text-sm font-semibold">$650.000 – $800.000 líquido</span>
            <div className="flex flex-wrap gap-1.5">{['Atención al cliente', 'Metas', 'Licencia B'].map((t) => <span key={t} className="rounded-md bg-[#F4EEF2] px-2 py-0.5 text-xs">{t}</span>)}</div>
            <div className="mt-1 grid grid-cols-2 gap-2"><span className="flex h-11 items-center justify-center rounded-xl border border-linea text-sm font-semibold text-tinta-3">No me interesa</span><span className="flex h-11 items-center justify-center rounded-xl bg-rosa-accion text-sm font-semibold text-white">Me interesa</span></div>
          </div>
          <div className="relative -mt-3 ml-auto w-56 rounded-2xl bg-morado p-3.5 text-white shadow-lg"><span className="text-[13px] font-semibold">¡Es un match! 🎉</span><span className="block text-xs text-white/80">La empresa también se interesó en ti. Escríbele.</span></div>
        </div>
      </section>

      {/* Ofertas destacadas (pagadas por las empresas; rotan) */}
      {featuredJobs.length > 0 && (
        <section className="mx-auto flex max-w-6xl flex-col gap-4 px-5 pb-12">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-display text-[22px] font-bold md:text-[26px]">Ofertas destacadas</h2>
            <span className="text-xs text-tinta-3">Empresas verificadas · publicidad</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featuredJobs.map((j) => (
              <Link key={j.id} to={`/empleo/${j.id}`} onClick={() => trackPromo([j.promotion_id], 'click')} className="flex flex-col gap-1.5 rounded-2xl border border-[#F0DDA0] bg-white p-4 hover:border-[#E6C66A]">
                <FeaturedBadge />
                <span className="font-display text-[16px] font-semibold leading-snug">{j.title}</span>
                <span className="text-sm text-tinta-3">{j.company} · {j.modality === 'Remota' ? 'Remoto' : [j.comuna, j.region].filter(Boolean).join(', ')}</span>
                {salaryText(j) && <span className="text-sm font-semibold text-tinta-2">{salaryText(j)}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Para personas */}
      <section id="personas" className="scroll-mt-16 bg-white py-14">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5">
          <div className="flex max-w-2xl flex-col gap-2">
            <span className="text-sm font-semibold uppercase tracking-wide text-rosa-texto">Para personas que buscan trabajo</span>
            <h2 className="font-display text-[28px] font-bold leading-tight md:text-[34px]">Busca trabajo sin perder tiempo</h2>
            <p className="text-[16px] leading-relaxed text-tinta-3">Todo lo esencial es gratis, siempre.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PERSONAS.map(([i, t, d]) => <Feature key={t} icon={i} title={t} text={d} tone="bg-rosa-palido text-rosa-accion" />)}
          </div>
          <button onClick={() => go('/registro/candidato')} className="btn self-start px-6">Crear mi perfil gratis</button>

          <div className="mt-4 flex flex-col gap-2" id="asesorias">
            <h3 className="font-display text-[24px] font-bold">Asesoría con reclutador <span className="text-base font-medium text-tinta-3">(opcional)</span></h3>
            <p className="max-w-2xl text-[15px] leading-relaxed text-tinta-3">Un reclutador de VINKA te ayuda a mejorar tu CV y a ordenar tu búsqueda. Todo ocurre dentro de la app: conversación, sesiones, tu CV mejorado y las ofertas que te recomienda.</p>
          </div>
          {services == null ? <div className="h-40 animate-pulse rounded-2xl bg-[#F6EEF3]" /> : (
            <div className="grid gap-4 md:grid-cols-3">
              {services.map((s) => {
                const featured = s.id === 'completa'
                return (
                  <div key={s.id} className={`flex flex-col gap-3 rounded-3xl border bg-rosa-fondo p-5 ${featured ? 'border-2 border-rosa-accion' : 'border-[#EFE4EA]'}`}>
                    {featured && <span className="self-start rounded-full bg-rosa-accion px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">Más completa</span>}
                    <span className="font-display text-[18px] font-semibold">{s.name}</span>
                    <span className="font-display text-[32px] font-bold leading-none">{money(s.price_clp)}</span>
                    <span className="text-xs text-tinta-3">Pago único, IVA incluido · {s.delivery}</span>
                    <p className="text-sm leading-relaxed text-tinta-2">{s.summary}</p>
                    <ul className="flex flex-col gap-1.5 text-sm">{(s.includes || []).map((x) => <li key={x} className="flex gap-2"><Svg name="check" size={18} className="shrink-0 text-[#2F7A4F]" />{x}</li>)}</ul>
                    <button onClick={() => go('/registro/candidato', '/asesoria')} className={`mt-auto ${featured ? 'btn' : 'btn-sec'}`}>Pedir esta asesoría</button>
                  </div>
                )
              })}
            </div>
          )}
          <p className="text-[13px] text-tinta-3">No pagas al solicitar: te contactamos para confirmar y coordinar el pago. Contratar una asesoría no cambia tus postulaciones ni cómo te ven las empresas.</p>
          {promo.some((x) => x.target === 'profile') && (
            <div className="mt-2 flex flex-col gap-4 rounded-3xl border border-[#F0DDA0] bg-[#FFF9E8] p-5 md:flex-row md:items-center">
              <div className="flex flex-1 flex-col gap-1.5">
                <FeaturedBadge kind="profile" />
                <h3 className="font-display text-[20px] font-bold">Perfil destacado <span className="text-base font-medium text-tinta-3">(opcional)</span></h3>
                <p className="text-sm leading-relaxed text-tinta-2">Aparece entre los primeros cuando una empresa busca personas para una vacante que te calza. Postular sigue siendo gratis y no cambia cómo te evalúan.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {promo.filter((x) => x.target === 'profile').map((x) => (
                  <span key={x.id} className="flex flex-col rounded-xl border border-[#F0DDA0] bg-white px-3.5 py-2"><b className="text-[15px]">{x.days} días</b><span className="text-sm">{money(x.price_clp)}</span></span>
                ))}
              </div>
              <button onClick={() => go('/registro/candidato', '/visibilidad')} className="btn-sec shrink-0 md:w-auto md:px-6">Destacar mi perfil</button>
            </div>
          )}
        </div>
      </section>

      {/* Para empresas */}
      <section id="empresas" className="scroll-mt-16 py-14">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5">
          <div className="flex max-w-2xl flex-col gap-2">
            <span className="text-sm font-semibold uppercase tracking-wide text-[#B85F00]">Para empresas y pymes</span>
            <h2 className="font-display text-[28px] font-bold leading-tight md:text-[34px]">Recluta como una empresa grande, con el tiempo de una pyme</h2>
            <p className="text-[16px] leading-relaxed text-tinta-3">Publica, recibe candidatos que calzan y lleva todo el proceso en un solo lugar.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {EMPRESAS.map(([i, t, d]) => <Feature key={t} icon={i} title={t} text={d} tone="bg-naranja-palido text-[#B85F00]" />)}
          </div>
        </div>
      </section>

      {/* Planes */}
      <section id="precios" className="scroll-mt-16 bg-white py-14">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5">
          <div className="flex max-w-2xl flex-col gap-2">
            <span className="text-sm font-semibold uppercase tracking-wide text-[#B85F00]">Planes para empresas</span>
            <h2 className="font-display text-[28px] font-bold leading-tight md:text-[34px]">Paga según lo que contratas</h2>
            <p className="text-[16px] leading-relaxed text-tinta-3">Todas las funciones están incluidas en todos los planes. Cambia según cuántas vacantes publicas a la vez y cuántas personas de tu equipo participan.</p>
          </div>
          {plans == null ? <div className="h-48 animate-pulse rounded-2xl bg-[#F6EEF3]" /> : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((p) => {
                const featured = p.id === 'pyme'
                return (
                  <div key={p.id} className={`flex flex-col gap-3 rounded-3xl border p-5 ${featured ? 'border-2 border-[#FF941E] bg-naranja-palido/40' : 'border-[#EFE4EA] bg-rosa-fondo'}`}>
                    {featured && <span className="self-start rounded-full bg-[#FF941E] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">30 días gratis</span>}
                    <span className="font-display text-[18px] font-semibold">{p.name}</span>
                    <span className="font-display text-[28px] font-bold leading-none">{p.price_clp == null ? 'A medida' : p.price_clp === 0 ? 'Gratis' : money(p.price_clp)}</span>
                    <span className="text-xs text-tinta-3">{p.price_clp ? 'mensual + IVA' : p.price_clp === 0 ? 'para siempre' : 'cotización según tu empresa'}</span>
                    <ul className="flex flex-col gap-1.5 text-sm">
                      <li className="flex gap-2"><Svg name="check" size={18} className="shrink-0 text-[#2F7A4F]" />{p.max_active_jobs == null ? 'Vacantes sin límite' : `${p.max_active_jobs} ${p.max_active_jobs === 1 ? 'vacante publicada' : 'vacantes publicadas'} a la vez`}</li>
                      <li className="flex gap-2"><Svg name="check" size={18} className="shrink-0 text-[#2F7A4F]" />{p.max_members == null ? 'Equipo sin límite' : `${p.max_members} ${p.max_members === 1 ? 'persona' : 'personas'} en el equipo`}</li>
                      <li className="flex gap-2"><Svg name="check" size={18} className="shrink-0 text-[#2F7A4F]" />{p.ai_monthly.toLocaleString('es-CL')} consultas de IA al mes</li>
                      <li className="flex gap-2"><Svg name="check" size={18} className="shrink-0 text-[#2F7A4F]" />{p.promo_credits ? `${p.promo_credits} ${p.promo_credits === 1 ? 'oferta destacada' : 'ofertas destacadas'} de ${p.promo_days} días al mes` : 'Ofertas destacadas sueltas'}</li>
                      <li className="flex gap-2"><Svg name="check" size={18} className="shrink-0 text-[#2F7A4F]" />Proceso de selección, chat, agenda y reportes</li>
                    </ul>
                    <button onClick={() => go('/registro/empresa', p.id === 'gratis' ? null : '/plan')} className={`mt-auto ${featured ? 'btn' : 'btn-sec'}`}>
                      {p.id === 'gratis' ? 'Comenzar gratis' : p.price_clp == null ? 'Pedir cotización' : featured ? 'Probar 30 días gratis' : `Elegir ${p.name}`}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <p className="text-[13px] text-tinta-3">Toda empresa nueva parte con 30 días del plan Pyme. Si no eliges un plan, pasa al plan Gratis sin perder tus datos. Pago por transferencia o tarjeta, con factura.{promo.some((x) => x.target === 'job') && <> Ofertas destacadas sueltas, con cualquier plan: {promo.filter((x) => x.target === 'job').map((x) => `${x.days} días ${money(x.price_clp)}`).join(' · ')} + IVA.</>}</p>
        </div>
      </section>

      {/* Cómo funciona y confianza */}
      <section className="py-14">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <h2 className="font-display text-[26px] font-bold">Cómo funciona</h2>
            {[['1', 'Crea tu cuenta', 'Como persona o como empresa. Toma un par de minutos.'], ['2', 'Completa tu perfil o publica tu vacante', 'Sube tu CV o describe el cargo; la IA te ayuda a redactar.'], ['3', 'Hagan match y conversen', 'Cuando hay interés mutuo se abre el chat y se agenda la entrevista.'], ['4', 'Contrata lo que necesites', 'Asesoría con reclutador para personas; planes para empresas que contratan más.']].map(([nn, t, dd]) => (
              <div key={nn} className="flex gap-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-morado font-display font-bold text-white">{nn}</span><span className="flex flex-col gap-0.5"><span className="font-display font-semibold">{t}</span><span className="text-sm text-tinta-3">{dd}</span></span></div>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-[26px] font-bold">Confianza</h2>
            <Feature icon="shield" title="Empresas verificadas" text="Revisamos RUT y razón social antes de que una empresa publique." tone="bg-[#EAF6EF] text-[#2F7A4F]" />
            <Feature icon="user" title="Tus datos, protegidos" text="Cumplimos la Ley 19.628 y la Ley 21.719. Descarga tus datos o borra tu cuenta cuando quieras." tone="bg-[#EAF6EF] text-[#2F7A4F]" />
            <Feature icon="check" title="IA sin discriminación" text="La IA no usa nombre, edad ni datos personales, y nunca decide: siempre decide una persona." tone="bg-[#EAF6EF] text-[#2F7A4F]" />
          </div>
        </div>
      </section>

      {/* Preguntas */}
      <section id="preguntas" className="scroll-mt-16 bg-white py-14">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-5">
          <h2 className="font-display text-[26px] font-bold">Preguntas frecuentes</h2>
          {FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-2xl border border-[#EFE4EA] bg-rosa-fondo p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">{q}<Svg name="chevron" size={18} className="shrink-0 rotate-90 text-tinta-suave transition group-open:-rotate-90" /></summary>
              <p className="mt-2 text-sm leading-relaxed text-tinta-3">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Llamado final */}
      <section className="py-14">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-5 rounded-[32px] bg-morado px-6 py-10 text-center text-white">
          <h2 className="font-display text-[26px] font-bold leading-tight md:text-[32px]">¿Empezamos?</h2>
          <p className="max-w-xl text-white/80">Crea tu cuenta gratis. Si ya tienes una, ingresa y sigue donde quedaste.</p>
          <div className="grid w-full max-w-md gap-3 sm:grid-cols-2">
            <button onClick={() => go('/registro/candidato')} className="btn">Busco trabajo</button>
            <button onClick={() => go('/registro/empresa')} className="btn-sec border-white bg-transparent text-white">Busco talento</button>
          </div>
          <Link to="/ingresar" className="text-sm font-semibold text-white underline">Ya tengo cuenta</Link>
        </div>
      </section>

      <footer className="border-t border-[#F1E4EB] bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-sm text-tinta-3 sm:flex-row">
          <span><b className="font-display text-tinta">VINKA</b> · Empleo y selección en Chile</span>
          <span className="flex gap-4"><Link to="/legal/terminos" className="hover:text-rosa-texto">Términos</Link><Link to="/legal/privacidad" className="hover:text-rosa-texto">Privacidad</Link><Link to="/ingresar" className="hover:text-rosa-texto">Ingresar</Link></span>
        </div>
      </footer>
    </div>
  )
}
