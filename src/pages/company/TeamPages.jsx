import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { PLANTILLAS_BASE, ROLES, TIPOS_PLANTILLA } from '../../lib/catalog'
import { Avatar, Empty, ErrorBox, Field, Logo, Screen, Sheet, Spinner, Svg, Toast, TopBar } from '../../components/ui'
import { AiAssist } from '../../components/AiAssist'

/* ===================== Plantillas de mensajes ===================== */
export function Templates() {
  const { company } = useAuth()
  const [list, setList] = useState(null)
  const [edit, setEdit] = useState(null)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')
  const canManage = company?.member_role !== 'viewer'
  const load = useCallback(() => {
    supabase.from('message_templates').select('*').eq('company_id', company.id).order('created_at').then(({ data }) => setList(data || []))
  }, [company])
  useEffect(() => { load() }, [load])
  const save = async () => {
    setErr('')
    if (!edit.name.trim() || !edit.body.trim()) return setErr('Escribe un nombre y el mensaje.')
    const row = { company_id: company.id, name: edit.name.trim(), body: edit.body.trim(), kind: edit.kind }
    const { error } = edit.id && !String(edit.id).startsWith('b') ? await supabase.from('message_templates').update(row).eq('id', edit.id) : await supabase.from('message_templates').insert(row)
    if (error) return setErr(errMsg(error))
    setEdit(null); setToast('Plantilla guardada'); load()
  }
  const del = async () => { await supabase.from('message_templates').delete().eq('id', edit.id); setEdit(null); setToast('Plantilla eliminada'); load() }
  const shown = list?.length ? list : PLANTILLAS_BASE
  return (
    <Screen>
      <TopBar back="/vitrina" title="Plantillas de mensajes" right={canManage && <button aria-label="Nueva plantilla" onClick={() => setEdit({ name: '', body: '', kind: 'general' })} className="flex h-11 w-11 items-center justify-center text-rosa-texto"><Svg name="plus" /></button>} />
      <div className="flex flex-col gap-3 px-5 pb-10 pt-2">
        <p className="text-sm text-tinta-3">Úsalas en el chat o al mover varios candidatos a la vez. <b>{'{nombre}'}</b>, <b>{'{cargo}'}</b> y <b>{'{empresa}'}</b> se reemplazan automáticamente.</p>
        {list == null ? <Spinner /> : (
          <>
            {!list.length && <div className="rounded-xl bg-naranja-palido px-3 py-2.5 text-[13px] text-[#4A2A00]">Estas son plantillas sugeridas. Tócalas para personalizarlas y guardarlas como tuyas.</div>}
            {shown.map((t) => (
              <button key={t.id} disabled={!canManage} onClick={() => setEdit({ ...t })} className="card flex flex-col gap-1.5 p-4 text-left">
                <span className="flex items-center justify-between gap-2"><span className="text-[15px] font-semibold">{t.name}</span><span className="pill bg-[#F4EEF2] text-tinta-3">{(TIPOS_PLANTILLA.find((x) => x[0] === t.kind) || [, 'General'])[1]}</span></span>
                <span className="line-clamp-3 text-sm leading-relaxed text-tinta-2">{t.body}</span>
              </button>
            ))}
          </>
        )}
      </div>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id && !String(edit.id).startsWith('b') ? 'Editar plantilla' : 'Nueva plantilla'}>
        {edit && (
          <div className="flex flex-col gap-3.5">
            <Field label="Nombre"><input className="input" maxLength={60} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <fieldset><legend className="label mb-2">Tipo</legend><div className="flex flex-wrap gap-2">{TIPOS_PLANTILLA.map(([k, l]) => <button key={k} type="button" onClick={() => setEdit({ ...edit, kind: k })} className={`chip h-9 text-[13px] ${edit.kind === k ? 'chip-on' : ''}`}>{l}</button>)}</div></fieldset>
            <Field label="Mensaje"><textarea className="textarea h-40" maxLength={2000} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></Field>
            <AiAssist task="message_template" title="Plantilla" current={edit.body} getContext={() => ({ kind: (TIPOS_PLANTILLA.find((x) => x[0] === edit.kind) || [])[1] })} onApply={(t) => setEdit((x) => ({ ...x, body: t.slice(0, 2000) }))} />
            <ErrorBox>{err}</ErrorBox>
            <button className="btn" onClick={save}>Guardar plantilla</button>
            {edit.id && !String(edit.id).startsWith('b') && <button className="h-11 text-sm font-semibold text-[#B42318]" onClick={del}>Eliminar</button>}
          </div>
        )}
      </Sheet>
      <Toast msg={toast} onDone={() => setToast('')} />
    </Screen>
  )
}

