import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { MatchWatcher } from './components/MatchWatcher'
import { useAuth } from './lib/auth'
import { useHeartbeat } from './lib/presence'
import { BottomNav, Spinner, Svg } from './components/ui'
import { DesktopNav } from './components/DesktopNav'
import { ErrorBoundary, isStaleChunk, reloadForNewVersion } from './components/ErrorBoundary'
import Welcome from './pages/auth/Welcome'
import { CheckEmail, Forgot, Login, NewPassword } from './pages/auth/AuthPages'
import { SignupCandidate, SignupCompany } from './pages/auth/Signup'
import { readPendingInvite } from './pages/Invitation'

// Cada pantalla se descarga solo cuando se abre: la app inicial pesa menos y carga más rápido
// Pantallas con carga diferida. Si la app quedó abierta durante una publicación, el archivo antiguo ya no existe: se recarga sola.
const lz = (load, name = 'default') => lazy(() => load().then((m) => ({ default: m[name] }), (err) => {
  if (isStaleChunk(err?.message) && reloadForNewVersion()) return new Promise(() => {})
  throw err
}))
const Onboarding = lz(() => import('./pages/candidate/ProfileSteps'), 'Onboarding')
const StepWork = lz(() => import('./pages/candidate/ProfileSteps'), 'StepWork')
const StepPrefs = lz(() => import('./pages/candidate/ProfileSteps'), 'StepPrefs')
const StepIntro = lz(() => import('./pages/candidate/ProfileSteps'), 'StepIntro')
const Explore = lz(() => import('./pages/candidate/Explore'))
const Interests = lz(() => import('./pages/candidate/Interests'))
const ChatList = lz(() => import('./pages/Chats'), 'ChatList')
const ChatRoom = lz(() => import('./pages/Chats'), 'ChatRoom')
const CandidateProfile = lz(() => import('./pages/Account'), 'CandidateProfile')
const CompanyAccount = lz(() => import('./pages/company/Company'), 'CompanyAccount')
const CompanyMissing = lz(() => import('./pages/company/Company'), 'CompanyMissing')
const CompanyPanel = lz(() => import('./pages/company/Company'), 'CompanyPanel')
const JobCandidates = lz(() => import('./pages/company/Company'), 'JobCandidates')
const JobForm = lz(() => import('./pages/company/Company'), 'JobForm')
const Admin = lz(() => import('./pages/admin/Admin'))
const AdminAccount = lz(() => import('./pages/admin/Admin'), 'AdminAccount')
const AdvisorHome = lz(() => import('./pages/advisor/Advisor'))
const AdvisorTerms = lz(() => import('./pages/advisor/Advisor'), 'AdvisorTerms')
const AdvisorTeam = lz(() => import('./pages/advisor/Advisor'), 'AdvisorTeam')
const ForcePassword = lz(() => import('./pages/advisor/Advisor'), 'ForcePassword')
const Legal = lz(() => import('./pages/Legal'))
const Help = lz(() => import('./pages/Help'))
const Quote = lz(() => import('./pages/Quote'))
const Tutorials = lz(() => import('./pages/Tutorials'))
const Agenda = lz(() => import('./pages/company/Agenda'))
const BookInterview = lz(() => import('./pages/candidate/BookInterview'))
const Notifications = lz(() => import('./pages/Notifications'))
const Invitation = lz(() => import('./pages/Invitation'))
const ImportJobs = lz(() => import('./pages/company/ImportPages'), 'ImportJobs')
const ExternalApplicants = lz(() => import('./pages/company/ImportPages'), 'ExternalApplicants')
const Pipeline = lz(() => import('./pages/company/Pipeline'))
const CandidateDetail = lz(() => import('./pages/company/CandidateDetail'))
const Talent = lz(() => import('./pages/company/Talent'))
const Reports = lz(() => import('./pages/company/Reports'))
const Templates = lz(() => import('./pages/company/TeamPages'), 'Templates')
const Team = lz(() => import('./pages/company/TeamPages'), 'Team')
const JoinTeam = lz(() => import('./pages/company/TeamPages'), 'JoinTeam')
const Offer = lz(() => import('./pages/candidate/Offer'))
const PublicCompany = lz(() => import('./pages/PublicJobs'), 'PublicCompany')
const PublicJob = lz(() => import('./pages/PublicJobs'), 'PublicJob')
const Compare = lz(() => import('./pages/company/Compare'))
const Automations = lz(() => import('./pages/company/Automations'))
const Plan = lz(() => import('./pages/company/Plan'))
const Clients = lz(() => import('./pages/company/Clients'))
const Advisory = lz(() => import('./pages/candidate/Advisory'))
const Visibility = lz(() => import('./pages/candidate/Visibility'))
const Promote = lz(() => import('./pages/company/Promote'))

