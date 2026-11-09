import { useCallback, useEffect, useState } from 'react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Empty, ErrorBox, Logo, Screen, Spinner, Svg, Toast } from '../../components/ui'
import { ServiceChat } from '../../components/ServiceChat'
import { SERVICE_STATUS } from '../candidate/Advisory'

const CONTACT_TXT = { whatsapp: 'WhatsApp', correo: 'correo', videollamada: 'videollamada' }
const fmt = (d) => new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })

/** Primera vez: acuerdo de confidencialidad y no captación de clientes */
export function AdvisorTerms() {
  const { refresh, signOut } = useAuth()
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState('')
  const accept = async () => {
    const { error } = await supabase.rpc('accept_advisor_terms')
    if (error) return setErr(errMsg(error))
    refresh()
  }
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 bg-rosa-fondo px-6 pb-10 pt-12">
      <Logo />
      <h1 className="text-[24px] font-bold leading-tight">Bienvenido/a al equipo de asesores de VINKA</h1>
      <p className="text-[15px] leading-relaxed text-tinta-2">Antes de empezar, lee y acepta el acuerdo de trabajo con las personas que asesoras:</p>
      <ol className="card flex list-decimal flex-col gap-2.5 p-4 pl-9 text-sm leading-relaxed">
        <li>Las personas que atiendes son clientes de VINKA. Toda la comunicación, los archivos y las entregas se hacen dentro de la app.</li>
        <li>No pedirás ni compartirás teléfonos, correos, redes sociales u otros medios de contacto fuera de VINKA, ni ofrecerás servicios por tu cuenta a estas personas, durante el servicio ni después.</li>
        <li>Los pagos los gestiona solo VINKA. No recibirás pagos directos de las personas asesoradas.</li>
        <li>Usarás la información del perfil y los documentos solo para la asesoría y la mantendrás confidencial (Ley 19.628 y Ley 21.719).</li>
        <li>No harás promesas de contratación ni discriminarás por motivos que prohíbe el Código del Trabajo.</li>
        <li>VINKA puede revisar las conversaciones para resguardar la calidad del servicio, y suspender tu cuenta si no cumples este acuerdo.</li>
      </ol>
      <label className="flex items-start gap-2.5 rounded-xl border border-rosa-borde bg-white p-3 text-[13px] leading-snug">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D02E72]" />
        Leí y acepto el acuerdo de confidencialidad y no captación de clientes de VINKA.
      </label>
      <ErrorBox>{err}</ErrorBox>
      <button className="btn" disabled={!ok} onClick={accept}>Aceptar y continuar</button>
      <button className="btn-sec" onClick={signOut}>Cerrar sesión</button>
    </div>
  )
}