/* ===================== Equipo ===================== */
export function Team() {
  const { company } = useAuth()
  const [members, setMembers] = useState(null)
  const [invites, setInvites] = useState([])
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ email: '', role: 'recruiter' })
  const [roleFor, setRoleFor] = useState(null)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')
  const isAdmin = ['owner', 'admin'].includes(company?.member_role)
  const load = useCallback(async () => {
    const [{ data: m }, { data: i }] = await Promise.all([
      supabase.rpc('team_members', { p_company: company.id }),
      supabase.from('company_invites').select('*').eq('company_id', company.id).is('accepted_at', null).order('created_at', { ascending: false }),
    ])
    setMembers(m || []); setInvites(i || [])
  }, [company])
  useEffect(() => { load() }, [load])
  const invite = async () => {
    setErr('')
    const { error } = await supabase.rpc('invite_member', { p_company: company.id, p_email: f.email, p_role: f.role })
    if (error) return setErr(errMsg(error))
    setOpen(false); setF({ email: '', role: 'recruiter' }); setToast('Invitación enviada'); load()
  }
  const changeRole = async (role) => {
    const { error } = await supabase.rpc('set_member_role', { p_company: company.id, p_user: roleFor.user_id, p_role: role })
    if (error) setErr(errMsg(error)); else { setToast('Rol actualizado'); load() }
    setRoleFor(null)
  }
  const remove = async () => {
    const { error } = await supabase.rpc('remove_member', { p_company: company.id, p_user: roleFor.user_id })
    if (error) setErr(errMsg(error)); else { setToast('Persona quitada del equipo'); load() }
    setRoleFor(null)
  }
  const cancel = async (id) => { await supabase.rpc('cancel_member_invite', { p_id: id }); load() }
  const copyLink = async (t) => { try { await navigator.clipboard.writeText(`${location.origin}/equipo/unirse/${t}`); setToast('Enlace copiado') } catch { setToast('No se pudo copiar') } }
  return (
    <Screen>
      <TopBar back="/vitrina" title="Equipo" />
      <div className="flex flex-col gap-4 px-5 pb-10 pt-2">
        <p className="text-sm text-tinta-3">Invita a otras personas de {company?.display_name} para revisar candidatos, evaluar y comentar en equipo.</p>
        {isAdmin && <button className="btn" onClick={() => setOpen(true)}><Svg name="plus" size={20} />Invitar a alguien</button>}
        <ErrorBox>{err}</ErrorBox>
        {members == null ? <Spinner /> : (
          <div className="card px-4">
            {members.map((m) => (
              <button key={m.user_id} disabled={!isAdmin || m.role === 'owner' || m.is_me} onClick={() => setRoleFor(m)} className="flex w-full items-center gap-3 border-b border-[#F1E7ED] py-3 text-left last:border-0">
                <Avatar text={(m.name || m.email).split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()} color="#302538" size={40} round />
                <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-[15px] font-semibold">{m.name || m.email}{m.is_me && ' (tú)'}</span><span className="truncate text-xs text-tinta-3">{m.email}</span></span>
                <span className="pill bg-[#F4EEF2] text-tinta-2">{ROLES[m.role]?.[0]}</span>
              </button>
            ))}
          </div>
        )}
        {invites.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="label">Invitaciones pendientes</span>
            {invites.map((i) => (
              <div key={i.id} className="card flex items-center gap-2 p-3">
                <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-sm font-semibold">{i.email}</span><span className="text-xs text-tinta-3">{ROLES[i.role]?.[0]}</span></span>
                <button className="btn-sm h-9 border border-linea bg-white px-3 text-xs" onClick={() => copyLink(i.token)}>Copiar enlace</button>
                {isAdmin && <button aria-label="Cancelar invitación" className="flex h-9 w-9 items-center justify-center text-tinta-suave" onClick={() => cancel(i.id)}><Svg name="x" size={16} /></button>}
              </div>
            ))}
            <span className="hint">Mientras no tengas un dominio propio en Resend, el correo solo llega a tu dirección. Puedes copiar el enlace y enviarlo por WhatsApp.</span>
          </div>
        )}
        <div className="card flex flex-col gap-2 p-4">
          <span className="label">Qué puede hacer cada rol</span>
          {Object.entries(ROLES).map(([k, [l, d]]) => <span key={k} className="text-sm"><b>{l}:</b> <span className="text-tinta-2">{d}</span></span>)}
        </div>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Invitar al equipo">
        <div className="flex flex-col gap-3.5">
          <Field label="Correo"><input className="input" type="email" inputMode="email" autoCapitalize="none" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="nombre@empresa.cl" /></Field>
          <fieldset className="flex flex-col gap-2"><legend className="label mb-2">Rol</legend>
            {['admin', 'recruiter', 'viewer'].map((k) => (
              <label key={k} className={`flex items-start gap-3 rounded-xl border p-3 ${f.role === k ? 'border-rosa-accion bg-rosa-fondo' : 'border-linea'}`}>
                <input type="radio" name="role" className="mt-0.5 h-5 w-5 accent-[#D02E72]" checked={f.role === k} onChange={() => setF({ ...f, role: k })} />
                <span className="flex flex-col"><span className="text-sm font-semibold">{ROLES[k][0]}</span><span className="text-xs text-tinta-3">{ROLES[k][1]}</span></span>
              </label>
            ))}
          </fieldset>
          <ErrorBox>{err}</ErrorBox>
          <button className="btn" onClick={invite} disabled={!f.email.includes('@')}>Enviar invitación</button>
        </div>
      </Sheet>
      <Sheet open={!!roleFor} onClose={() => setRoleFor(null)} title={roleFor?.name || ''}>
        {roleFor && (
          <div className="flex flex-col gap-2">
            {['admin', 'recruiter', 'viewer'].map((k) => (
              <button key={k} onClick={() => changeRole(k)} className={`flex flex-col items-start rounded-xl border p-3 text-left ${roleFor.role === k ? 'border-rosa-accion bg-rosa-fondo' : 'border-linea'}`}>
                <span className="text-sm font-semibold">{ROLES[k][0]}</span><span className="text-xs text-tinta-3">{ROLES[k][1]}</span>
              </button>
            ))}
            <button className="mt-2 h-11 text-sm font-semibold text-[#B42318]" onClick={remove}>Quitar del equipo</button>
          </div>
        )}
      </Sheet>
      <Toast msg={toast} onDone={() => setToast('')} />
    </Screen>
  )
}