function PendingInvite() {
  const nav = useNavigate()
  const loc = useLocation()
  useEffect(() => {
    const t = readPendingInvite()
    if (t && !loc.pathname.startsWith('/invitacion')) nav(`/invitacion/${t}`)
  }, []) // eslint-disable-line
  return null
}

/** Después de registrarse o ingresar, lleva a lo que la persona eligió contratar en la página de inicio */
function GoNext({ allowed }) {
  const nav = useNavigate()
  useEffect(() => {
    let t = ''
    try { t = localStorage.getItem('vinka-next') || ''; localStorage.removeItem('vinka-next') } catch { /* sin almacenamiento */ }
    if (t && allowed.includes(t)) nav(t)
  }, []) // eslint-disable-line
  return null
}

function WithNav({ items, children }) {
  return <>{children}<BottomNav items={items} /></>
}

function EditStep({ Comp }) {
  const nav = useNavigate()
  return <Comp edit onDone={() => nav('/perfil')} />
}

/** En computador: lista de chats a la izquierda y conversación a la derecha. En móvil: una pantalla a la vez. */
function ChatsSplit({ items }) {
  const { id } = useParams()
  return (
    <div className="h-full lg:grid lg:grid-cols-[380px_1fr]">
      <div className={`${id ? 'hidden lg:block' : ''} h-full overflow-y-auto lg:border-r lg:border-[#EEE3EA]`}>
        <ChatList />{!id && <BottomNav items={items} />}
      </div>
      {id ? <div className="h-full lg:overflow-hidden"><ChatRoom key={id} /></div> : (
        <div className="hidden h-full flex-col items-center justify-center gap-2 bg-rosa-fondo text-center lg:flex">
          <Svg name="chat" size={40} className="text-tinta-suave" />
          <span className="font-display text-lg font-semibold">Elige una conversación</span>
          <span className="text-sm text-tinta-3">Aquí verás el chat sin salir de la lista.</span>
        </div>
      )}
    </div>
  )
}

const Loading = () => <div className="flex h-full min-h-[50vh]"><Spinner /></div>