/** Cambio de contraseña obligatorio para cuentas entregadas por VINKA con clave temporal */
export function ForcePassword() {
  const { refresh, signOut } = useAuth()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async (e) => {
    e.preventDefault(); setErr('')
    if (pw.length < 8) return setErr('La contraseña debe tener al menos 8 caracteres.')
    if (pw !== pw2) return setErr('Las contraseñas no coinciden.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) { setBusy(false); return setErr(errMsg(error)) }
    await supabase.rpc('password_changed')
    setBusy(false); refresh()
  }
  return (
    <form onSubmit={save} className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 bg-rosa-fondo px-6 pb-10 pt-12">
      <Logo />
      <h1 className="text-[24px] font-bold leading-tight">Crea tu contraseña</h1>
      <p className="text-[15px] leading-relaxed text-tinta-2">Entraste con una clave temporal entregada por VINKA. Elige una contraseña propia para seguir.</p>
      <label className="flex flex-col gap-1.5"><span className="label">Nueva contraseña</span><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      <label className="flex flex-col gap-1.5"><span className="label">Repítela</span><input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
      <ErrorBox>{err}</ErrorBox>
      <button className="btn" disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
      <button type="button" className="btn-sec" onClick={signOut}>Cerrar sesión</button>
    </form>
  )
}

function Profile({ r }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-[#FAF7F9] p-3 text-sm text-tinta-2">
      <span><b>{r.headline || 'Sin cargo definido'}</b>{r.comuna ? ` · ${r.comuna}` : ''}{r.region ? `, ${r.region}` : ''}</span>
      {r.areas?.length > 0 && <span className="text-xs text-tinta-3">Áreas de interés: {r.areas.join(', ')}</span>}
      {r.has_experience === false && <span className="text-xs">Busca su primer empleo</span>}
      {(r.experiences || []).map((x, i) => <span key={i} className="text-xs">• {x.role} en {x.company} ({x.from || '?'} a {x.current ? 'hoy' : x.to || '?'}){x.description ? ` — ${x.description}` : ''}</span>)}
      {(r.education || []).map((x, i) => <span key={'e' + i} className="text-xs">• {x.title}{x.institution ? `, ${x.institution}` : ''}{x.status ? ` (${x.status})` : ''}</span>)}
      {r.skills?.length > 0 && <span className="text-xs">Habilidades: {r.skills.join(', ')}</span>}
      {r.bio && <span className="text-xs italic">«{r.bio}»</span>}
    </div>
  )
}

/** Panel del asesor/a: solo ve las asesorías que VINKA le asignó, sin datos de contacto */
export default function AdvisorHome() {
  const { profile } = useAuth()
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(null)
  const [note, setNote] = useState('')
  const [toast, setToast] = useState('')
  const load = useCallback(() => {
    supabase.rpc('advisor_requests').then(({ data, error }) => { if (error) setErr(errMsg(error)); setList(data || []) })
  }, [])
  useEffect(() => { load() }, [load])
  const deliver = async (r) => {
    setErr('')
    const { error } = await supabase.rpc('advisor_deliver', { p_id: r.id, p_note: note })
    if (error) return setErr(errMsg(error))
    setNote(''); setToast('Asesoría marcada como entregada'); load()
  }
  const active = (list || []).filter((r) => ['solicitada', 'pago_pendiente', 'en_curso'].includes(r.status))
  const done = (list || []).filter((r) => !['solicitada', 'pago_pendiente', 'en_curso'].includes(r.status))

  const card = (r) => {
    const st = SERVICE_STATUS[r.status] || [r.status, 'bg-[#F4EEF2]']
    const isOpen = open === r.id
    return (
      <div key={r.id} className="card flex flex-col gap-2.5 p-4">
        <button className="flex items-start justify-between gap-2 text-left" onClick={() => setOpen(isOpen ? null : r.id)}>
          <span className="flex flex-col"><span className="text-[15px] font-semibold">{r.name}</span><span className="text-xs text-tinta-3">{r.service} · asignada el {fmt(r.created_at)}{r.messages ? ` · ${r.messages} mensajes` : ''}</span></span>
          <span className={`pill shrink-0 ${st[1]}`}>{st[0]}</span>
        </button>
        {isOpen && (
          <>
            {r.goal && <div className="rounded-xl bg-[#F7F0FB] px-3 py-2.5 text-sm text-[#4A2163]"><b>Lo que busca:</b> {r.goal}</div>}
            <span className="text-xs text-tinta-3">Prefiere {CONTACT_TXT[r.contact_pref] || r.contact_pref}. Para videollamadas, comparte el enlace de la reunión en el chat.</span>
            {r.status !== 'en_curso' && r.status !== 'entregada' && <div className="rounded-xl bg-naranja-palido px-3 py-2.5 text-xs text-naranja-texto">VINKA está coordinando el pago. Puedes presentarte por el chat, pero la asesoría comienza cuando la solicitud pase a «En curso».</div>}
            <Profile r={r} />
            <span className="text-[13px] font-semibold">Conversación y archivos</span>
            <ServiceChat requestId={r.id} as="advisor" disabled={r.status === 'cancelada'} />
            {r.status === 'en_curso' && (
              <div className="flex flex-col gap-2 border-t border-[#F1E7ED] pt-3">
                <span className="text-[13px] font-semibold">¿Terminaste la asesoría?</span>
                <textarea className="textarea h-20" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mensaje final para la persona: qué le entregaste y próximos pasos" />
                <button className="btn" onClick={() => deliver(r)}>Marcar como entregada</button>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <Screen className="bg-[#FAF7F9]" wide>
      <div className="safe-t px-5 pb-3 pt-2 lg:px-8 lg:pt-6">
        <h1 className="text-[22px] font-bold">Mis asesorías</h1>
        <p className="text-[13px] text-tinta-3">Hola {profile?.first_name}. Aquí ves solo las asesorías que VINKA te asignó.</p>
      </div>
      <div className="flex flex-col gap-3 px-5 pb-28 lg:px-8 lg:pb-10">
        <ErrorBox>{err}</ErrorBox>
        {list == null ? <Spinner /> : list.length === 0 ? (
          <Empty title="Aún no tienes asesorías asignadas">Cuando VINKA te asigne una, te llegará un aviso y aparecerá aquí.</Empty>
        ) : (
          <>
            {active.length > 0 && <span className="text-[15px] font-semibold">Activas ({active.length})</span>}
            {active.map(card)}
            {done.length > 0 && <span className="mt-2 text-[15px] font-semibold">Terminadas ({done.length})</span>}
            {done.map(card)}
          </>
        )}
        <div className="mt-2 flex gap-2 rounded-xl bg-white p-3 text-xs leading-snug text-tinta-3"><Svg name="shield" size={18} className="shrink-0" />Recuerda: toda la comunicación y los archivos van por VINKA. No compartas datos de contacto ni recibas pagos directos.</div>
      </div>
      <Toast msg={toast} onDone={() => setToast('')} />
    </Screen>
  )
}
