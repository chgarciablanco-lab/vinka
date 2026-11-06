import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { clp } from '../lib/catalog'
import { Avatar, ErrorBox, Sheet, Svg } from '../components/ui'
import { NotifyCard } from '../components/NotifyCard'
import { Bell } from '../components/Bell'
import { InstallBanner } from '../components/InstallBanner'
import { EmailToggle } from './Notifications'

function Row({ to, title, sub }) {
  return (
    <Link to={to} className="flex items-center justify-between gap-3 border-b border-[#F1E7ED] py-3.5 last:border-0">
      <span className="flex flex-col gap-0.5"><span className="text-[15px] font-semibold">{title}</span>{sub && <span className="text-[13px] text-tinta-3">{sub}</span>}</span>
      <Svg name="chevron" size={18} className="text-tinta-suave" />
    </Link>
  )
}

export function DangerZone() {
  const { signOut } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [txt, setTxt] = useState('')
  const [err, setErr] = useState('')
  const del = async () => {
    const { error } = await supabase.rpc('delete_my_account')
    if (error) return setErr(errMsg(error))
    await signOut(); nav('/')
  }
  return (
    <>
      <div className="flex flex-col gap-2.5">
        <button className="btn-sec" onClick={async () => { await signOut(); nav('/') }}>Cerrar sesión</button>
        <button className="h-11 text-sm font-semibold text-[#B42318]" onClick={() => setOpen(true)}>Eliminar mi cuenta</button>
        <p className="text-center text-xs text-tinta-suave">
          <Link to="/legal/terminos" className="underline">Términos</Link> · <Link to="/legal/privacidad" className="underline">Privacidad</Link>
        </p>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Eliminar cuenta">
        <div className="flex flex-col gap-3 text-sm leading-relaxed">
          <p>Se borrarán tu perfil, tus intereses, tus matches, tus mensajes y tu video. Esta acción no se puede deshacer.</p>
          <label className="flex flex-col gap-1.5"><span className="label">Escribe ELIMINAR para confirmar</span>
            <input className="input" value={txt} onChange={(e) => setTxt(e.target.value)} /></label>
          <ErrorBox>{err}</ErrorBox>
          <button className="btn bg-[#B42318]" disabled={txt !== 'ELIMINAR'} onClick={del}>Eliminar definitivamente</button>
        </div>
      </Sheet>
    </>
  )
}

export function CandidateProfile() {
  const { profile, candidate, user, refresh } = useAuth()
  const [err, setErr] = useState('')
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()
  const togglePublic = async () => {
    const { error } = await supabase.from('candidate_profiles').update({ is_public: !candidate.is_public }).eq('user_id', user.id)
    if (error) setErr(errMsg(error)); else refresh()
  }
  const c = candidate || {}
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-rosa-fondo pb-28">
      <div className="safe-t flex items-center justify-between px-5 pb-4"><h1 className="text-[22px] font-bold">Perfil</h1><Bell /></div>
      <div className="flex flex-col gap-4 px-5">
        <div className="card flex items-center gap-3.5 p-4">
          <Avatar text={`${profile?.first_name?.[0] || ''}${profile?.last_name?.[0] || ''}`.toUpperCase()} color="#302538" size={56} round />
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-lg font-semibold">{name}</span>
            <span className="text-sm text-tinta-2">{c.headline || 'Sin cargo definido'}</span>
            <span className="text-xs text-tinta-suave">{[c.comuna, c.region].filter(Boolean).join(', ')}</span>
          </div>
        </div>
        <div className="card px-4">
          <Row to="/perfil/laboral" title="Perfil laboral" sub={[c.has_experience ? `${c.experiences?.length || 0} experiencia(s)` : 'Primer empleo', c.salary_expectation ? `${clp(c.salary_expectation)} líquido` : null].filter(Boolean).join(' · ')} />
          <Row to="/perfil/preferencias" title="Preferencias" sub={[...(c.modalities || []), ...(c.schedules || [])].join(' · ') || 'Sin definir'} />
          <Row to="/perfil/presentacion" title="Presentación" sub={c.video_path ? 'Video publicado' : c.bio ? 'Texto escrito' : 'Sin presentación'} />
        </div>
        <div className="card flex flex-col gap-2 p-4">
          <span className="label">Privacidad</span>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Empresas verificadas pueden encontrar mi perfil</span>
            <input type="checkbox" role="switch" className="h-6 w-6 accent-[#D02E72]" checked={!!c.is_public} onChange={togglePublic} />
          </label>
          <span className="hint">Si lo desactivas, solo verán tu perfil las empresas a las que tú muestres interés. Tu teléfono y correo nunca se muestran sin tu permiso.</span>
          <ErrorBox>{err}</ErrorBox>
        </div>
        <NotifyCard />
        <EmailToggle />
        <InstallBanner always />
        <DangerZone />
      </div>
    </div>
  )
}