export default function App() {
  const { session, profile, candidate, company, isAdmin, advisor, loading, recovery } = useAuth()
  useHeartbeat(!!session && !!profile && profile.show_online !== false)
  const [unseen, setUnseen] = useState(0)
  const loc = useLocation()

  if (loading || (session && !profile)) return <div className="flex h-full"><Spinner /></div>

  const wrap = (routes) => <ErrorBoundary resetKey={loc.pathname}><Suspense fallback={<Loading />}>{routes}</Suspense></ErrorBoundary>

  const common = [
    <Route key="legal" path="/legal/:doc" element={<Legal />} />,
    <Route key="inv" path="/invitacion/:token" element={<Invitation />} />,
    <Route key="team" path="/equipo/unirse/:token" element={<JoinTeam />} />,
    <Route key="pubco" path="/empleos/:slug" element={<PublicCompany />} />,
    <Route key="pubjob" path="/empleo/:id" element={<PublicJob />} />,
    <Route key="help" path="/ayuda" element={<Help />} />,
    <Route key="quote" path="/cotizar" element={<Quote />} />,
    <Route key="tut" path="/tutoriales" element={<Tutorials />} />,
    <Route key="tutw" path="/tutoriales/:who" element={<Tutorials />} />,
  ]

  if (recovery) return <Routes><Route path="*" element={<NewPassword />} /></Routes>

  if (!session) {
    return wrap(
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/ingresar" element={<Login />} />
        <Route path="/recuperar" element={<Forgot />} />
        <Route path="/registro/candidato" element={<SignupCandidate />} />
        <Route path="/registro/empresa" element={<SignupCompany />} />
        <Route path="/confirmar" element={<CheckEmail />} />
        {common}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>,
    )
  }

  const adminItem = isAdmin ? [{ to: '/admin', label: 'Admin', icon: 'shield' }] : []

  // Cuentas entregadas por VINKA con clave temporal: primero crean su contraseña
  if (profile.must_change_password) return wrap(<Routes><Route path="*" element={<ForcePassword />} /></Routes>)

  // Asesores de VINKA: solo sus asesorías asignadas
  if (profile.role === 'advisor') {
    if (!advisor?.active) return wrap(<Routes><Route path="*" element={<AdminAccount subtitle="Tu cuenta de asesor/a no está activa. Escribe a VINKA si crees que es un error." hint="" />} /></Routes>)
    if (!advisor.terms_accepted_at) return wrap(<Routes><Route path="*" element={<AdvisorTerms />} /></Routes>)
    const nav = [{ to: '/', label: 'Asesorías', icon: 'people' }, { to: '/equipo', label: 'Equipo VINKA', icon: 'chat' }, { to: '/avisos', label: 'Avisos', icon: 'bell' }, { to: '/cuenta', label: 'Cuenta', icon: 'user' }]
    return (
      <>
      <DesktopNav items={nav} />
      <div className="desk h-full lg:pl-64">
      {wrap(
      <Routes>
        <Route path="/" element={<WithNav items={nav}><AdvisorHome /></WithNav>} />
        <Route path="/equipo" element={<WithNav items={nav}><AdvisorTeam /></WithNav>} />
        <Route path="/cuenta" element={<WithNav items={nav}><AdminAccount subtitle="Asesor/a de VINKA" hint="Tu cuenta la entregó VINKA. Si olvidas tu contraseña, pide una nueva a administración." /></WithNav>} />
        <Route path="/avisos" element={<Notifications />} />
        {common}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>)}
      </div>
      </>
    )
  }

  // Cuentas de administración de VINKA: su propio espacio, sin las pantallas de postulante
  if (isAdmin && profile.role === 'candidate') {
    const nav = [
      { to: '/', label: 'Negocio', icon: 'chart' }, { to: '/asesorias', label: 'Asesorías', icon: 'chat' },
      { to: '/postulantes', label: 'Usuarios', icon: 'people' }, { to: '/verificar', label: 'Empresas', icon: 'building' }, { to: '/cuenta', label: 'Cuenta', icon: 'user' },
    ]
    const deskNav = [
      { to: '/', label: 'Negocio y planes', icon: 'chart' }, { to: '/promociones', label: 'Destacados', icon: 'star' },
      { section: 'Asesorías' },
      { to: '/asesorias', label: 'Solicitudes', icon: 'chat' }, { to: '/asesores', label: 'Asesores', icon: 'star' },
      { section: 'Usuarios' },
      { to: '/postulantes', label: 'Postulantes', icon: 'people' },
      { section: 'Empresas' },
      { to: '/verificar', label: 'Por verificar', icon: 'shield' }, { to: '/empresas', label: 'Todas las empresas', icon: 'building' }, { to: '/denuncias', label: 'Denuncias', icon: 'doc' }, { to: '/sugerencias', label: 'Errores y sugerencias', icon: 'chat' },
      { section: 'Cuenta' }, { to: '/avisos', label: 'Avisos', icon: 'bell' }, { to: '/cuenta', label: 'Mi cuenta', icon: 'user' },
    ]
    return (
      <>
      <DesktopNav items={deskNav} />
      <div className="desk h-full lg:pl-64">
      {wrap(
      <Routes>
        <Route path="/" element={<WithNav items={nav}><Admin section="business" /></WithNav>} />
        <Route path="/asesorias" element={<WithNav items={nav}><Admin section="advisory" /></WithNav>} />
        <Route path="/postulantes" element={<WithNav items={nav}><Admin section="candidates" /></WithNav>} />
        <Route path="/asesores" element={<WithNav items={nav}><Admin section="advisors" /></WithNav>} />
        <Route path="/promociones" element={<WithNav items={nav}><Admin section="promos" /></WithNav>} />
        <Route path="/verificar" element={<WithNav items={nav}><Admin section="pending" /></WithNav>} />
        <Route path="/empresas" element={<WithNav items={nav}><Admin section="all" /></WithNav>} />
        <Route path="/denuncias" element={<WithNav items={nav}><Admin section="reports" /></WithNav>} />
        <Route path="/sugerencias" element={<WithNav items={nav}><Admin section="feedback" /></WithNav>} />
        <Route path="/cuenta" element={<WithNav items={nav}><AdminAccount /></WithNav>} />
        <Route path="/admin" element={<Navigate to="/" replace />} />
        <Route path="/avisos" element={<Notifications />} />
        {common}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>)}
      </div>
      </>
    )
  }

  if (profile.role === 'candidate') {
    if (!candidate?.onboarding_done) return wrap(<Routes>{common}<Route path="*" element={<Onboarding />} /></Routes>)
    const nav = [
      { to: '/', label: 'Explorar', icon: 'card' }, { to: '/intereses', label: 'Intereses', icon: 'swap' },
      { to: '/chats', label: 'Chats', icon: 'chat', badge: unseen > 0 }, { to: '/perfil', label: 'Perfil', icon: 'user' }, ...adminItem,
    ]
    const deskNav = [
      { to: '/', label: 'Explorar vacantes', icon: 'card' }, { to: '/intereses', label: 'Intereses', icon: 'swap' },
      { to: '/chats', label: 'Chats', icon: 'chat', badge: unseen > 0 },
      { section: 'Mi perfil' },
      { to: '/perfil', label: 'Perfil', icon: 'user' }, { to: '/asesoria', label: 'Asesoría', icon: 'people' }, { to: '/visibilidad', label: 'Perfil destacado', icon: 'star' },
      { to: '/avisos', label: 'Avisos', icon: 'bell' },
      { section: 'Ayuda' }, { to: '/tutoriales', label: 'Tutoriales', icon: 'video' }, { to: '/ayuda', label: 'Ayuda y reportes', icon: 'chat' }, ...adminItem,
    ]
    return (
      <>
      <MatchWatcher onCount={setUnseen} />
      <PendingInvite />
      <GoNext allowed={['/asesoria', '/visibilidad']} />
      <DesktopNav items={deskNav} />
      <div className="desk h-full lg:pl-64">
      {wrap(
      <Routes>
        <Route path="/" element={<WithNav items={nav}><Explore /></WithNav>} />
        <Route path="/intereses" element={<WithNav items={nav}><Interests /></WithNav>} />
        <Route path="/chats" element={<ChatsSplit items={nav} />} />
        <Route path="/chats/:id" element={<ChatsSplit items={nav} />} />
        <Route path="/chats/:id/agendar" element={<BookInterview />} />
        <Route path="/ofertas/:id" element={<Offer />} />
        <Route path="/avisos" element={<Notifications />} />
        <Route path="/perfil" element={<WithNav items={nav}><CandidateProfile /></WithNav>} />
        <Route path="/perfil/laboral" element={<EditStep Comp={StepWork} />} />
        <Route path="/perfil/preferencias" element={<EditStep Comp={StepPrefs} />} />
        <Route path="/perfil/presentacion" element={<EditStep Comp={StepIntro} />} />
        <Route path="/asesoria" element={<Advisory />} />
        <Route path="/visibilidad" element={<Visibility />} />
        {isAdmin && <Route path="/admin" element={<Admin />} />}
        {common}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>)}
      </div>
      </>
    )
  }

  if (!company) return wrap(<Routes>{common}{isAdmin && <Route path="/admin" element={<Admin />} />}<Route path="*" element={<CompanyMissing />} /></Routes>)
  const nav = [
    { to: '/', label: 'Panel', icon: 'grid' }, { to: '/talento', label: 'Talento', icon: 'people' }, { to: '/agenda', label: 'Agenda', icon: 'calendar' },
    { to: '/chats', label: 'Chats', icon: 'chat', badge: unseen > 0 }, { to: '/vitrina', label: 'Empresa', icon: 'building' }, ...adminItem,
  ]
  const deskNav = [
    { to: '/', label: 'Panel', icon: 'grid' }, { to: '/talento', label: 'Banco de talento', icon: 'people' }, { to: '/agenda', label: 'Agenda', icon: 'calendar' },
    { to: '/chats', label: 'Chats', icon: 'chat', badge: unseen > 0 },
    { section: 'Gestión' },
    { to: '/reportes', label: 'Reportes', icon: 'chart' }, { to: '/plantillas', label: 'Plantillas', icon: 'doc' }, { to: '/automatizaciones', label: 'Automatizaciones', icon: 'swap' }, { to: '/equipo', label: 'Equipo', icon: 'user' },
    { to: '/plan', label: 'Plan y uso', icon: 'chart' },
    ...(company.kind === 'consultora' && !company.parent_id ? [{ to: '/clientes', label: 'Clientes', icon: 'building' }] : []),
    { to: '/vitrina', label: 'Empresa', icon: 'building' },
    { section: 'Ayuda' }, { to: '/tutoriales', label: 'Tutoriales', icon: 'video' }, { to: '/ayuda', label: 'Ayuda y reportes', icon: 'chat' }, ...adminItem,
  ]
  return (
    <>
    <MatchWatcher onCount={setUnseen} />
    <GoNext allowed={['/plan']} />
    <DesktopNav items={deskNav} />
    <div className="desk h-full lg:pl-64">
    {wrap(
    <Routes>
      <Route path="/" element={<WithNav items={nav}><CompanyPanel /></WithNav>} />
      <Route path="/vacantes/nueva" element={<JobForm />} />
      <Route path="/vacantes/:id" element={<JobForm />} />
      <Route path="/vacantes/:id/candidatos" element={<JobCandidates />} />
      <Route path="/vacantes/:id/externos" element={<ExternalApplicants />} />
      <Route path="/vacantes/:id/proceso" element={<Pipeline />} />
      <Route path="/vacantes/:id/comparar" element={<Compare />} />
      <Route path="/automatizaciones" element={<Automations />} />
      <Route path="/plan" element={<Plan />} />
      <Route path="/clientes" element={<Clients />} />
      <Route path="/vacantes/:id/destacar" element={<Promote />} />
      <Route path="/vacantes/:job/candidato/:cid" element={<CandidateDetail />} />
      <Route path="/vacantes/:job/externo/:eid" element={<CandidateDetail />} />
      <Route path="/talento" element={<WithNav items={nav}><Talent /></WithNav>} />
      <Route path="/reportes" element={<Reports />} />
      <Route path="/plantillas" element={<Templates />} />
      <Route path="/equipo" element={<Team />} />
      <Route path="/ofertas/:id" element={<Offer />} />
      <Route path="/importar/vacantes" element={<ImportJobs />} />
      <Route path="/chats" element={<ChatsSplit items={nav} />} />
      <Route path="/chats/:id" element={<ChatsSplit items={nav} />} />
      <Route path="/vitrina" element={<WithNav items={nav}><CompanyAccount /></WithNav>} />
      <Route path="/agenda" element={<WithNav items={nav}><Agenda /></WithNav>} />
      <Route path="/avisos" element={<Notifications />} />
      {isAdmin && <Route path="/admin" element={<Admin />} />}
      {common}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>)}
    </div>
    </>
  )
}
