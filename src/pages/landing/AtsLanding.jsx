import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Svg } from '../../components/ui'
import { setNext } from '../auth/Welcome'

// Portada de VINKA ATS: software de reclutamiento y selección para pymes, empresas y consultoras.
// Misma app, cuentas y vacantes que VINKA Empleo. Las capturas son del ATS con datos de demostración.
const money = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`
const BG = '#1B1220'

const FEATURES = [
  ['plus', 'Publicación de vacantes', 'La IA redacta el aviso y detecta sesgos. Comparte el enlace por WhatsApp, LinkedIn o tu web, y publícalo también en VINKA Empleo.'],
  ['columns', 'Seguimiento de candidatos', 'Etapas, filtros, evaluaciones con criterios, notas internas y comparación lado a lado. Todas las postulaciones en un solo proceso.'],
  ['calendar', 'Agenda de entrevistas', 'Publica tus horarios libres y la persona elige uno desde el chat. Recordatorios y todo en hora de Chile.'],
  ['people', 'Trabajo en equipo', 'Roles de administrador, reclutador y evaluador, aprobaciones, plantillas y automatizaciones. Suma asesores con sus permisos.'],
  ['doc', 'Informes psicolaborales con IA', 'Sube CV y entrevista: la IA redacta el informe en tu formato, sin datos protegidos. Test DISC propio y comparativo de candidatos.'],
  ['chart', 'Carta oferta y reportes', 'Carta oferta digital con tu logo, embudo, tiempos y fuentes de cada proceso.'],
]
const SHOTS = [['e_vacante', 'Publica la vacante'], ['e_proceso', 'Sigue a cada persona'], ['e_agenda', 'Agenda entrevistas'], ['e_equipo', 'Trabaja en equipo']]
const FLOW = [
  ['1', 'Crea la vacante en VINKA ATS', 'Con ayuda de la IA, en pocos minutos.'],
  ['2', 'Compártela donde quieras', 'Enlace para WhatsApp, LinkedIn o tu web, y también en VINKA Empleo.'],
  ['3', 'Todo llega al mismo proceso', 'Quienes postulan por el enlace o hacen match en VINKA Empleo entran a la misma vacante.'],
  ['4', 'Decide en equipo', 'Tu equipo y los asesores que invites trabajan sobre ese proceso con sus permisos.'],
]

export default function AtsLanding() {
  const nav = useNavigate()
  const [plans, setPlans] = useState(null)
  const [menu, setMenu] = useState(false)
  useEffect(() => { supabase.from('plans').select('*').order('sort').then(({ data }) => setPlans(data || []), () => setPlans([])) }, [])
  const demo = () => nav('/cotizar?demo=1')
  const trial = () => nav('/registro/empresa')

  return (
    <div className="min-h-full text-white" style={{ background: BG }}>
      <header className="sticky top-0 z-30 border-b border-white/10 backdrop-blur" style={{ background: 'rgba(27,18,32,.88)' }}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5">
          <Link to="/portada/ats" className="flex items-baseline gap-1.5" aria-label="VINKA ATS, inicio">
            <span className="font-display text-[22px] font-bold tracking-wide">VINKA</span><span className="font-display text-[15px] font-semibold text-[#FF6FA8]">ATS</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-white/80 md:flex" aria-label="Menú principal">
            <a href="#funciones" className="hover:text-white">Funciones</a>
            <a href="#planes" className="hover:text-white">Planes</a>
            <Link to="/ingresar" className="hover:text-white">Ingresar</Link>
            <Link to="/portada/empleo" className="text-white/60 hover:text-white">VINKA Empleo</Link>
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={demo} className="btn-sm hidden h-10 bg-rosa-accion px-4 text-white sm:inline-flex">Solicitar demo</button>
            <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 md:hidden" aria-label="Abrir menú" aria-expanded={menu} onClick={() => setMenu(!menu)}><Svg name={menu ? 'x' : 'dots'} size={20} /></button>
          </div>
        </div>
        {menu && (
          <nav className="flex flex-col border-t border-white/10 px-5 py-2 text-[15px] font-semibold md:hidden" aria-label="Menú">
            <a href="#funciones" onClick={() => setMenu(false)} className="py-3">Funciones</a>
            <a href="#planes" onClick={() => setMenu(false)} className="py-3">Planes</a>
            <Link to="/ingresar" className="py-3">Ingresar</Link>
            <Link to="/portada/empleo" className="py-3 text-[#FF8FBA]">¿Buscas trabajo? VINKA Empleo</Link>
          </nav>
        )}
      </header>

      {/* Portada */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-14 pt-10 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
        <div className="flex flex-col gap-5">
          <span className="self-start rounded-full border border-[#FF6FA8]/40 bg-[#FF6FA8]/10 px-3 py-1 text-[13px] font-semibold text-[#FF8FBA]">Software de reclutamiento y selección para empresas</span>
          <h1 className="font-display text-[34px] font-bold leading-[1.1] md:text-[48px]">Contrata mejor y más rápido, <span className="text-[#FF6FA8]">con todo tu equipo</span>.</h1>
          <p className="max-w-xl text-[17px] leading-relaxed text-white/75">Para pymes, empresas y consultoras de Chile. Publica, recibe postulaciones de todos tus canales en un solo proceso, entrevista y envía la oferta sin planillas ni correos sueltos.</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button onClick={demo} className="btn sm:w-auto sm:px-7">Solicitar demo</button>
            <button onClick={trial} className="flex h-12 items-center justify-center rounded-2xl border border-white/30 px-6 text-[15px] font-semibold text-white hover:bg-white/10">Probar gratis 30 días</button>
          </div>
          <span className="text-[13px] text-white/60">Sin tarjeta. Al terminar la prueba sigues en el plan Gratis sin perder tus datos.</span>
        </div>
        {/* Capturas reales del ATS con datos de demostración */}
        <figure className="relative mx-auto flex w-full max-w-lg items-end justify-center gap-3">
          {[['e_proceso', 'rotate-[-4deg] translate-y-4'], ['e_vacante', 'z-10 scale-105'], ['e_agenda', 'rotate-[4deg] translate-y-4']].map(([img, cls]) => (
            <img key={img} src={`/media/tut/${img}.jpg`} alt="" className={`w-[31%] rounded-[18px] border-4 border-[#2C1E33] shadow-[0_20px_50px_rgba(0,0,0,.45)] ${cls}`} loading="lazy" />
          ))}
          <figcaption className="absolute -bottom-7 left-0 right-0 text-center text-[11px] text-white/50">Capturas de VINKA ATS con datos de demostración</figcaption>
        </figure>
      </section>

      {/* Cómo funciona con VINKA Empleo */}
      <section className="border-y border-white/10 py-12" style={{ background: '#22172A' }}>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5">
          <h2 className="font-display text-[26px] font-bold leading-tight md:text-[30px]">Un solo proceso, todos tus canales</h2>
          <ol className="grid gap-3 md:grid-cols-4">
            {FLOW.map(([n, t, d]) => (
              <li key={n} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rosa-accion text-[14px] font-bold">{n}</span>
                <b className="text-[15px]">{t}</b><span className="text-[13px] leading-relaxed text-white/70">{d}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Funciones */}
      <section id="funciones" className="scroll-mt-16 py-14">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5">
          <div className="flex max-w-2xl flex-col gap-2">
            <span className="text-sm font-semibold uppercase tracking-wide text-[#FF8FBA]">Funciones</span>
            <h2 className="font-display text-[28px] font-bold leading-tight md:text-[34px]">Todo el proceso de selección en un lugar</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([ic, t, d]) => (
              <div key={t} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rosa-accion/20 text-[#FF8FBA]"><Svg name={ic} size={22} /></span>
                <b className="font-display text-[17px]">{t}</b><span className="text-[14px] leading-relaxed text-white/70">{d}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {SHOTS.map(([img, t]) => (
              <figure key={img} className="flex flex-col gap-2">
                <img src={`/media/tut/${img}.jpg`} alt={`Captura de VINKA ATS: ${t}`} className="rounded-2xl border-4 border-[#2C1E33]" loading="lazy" />
                <figcaption className="text-center text-[13px] font-semibold text-white/80">{t}</figcaption>
              </figure>
            ))}
          </div>
          <p className="text-[12px] text-white/50">Capturas con datos de demostración: las personas y empresas que aparecen no son reales.</p>
        </div>
      </section>

      {/* Planes */}
      <section id="planes" className="scroll-mt-16 border-t border-white/10 py-14" style={{ background: '#22172A' }}>
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5">
          <div className="flex max-w-2xl flex-col gap-2">
            <span className="text-sm font-semibold uppercase tracking-wide text-[#FF8FBA]">Planes</span>
            <h2 className="font-display text-[28px] font-bold leading-tight md:text-[34px]">Todas las funciones en todos los planes</h2>
            <p className="text-[15px] text-white/70">Cambia según cuántas vacantes publicas a la vez y cuántas personas de tu equipo participan.</p>
          </div>
          {plans == null ? <div className="h-48 animate-pulse rounded-2xl bg-white/5" /> : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {plans.filter((p) => p.id !== 'asesor').slice(0, 4).map((p) => {
                const featured = p.id === 'pyme'
                return (
                  <div key={p.id} className={`flex flex-col gap-3 rounded-3xl border p-5 ${featured ? 'border-2 border-rosa-accion bg-rosa-accion/10' : 'border-white/10 bg-white/[0.04]'}`}>
                    {featured && <span className="self-start rounded-full bg-rosa-accion px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">30 días gratis</span>}
                    <span className="font-display text-[18px] font-semibold">{p.name}</span>
                    <span className="font-display text-[28px] font-bold leading-none">{p.price_clp == null ? 'A medida' : money(p.price_clp)}</span>
                    <span className="text-xs text-white/60">{p.price_clp ? 'mensual + IVA' : p.price_clp === 0 ? 'para siempre' : 'cotización según tu empresa'}</span>
                    <ul className="flex flex-col gap-1.5 text-sm text-white/85">
                      <li className="flex gap-2"><Svg name="check" size={18} className="shrink-0 text-[#7FD3A4]" />{p.max_active_jobs == null ? 'Vacantes sin límite' : `${p.max_active_jobs} ${p.max_active_jobs === 1 ? 'vacante publicada' : 'vacantes publicadas'} a la vez`}</li>
                      <li className="flex gap-2"><Svg name="check" size={18} className="shrink-0 text-[#7FD3A4]" />{p.max_members == null ? 'Equipo sin límite' : `${p.max_members} ${p.max_members === 1 ? 'persona' : 'personas'} en el equipo`}</li>
                      {p.report_monthly ? <li className="flex gap-2"><Svg name="check" size={18} className="shrink-0 text-[#7FD3A4]" />{p.report_monthly} informes psicolaborales con IA al mes</li> : null}
                    </ul>
                    <button onClick={() => (p.price_clp == null ? nav(`/cotizar?plan=${p.id}`) : (p.id !== 'gratis' && setNext('/plan'), trial()))}
                      className={`mt-auto h-11 rounded-xl text-[14px] font-semibold ${featured ? 'bg-rosa-accion text-white' : 'border border-white/30 text-white hover:bg-white/10'}`}>
                      {p.id === 'gratis' ? 'Comenzar gratis' : p.price_clp == null ? 'Pedir cotización' : featured ? 'Probar 30 días gratis' : `Elegir ${p.name}`}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <p className="text-[13px] text-white/60">¿Eres consultora o tienes muchas vacantes? <Link to="/cotizar?motivo=consultora" className="font-semibold text-[#FF8FBA] underline">Pide una cotización</Link>.</p>
        </div>
      </section>

      {/* Cierre */}
      <section className="px-5 py-14">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 rounded-3xl bg-gradient-to-br from-rosa-accion to-[#8A1B4A] px-6 py-8 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1"><b className="font-display text-[22px]">Te mostramos VINKA ATS con tus propios cargos</b><span className="text-[14px] text-white/85">Una demo de 30 minutos, sin compromiso.</span></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button onClick={demo} className="h-11 rounded-xl bg-white px-5 text-[14px] font-semibold text-[#8A1B4A]">Solicitar demo</button>
            <button onClick={trial} className="h-11 rounded-xl border border-white/60 px-5 text-[14px] font-semibold">Probar gratis</button>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 text-[13px] text-white/60">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-5">
          <span>© VINKA ATS · contacto@vinka.cl</span>
          <span className="flex flex-wrap gap-4"><Link to="/legal/terminos">Términos</Link><Link to="/legal/privacidad">Privacidad</Link><Link to="/ayuda">Ayuda</Link><Link to="/portada/empleo">¿Buscas trabajo? VINKA Empleo</Link></span>
        </div>
      </footer>
    </div>
  )
}
