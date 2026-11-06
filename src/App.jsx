import { useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { MatchWatcher } from './components/MatchWatcher'
import { useAuth } from './lib/auth'
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

function WithNav({ items, children }) {
  return <>{children}<BottomNav items={items} /></>
}

function EditStep({ Comp }) {
  const nav = useNavigate()
  return <Comp edit onDone={() => nav('/perfil')} />
}

export default function App() {
  const { session, profile, candidate, company, isAdmin, loading, recovery } = useAuth()
  const [unseen, setUnseen] = useState(0)

  if (loading || (session && !profile)) return <div className="flex h-full"><Spinner /></div>

  const common = [
    <Route key="legal" path="/legal/:doc" element={<Legal />} />,
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
      <Routes>
        <Route path="/" element={<WithNav items={nav}><Explore /></WithNav>} />
        <Route path="/intereses" element={<WithNav items={nav}><Interests /></WithNav>} />
        <Route path="/chats" element={<WithNav items={nav}><ChatList /></WithNav>} />
        <Route path="/chats/:id" element={<ChatRoom />} />
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

  if (!company) return <Routes>{isAdmin && <Route path="/admin" element={<Admin />} />}<Route path="*" element={<CompanyMissing />} /></Routes>
  const nav = [
    { to: '/', label: 'Panel', icon: 'grid' }, { to: '/chats', label: 'Chats', icon: 'chat', badge: unseen > 0 },
    { to: '/vitrina', label: 'Vitrina', icon: 'building' }, ...adminItem,
  ]
  return (
    <>
    <MatchWatcher onCount={setUnseen} />
    <Routes>
      <Route path="/" element={<WithNav items={nav}><CompanyPanel /></WithNav>} />
      <Route path="/vacantes/nueva" element={<JobForm />} />
      <Route path="/vacantes/:id" element={<JobForm />} />
      <Route path="/vacantes/:id/candidatos" element={<JobCandidates />} />
      <Route path="/chats" element={<WithNav items={nav}><ChatList /></WithNav>} />
      <Route path="/chats/:id" element={<ChatRoom />} />
      <Route path="/vitrina" element={<WithNav items={nav}><CompanyAccount /></WithNav>} />
      {isAdmin && <Route path="/admin" element={<Admin />} />}
      {common}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}
