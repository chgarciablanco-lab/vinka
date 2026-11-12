import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase, errMsg, withRetry } from '../../lib/supabase'
import { FeaturedBadge, trackPromo, daysLeft } from '../../lib/promo'
import { logoUrl } from '../../components/OfferLetter'
import { useAuth, useVacanciesHome } from '../../lib/auth'
import { AREAS, CONTRATOS, JORNADAS, MODALIDADES, NIVELES, REGIONES, clp, colorFor, initials, parseCLP, salaryText } from '../../lib/catalog'
import { Avatar, Chips, Empty, ErrorBox, Field, Screen, Sheet, Spinner, Svg, Toast, TopBar, Verified } from '../../components/ui'
import { DangerZone, MyData } from '../Account'
import { CalendarSync } from '../../components/CalendarSync'
import { usePresence } from '../../lib/presence'
import { OnlineToggle, PresenceLine, StatusPill } from '../../components/Presence'
import { NotifyCard } from '../../components/NotifyCard'
import { AiAssist, Sparkle, callAi } from '../../components/AiAssist'
import { Bell } from '../../components/Bell'
import { InstallBanner } from '../../components/InstallBanner'
import { EmailToggle } from '../Notifications'
import { SwipeButtons, SwipeCard, SwipeHint } from '../../components/SwipeCard'
import { MatchModal } from '../../components/MatchModal'
import { CompanyContext, companyOption, homeCompany } from '../../components/CompanySwitcher'
import { pl } from '../../lib/text'
import { CompanyPhotosEditor } from '../../components/CompanyPhotos'
import { BillingBanner } from '../../components/BillingBanner'
import { VacTabs } from '../advisor/Hub'
import { TodoBlock } from '../../components/TodoBlock'

const STATUS = {
  draft: ['BORRADOR', 'bg-[#F1EDF0] text-[#3D2F4A]'], pending: ['ESPERA VERIFICACIÓN', 'bg-naranja-palido text-naranja-texto'],
  review: ['POR APROBAR', 'bg-[#F7F0FB] text-[#6B2E8F]'], published: ['PUBLICADA', 'bg-[#EAF6EF] text-[#134A2B]'], paused: ['PAUSADA', 'bg-[#F1F1F1] text-[#3A3A3A]'], closed: ['CERRADA', 'bg-[#F1F1F1] text-[#3A3A3A]'],
}

export function VerificationBanner({ company }) {
  if (company.verification_status === 'verified') return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-[#A9D9BC] bg-[#EAF6EF] px-3.5 py-3">
      <Verified size={22} /><span className="text-sm font-semibold text-[#134A2B]">Empresa verificada · tus vacantes son visibles</span>
    </div>
  )
  if (company.verification_status === 'pending') return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[#F5C892] bg-naranja-palido p-3.5">
      <span className="text-[15px] font-bold text-[#6B3800]">Verificación en revisión</span>
      <span className="text-[13px] leading-snug text-[#4A2A00]">Puedes preparar vacantes. Se publicarán automáticamente cuando aprobemos tu empresa. Te avisaremos por correo.</span>
      {company.rut_duplicate_of && !company.rut_dup_ok && <span className="text-[13px] leading-snug text-[#4A2A00]"><b>Tu RUT ya está registrado en otra cuenta de VINKA.</b> Revisaremos el caso antes de aprobar. Si tu empresa ya usa VINKA, pide a su administrador que te invite al equipo.</span>}
    </div>
  )
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-[#F4C7C3] bg-[#FEF3F2] p-3.5">
      <span className="text-[15px] font-bold text-[#912018]">{company.verification_status === 'rejected' ? 'Verificación rechazada' : 'Cuenta suspendida'}</span>
      {company.verification_note && <span className="text-[13px] text-[#912018]">{company.verification_note}</span>}
      <span className="text-[13px] text-[#912018]">Escríbenos para revisar tu caso.</span>
    </div>
  )
}

export const copyText = async (t) => { try { await navigator.clipboard.writeText(t); return true } catch { return false } }