/* ===================== Unirse a un equipo (enlace del correo) ===================== */
export function JoinTeam() {
  const { token } = useParams()
  const nav = useNavigate()
  const { session, profile, company, refresh, signOut } = useAuth()
  const [inv, setInv] = useState(null)
  const [f, setF] = useState({ first_name: '', last_name: '', password: '', terms: false })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  useEffect(() => {
    supabase.rpc('get_member_invite', { p_token: token }).then(({ data }) => setInv(data?.[0] || false))
    try { localStorage.setItem('vinka-team-invite', token) } catch { /* sin almacenamiento */ }
  }, [token])
  if (inv === null) return <Spinner />
  if (inv === false) return <Screen><TopBar back="/" title="" /><div className="p-6"><Empty title="Invitación no disponible">El enlace no es válido o venció. Pide una nueva invitación.</Empty></div></Screen>

  const accept = async () => {
    setErr(''); setBusy(true)
    const { error } = await supabase.rpc('accept_member_invite', { p_token: token })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    try { localStorage.removeItem('vinka-team-invite') } catch { /* nada */ }
    await refresh(); nav('/')
  }
  const signup = async () => {
    setErr('')
    if (!f.first_name.trim() || !f.last_name.trim()) return setErr('Escribe tu nombre y apellido.')
    if (f.password.length < 8) return setErr('La contraseña debe tener al menos 8 caracteres.')
    if (!f.terms) return setErr('Debes aceptar los términos y la política de privacidad.')
    setBusy(true)
    const { error } = await supabase.auth.signUp({ email: inv.email, password: f.password, options: {
      emailRedirectTo: location.origin, data: { role: 'company', first_name: f.first_name.trim(), last_name: f.last_name.trim(), terms_accepted: true, team_invite: token } } })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setSent(true)
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-rosa-fondo px-6 pb-10 pt-14">
      <Logo />
      <div className="mt-8 flex flex-col gap-4">
        <span className="text-sm font-semibold uppercase tracking-wide text-naranja-texto">Invitación de equipo</span>
        <h1 className="text-[26px] font-bold leading-tight">Únete a {inv.company_name} en VINKA</h1>
        <p className="text-[15px] leading-relaxed text-tinta-2">Te invitaron como <b>{ROLES[inv.role]?.[0]}</b>: {ROLES[inv.role]?.[1].toLowerCase()}.</p>
        <ErrorBox>{err}</ErrorBox>
        {inv.accepted ? (
          <><p className="text-sm text-[#134A2B]">Esta invitación ya fue aceptada.</p><Link to="/" className="btn">Ir a VINKA</Link></>
        ) : sent ? (
          <div className="card flex flex-col gap-2 p-4 text-sm leading-relaxed"><b>Revisa tu correo</b>Te enviamos un enlace a {inv.email} para confirmar tu cuenta. Al confirmarlo entrarás directo al equipo.</div>
        ) : session ? (
          company && company.id ? (
            <p className="text-sm text-tinta-3">Tu cuenta ya pertenece a {company.display_name}. Para unirte a otra empresa, usa otro correo.</p>
          ) : profile?.role === 'company' ? (
            <button className="btn" disabled={busy} onClick={accept}>{busy ? 'Uniéndote…' : 'Aceptar invitación'}</button>
          ) : (
            <><p className="text-sm text-tinta-3">Estás con una cuenta de candidato/a. Cierra sesión para crear tu cuenta de empresa con {inv.email}.</p><button className="btn-sec" onClick={signOut}>Cerrar sesión</button></>
          )
        ) : (
          <div className="card flex flex-col gap-3 p-4">
            <Field label="Correo"><input className="input bg-[#F6F1F4]" value={inv.email} readOnly /></Field>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Nombre"><input className="input" value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} autoComplete="given-name" /></Field>
              <Field label="Apellido"><input className="input" value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} autoComplete="family-name" /></Field>
            </div>
            <Field label="Contraseña" hint="Mínimo 8 caracteres"><input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Field>
            <label className="flex items-start gap-2.5 text-[13px] leading-snug">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#D02E72]" checked={f.terms} onChange={(e) => setF({ ...f, terms: e.target.checked })} />
              <span>Acepto los <Link to="/legal/terminos" className="underline">términos</Link> y la <Link to="/legal/privacidad" className="underline">política de privacidad</Link>.</span>
            </label>
            <button className="btn" disabled={busy} onClick={signup}>{busy ? 'Creando…' : 'Crear cuenta y unirme'}</button>
            <Link to="/ingresar" className="text-center text-sm font-semibold text-rosa-texto">Ya tengo cuenta de empresa</Link>
          </div>
        )}
      </div>
    </div>
  )
}
