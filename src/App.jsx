import { useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { MatchWatcher } from './components/MatchWatcher'
import { useAuth } from './lib/auth'
import { useHeartbeat } from './lib/presence'
import { BottomNav, Spinner } from './components/ui'
import Welcome from './pages/auth/Welcome'
import { CheckEmail, Forgot, Login, NewPassword } from './pages/auth/AuthPages'
import { SignupCandidate, SignupCompany } from './pages/auth/Signup'
import { Onboarding, StepIntro, StepPrefs, StepWork } from './pages/candidate/ProfileSteps'
import Explore from './pages/candidate/Explore'
import Interests from './pages/candidate/Interests'
import { ChatList, ChatRoom } from './pages/Chats'
import { CandidateProfile } from './pages/Account'
import { CompanyAccount, CompanyMissing, CompanyPanel, JobCandidates, JobForm } from './pages/company/Company'
import Admin from './pages/admin/Admin'
import Legal from './pages/Legal'
import Agenda from './pages/company/Agenda'
import BookInterview from './pages/candidate/BookInterview'
import Notifications from './pages/Notifications'
import Invitation, { readPendingInvite } from './pages/Invitation'
import { ExternalApplicants, ImportJobs } from './pages/company/ImportPages'
import { useEffect } from 'react'
import Pipeline from './pages/company/Pipeline'
import CandidateDetail from './pages/company/CandidateDetail'
import Talent from './pages/company/Talent'
import Reports from './pages/company/Reports'
import { JoinTeam, Team, Templates } from './pages/company/TeamPages'
import Offer from './pages/candidate/Offer'
import { useLocation } from 'react-router-dom'

function PendingInvite() {
  const nav = useNavigate()
  const loc = useLocation()
  useEffect(() => {
    const t = readPendingInvite()
    if (t && !loc.pathname.startsWith('/invitacion')) nav(`/invitacion/${t}`)
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

export default function App() {
  const { session, profile, candidate, company, isAdmin, loading, recovery } = useAuth()
  useHeartbeat(!!session && !!profile && profile.show_online !== false)
  const [unseen, setUnseen] = useState(0)

  if (loading || (session && !profile)) return <div className="flex h-full"><Spinner /></div>

  const common = [
    <Route key="legal" path="/legal/:doc" element={<Legal />} />,
    <Route key="inv" path="/invitacion/:token" element={<Invitation />} />,
    <Route key="team" path="/equipo/unirse/:token" element={<JoinTeam />} />,
  ]

  if (recovery) return <Routes><Route path="*" element={<NewPassword />} /></Routes>

  if (!session) {
    return (
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/ingresar" element={<Login />} />
        <Route path="/recuperar" element={<Forgot />} />
        <Route path="/registro/candidato" element={<SignupCandidate />} />
        <Route path="/registro/empresa" element={<SignupCompany />} />
        <Route path="/confirmar" element={<CheckEmail />} />
        {common}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  const adminItem = isAdmin ? [{ to: '/admin', label: 'Admin', icon: 'shield' }] : []

  if (profile.role === 'candidate') {
    if (!candidate?.onboarding_done) return <Routes>{common}<Route path="*" element={<Onboarding />} /></Routes>
    const nav = [
      { to: '/', label: 'Explorar', icon: 'card' }, { to: '/intereses', label: 'Intereses', icon: 'swap' },
      { to: '/chats', label: 'Chats', icon: 'chat', badge: unseen > 0 }, { to: '/perfil', label: 'Perfil', icon: 'user' }, ...adminItem,
    ]
    return (
      <>
      <MatchWatcher onCount={setUnseen} />
      <PendingInvite />
      <Routes>
        <Route path="/" element={<WithNav items={nav}><Explore /></WithNav>} />
        <Route path="/intereses" element={<WithNav items={nav}><Interests /></WithNav>} />
        <Route path="/chats" element={<WithNav items={nav}><ChatList /></WithNav>} />
        <Route path="/chats/:id" element={<ChatRoom />} />
        <Route path="/chats/:id/agendar" element={<BookInterview />} />
        <Route path="/ofertas/:id" element={<Offer />} />
        <Route path="/avisos" element={<Notifications />} />
        <Route path="/perfil" element={<WithNav items={nav}><CandidateProfile /></WithNav>} />
        <Route path="/perfil/laboral" element={<EditStep Comp={StepWork} />} />
        <Route path="/perfil/preferencias" element={<EditStep Comp={StepPrefs} />} />
        <Route path="/perfil/presentacion" element={<EditStep Comp={StepIntro} />} />
        {isAdmin && <Route path="/admin" element={<Admin />} />}
        {common}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </>
    )
  }

  if (!company) return <Routes>{common}{isAdmin && <Route path="/admin" element={<Admin />} />}<Route path="*" element={<CompanyMissing />} /></Routes>
  const nav = [
    { to: '/', label: 'Panel', icon: 'grid' }, { to: '/talento', label: 'Talento', icon: 'people' }, { to: '/agenda', label: 'Agenda', icon: 'calendar' },
    { to: '/chats', label: 'Chats', icon: 'chat', badge: unseen > 0 }, { to: '/vitrina', label: 'Empresa', icon: 'building' }, ...adminItem,
  ]
  return (
    <>
    <MatchWatcher onCount={setUnseen} />
    <Routes>
      <Route path="/" element={<WithNav items={nav}><CompanyPanel /></WithNav>} />
      <Route path="/vacantes/nueva" element={<JobForm />} />
      <Route path="/vacantes/:id" element={<JobForm />} />
      <Route path="/vacantes/:id/candidatos" element={<JobCandidates />} />
      <Route path="/vacantes/:id/externos" element={<ExternalApplicants />} />
      <Route path="/vacantes/:id/proceso" element={<Pipeline />} />
      <Route path="/vacantes/:job/candidato/:cid" element={<CandidateDetail />} />
      <Route path="/vacantes/:job/externo/:eid" element={<CandidateDetail />} />
      <Route path="/talento" element={<WithNav items={nav}><Talent /></WithNav>} />
      <Route path="/reportes" element={<Reports />} />
      <Route path="/plantillas" element={<Templates />} />
      <Route path="/equipo" element={<Team />} />
      <Route path="/ofertas/:id" element={<Offer />} />
      <Route path="/importar/vacantes" element={<ImportJobs />} />
      <Route path="/chats" element={<WithNav items={nav}><ChatList /></WithNav>} />
      <Route path="/chats/:id" element={<ChatRoom />} />
      <Route path="/vitrina" element={<WithNav items={nav}><CompanyAccount /></WithNav>} />
      <Route path="/agenda" element={<WithNav items={nav}><Agenda /></WithNav>} />
      <Route path="/avisos" element={<Notifications />} />
      {isAdmin && <Route path="/admin" element={<Admin />} />}
      {common}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}
