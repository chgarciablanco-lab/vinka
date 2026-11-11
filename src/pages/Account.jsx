import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { clp } from '../lib/catalog'
import { Avatar, ErrorBox, Sheet, Svg } from '../components/ui'
import { NotifyCard } from '../components/NotifyCard'
import { Bell } from '../components/Bell'
import { InstallBanner } from '../components/InstallBanner'
import { EmailToggle } from './Notifications'
import { CalendarSync } from '../components/CalendarSync'
import { OnlineToggle, StatusPill } from '../components/Presence'
import { MyCv } from '../components/MyCv'
import { pl } from '../lib/text'

function Row({ to, title, sub }) {
  return (
    <Link to={to} className="flex items-center justify-between gap-3 border-b border-[#F1E7ED] py-3.5 last:border-0">
      <span className="flex flex-col gap-0.5"><span className="text-[15px] font-semibold">{title}</span>{sub && <span className="text-[13px] text-tinta-3">{sub}</span>}</span>
      <Svg name="chevron" size={18} className="text-tinta-suave" />
    </Link>
  )
}

/** Ley 21.719: la persona puede descargar una copia de sus datos */
export function MyData() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const download = async () => {
    setErr(''); setBusy(true)
    const { data, error } = await supabase.rpc('export_my_data')
    setBusy(false)
    if (error) return setErr(errMsg(error))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    a.download = `mis-datos-vinka-${new Date().toISOString().slice(0, 10)}.json`
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  return (
    <div className="card flex flex-col gap-2 p-4">
      <span className="label">Tus datos personales</span>
      <span className="hint">Descarga una copia de todo lo que VINKA guarda sobre ti. Los procesos cerrados se eliminan automáticamente después de 12 meses.</span>
      <ErrorBox>{err}</ErrorBox>
      <button className="btn-sec h-11 text-sm" disabled={busy} onClick={download}><Svg name="download" size={18} />{busy ? 'Preparando…' : 'Descargar mis datos'}</button>
    </div>
  )
}

