import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Empty, ErrorBox, Logo, Screen, Spinner, TopBar } from '../components/ui'

export const INVITE_KEY = 'vinka-invite'
export const savePendingInvite = (t) => { try { localStorage.setItem(INVITE_KEY, t) } catch { /* sin almacenamiento */ } }
export const readPendingInvite = () => { try { return localStorage.getItem(INVITE_KEY) } catch { return null } }
export const clearPendingInvite = () => { try { localStorage.removeItem(INVITE_KEY) } catch { /* sin almacenamiento */ } }

/** Invitación de una empresa a un postulante importado desde otro portal. */
export default function Invitation() {
  const { token } = useParams()
  const nav = useNavigate()
  const { session, profile, candidate } = useAuth()
  const [inv, setInv] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.rpc('get_invitation', { p_token: token }).then(({ data, error }) => {
      if (error) setErr(errMsg(error))
      setInv(data?.[0] || false)
    })
  }, [token])

  const accept = async () => {
    setErr(''); setBusy(true)
    const { data, error } = await supabase.rpc('accept_invitation', { p_token: token })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    clearPendingInvite()
    nav(data ? `/chats/${data}` : '/intereses')
  }

  if (inv === null) return <Spinner />
  if (inv === false) return (
    <Screen><TopBar back="/" title="" /><div className="p-6"><Empty title="Invitación no disponible">El enlace no es válido o la empresa ya no está activa en VINKA.</Empty></div></Screen>
  )

  const isCandidate = session && profile?.role === 'candidate'
  const ready = isCandidate && candidate?.onboarding_done

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-rosa-fondo px-6 pb-10 pt-14">
      <Logo />
      <div className="mt-8 flex flex-col gap-4">
        <span className="text-sm font-semibold uppercase tracking-wide text-rosa-texto">Invitación</span>
        <h1 className="text-[26px] font-bold leading-tight">{inv.company_name} te invita a continuar tu proceso</h1>
        <p className="text-[15px] leading-relaxed text-tinta-2">Hola {inv.first_name}, postulaste a <b>{inv.job_title}</b>. Si aceptas, podrás conversar con {inv.company_name} y elegir el horario de tu entrevista desde VINKA.</p>
        <div className="card flex flex-col gap-1 p-4 text-sm">
          <span className="font-semibold">{inv.job_title}</span>
          <span className="text-tinta-3">{inv.company_name} · {inv.modality === 'Remota' ? 'Remoto' : inv.comuna}</span>
        </div>
        <ErrorBox>{err}</ErrorBox>
        {inv.accepted && !isCandidate && <p className="text-sm text-[#134A2B]">Esta invitación ya fue aceptada. Inicia sesión para continuar.</p>}
        {ready ? (
          <button className="btn" disabled={busy} onClick={accept}>{busy ? 'Conectando…' : 'Aceptar y continuar'}</button>
        ) : isCandidate ? (
          <>
            <p className="text-sm text-tinta-3">Primero termina tu perfil; después volverás aquí para aceptar.</p>
            <button className="btn" onClick={() => { savePendingInvite(token); nav('/') }}>Completar mi perfil</button>
          </>
        ) : session ? (
          <p className="text-sm text-tinta-3">Estás con una cuenta de empresa. Cierra sesión e ingresa con tu cuenta de candidato/a para aceptar.</p>
        ) : (
          <>
            <Link to={`/registro/candidato?email=${encodeURIComponent(inv.email || '')}`} onClick={() => savePendingInvite(token)} className="btn">Crear mi cuenta gratis</Link>
            <Link to="/ingresar" onClick={() => savePendingInvite(token)} className="btn-sec">Ya tengo cuenta</Link>
          </>
        )}
        <p className="text-center text-xs leading-relaxed text-tinta-suave">Si no te interesa, puedes cerrar esta página: no se creará ninguna cuenta con tus datos.</p>
      </div>
    </div>
  )
}