export function CompanyPanel() {
  const { company, companies, profile } = useAuth()
  const isAdvisor = profile?.role === 'advisor' // sus pendientes ya están en su Inicio
  const [jobs, setJobs] = useState(null)
  const [toast, setToast] = useState('')
  const [reload, setReload] = useState(0)
  const isAdmin = ['owner', 'admin'].includes(company?.member_role)
  const share = async (url) => setToast((await copyText(url)) ? 'Enlace copiado' : url)
  const approve = async (j) => { const { error } = await supabase.rpc('approve_job', { p_job: j.id }); setToast(error ? errMsg(error) : `«${j.title}» publicada`); setReload((n) => n + 1) }
  const [stats, setStats] = useState({})
  // Listado de vacantes: búsqueda, filtro por estado y orden (las activas primero)
  const [jq, setJq] = useState('')
  const [jst, setJst] = useState('activas')
  const [jsort, setJsort] = useState('estado')
  const [planInfo, setPlanInfo] = useState(null)
  const [ext, setExt] = useState({})
  const [promos, setPromos] = useState({})
  useEffect(() => {
    if (!company) return
    supabase.from('jobs').select('*').eq('company_id', company.id).order('created_at', { ascending: false }).then(({ data }) => setJobs(data || []))
    supabase.from('external_applicants').select('job_id').eq('company_id', company.id).then(({ data }) => { const c = {}; (data || []).forEach((r) => { c[r.job_id] = (c[r.job_id] || 0) + 1 }); setExt(c) })
    supabase.rpc('company_stats', { p_company: company.id }).then(({ data }) => setStats(Object.fromEntries((data || []).map((s) => [s.job_id, s]))))
    supabase.rpc('company_plan', { p_company: company.id }).then(({ data }) => setPlanInfo(data || null))
    supabase.from('promotions').select('job_id, status, ends_at, renews_id').eq('company_id', company.id).in('status', ['solicitada', 'activa', 'pausada'])
      .then(({ data }) => {
        const m = Object.fromEntries((data || []).filter((p) => !p.renews_id).map((p) => [p.job_id, p]))
        ;(data || []).filter((p) => p.renews_id && m[p.job_id]).forEach((p) => { m[p.job_id] = { ...m[p.job_id], renewal: true } })
        setPromos(m)
      })
  }, [company, reload])
  const pubN = jobs?.filter((j) => j.status === 'published').length ?? 0
  // El límite del plan es del grupo (matriz + clientes)
  const groupN = planInfo?.usage?.jobs ?? pubN
  const inGroup = !!company?.parent_id || company?.kind === 'consultora'
  const lim = planInfo?.plan?.max_active_jobs
  const tot = Object.values(stats).reduce((a, s) => ({ i: a.i + s.interests, m: a.m + s.matches }), { i: 0, m: 0 })
  const verified = company?.verification_status === 'verified'
  const canManage = ['owner', 'admin', 'recruiter'].includes(company?.member_role)
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-[#FAF7F9] pb-28 lg:max-w-6xl lg:pb-10 lg:pt-4">
      <div className="safe-t flex items-center justify-between gap-3 px-5 pb-3">
        <div className="flex min-w-0 flex-col"><span className="truncate text-[13px] text-tinta-suave">{isAdvisor ? homeCompany(companies, company)?.display_name : 'VINKA Company'}</span>
        <h1 className="truncate text-[22px] font-bold">{isAdvisor ? 'Vacantes' : homeCompany(companies, company)?.display_name}</h1></div>
        <div className="flex items-center gap-2"><StatusPill /><Bell /></div>
      </div>
      <VacTabs />
      <div className="flex flex-col gap-3.5 px-5">
        <InstallBanner />
        {isAdmin && <BillingBanner billing={planInfo?.billing} />}
        {!isAdvisor && <TodoBlock companyId={company?.id} refresh={reload} />}
        {canManage && verified && (() => {
          const due = (jobs || []).filter((j) => { const pr = promos[j.id]; return j.status === 'published' && pr?.status === 'activa' && !pr.renewal && new Date(pr.ends_at) - Date.now() <= 3 * 86400000 && new Date(pr.ends_at) > Date.now() })
          if (!due.length) return null
          return (
            <div className="flex flex-col gap-1.5 rounded-2xl border border-[#E6C66A] bg-[#FFF8E6] p-3.5 text-[#5C3D00]">
              <span className="text-[15px] font-bold">{due.length === 1 ? 'Un destacado termina pronto' : `${due.length} destacados terminan pronto`}</span>
              <span className="text-[13px] leading-snug">Renuévalos ahora y los días nuevos se suman al final: no pierdes ninguno.</span>
              {due.map((j) => (
                <Link key={j.id} to={`/vacantes/${j.id}/destacar`} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-[13px] font-semibold">
                  <span className="min-w-0">{j.title} · termina {new Date(promos[j.id].ends_at).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}</span><span className="shrink-0 text-rosa-texto">Renovar ›</span>
                </Link>
              ))}
            </div>
          )
        })()}
        <VerificationBanner company={company} />
        <CompanyContext />
        <div className="grid grid-cols-3 gap-2">
          {[[jobs ? (inGroup ? pubN : `${pubN}${lim ? ` de ${lim}` : ''}`) : '—', 'Publicadas ahora', inGroup ? `Publicadas en esta empresa. El plan permite ${lim ?? 'sin límite de'} entre la matriz y sus clientes (hoy ${groupN})` : 'Vacantes publicadas en este momento y el máximo de tu plan'], [verified ? tot.i : '—', 'Interesados', 'Personas que mostraron interés desde la app, desde que publicaste cada vacante. No incluye postulaciones externas ni importadas'], [verified ? tot.m : '—', 'Matches', 'Interés mutuo desde que publicaste cada vacante']].map(([v, l, t]) => (
            <div key={l} className="card flex flex-col gap-0.5 p-3" title={t}><span className="font-display text-[22px] font-bold">{v}</span><span className="text-xs text-tinta-3">{l}</span></div>
          ))}
        </div>
        <p className="-mt-1.5 text-[11px] leading-snug text-tinta-suave">Intereses y matches: total histórico desde la app. Reportes muestra el período que elijas e incluye otras fuentes, por eso las cifras pueden diferir.</p>
        {lim != null && groupN > lim && <Link to="/plan" className="rounded-2xl border border-[#F5C892] bg-naranja-palido p-3.5 text-sm text-[#4A2A00]"><b>{inGroup ? `Entre la matriz y sus clientes hay ${pl(groupN, 'vacante', 'vacantes')} publicadas` : `Tienes ${pl(groupN, 'vacante', 'vacantes')} publicadas`} y el plan permite {lim}.</b> Pausa {groupN - lim} o cambia de plan; mientras tanto no podrás publicar nuevas. Ver plan ›</Link>}
        <Link to="/reportes" className="card flex items-center gap-3 p-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rosa-palido text-rosa-oscuro"><Svg name="chart" /></span>
          <span className="flex flex-1 flex-col"><span className="text-[15px] font-semibold">Reportes</span><span className="text-[13px] text-tinta-3">Embudo, tiempo de contratación y fuentes</span></span>
          <Svg name="chevron" size={18} className="text-tinta-suave" />
        </Link>
        {verified && company.slug && (
          <div className="card flex items-center gap-3 p-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FA] text-[#2C4A8A]"><Svg name="link" /></span>
            <span className="flex min-w-0 flex-1 flex-col"><span className="text-[15px] font-semibold">Tu página de empleos</span><span className="truncate text-[13px] text-tinta-3">Compártela en redes o WhatsApp: se postula sin crear cuenta</span></span>
            <a href={`/empleos/${company.slug}`} target="_blank" rel="noreferrer" className="btn-sm h-10 shrink-0 border border-linea bg-white px-3">Ver</a>
            <button onClick={() => share(`${window.location.origin}/empleos/${company.slug}`)} className="btn-sm h-10 shrink-0 bg-morado px-3 text-white">Copiar</button>
          </div>
        )}
        <div className="flex items-center justify-between">
          <h2 id="vacantes" className="scroll-mt-4 text-[17px] font-semibold">Vacantes</h2>
          {canManage && <span className="flex gap-3"><Link to="/importar/vacantes" className="flex h-11 items-center text-sm font-semibold text-tinta-3">Importar</Link><Link to="/vacantes/nueva" className="flex h-11 items-center text-sm font-semibold text-rosa-texto">+ Crear vacante</Link></span>}
        </div>
        {jobs == null ? <Spinner /> : jobs.length === 0 ? (
          <Empty title="Crea tu primera vacante" action={<Link to="/vacantes/nueva" className="btn-sm mt-1 bg-rosa-accion text-white">Crear vacante</Link>}>
            {verified ? 'Publícala y empieza a recibir intereses.' : 'Puedes dejarla lista mientras verificamos tu empresa.'}
          </Empty>
        ) : (() => {
          const groupOf = (st) => (st === 'draft' ? 'borradores' : st === 'closed' ? 'cerradas' : 'activas')
          const count = (g) => jobs.filter((j) => g === 'todas' || groupOf(j.status) === g).length
          const RANK = { published: 0, review: 1, pending: 2, paused: 3, draft: 4, closed: 5 }
          const qn = jq.trim().toLowerCase()
          const shown = jobs.filter((j) => (jst === 'todas' || groupOf(j.status) === jst) && (!qn || `${j.title} ${j.comuna || ''} ${j.area || ''}`.toLowerCase().includes(qn)))
            .sort((a, b) => jsort === 'interes' ? (stats[b.id]?.interests || 0) - (stats[a.id]?.interests || 0)
              : jsort === 'nombre' ? a.title.localeCompare(b.title, 'es')
              : jsort === 'antiguas' ? new Date(a.created_at) - new Date(b.created_at)
              : jsort === 'recientes' ? new Date(b.created_at) - new Date(a.created_at)
              : (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || new Date(b.created_at) - new Date(a.created_at))
          return (<>
          <div className="flex flex-col gap-2">
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {[['activas', 'Activas'], ['borradores', 'Borradores'], ['cerradas', 'Cerradas'], ['todas', 'Todas']].map(([k, l]) => (
                <button key={k} type="button" aria-pressed={jst === k} onClick={() => setJst(k)} className={`chip h-9 shrink-0 text-[13px] ${jst === k ? 'chip-on' : ''}`}>{l} · {count(k)}</button>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative min-w-0 flex-1"><span className="sr-only">Buscar vacante</span>
                <Svg name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-suave" />
                <input className="input h-11 pl-9 text-[15px]" placeholder="Buscar por cargo, comuna o área" value={jq} onChange={(e) => setJq(e.target.value)} /></label>
              <select className="input h-11 shrink-0 pr-8 text-[14px] sm:w-auto" aria-label="Ordenar vacantes" value={jsort} onChange={(e) => setJsort(e.target.value)}>
                <option value="estado">Activas primero</option><option value="recientes">Más recientes</option><option value="antiguas">Más antiguas</option><option value="interes">Más interesados</option><option value="nombre">Nombre (A-Z)</option>
              </select>
            </div>
          </div>
          {shown.length === 0 && <div className="rounded-2xl border border-dashed border-linea px-4 py-8 text-center text-sm text-tinta-suave">{qn ? 'Ninguna vacante coincide con la búsqueda.' : jst === 'activas' ? 'No tienes vacantes activas. Revisa los borradores o crea una nueva.' : 'No hay vacantes en este grupo.'}</div>}
          <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:items-start">{shown.map((j) => (
          <div key={j.id} className="card flex flex-col gap-2.5 p-3.5">
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold">{j.title}</span>
                <span className="text-xs text-tinta-3">{[j.comuna, j.modality, stats[j.id] && `${stats[j.id].interests} ${stats[j.id].interests === 1 ? 'interesado' : 'interesados'} · ${stats[j.id].matches} ${stats[j.id].matches === 1 ? 'match' : 'matches'}`].filter(Boolean).join(' · ')}</span>
              </div>
              <span className={`pill whitespace-nowrap ${STATUS[j.status][1]}`}>{STATUS[j.status][0]}</span>
            </div>
            <Link to={`/vacantes/${j.id}/proceso`} className="btn-sm gap-1.5 bg-rosa-accion text-white"><Svg name="columns" size={18} />Proceso de selección{stats[j.id] ? ` · ${stats[j.id].interests + (ext[j.id] || 0)}` : ''}</Link>
            <div className="grid grid-cols-2 gap-2">
              {canManage && <Link to={`/vacantes/${j.id}`} className="btn-sm border border-linea bg-white">Editar</Link>}
              {j.status === 'published'
                ? <Link to={`/vacantes/${j.id}/candidatos`} className={`btn-sm border border-linea bg-white ${canManage ? '' : 'col-span-2'}`}>Buscar candidatos</Link>
                : <span className={`btn-sm bg-[#F4EEF2] text-tinta-3 ${canManage ? '' : 'col-span-2'}`}>{j.status === 'pending' ? 'Se publica al verificar' : 'No visible'}</span>}
            </div>
            {canManage && j.status === 'closed' && <Link to={`/vacantes/nueva?desde=${j.id}`} className="btn-sm gap-1.5 border border-rosa-accion bg-white text-rosa-texto">↻ Republicar (nuevo requerimiento)</Link>}
            {j.status === 'review' && (isAdmin
              ? <button className="btn-sm bg-[#6B2E8F] text-white" onClick={() => approve(j)}>Aprobar y publicar</button>
              : <span className="text-xs text-[#6B2E8F]">Un administrador debe aprobarla para publicarla.</span>)}
            {j.status === 'published' && verified && canManage && (() => {
              const pr = promos[j.id]
              const live = pr?.status === 'activa' && new Date(pr.ends_at) > new Date()
              const soon = live && !pr.renewal && new Date(pr.ends_at) - Date.now() <= 3 * 86400000
              return (
                <Link to={`/vacantes/${j.id}/destacar`} className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${live ? 'bg-[#FFF4D6] text-[#7A5200]' : 'border border-dashed border-[#E6C66A] text-[#7A5200]'}`}>
                  <span className="flex items-center gap-1.5">{live ? <FeaturedBadge className="!bg-white" /> : '★'}{live ? `${pl(daysLeft(pr.ends_at), 'día', 'días')} más entre los primeros` : pr?.status === 'solicitada' ? 'Destacado pendiente de pago' : pr?.status === 'pausada' ? 'Destacado en pausa' : 'Destacar para aparecer entre los primeros'}</span>
                  <span className={soon ? 'text-rosa-texto' : ''}>{soon ? 'Renovar ›' : pr?.renewal ? 'Renovación pedida ›' : live ? 'Ver rendimiento ›' : '›'}</span>
                </Link>
              )
            })()}
            <div className="flex items-center justify-between gap-2">
              <Link to={`/vacantes/${j.id}/externos`} className="text-xs font-semibold text-rosa-texto">Postulantes de otros portales{ext[j.id] ? ` · ${ext[j.id]}` : ''} ›</Link>
              {j.status === 'published' && verified && <button onClick={() => share(`${window.location.origin}/empleo/${j.id}`)} className="flex items-center gap-1 text-xs font-semibold text-[#2C4A8A]"><Svg name="link" size={14} />Copiar enlace</button>}
            </div>
          </div>
        ))}</div>
          </>)
        })()}
      </div>
      <Toast msg={toast} onDone={() => setToast('')} />
    </div>
  )
}

/** Preguntas de filtro: se responden al decir "Me interesa"; las eliminatorias marcan a quien no cumple */
function QuestionsEditor({ value, onChange }) {
  const [t, setT] = useState('')
  const [type, setType] = useState('yesno')
  const add = () => {
    if (!t.trim() || value.length >= 8) return
    onChange([...value, { id: 'q' + Date.now().toString(36), text: t.trim().slice(0, 200), type, knockout: type === 'yesno' ? 'no' : null }]); setT('')
  }
  const upd = (k, patch) => onChange(value.map((q, n) => (n === k ? { ...q, ...patch } : q)))
  return (
    <div className="flex flex-col gap-2">
      <span className="label">Preguntas de filtro</span>
      <span className="hint -mt-1">Se responden al decir "Me interesa". Si marcas una respuesta como eliminatoria, verás a esas personas marcadas con "No cumple filtro". No preguntes por edad, sexo, estado civil, salud ni otros datos personales.</span>
      {value.map((q, k) => (
        <div key={q.id} className="flex flex-col gap-2 rounded-xl border border-[#EEE3EA] p-3">
          <div className="flex items-start gap-2"><span className="flex-1 text-sm font-medium">{q.text}</span>
            <button type="button" aria-label={`Quitar pregunta ${q.text}`} onClick={() => onChange(value.filter((_, n) => n !== k))} className="-mr-1 -mt-1 flex h-9 w-9 items-center justify-center text-tinta-suave"><Svg name="x" size={16} /></button></div>
          {q.type === 'yesno' ? (
            <select className="input h-10 text-sm" aria-label="Respuesta eliminatoria" value={q.knockout || ''} onChange={(e) => upd(k, { knockout: e.target.value || null })}>
              <option value="no">Eliminatoria si responde "No"</option><option value="si">Eliminatoria si responde "Sí"</option><option value="">Solo informativa</option>
            </select>
          ) : <span className="text-xs text-tinta-suave">Respuesta abierta (informativa)</span>}
        </div>
      ))}
      {value.length < 8 && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-linea p-3">
          <input className="input" value={t} maxLength={200} onChange={(e) => setT(e.target.value)} placeholder="Ej.: ¿Tienes licencia de conducir clase B?" />
          <div className="flex gap-2">
            <div className="flex flex-1 gap-1 rounded-xl bg-[#F4EEF2] p-[3px]">
              {[['yesno', 'Sí / No'], ['text', 'Abierta']].map(([k, l]) => <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)} className={`h-[38px] flex-1 rounded-[9px] text-[13px] font-semibold ${type === k ? 'bg-white shadow-sm' : 'text-tinta-3'}`}>{l}</button>)}
            </div>
            <button type="button" className="btn-sm shrink-0 border border-rosa-accion bg-white text-rosa-texto" onClick={add}>Agregar</button>
          </div>
        </div>
      )}
    </div>
  )
}

const EMPTY_JOB = { title: '', area: '', level: '', description: '', requirements: [], modality: '', schedule: '', contract: '', region: '', comuna: '', salary_min: null, salary_max: null, salary_type: 'liquido', status: 'draft', questions: [] }

/** Revisa el aviso antes de publicar: detecta frases que pueden discriminar y propone alternativas neutrales. */
function BiasReview({ job, onFix }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [items, setItems] = useState(null)
  const [err, setErr] = useState('')
  const run = async () => {
    setOpen(true); setErr(''); setItems(null); setBusy(true)
    try {
      const r = await callAi('job_bias_review', 'write', { title: job.title, description: job.description, requirements: job.requirements })
      setItems((r.items || []).filter((x) => x && x.text).slice(0, 8))
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const apply = (x, k) => {
    const sug = String(x.suggestion || '')
    let next = { ...job }
    if (job.description.includes(x.text)) next.description = job.description.split(x.text).join(sug)
    else if (job.title.includes(x.text)) next.title = job.title.split(x.text).join(sug)
    else next.requirements = job.requirements.map((r) => (r.text.includes(x.text) ? { ...r, text: r.text.split(x.text).join(sug) } : r)).filter((r) => r.text.trim())
    onFix(next); setItems(items.filter((_, n) => n !== k))
  }
  const found = (x) => job.description.includes(x.text) || job.title.includes(x.text) || job.requirements.some((r) => r.text.includes(x.text))
  return (
    <>
      <button type="button" onClick={run} disabled={!job.title.trim() || (!job.description.trim() && !job.requirements.length)}
        className="inline-flex h-9 items-center gap-1.5 self-start rounded-full border border-[#E9D3F0] bg-[#F7F0FB] px-3 text-[13px] font-semibold text-[#6B2E8F] disabled:opacity-50">
        <Sparkle />Revisar sesgos del aviso
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Revisión de sesgos">
        <div className="flex flex-col gap-3">
          <p className="text-[13px] leading-snug text-tinta-3">La IA busca frases que puedan excluir por edad, sexo, apariencia, nacionalidad u otros motivos que prohíbe el Código del Trabajo (art. 2), y requisitos excesivos para el cargo. Tú decides qué cambiar.</p>
          {busy && <div className="flex items-center gap-2 rounded-xl bg-[#F7F0FB] px-3.5 py-4 text-sm text-[#6B2E8F]" role="status"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#6B2E8F] border-t-transparent" />Revisando…</div>}
          <ErrorBox>{err}</ErrorBox>
          {items && items.length === 0 && <div className="rounded-xl bg-[#EAF6EF] p-3.5 text-sm text-[#134A2B]">No encontramos frases problemáticas. Igual revisa que los requisitos sean necesarios para el cargo.</div>}
          {items?.map((x, k) => (
            <div key={k} className="card flex flex-col gap-1.5 p-3.5 text-sm">
              <span className="font-semibold">«{x.text}»</span>
              <span className="text-tinta-3">{x.why}</span>
              {x.suggestion && <span>Alternativa: <b>{x.suggestion}</b></span>}
              {found(x) && <button type="button" className="btn-sm self-start border border-rosa-accion bg-white text-rosa-texto" onClick={() => apply(x, k)}>{x.suggestion ? 'Usar alternativa' : 'Quitar frase'}</button>}
            </div>
          ))}
          {items && <button type="button" className="btn-sec" onClick={() => setOpen(false)}>Listo</button>}
        </div>
      </Sheet>
    </>
  )
}

export function JobForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const home = useVacanciesHome()
  const { company } = useAuth()
  const [j, setJ] = useState(id ? null : { ...EMPTY_JOB, region: company?.region || '', comuna: company?.comuna || '' })
  const [req, setReq] = useState('')
  const [ok, setOk] = useState(!!id)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // Republicar: ?desde=<id> copia una vacante (cerrada o no) como una nueva, con su propio proceso de selección
  const [sp] = useSearchParams()
  const from = !id ? sp.get('desde') : null
  const [fromTitle, setFromTitle] = useState('')
  const [draftId, setDraftId] = useState(null)
  const [full, setFull] = useState(null)
  // Publicación rápida (solo vacantes nuevas): lo esencial en una pantalla. Usa las mismas validaciones y la misma
  // revisión del servidor que la completa; lo demás se puede agregar después editando la vacante.
  const [quick, setQuick] = useState(() => { if (id || from) return false; try { return localStorage.getItem('vinka-job-mode') !== 'completa' } catch { return true } })
  const pickMode = (q) => { setQuick(q); try { localStorage.setItem('vinka-job-mode', q ? 'rapida' : 'completa') } catch { /* sin almacenamiento */ } }
  useEffect(() => {
    if (!from) return
    supabase.from('jobs').select('*').eq('id', from).single().then(({ data }) => {
      if (!data) return
      const keep = ['title', 'area', 'level', 'description', 'requirements', 'modality', 'schedule', 'contract', 'region', 'comuna', 'salary_min', 'salary_max', 'salary_type', 'questions', 'confidential']
      setJ({ ...EMPTY_JOB, ...Object.fromEntries(keep.filter((k) => k in data).map((k) => [k, data[k]])), requirements: data.requirements || [], questions: data.questions || [], status: 'draft' })
      setFromTitle(data.title)
    })
  }, [from])
  const loadPublished = () => supabase.from('jobs').select('id, title, comuna, created_at').eq('company_id', company.id).eq('status', 'published').order('created_at').then(({ data }) => setFull(data || []))
  const freeUp = async (job, status) => {
    setErr('')
    const { error } = await supabase.from('jobs').update({ status }).eq('id', job.id)
    if (error) return setErr(errMsg(error))
    setFull(null)
    save('published')
  }
  useEffect(() => {
    if (id) supabase.from('jobs').select('*').eq('id', id).single().then(({ data, error }) => { if (error) setErr(errMsg(error)); setJ(data ? { ...EMPTY_JOB, ...data, requirements: data.requirements || [], questions: data.questions || [] } : data) })
  }, [id])
  if (!j) return <Spinner />
  const set = (k, v) => setJ({ ...j, [k]: v })
  const save = async (status) => {
    setErr('')
    if (!j.title.trim() || !j.area || !j.modality || !j.schedule) return setErr('Completa título, área, modalidad y jornada.')
    if (j.modality !== 'Remota' && (!j.region || !j.comuna.trim())) return setErr('Indica región y comuna.')
    if (j.salary_min && j.salary_max && j.salary_min > j.salary_max) return setErr('La renta "desde" no puede ser mayor que "hasta".')
    if (status === 'published' && j.title.trim().length < 4) return setErr('Para publicar, escribe el nombre del cargo (al menos 4 caracteres).')
    if (status === 'published' && (j.description || '').trim().length < 30) return setErr('Para publicar, describe el cargo: funciones, horario o beneficios (al menos 30 caracteres).')
    if (status === 'published' && !ok) return setErr('Confirma que la oferta es real, no cobra a postulantes y no discrimina.')
    setBusy(true)
    const row = { ...j, title: j.title.trim(), comuna: j.comuna.trim(), status, company_id: company.id }
    delete row.id; delete row.created_at; delete row.updated_at
    const target = id || draftId
    const q = target ? supabase.from('jobs').update(row).eq('id', target) : supabase.from('jobs').insert(row).select('id').single()
    const { data, error } = await q
    setBusy(false)
    if (error) {
      // Límite del plan: no se pierde lo escrito. Se guarda como borrador y se ofrece cerrar o pausar otra para publicar esta.
      if (status === 'published' && /a la vez/.test(error.message || '')) {
        if (!target) {
          const r = await supabase.from('jobs').insert({ ...row, status: 'draft' }).select('id').single()
          if (r.data?.id) setDraftId(r.data.id)
        } else await supabase.from('jobs').update({ ...row, status: 'draft' }).eq('id', target)
        loadPublished()
        return setErr(`${errMsg(error)} La guardamos como borrador para que no pierdas nada.`)
      }
      return setErr(errMsg(error))
    }
    if (!target && data?.id) setDraftId(data.id)
    nav(home)
  }
  const verified = company?.verification_status === 'verified'
  return (
    <Screen>
      <TopBar back="/" title={id ? 'Editar vacante' : from ? 'Republicar vacante' : 'Nueva vacante'} />
      {fromTitle && <p className="mx-6 rounded-xl bg-[#F7F0FB] px-3 py-2.5 text-[13px] leading-snug text-[#3D2350]">Copiamos «{fromTitle}». Revisa los datos y publícala: se crea una vacante nueva con su propio proceso de selección. La anterior queda como estaba, con su historial.</p>}
      <Sheet open={!!full} onClose={() => setFull(null)} title="Libera un cupo para publicar">
        {full && (
          <div className="flex flex-col gap-2.5">
            <p className="text-[13px] leading-snug text-tinta-3">El cupo cuenta solo las vacantes <b>publicadas</b>. Las cerradas, pausadas y borradores no ocupan cupo. Cierra o pausa una de estas y publicamos la nueva de inmediato:</p>
            {full.map((x) => (
              <div key={x.id} className="flex flex-col gap-2 rounded-xl border border-linea bg-white p-3 text-sm">
                <span><b>{x.title}</b>{x.comuna ? ` · ${x.comuna}` : ''} <span className="text-xs text-tinta-3">· desde {new Date(x.created_at).toLocaleDateString('es-CL')}</span></span>
                <div className="grid grid-cols-2 gap-2"><button className="btn-sm border border-linea bg-white" onClick={() => freeUp(x, 'paused')}>Pausar y publicar la nueva</button><button className="btn-sm border border-linea bg-white" onClick={() => freeUp(x, 'closed')}>Cerrar y publicar la nueva</button></div>
              </div>
            ))}
            <Link to="/plan" className="text-center text-[13px] font-semibold text-rosa-texto">O cambia de plan para publicar más a la vez →</Link>
          </div>
        )}
      </Sheet>
      <div className="flex flex-col gap-4 px-6 pb-6 pt-2">
        {!id && !from && (
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1 rounded-xl bg-[#F4EEF2] p-[3px]" role="group" aria-label="Tipo de publicación">
              {[[true, 'Rápida'], [false, 'Completa']].map(([q, l]) => (
                <button key={l} type="button" aria-pressed={quick === q} onClick={() => pickMode(q)}
                  className={`h-[38px] flex-1 rounded-[9px] text-[13px] font-semibold ${quick === q ? 'bg-white text-tinta shadow-sm' : 'text-tinta-3'}`}>{l}</button>
              ))}
            </div>
            <span className="hint">{quick ? 'Lo esencial en una pantalla. Puedes sumar requisitos y preguntas después, editando la vacante.' : 'Con nivel, contrato, requisitos y preguntas de filtro.'}</span>
          </div>
        )}
        <Field label="Título del cargo"><input className="input" maxLength={90} value={j.title} onChange={(e) => set('title', e.target.value)} placeholder="Ej.: Vendedor/a de tienda" /></Field>
        <Field label="Área"><select className="input" value={j.area} onChange={(e) => set('area', e.target.value)}><option value="">Selecciona</option>{AREAS.map((a) => <option key={a}>{a}</option>)}</select></Field>
        {!quick && <Chips legend="Nivel" multi={false} options={NIVELES} value={j.level} onChange={(v) => set('level', v)} />}
        <Chips legend="Modalidad" multi={false} options={MODALIDADES} value={j.modality} onChange={(v) => set('modality', v)} />
        <Chips legend="Jornada" multi={false} options={JORNADAS} value={j.schedule} onChange={(v) => set('schedule', v)} />
        {!quick && <Chips legend="Tipo de contrato" multi={false} options={CONTRATOS} value={j.contract} onChange={(v) => set('contract', v)} />}
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Región"><select className="input" value={j.region} onChange={(e) => set('region', e.target.value)}><option value="">Selecciona</option>{REGIONES.map((r) => <option key={r}>{r}</option>)}</select></Field>
          <Field label="Comuna"><input className="input" value={j.comuna} onChange={(e) => set('comuna', e.target.value)} /></Field>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="label">Renta mensual (CLP)</span>
          <div className="flex gap-1 rounded-xl bg-[#F4EEF2] p-[3px]">
            {[['liquido', 'Líquida'], ['bruto', 'Bruta']].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={j.salary_type === k} onClick={() => set('salary_type', k)}
                className={`h-[38px] flex-1 rounded-[9px] text-[13px] font-semibold ${j.salary_type === k ? 'bg-white text-tinta shadow-sm' : 'text-tinta-3'}`}>{l}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <input className="input" inputMode="numeric" aria-label="Desde" placeholder="Desde" value={clp(j.salary_min)} onChange={(e) => set('salary_min', parseCLP(e.target.value))} />
            <input className="input" inputMode="numeric" aria-label="Hasta" placeholder="Hasta" value={clp(j.salary_max)} onChange={(e) => set('salary_max', parseCLP(e.target.value))} />
          </div>
          <span className="hint">Recomendado. Los candidatos ven este rango antes de mostrar interés.</span>
        </div>
        <Field label="Descripción" hint={`Funciones principales, horario, beneficios. Mínimo 30 caracteres para publicar${(j.description || "").trim().length < 30 ? ` (llevas ${(j.description || "").trim().length})` : ''}.`}><textarea className="textarea h-36" maxLength={3000} value={j.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <AiAssist task="job_description" title="Descripción de la vacante" current={j.description}
          getContext={() => ({ title: j.title, area: j.area, level: j.level, modality: j.modality, schedule: j.schedule, contract: j.contract, comuna: j.comuna, company: company?.display_name, company_description: company?.description, benefits: company?.benefits })}
          onApply={(t) => set('description', t.slice(0, 3000))} />
        {!quick && <div className="flex flex-col gap-2">
          <span className="label">Requisitos</span>
          <AiAssist list task="job_requirements" title="Requisitos sugeridos" label="Sugerir requisitos con IA"
            renderItem={(x) => <span><b className={x.essential ? 'text-morado' : 'text-tinta-3'}>{x.essential ? 'Esencial' : 'Deseable'}</b> · {x.text}</span>}
            getContext={() => ({ title: j.title, area: j.area, level: j.level, description: j.description, existing: j.requirements })}
            onAddItems={(items) => set('requirements', [...j.requirements, ...items.filter((x) => x?.text).map((x) => ({ text: String(x.text).slice(0, 200), essential: !!x.essential }))].slice(0, 20))} />
          {j.requirements.map((r, k) => (
            <div key={k} className="flex items-center gap-2 rounded-xl border border-[#EEE3EA] px-3 py-2 text-sm">
              <button type="button" onClick={() => set('requirements', j.requirements.map((x, n) => (n === k ? { ...x, essential: !x.essential } : x)))}
                className={`pill ${r.essential ? 'bg-morado text-white' : 'bg-[#F1EDF0] text-[#3D2F4A]'}`} aria-label="Cambiar entre esencial y deseable">{r.essential ? 'ESENCIAL' : 'DESEABLE'}</button>
              <span className="flex-1">{r.text}</span>
              <button type="button" aria-label={`Quitar ${r.text}`} onClick={() => set('requirements', j.requirements.filter((_, n) => n !== k))} className="flex h-9 w-9 items-center justify-center text-tinta-suave"><Svg name="x" size={16} /></button>
            </div>
          ))}
          <div className="flex gap-2">
            <input className="input" value={req} onChange={(e) => setReq(e.target.value)} placeholder="Ej.: Licencia clase B" />
            <button type="button" className="btn-sm shrink-0 border border-rosa-accion bg-white text-rosa-texto"
              onClick={() => { if (req.trim()) { set('requirements', [...j.requirements, { text: req.trim(), essential: true }]); setReq('') } }}>Agregar</button>
          </div>
        </div>}
        {!quick && <QuestionsEditor value={j.questions || []} onChange={(v) => set('questions', v)} />}
        <BiasReview job={j} onFix={(next) => setJ(next)} />
        {company?.parent_id && (
          <label className="flex items-start gap-2.5 rounded-xl border border-linea bg-white p-3 text-[13px] leading-snug">
            <input type="checkbox" checked={!!j.confidential} onChange={(e) => set('confidential', e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D02E72]" />
            <span><b>Vacante confidencial.</b> Los postulantes verán «Empresa confidencial · gestionado por {company.managed_by || 'la consultora'}» en vez del nombre de {company.display_name}. Tú decides cuándo revelarlo en el chat.</span>
          </label>
        )}
        <label className="flex items-start gap-2.5 rounded-xl border border-rosa-borde bg-rosa-fondo p-3 text-[13px] leading-snug">
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D02E72]" />
          Confirmo que esta oferta es real, no cobra a postulantes y no excluye por motivos ilegales.
        </label>
        {id && j.status === 'published' && (
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-sm border border-linea bg-white" onClick={() => save('paused')}>Pausar</button>
            <button className="btn-sm border border-linea bg-white" onClick={() => save('closed')}>Cerrar vacante</button>
          </div>
        )}
        <ErrorBox>{err}</ErrorBox>
      </div>
      <div className="safe-b sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-[#F1E7ED] bg-white px-6 pt-3">
        {!verified && <span className="text-center text-xs text-[#6B3800]">Se publicará automáticamente cuando tu empresa esté verificada.</span>}
        <div className="grid grid-cols-2 gap-2.5">
          <button className="btn-sec h-[50px] text-[15px]" disabled={busy} onClick={() => save('draft')}>Guardar borrador</button>
          <button className="btn h-[50px] text-[15px]" disabled={busy} onClick={() => save('published')}>{verified ? 'Publicar' : 'Enviar a publicar'}</button>
        </div>
      </div>
    </Screen>
  )
}

export function JobCandidates() {
  const { id } = useParams()
  const { user } = useAuth()
  const nav = useNavigate()
  const home = useVacanciesHome()
  const [job, setJob] = useState(null)
  const [list, setList] = useState(null)
  const [i, setI] = useState(0)
  const [toast, setToast] = useState({ msg: '', tone: 'dark' })
  const [err, setErr] = useState('')
  const [video, setVideo] = useState('')
  const [busy, setBusy] = useState(false)

  const [broad, setBroad] = useState(false)
  const [full, setFull] = useState(false)
  const load = useCallback(async (wide = false) => {
    setList(null); setI(0); setBroad(wide)
    const [{ data: jd }, { data, error }] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', id).single(),
      supabase.rpc('candidates_for_job', { p_job: id, p_broad: wide }),
    ])
    if (error) setErr(errMsg(error))
    setJob(jd); setList(data || [])
  }, [id])
  useEffect(() => { load() }, [load])

  const c = list?.[i]
  const pres = usePresence({ users: [c?.candidate_id] })
  useEffect(() => { if (c?.promotion_id) trackPromo([c.promotion_id]) }, [c?.promotion_id])
  const cardRef = useRef()
  const artRef = useRef()
  const [match, setMatch] = useState(null)
  const { company } = useAuth()
  const onSwipe = async (dir) => {
    const cur = list[i]
    const action = { right: 'interest', left: 'pass', up: 'save' }[dir]
    setVideo(''); setErr(''); setI((n) => n + 1)
    if (cur.promotion_id && action !== 'pass') trackPromo([cur.promotion_id], 'click')
    // Se reintenta si falla la red; si igual no se guarda, la persona vuelve a la pantalla para decidir de nuevo
    const { error } = await withRetry(() => supabase.from('company_candidate_actions').upsert({ job_id: id, candidate_id: cur.candidate_id, action, created_by: user.id }))
    if (error) {
      const back = list.findIndex((x) => x.candidate_id === cur.candidate_id)
      if (back >= 0) setI(back)
      return setErr(error.code ? errMsg(error) : `No se guardó tu decisión sobre ${cur.display_name} por un problema de conexión. Volvió a la pantalla: inténtalo de nuevo.`)
    }
    if (action === 'interest') {
      const { data: m } = await supabase.from('matches').select('id').eq('job_id', id).eq('candidate_id', cur.candidate_id).maybeSingle()
      if (m) setMatch({
        matchId: m.id, jobTitle: job?.title, otherName: cur.display_name, continueLabel: 'Seguir revisando candidatos',
        note: 'Ya pueden conversar. Su teléfono y correo se muestran solo si la persona decide compartirlos.',
        leftInitials: initials(company?.display_name), leftColor: colorFor(company?.display_name || ''), rightInitials: cur.initials, rightColor: '#D02E72',
      })
      else setToast({ msg: `Invitación enviada a ${cur.display_name} para esta vacante. Será match si acepta.`, tone: 'dark' })
    } else if (action === 'save') setToast({ msg: `${cur.display_name} guardado/a. No recibe aviso.`, tone: 'dark' })
  }
  const playVideo = async () => {
    const { data: path } = await supabase.rpc('candidate_video_path', { p_candidate: c.candidate_id })
    if (!path) return setErr('El video no está disponible.')
    const { data } = await supabase.storage.from('videos').createSignedUrl(path, 600)
    setVideo(data?.signedUrl || '')
  }

  const yrs = (exps) => {
    let months = 0
    for (const x of exps || []) {
      if (!x.from) continue
      const a = new Date(x.from + '-01'), b = x.current || !x.to ? new Date() : new Date(x.to + '-01')
      months += Math.max(0, (b - a) / 2.63e9)
    }
    return months >= 12 ? pl(Math.round(months / 12), 'año', 'años') : months > 0 ? pl(Math.round(months), 'mes', 'meses') : 'Sin datos'
  }
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const ym = (v) => { if (!v) return '?'; const [y, m] = v.split('-'); return m ? `${MES[Number(m) - 1]} ${y}` : y }
  const period = (x) => `${ym(x.from)} – ${x.current || !x.to ? 'actual' : ym(x.to)}`
  const swipeFromSheet = (dir) => { setFull(false); setTimeout(() => cardRef.current?.swipe(dir), 120) }

  return (
    <div className="safe-b mx-auto flex min-h-full w-full max-w-md flex-col overflow-hidden bg-[#FAF7F9] lg:max-w-3xl lg:pb-10">
      <div className="safe-t flex items-center gap-1.5 px-4 pb-3">
        <button aria-label="Volver" onClick={() => nav(home)} className="flex h-11 w-11 items-center justify-center"><Svg name="back" /></button>
        <div className="flex flex-col"><span className="text-[11px] text-tinta-suave">Candidatos para</span><span className="text-[15px] font-semibold">{job?.title || '…'}</span></div>
      </div>
      <div className="flex flex-1 flex-col px-4">
        <ErrorBox>{err}</ErrorBox>
        {list == null ? <Spinner /> : !c ? (
          <Empty title={broad ? 'No hay más perfiles por ahora' : 'Viste todos los perfiles acordes a esta vacante'}
            action={<div className="mt-1 flex flex-col items-center gap-2">
              {!broad && <button onClick={() => load(true)} className="btn-sm bg-rosa-accion text-white">Ver otros perfiles</button>}
              <button onClick={() => load(false)} className="btn-sm border border-rosa-accion bg-white text-rosa-texto">Buscar de nuevo</button>
            </div>}>
            {broad ? 'Vuelve más tarde: cada día se suman personas nuevas.' : 'Te mostramos solo personas con un tipo de cargo y nivel congruentes con la vacante. "Ver otros perfiles" muestra el resto.'}
          </Empty>
        ) : (
          <>
          <SwipeCard key={c.candidate_id} ref={cardRef} onSwipe={onSwipe} labels={{ right: 'ME INTERESA' }}
            behind={list[i + 1] ? <div className="deck-h rounded-[22px] border border-[#EEE3EA] bg-white shadow-[0_10px_30px_rgba(48,37,56,0.10)]" /> : null}>
          <article ref={artRef} className="deck-h flex flex-col gap-3 rounded-[22px] border border-[#EEE3EA] bg-white p-[18px] shadow-[0_10px_30px_rgba(48,37,56,0.10)]">
            {c.already_interested && <div className="rounded-xl bg-rosa-palido px-2.5 py-2 text-xs font-bold text-rosa-oscuro">Ya postuló · si te interesa, es match</div>}
            {c.featured && <FeaturedBadge kind="profile" />}
            <div className="flex items-center gap-3">
              <Avatar text={c.initials} color="#302538" size={56} round />
              <div className="flex min-w-0 flex-col gap-0.5"><span className="font-display text-[19px] font-semibold">{c.display_name}</span><span className="text-sm text-tinta-2">{c.headline}</span>
                {c.role_label && c.role_label !== c.headline && <span className="text-xs text-tinta-suave">{c.role_label}</span>}<PresenceLine p={pres[c.candidate_id]} /></div>
            </div>
            <p className="text-[13px] leading-snug text-tinta-2">{[[c.comuna, c.region].filter(Boolean).join(', '), c.availability && `disponible ${c.availability.toLowerCase()}`, c.modalities?.join(' o ').toLowerCase(), c.schedules?.length && `jornada ${c.schedules.join(' o ').toLowerCase()}`].filter(Boolean).join(' · ')}</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-xl bg-[#FBF7FA] p-3 text-sm">
              {[['Experiencia', c.has_experience ? yrs(c.experiences) : 'Primer empleo'],
                ['Estudios', c.education?.[0] ? (c.education[0].level || c.education[0].title) : '—'],
                ['Áreas', c.areas?.length ? c.areas.slice(0, 2).join(', ') : '—'],
                ['Pretensión', bandTxt(c) || 'No indicada']].map(([k, v]) => (
                <div key={k} className="flex min-w-0 flex-col gap-0.5"><span className="text-xs text-tinta-suave">{k}</span><span className="truncate font-medium">{v}</span></div>
              ))}
              {c.salary_in_range != null && <span className={`col-span-2 text-[11px] font-semibold ${c.salary_in_range ? 'text-[#1E6B3F]' : 'text-[#B85F00]'}`}>Pretensión {c.salary_in_range ? 'dentro de tu rango' : 'sobre tu rango'}</span>}
            </div>
            {c.out_of_profile && <span className="self-start rounded-full bg-[#F4EEF2] px-2.5 py-1 text-xs font-semibold text-tinta-3">Perfil distinto al cargo</span>}
            <FitExtras dep={c.candidate_id} box={artRef} steps={(() => {
              const bio = (lines) => (c.bio || c.has_video) && (
              <div key="bio" className="flex flex-col gap-1 rounded-xl bg-rosa-fondo px-3 py-2.5">
                <span className="text-xs font-semibold text-tinta-3">Presentación{c.has_video ? ' · tiene video' : ''}</span>
                {c.bio && <p className={`${lines === 3 ? 'line-clamp-3' : 'line-clamp-2'} text-sm leading-snug`}>{c.bio}</p>}
              </div>
            )
              const exp = c.experiences?.length > 0 ? (
              <div key="exp" className="flex flex-col gap-1 text-sm"><span className="text-xs font-semibold text-tinta-3">Experiencia reciente</span>
                {c.experiences.slice(0, 2).map((x, k) => <span key={k} className="flex justify-between gap-2"><span className="min-w-0 truncate"><b>{x.role}</b> · {x.company}</span><span className="shrink-0 text-xs text-tinta-suave">{period(x)}</span></span>)}
              </div>
            ) : c.education?.[0] && (
              <div key="edu" className="flex flex-col gap-0.5 text-sm"><span className="text-xs font-semibold text-tinta-3">Estudios</span>
                <span className="truncate"><b>{c.education[0].title || c.education[0].level}</b>{c.education[0].institution ? ` · ${c.education[0].institution}` : ''}{c.education[0].status ? ` · ${c.education[0].status}` : ''}</span>
              </div>
            )
              const skills = c.skills?.length > 0 && <p key="skills" className="line-clamp-1 text-sm text-tinta-2"><span className="text-xs font-semibold text-tinta-3">Habilidades: </span>{c.skills.slice(0, 6).join(' · ')}</p>
              return [[bio(3), exp, skills], [bio(3), exp], [bio(2), exp], [bio(3)], [bio(2)], []]
            })()} />
            {c.reasons?.length > 0 && <p className="text-[13px] leading-snug text-[#1E6B3F]"><b>✓ Coincide en:</b> {c.reasons.map((r) => r.toLowerCase()).join(', ')}</p>}
            <div className="flex-1" />
            <button onClick={() => { if (c.promotion_id) trackPromo([c.promotion_id], 'click'); setFull(true) }} className="btn-sm h-11 w-full border border-rosa-accion bg-white text-rosa-texto">
              Ver más</button>
          </article>
          </SwipeCard>
          <div className="mt-4 flex flex-col gap-2.5">
            <SwipeButtons onPass={() => cardRef.current?.swipe('left')} onSave={() => cardRef.current?.swipe('up')} onLike={() => cardRef.current?.swipe('right')} />
            <div className="[@media(max-height:700px)]:hidden"><SwipeHint /></div>
          </div>
          </>
        )}
      </div>
      <Sheet open={full && !!c} onClose={() => setFull(false)} title={c ? `${c.display_name} · ${c.headline || 'Perfil'}` : ''} wide>
        {c && (
          <div className="flex flex-col gap-4 text-[15px]">
            {c.featured && <FeaturedBadge kind="profile" />}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-4">
                <div className="card grid grid-cols-2 gap-3 p-4 text-sm">
                  {[['Ubicación', [c.comuna, c.region].filter(Boolean).join(', ')], ['Disponibilidad', c.availability], ['Modalidad', (c.modalities || []).join(', ')], ['Jornada', (c.schedules || []).join(', ')],
                    ['También trabajaría en', (c.locations || []).join(', ')], ['Cambio de ciudad', c.relocate], ['Áreas de interés', (c.areas || []).join(', ')], ['Pretensión de renta (rango)', bandTxt(c)]].map(([k, v]) => (
                    <div key={k} className="flex flex-col gap-0.5"><span className="text-xs text-tinta-suave">{k}</span><span className="font-medium">{v || '—'}</span></div>
                  ))}
                </div>
                {(c.bio || c.has_video) && (
                  <div className="card flex flex-col gap-2 p-4"><span className="font-semibold">Presentación</span>
                    {c.bio && <p className="whitespace-pre-line text-sm leading-relaxed">{c.bio}</p>}
                    {c.has_video && (video ? <video src={video} controls autoPlay playsInline className="w-full rounded-xl bg-morado" /> : <button onClick={playVideo} className="btn-sm self-start bg-morado text-white"><Svg name="video" size={18} className="mr-1.5" />Ver video</button>)}
                  </div>
                )}
                {c.reasons?.length > 0 && <div className="flex flex-wrap gap-1.5">{c.reasons.map((r) => <span key={r} className="rounded-full bg-[#EAF6EF] px-2.5 py-1 text-xs font-semibold text-[#1E6B3F]">✓ {r}</span>)}</div>}
              </div>
              <div className="flex flex-col gap-4">
                <div className="card flex flex-col gap-3 p-4"><span className="font-semibold">Experiencia {c.has_experience && <span className="text-sm font-normal text-tinta-3">· {yrs(c.experiences)}</span>}</span>
                  {!c.has_experience ? <span className="text-sm text-tinta-3">Busca su primer empleo.</span> : (c.experiences || []).map((x, k) => (
                    <div key={k} className="flex flex-col gap-0.5 border-l-2 border-rosa-palido pl-3 text-sm"><b>{x.role}</b><span className="text-tinta-2">{x.company}</span><span className="text-xs text-tinta-suave">{period(x)}</span>{x.description && <span className="text-tinta-2">{x.description}</span>}</div>
                  ))}
                </div>
                {(c.education || []).length > 0 && (
                  <div className="card flex flex-col gap-2 p-4"><span className="font-semibold">Estudios</span>
                    {c.education.map((x, k) => <div key={k} className="flex flex-col text-sm"><b>{x.title || x.level}</b><span className="text-tinta-2">{[x.institution, x.level !== x.title && x.title ? x.level : null, x.status].filter(Boolean).join(' · ')}</span></div>)}
                  </div>
                )}
                {(c.skills || []).length > 0 && <div className="card flex flex-col gap-2 p-4"><span className="font-semibold">Habilidades</span><div className="flex flex-wrap gap-1.5">{c.skills.map((s) => <span key={s} className="rounded-full border border-linea px-2.5 py-1 text-xs">{s}</span>)}</div></div>}
              </div>
            </div>
            <span className="text-xs text-tinta-suave">Teléfono y correo se muestran solo tras el match y si la persona los comparte.</span>
            {c.updated_at && <span className="text-xs text-tinta-suave">Perfil actualizado el {new Date(c.updated_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}. Teléfono y correo se muestran solo tras el match y si la persona los comparte.</span>}
            <div className="sticky bottom-0 grid grid-cols-3 gap-2 bg-white pt-2">
              <button className="btn-sm h-12 border border-linea bg-white" onClick={() => swipeFromSheet('left')}>Descartar</button>
              <button className="btn-sm h-12 border border-linea bg-white" onClick={() => swipeFromSheet('up')}>Guardar</button>
              <button className="btn-sm h-12 bg-rosa-accion text-white" onClick={() => swipeFromSheet('right')}>Me interesa</button>
            </div>
          </div>
        )}
      </Sheet>
      <Toast msg={toast.msg} tone={toast.tone} onDone={() => setToast({ msg: '', tone: 'dark' })} />
      <MatchModal match={match} onClose={() => setMatch(null)} />
    </div>
  )
}

/** Renta esperada como rango (las empresas no reciben el monto exacto) */
const millones = (v) => (v / 1000000).toLocaleString('es-CL', { maximumFractionDigits: 1 })
// Corto para que quepa en la tarjeta del teléfono: «$700–800 mil líq.» o «$1,2–1,4 M líq.»
function bandTxt(c) {
  if (!c.salary_min) return ''
  return c.salary_max <= 1000000 ? `$${Math.round(c.salary_min / 1000)}–${Math.round(c.salary_max / 1000)} mil líq.` : `$${millones(c.salary_min)}–${millones(c.salary_max)} M líq.`
}

/** Prueba versiones de la tarjeta, de la más completa a la más breve, y deja la primera que no la hace crecer más que el alto disponible (así los botones siguen abajo) */
function FitExtras({ steps, dep, box }) {
  const [i, setI] = useState(0)
  const [tick, setTick] = useState(0)
  useLayoutEffect(() => { setI(0) }, [dep, tick])
  useLayoutEffect(() => {
    const el = box?.current
    if (!el || i >= steps.length - 1) return
    const probe = document.createElement('div'); probe.className = 'deck-h'; probe.style.cssText = 'position:absolute;visibility:hidden;width:1px'
    el.parentNode.appendChild(probe); const avail = probe.offsetHeight; probe.remove()
    if (el.offsetHeight > avail + 1) setI(i + 1)
  }, [i, dep, tick, box, steps.length])
  useEffect(() => {
    const f = () => setTick((t) => t + 1)
    window.addEventListener('resize', f); document.fonts?.ready?.then(f)
    return () => window.removeEventListener('resize', f)
  }, [])
  return (steps[i] || []).filter(Boolean)
}

export function CompanyAccount() {
  const { company, refresh } = useAuth()
  const home = useVacanciesHome()
  const isAdmin = ['owner', 'admin'].includes(company?.member_role)
  const [f, setF] = useState(() => ({ description: company?.description || '', benefits: company?.benefits || '', website: company?.website || '', display_name: company?.display_name || '' }))
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const logoInput = useRef()
  const [logoBusy, setLogoBusy] = useState(false)
  const uploadLogo = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    if (file.size > 2 * 1024 * 1024) return setErr('El logo pesa más de 2 MB.')
    setErr(''); setLogoBusy(true)
    const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
    const path = `${company.id}/logo-${Date.now()}.${ext}`
    const up = await supabase.storage.from('logos').upload(path, file, { contentType: file.type })
    if (up.error) { setLogoBusy(false); return setErr('No pudimos subir el logo. Usa PNG, JPG o WEBP de hasta 2 MB.') }
    const { error } = await supabase.rpc('set_company_logo', { p_company: company.id, p_path: path })
    if (error) supabase.storage.from('logos').remove([path]).then(() => {})
    if (!error && company.logo_path) supabase.storage.from('logos').remove([company.logo_path]).then(() => {})
    setLogoBusy(false)
    if (error) return setErr(errMsg(error))
    setMsg('Logo actualizado.'); refresh()
  }
  const save = async () => {
    setErr('')
    const { error } = await supabase.from('companies').update(f).eq('id', company.id)
    if (error) return setErr(errMsg(error))
    setMsg('Vitrina actualizada.'); refresh()
  }
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-[#FAF7F9] pb-28 lg:max-w-3xl lg:pb-10 lg:pt-4">
      <div className="safe-t flex items-start justify-between gap-3 px-5 pb-3"><div><h1 className="text-[22px] font-bold">Empresa</h1><p className="text-[13px] text-tinta-3">Vitrina, equipo y ajustes.</p></div><div className="flex items-center gap-2"><StatusPill /><Bell /></div></div>
      <div className="flex flex-col gap-4 px-5">
        <div className="card flex items-center gap-3 p-4">
          {company?.logo_path ? <img src={logoUrl(company.logo_path)} alt="Logo" className="h-[52px] w-[52px] shrink-0 rounded-xl border border-linea bg-white object-contain p-1" /> : <Avatar text={company?.display_name?.slice(0, 2).toUpperCase()} color="#3B5BA9" size={52} />}
          <div className="flex min-w-0 flex-1 flex-col"><span className="flex items-center gap-1.5 font-semibold">{company?.display_name}{company?.verification_status === 'verified' && <Verified />}</span>
            <span className="text-xs text-tinta-3">{company?.legal_name} · {company?.rut}</span></div>
          {isAdmin && <>
            <button className="btn-sm h-10 shrink-0 border border-linea bg-white px-3" disabled={logoBusy} onClick={() => logoInput.current?.click()}>{logoBusy ? 'Subiendo…' : company?.logo_path ? 'Cambiar logo' : 'Subir logo'}</button>
            <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={uploadLogo} />
          </>}
        </div>
        {isAdmin && <p className="hint -mt-2">El logo aparece en tus cartas oferta y en los correos. PNG, JPG o WEBP de hasta 2 MB; ideal fondo transparente.</p>}
        <CompanyPhotosEditor company={company} canEdit={isAdmin} onSaved={refresh} />
        <Field label="Nombre visible"><input className="input" value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></Field>
        <Field label="Quiénes somos" hint="Propósito, cultura y qué hace tu equipo."><textarea className="textarea h-32" maxLength={1500} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <AiAssist task="company_description" title="Quiénes somos" current={f.description}
          getContext={() => ({ company: f.display_name, sector: company?.sector, size: company?.size, comuna: company?.comuna, region: company?.region })}
          onApply={(t) => setF({ ...f, description: t.slice(0, 1500) })} />
        <Field label="Beneficios"><textarea className="textarea h-24" maxLength={800} value={f.benefits} onChange={(e) => setF({ ...f, benefits: e.target.value })} placeholder="Ej.: seguro complementario, horario flexible" /></Field>
        {f.benefits.trim() && <AiAssist task="company_benefits" title="Beneficios" label="Ordenar con IA" current={f.benefits} onApply={(t) => setF({ ...f, benefits: t.slice(0, 800) })} />}
        <Field label="Sitio web"><input className="input" type="url" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} placeholder="https://" /></Field>
        <ErrorBox>{err}</ErrorBox>
        <button className="btn" onClick={save} disabled={!isAdmin}>Guardar vitrina</button>
        {!isAdmin && <span className="hint -mt-2">Solo quien administra la empresa puede editar la vitrina.</span>}
        <div className="card px-4">
          {[[home === '/vacantes' ? '/equipo-consultora' : '/equipo', 'people', 'Equipo', 'Invita reclutadores y evaluadores'], ['/plantillas', 'chat', 'Plantillas de mensajes', 'Respuestas listas con {nombre} y {cargo}'], ['/automatizaciones', 'swap', 'Automatizaciones', 'Mensajes por etapa, avisos y aprobaciones'], ['/reportes', 'chart', 'Reportes', 'Embudo, tiempos y fuentes'], ['/plan', 'check', 'Plan y uso', 'Límites, consumo de IA y cambio de plan'],
            ...(company?.parent_id ? [] : [['/clientes', 'building', company?.kind === 'consultora' ? 'Clientes de la consultora' : 'Somos consultora', company?.kind === 'consultora' ? `${pl(company?.clients || 0, 'cliente', 'clientes')} · agrega y cambia de cliente` : 'Recluta para otras empresas desde una cuenta matriz']])].map(([to, icon, t, sub]) => (
            <Link key={to} to={to} className="flex items-center gap-3 border-b border-[#F1E7ED] py-3.5 last:border-0">
              <Svg name={icon} className="text-tinta-3" /><span className="flex flex-1 flex-col"><span className="text-[15px] font-semibold">{t}</span><span className="text-[13px] text-tinta-3">{sub}</span></span><Svg name="chevron" size={18} className="text-tinta-suave" />
            </Link>
          ))}
        </div>
        <CompanySwitcher />
        <OnlineToggle />
        <CalendarSync />
        <NotifyCard />
        <EmailToggle />
        <InstallBanner always />
        <MyData />
        <div className="mt-2"><DangerZone /></div>
      </div>
      <Toast msg={msg} onDone={() => setMsg('')} />
    </div>
  )
}

/** Consultora: elegir si trabajar en la matriz o en uno de sus clientes. */
function CompanySwitcher() {
  const { company, companies, switchCompany } = useAuth()
  if (!companies || companies.length < 2) return null
  return (
    <div className="card flex flex-col gap-2 p-4">
      <span className="text-[15px] font-semibold">Tu consultora y sus clientes</span>
      <span className="text-[13px] text-tinta-3">Elige con qué empresa trabajar. Los clientes se agregan desde «Clientes de la consultora».</span>
      {companies.map((c) => (
        <button key={c.id} type="button" disabled={c.id === company.id} onClick={() => { switchCompany(c.id); window.location.assign('/') }}
          className={`flex h-12 items-center justify-between rounded-xl border px-4 text-left text-sm font-semibold ${c.id === company.id ? 'border-rosa-accion bg-rosa-palido text-rosa-oscuro' : 'border-linea bg-white'}`}>
          <span className="truncate">{companyOption(c)}</span><span className="text-xs font-normal text-tinta-3">{c.id === company.id ? 'Actual' : 'Cambiar'}</span>
        </button>
      ))}
    </div>
  )
}

export function CompanyMissing() {
  const { signOut } = useAuth()
  let team = null
  try { team = localStorage.getItem('vinka-team-invite') } catch { /* sin almacenamiento */ }
  return (
    <Screen>
      <TopBar title="VINKA Company" />
      <div className="flex flex-1 flex-col gap-4 px-6 pb-8">
        {team && <Link to={`/equipo/unirse/${team}`} className="btn">Aceptar mi invitación al equipo</Link>}
        <Empty title="No encontramos tu empresa">Tu cuenta no tiene una empresa asociada. Si te invitaron a un equipo, abre el enlace del correo de invitación.</Empty>
        <div className="card grid grid-cols-2 divide-x divide-[#F1E7ED] overflow-hidden"><Link to="/ayuda" className="flex items-center justify-center gap-2 py-3.5 text-sm font-semibold"><Svg name="chat" size={18} />Ayuda y reportes</Link><Link to="/tutoriales" className="flex items-center justify-center gap-2 py-3.5 text-sm font-semibold"><Svg name="video" size={18} />Tutoriales</Link></div>
        <button className="btn-sec" onClick={signOut}>Cerrar sesión</button>
      </div>
    </Screen>
  )
}

export function salaryForCard(j) { return salaryText(j) }