export function DangerZone() {
  const { signOut } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [txt, setTxt] = useState('')
  const [err, setErr] = useState('')
  const [owned, setOwned] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setErr(''); setTxt(''); setOwned(null)
    supabase.rpc('my_deletion_check').then(({ data }) => setOwned(data?.owned || []))
  }, [open])
  // La baja la hace una función de servidor: borra tus archivos (video, CV y archivos de asesorías) y luego la cuenta
  const del = async () => {
    setErr(''); setBusy(true)
    const { data, error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'ELIMINAR' } })
    setBusy(false)
    if (error || !data?.deleted) {
      let msg = data?.error
      try { msg = msg || (await error?.context?.json())?.error } catch { /* sin detalle */ }
      return setErr(msg || 'No pudimos eliminar tu cuenta. Inténtalo de nuevo.')
    }
    await signOut(); nav('/')
  }
  return (
    <>
      <div className="flex flex-col gap-2.5">
        <div className="card grid grid-cols-2 divide-x divide-[#F1E7ED] overflow-hidden"><Link to="/ayuda" className="flex items-center justify-center gap-2 py-3.5 text-sm font-semibold"><Svg name="chat" size={18} />Ayuda y reportes</Link><Link to="/tutoriales" className="flex items-center justify-center gap-2 py-3.5 text-sm font-semibold"><Svg name="video" size={18} />Tutoriales</Link></div>
        <button className="btn-sec" onClick={async () => { await signOut(); nav('/') }}>Cerrar sesión</button>
        <button className="h-11 text-sm font-semibold text-[#B42318]" onClick={() => setOpen(true)}>Eliminar mi cuenta</button>
        <p className="text-center text-xs text-tinta-suave">
          <Link to="/legal/terminos" className="underline">Términos</Link> · <Link to="/legal/privacidad" className="underline">Privacidad</Link>
        </p>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Eliminar cuenta">
        <div className="flex flex-col gap-3 text-sm leading-relaxed">
          {owned == null ? <p className="text-tinta-3">Revisando tu cuenta…</p> : owned.length > 0 ? (
            <>
              <p className="rounded-xl bg-[#FEF3F2] px-3 py-2.5 text-[#912018]"><b>Aún no puedes eliminar tu cuenta.</b> Eres dueño/a de {owned.map((c) => c.name).join(', ')}. Si la eliminas, se perderían sus vacantes, procesos y el trabajo de tu equipo.</p>
              {owned.some((c) => !c.client && c.others > 0)
                ? <p>Primero traspasa la empresa a otra persona del equipo: en <Link to="/equipo" className="font-semibold underline" onClick={() => setOpen(false)}>Equipo</Link>, toca a esa persona y elige «Traspasar la empresa». Después podrás eliminar tu cuenta.</p>
                : <p>No hay otra persona en el equipo a quien traspasarla. <Link to="/equipo" className="font-semibold underline" onClick={() => setOpen(false)}>Invita a alguien</Link> y traspásale la empresa, o escribe a <a href="mailto:contacto@vinka.cl" className="font-semibold underline">contacto@vinka.cl</a> para cerrarla.</p>}
            </>
          ) : (
            <>
              <p>Se borrarán tu perfil, tus intereses, tus matches, tus mensajes, tu video, tus CV y los archivos de tus asesorías. Los registros de pagos se conservan sin tus datos por obligación tributaria. Esta acción no se puede deshacer.</p>
              <label className="flex flex-col gap-1.5"><span className="label">Escribe ELIMINAR para confirmar</span>
                <input className="input" value={txt} onChange={(e) => setTxt(e.target.value)} /></label>
              <ErrorBox>{err}</ErrorBox>
              <button className="btn bg-[#B42318]" disabled={txt !== 'ELIMINAR' || busy} onClick={del}>{busy ? 'Eliminando…' : 'Eliminar definitivamente'}</button>
            </>
          )}
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
  const toggleAlerts = async () => {
    const { error } = await supabase.from('candidate_profiles').update({ job_alerts: !candidate.job_alerts }).eq('user_id', user.id)
    if (error) setErr(errMsg(error)); else refresh()
  }
  const c = candidate || {}
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-rosa-fondo pb-28 lg:max-w-2xl lg:pb-10 lg:pt-4">
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
        <Link to="/asesoria" className="flex items-center gap-3 rounded-2xl border border-[#E9D3F0] bg-[#F7F0FB] p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#6B2E8F]"><Svg name="user" /></span>
          <span className="flex flex-1 flex-col"><span className="text-[15px] font-semibold text-[#4A2163]">Asesoría con reclutador</span><span className="text-[13px] leading-snug text-[#4A2163]/80">Mejora tu CV y tu búsqueda de empleo con ayuda profesional</span></span>
          <Svg name="chevron" size={18} className="text-[#6B2E8F]" />
        </Link>
        <Link to="/visibilidad" className="flex items-center gap-3 rounded-2xl border border-[#F0DDA0] bg-[#FFF9E8] p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[18px] text-[#7A5200]">★</span>
          <span className="flex flex-1 flex-col"><span className="text-[15px] font-semibold text-[#5C3E00]">Perfil destacado</span><span className="text-[13px] leading-snug text-[#5C3E00]/80">Aparece entre los primeros cuando una empresa busca personas</span></span>
          <Svg name="chevron" size={18} className="text-[#7A5200]" />
        </Link>
        <MyCv />
        <div className="card px-4">
          <Row to="/perfil/laboral" title="Perfil laboral" sub={[c.has_experience ? pl(c.experiences?.length || 0, 'experiencia', 'experiencias') : 'Primer empleo', c.salary_expectation ? `${clp(c.salary_expectation)} líquido` : null].filter(Boolean).join(' · ')} />
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
        <div className="card flex items-center justify-between gap-3 p-4"><span className="flex flex-col"><span className="text-[15px] font-semibold">Tu disponibilidad</span><span className="text-[13px] text-tinta-3">Avisa cuando no quieras que te molesten</span></span><StatusPill /></div>
        <OnlineToggle />
        <CalendarSync />
        <NotifyCard />
        <div className="card flex flex-col gap-2 p-4">
          <label className="flex items-center justify-between gap-3">
            <span className="flex flex-col"><span className="label">Alertas de vacantes nuevas</span>
              <span className="text-xs leading-snug text-tinta-3">Un aviso al día si se publican vacantes compatibles con tu cargo y zona.</span></span>
            <input type="checkbox" role="switch" className="h-6 w-6 shrink-0 accent-[#D02E72]" checked={c.job_alerts !== false} onChange={toggleAlerts} />
          </label>
        </div>
        <EmailToggle />
        <InstallBanner always />
        <MyData />
        <DangerZone />
      </div>
    </div>
  )
}
