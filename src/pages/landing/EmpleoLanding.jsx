import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Svg } from '../../components/ui'
import { salaryText } from '../../lib/catalog'
import { setNext } from '../auth/Welcome'

// Portada de VINKA Empleo: para personas que buscan trabajo. Misma app, cuentas y vacantes que VINKA ATS.
const money = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`
const MOD = { presencial: 'Presencial', hibrida: 'Híbrida', remota: 'Remota' }

/** Vacantes recientes publicadas por empresas verificadas. Si la función aún no existe, usa las destacadas. */
export function useRecentJobs(limit = 6) {
  const [jobs, setJobs] = useState(null)
  useEffect(() => {
    supabase.rpc('public_recent_jobs', { p_limit: limit }).then(({ data, error }) => {
      if (!error && Array.isArray(data)) return setJobs(data)
      supabase.rpc('public_featured_jobs', { p_limit: limit }).then(({ data: f }) => setJobs(f || []), () => setJobs([]))
    }, () => setJobs([]))
  }, [limit])
  return jobs
}

export function JobMiniCard({ j }) {
  return (
    <Link to={`/empleo/${j.id}`} className="flex flex-col gap-2 rounded-2xl border border-[#F1E4EB] bg-white p-4 shadow-[0_6px_18px_rgba(48,37,56,0.06)] transition hover:border-rosa-borde">
      <div className="flex items-start justify-between gap-2">
        <span className="font-display text-[16px] font-semibold leading-snug">{j.title}</span>
        {j.demo && <span className="shrink-0 rounded-full bg-[#FFF4E5] px-2 py-0.5 text-[11px] font-semibold text-[#8F4500]">Aviso de demostración</span>}
      </div>
      <span className="text-[13px] text-tinta-3">{j.company}{j.comuna ? ` · ${j.comuna}` : ''}{j.modality ? ` · ${MOD[j.modality] || j.modality}` : ''}</span>
      {(j.salary_min || j.salary_max) ? <span className="text-[14px] font-semibold">{salaryText(j)}</span> : null}
      <span className="mt-auto flex items-center gap-1 pt-1 text-[13px] font-semibold text-rosa-texto">Ver y postular <Svg name="chevron" size={16} /></span>
    </Link>
  )
}

export default function EmpleoLanding() {
  const nav = useNavigate()
  const { session, profile } = useAuth()
  const jobs = useRecentJobs(6)
  const [services, setServices] = useState([])
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    supabase.from('career_services').select('id, name, summary, price_clp').eq('active', true).order('sort').limit(3).then(({ data }) => setServices(data || []))
  }, [])
  const logged = session && profile?.role === 'candidate'
  const buscar = () => { if (logged) nav('/'); else document.getElementById('vacantes')?.scrollIntoView({ behavior: 'smooth' }) }
  const demoCount = (jobs || []).filter((j) => j.demo).length

  return (
    <div className="min-h-full bg-rosa-fondo text-tinta">
      <header className="sticky top-0 z-30 border-b border-[#F1E4EB] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5">
          <Link to="/portada/empleo" className="flex items-baseline gap-1.5" aria-label="VINKA Empleo, inicio">
            <span className="font-display text-[22px] font-bold tracking-wide">VINKA</span><span className="font-display text-[15px] font-semibold text-rosa-accion">Empleo</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-tinta-2 md:flex" aria-label="Menú principal">
            <a href="#vacantes" className="hover:text-rosa-texto">Vacantes</a>
            <a href="#asesores" className="hover:text-rosa-texto">Asesores</a>
            <Link to="/ingresar" className="hover:text-rosa-texto">Ingresar</Link>
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={buscar} className="btn-sm hidden h-10 bg-rosa-accion px-4 text-white sm:inline-flex">Buscar trabajo</button>
            <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-linea bg-white md:hidden" aria-label="Abrir menú" aria-expanded={menu} onClick={() => setMenu(!menu)}><Svg name={menu ? 'x' : 'dots'} size={20} /></button>
          </div>
        </div>
        {menu && (
          <nav className="flex flex-col border-t border-[#F1E4EB] bg-white px-5 py-2 text-[15px] font-semibold md:hidden" aria-label="Menú">
            <a href="#vacantes" onClick={() => setMenu(false)} className="py-3">Vacantes</a>
            <a href="#asesores" onClick={() => setMenu(false)} className="py-3">Asesores</a>
            <Link to="/ingresar" className="py-3">Ingresar</Link>
            <Link to="/portada/ats" className="py-3 text-rosa-texto">¿Buscas contratar? VINKA ATS</Link>
          </nav>
        )}
      </header>

      {/* Portada */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-12 pt-10 md:grid-cols-[1.1fr_1fr] md:pt-16">
        <div className="flex flex-col gap-5">
          <span className="self-start rounded-full bg-rosa-palido px-3 py-1 text-[13px] font-semibold text-rosa-texto">Empleo en todo Chile · Gratis para ti</span>
          <h1 className="font-display text-[34px] font-bold leading-[1.1] md:text-[48px]">Encuentra un trabajo que <span className="text-rosa-accion">calce contigo</span>.</h1>
          <p className="max-w-xl text-[17px] leading-relaxed text-tinta-3">Vacantes de empresas verificadas según tu cargo, nivel y comuna. Si a ti y a la empresa les interesa, hacen match y conversan directo.</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button onClick={buscar} className="btn flex items-center justify-center gap-2 sm:w-auto sm:px-7"><Svg name="search" size={20} />Buscar trabajo</button>
            {!logged && <button onClick={() => nav('/registro/candidato')} className="btn-sec sm:w-auto sm:px-6">Crear mi perfil gratis</button>}
          </div>
          <div className="flex flex-wrap gap-2">
            {['Postular siempre es gratis', 'Empresas verificadas', 'Tú decides quién ve tus datos'].map((t) => (
              <span key={t} className="flex items-center gap-1.5 rounded-full border border-[#E6DCE3] bg-white px-3 py-1.5 text-[13px] text-tinta-3"><Svg name="check" size={14} className="text-[#2F7A4F]" />{t}</span>
            ))}
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
          <div className="absolute -right-4 -top-4 h-40 w-40 rounded-full bg-naranja-palido" />
          <div className="absolute -bottom-6 -left-6 h-32 w-32 rounded-full bg-rosa-palido" />
          <div className="relative flex flex-col gap-3 rounded-[28px] border border-[#F1E4EB] bg-white p-5 shadow-[0_20px_50px_rgba(48,37,56,0.12)]">
            <span className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">Vacante sugerida para ti</span>
            <span className="font-display text-xl font-semibold">Ejecutivo/a de ventas</span>
            <span className="text-sm text-tinta-3">Talca · Jornada completa · Presencial</span>
            <span className="text-sm font-semibold">$650.000 – $800.000 líquido</span>
            <div className="flex flex-wrap gap-1.5"><span className="rounded-full bg-[#EAF6EF] px-2 py-0.5 text-[12px] font-semibold text-[#134A2B]">✓ Mismo cargo</span><span className="rounded-full bg-[#EAF6EF] px-2 py-0.5 text-[12px] font-semibold text-[#134A2B]">✓ Tu comuna</span></div>
            <div className="mt-1 grid grid-cols-2 gap-2"><span className="flex h-11 items-center justify-center rounded-xl border border-linea text-sm font-semibold text-tinta-3">Pasar</span><span className="flex h-11 items-center justify-center rounded-xl bg-rosa-accion text-sm font-semibold text-white">Me interesa</span></div>
          </div>
          <div className="relative -mt-3 ml-auto w-56 rounded-2xl bg-morado p-3.5 text-white shadow-lg"><span className="text-[13px] font-semibold">¡Es un match! 🎉</span><span className="block text-xs text-white/80">La empresa también se interesó en ti.</span></div>
        </div>
      </section>

      {/* Vacantes recientes */}
      <section id="vacantes" className="scroll-mt-16 bg-white py-12">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-[26px] font-bold leading-tight md:text-[30px]">Vacantes recientes</h2>
              <p className="text-[15px] text-tinta-3">Toca una para ver el detalle y postular. Puedes postular sin crear cuenta.</p>
            </div>
            <button onClick={() => (logged ? nav('/') : (setNext('/'), nav('/registro/candidato')))} className="btn-sm h-10 border border-rosa-accion bg-white px-4 text-rosa-texto">Ver todas las que calzan conmigo</button>
          </div>
          {demoCount > 0 && <p className="rounded-xl bg-[#FFF4E5] px-3 py-2 text-[13px] text-[#8F4500]">VINKA está en etapa piloto: los avisos marcados «Aviso de demostración» son de prueba y no corresponden a empleos reales.</p>}
          {jobs == null ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((k) => <div key={k} className="h-36 animate-pulse rounded-2xl bg-[#F6EEF3]" />)}</div>
            : jobs.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{jobs.map((j) => <JobMiniCard key={j.id} j={j} />)}</div>
            : <p className="rounded-2xl bg-rosa-fondo p-5 text-[15px] text-tinta-3">Aún no hay vacantes públicas. Crea tu perfil y te avisamos cuando aparezca una que calce contigo.</p>}
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="py-12">
        <div className="mx-auto grid max-w-6xl gap-4 px-5 md:grid-cols-3">
          {[['user', 'Crea tu perfil en minutos', 'Sube tu CV y la IA te propone tus datos laborales. Tú confirmas qué se guarda.'],
            ['card', 'Vacantes que calzan', 'Te mostramos ofertas según tu cargo, nivel y comuna. Desliza o toca «Me interesa».'],
            ['chat', 'Match y chat directo', 'Si la empresa también se interesa, conversan en VINKA y agendan la entrevista.']].map(([ic, t, d]) => (
            <div key={t} className="flex flex-col gap-2 rounded-2xl border border-[#F1E4EB] bg-white p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rosa-palido text-rosa-accion"><Svg name={ic} size={22} /></span>
              <b className="font-display text-[17px]">{t}</b><span className="text-[14px] leading-relaxed text-tinta-3">{d}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Asesorías (opcional) y acceso de asesores */}
      <section className="bg-white py-12">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 lg:grid-cols-[1.3fr_1fr]">
          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold uppercase tracking-wide text-[#6B2E8F]">Servicio opcional</span>
            <h2 className="font-display text-[24px] font-bold leading-tight">Asesoría con un reclutador</h2>
            <p className="text-[15px] leading-relaxed text-tinta-3">Si quieres ayuda extra, un asesor/a de VINKA revisa tu CV, te prepara para entrevistas o busca vacantes contigo. Es opcional: postular siempre es gratis.</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {services.map((s) => (
                <div key={s.id} className="flex flex-col gap-1 rounded-xl border border-[#EFE4EA] bg-rosa-fondo p-3">
                  <b className="text-[14px]">{s.name}</b><span className="text-[12px] leading-snug text-tinta-3">{s.summary}</span>
                  {s.price_clp ? <span className="mt-auto pt-1 text-[13px] font-semibold">{money(s.price_clp)}</span> : null}
                </div>
              ))}
            </div>
            <button onClick={() => (logged ? nav('/asesoria') : (setNext('/asesoria'), nav('/registro/candidato')))} className="btn-sm h-10 self-start border border-linea bg-white px-4">Ver asesorías</button>
          </div>
          <div id="asesores" className="flex scroll-mt-20 flex-col gap-3 rounded-3xl bg-[#F7F0FB] p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[#6B2E8F]"><Svg name="people" size={22} /></span>
            <b className="font-display text-[18px]">¿Eres asesor/a de VINKA?</b>
            <p className="text-[14px] leading-relaxed text-tinta-2">Tu cuenta la crea VINKA. Ingresa con el correo y la contraseña temporal que te enviamos; la primera vez te pediremos cambiarla y aceptar las condiciones.</p>
            <Link to="/ingresar" className="btn-sm flex h-11 items-center justify-center bg-[#6B2E8F] px-4 text-white">Ingreso de asesores</Link>
            <a href="mailto:contacto@vinka.cl?subject=Quiero%20ser%20asesor%2Fa%20de%20VINKA" className="text-[13px] font-semibold text-[#6B2E8F] underline">¿Quieres ser asesor/a? Escríbenos</a>
          </div>
        </div>
      </section>

      {/* Hacia VINKA ATS */}
      <section className="py-12"><div className="mx-auto max-w-6xl px-5">
        <div className="flex flex-col items-start justify-between gap-4 rounded-3xl bg-morado px-6 py-7 text-white md:flex-row md:items-center">
          <div className="flex flex-col gap-1"><b className="font-display text-[20px]">¿Buscas contratar?</b><span className="text-[14px] text-white/80">Publica vacantes y lleva todo tu proceso de selección con VINKA ATS.</span></div>
          <Link to="/portada/ats" className="btn-sm flex h-11 items-center gap-1 bg-white px-5 text-morado">Conoce VINKA ATS <Svg name="chevron" size={16} /></Link>
        </div>
      </div>
      </section>

      <footer className="border-t border-[#F1E4EB] bg-white py-8 text-[13px] text-tinta-3">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-5">
          <span>© VINKA · Empleo en Chile · contacto@vinka.cl</span>
          <span className="flex flex-wrap gap-4"><Link to="/legal/terminos">Términos</Link><Link to="/legal/privacidad">Privacidad</Link><Link to="/ayuda">Ayuda</Link><Link to="/portada/ats">VINKA ATS</Link></span>
        </div>
      </footer>
    </div>
  )
}
