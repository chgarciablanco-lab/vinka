// Red de asesores (sin dinero): Oportunidades, captaciones, autorizaciones de representación, «Tus beneficios»,
// controles de la vacante abierta a la red y revisiones de administración.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { formatRut, validRut } from '../lib/rut'
import { ErrorBox, Screen, Sheet, Spinner, Svg, Toast, TopBar } from './ui'
import { ProposeSheet } from './Attribution'

const fdate = (d) => (d ? new Date(d).toLocaleDateString('es-CL') : '')
const daysLeft = (d) => Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86400000))
const useRpc = (name, args) => {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const key = JSON.stringify(args || {})
  const load = useCallback(() => supabase.rpc(name, args).then(({ data, error }) => { if (error) { setErr(errMsg(error)); setD((x) => x ?? []) } else { setErr(''); setD(data) } }), [name, key]) // eslint-disable-line
  useEffect(() => { load() }, [load])
  return [d, err, load]
}

/* ───────────── Asesor: Oportunidades ───────────── */
export function Opportunities() {
  const [list, err, load] = useRpc('network_opportunities')
  const [propose, setPropose] = useState(null)
  const [ask, setAsk] = useState(null)
  const [msg, setMsg] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState('')
  const [e2, setE2] = useState('')
  const hide = async (j) => {
    setBusy(j.id); setE2('')
    const { error } = await supabase.rpc('network_dismiss', { p_job: j.id, p_hide: true })
    setBusy('')
    if (error) return setE2(errMsg(error))
    setToast('Ocultada. No volverá a aparecer aquí.'); load()
  }
  const request = async () => {
    setBusy(ask.id); setE2('')
    const { error } = await supabase.rpc('collab_request_create', { p_job: ask.id, p_message: msg.trim() })
    setBusy('')
    if (error) return setE2(errMsg(error))
    setAsk(null); setMsg(''); setToast('Solicitud enviada. Quien gestiona la vacante decide.'); load()
  }
  return (
    <Screen>
      <TopBar back="/" title="Oportunidades" />
      <div className="flex flex-col gap-3 px-5 pb-28">
        <p className="text-[13px] leading-snug text-tinta-3">Vacantes que sus empresas abrieron a la red de asesores. Puedes proponer a personas que te autorizaron o pedir colaborar en el proceso.</p>
        <ErrorBox>{err || e2}</ErrorBox>
        {list == null ? <Spinner /> : list.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-linea bg-white px-4 py-3 text-[13px] text-tinta-3">Por ahora no hay vacantes abiertas a la red. Te avisaremos cuando una empresa abra una.</p>
        ) : list.map((j) => (
          <div key={j.id} className="card flex flex-col gap-2 p-4">
            <span className="text-xs text-tinta-3">Abierta el {fdate(j.opened_at)}</span>
            <b className="text-[15px]">{j.title}</b>
            <span className="text-[13px] text-tinta-3">{[j.company, j.comuna, j.modality].filter(Boolean).join(' · ')}</span>
            <div className="flex flex-wrap gap-2 pt-1">
              <button className="btn-sm h-10 bg-rosa-accion px-3 text-white" disabled={!j.proposable} onClick={() => setPropose(j)}>Proponer candidato{j.proposable ? ` (${j.proposable})` : ''}</button>
              {j.collaborating ? <span className="flex h-10 items-center text-[13px] font-semibold text-[#1E6B3F]">✓ Colaboras</span>
                : j.request === 'pendiente' ? <span className="flex h-10 items-center text-[13px] text-tinta-3">Pediste colaborar · esperando respuesta</span>
                : <button className="btn-sm h-10 border border-rosa-accion bg-white px-3 text-rosa-texto" disabled={!!busy} onClick={() => { setAsk(j); setMsg('') }}>Pedir colaborar</button>}
              <button className="btn-sm h-10 border border-linea bg-white px-3" disabled={!!busy} onClick={() => hide(j)}>Ocultar</button>
            </div>
            {!j.proposable && <span className="text-[11px] text-tinta-suave">Para proponer necesitas personas que te autorizaron y que no estén ya en este proceso. <Link to="/autorizaciones" className="font-semibold">Autorizaciones</Link></span>}
          </div>
        ))}
      </div>
      {propose && <ProposeSheet jobId={propose.id} onClose={() => setPropose(null)} onDone={(m) => { setPropose(null); setToast(m); load() }} />}
      {ask && (
        <Sheet open onClose={() => setAsk(null)} title="Pedir colaborar">
          <div className="flex flex-col gap-2.5">
            <p className="text-sm text-tinta-2"><b>{ask.title}</b> · Si aceptan, verás el perfil laboral de sus postulantes (sin contacto, notas ni evaluaciones), podrás sugerir avances y proponer candidatos.</p>
            <textarea className="textarea h-20" maxLength={300} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Cuéntales cómo puedes aportar (opcional)" />
            <ErrorBox>{e2}</ErrorBox>
            <button className="btn" disabled={!!busy} onClick={request}>{busy ? 'Enviando…' : 'Enviar solicitud'}</button>
          </div>
        </Sheet>
      )}
      <Toast msg={toast} onDone={() => setToast('')} />
    </Screen>
  )
}

/* ───────────── Asesor: captaciones ───────────── */
const CAP = { registrada: ['Registrada', 'Esperando contacto'], contactada: ['Contactada', 'Esperando que acepte la invitación'], verificada: ['Verificada', 'Falta publicar la primera vacante'],
  activada: ['Activada', 'Quedas como captador/a'], vencida: ['Vencida', 'Pasó el plazo; el RUT quedó libre'], anulada: ['Anulada', 'VINKA la anuló'] }
const CAP_STEPS = ['registrada', 'contactada', 'verificada', 'activada']

export function Captures() {
  const [list, err, load] = useRpc('my_captures')
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ rut: '', legal_name: '', email: '' })
  const [busy, setBusy] = useState(false)
  const [e2, setE2] = useState('')
  const [toast, setToast] = useState('')
  const link = (t) => `${window.location.origin}/registro/empresa?captacion=${t}`
  const copy = async (t) => {
    try { await navigator.clipboard.writeText(link(t)); setToast('Enlace copiado. Envíalo a tu contacto.') } catch { setToast(link(t)) }
  }
  const save = async () => {
    setE2('')
    if (!validRut(f.rut)) return setE2('El RUT no es válido. Revisa el dígito verificador.')
    setBusy(true)
    const { data, error } = await supabase.rpc('capture_register_prospect', { p_rut: f.rut, p_legal_name: f.legal_name.trim(), p_email: f.email.trim() })
    setBusy(false)
    if (error) return setE2(errMsg(error))
    setOpen(false); setF({ rut: '', legal_name: '', email: '' }); load()
    if (data?.token) copy(data.token)
  }
  return (
    <Screen>
      <TopBar back="/" title="Captaciones" right={<button className="btn-sm h-9 bg-rosa-accion px-3 text-white" onClick={() => setOpen(true)}>Registrar</button>} />
      <div className="flex flex-col gap-3 px-5 pb-28">
        <div className="rounded-2xl bg-[#FAF6F8] px-4 py-3 text-[13px] leading-snug text-tinta-2">
          Quedas como captador/a cuando la empresa <b>acepta tu invitación</b> y <b>publica su primera vacante</b>. Tienes 30 días para que acepte y hasta el día 60 para que publique. Mientras tanto, nadie más puede captar ese RUT.
          <span className="mt-1.5 block text-tinta-3">Para un cliente que gestionas tú: agrégalo en <Link to="/clientes" className="font-semibold text-rosa-texto">Clientes</Link> e invita a su contacto con rol «cliente». Para una empresa que tendrá su propia cuenta: usa «Registrar» y envíale el enlace.</span>
        </div>
        <ErrorBox>{err}</ErrorBox>
        {list == null ? <Spinner /> : list.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-linea bg-white px-4 py-3 text-[13px] text-tinta-3">Aún no registras empresas.</p>
        ) : list.map((c) => {
          const step = CAP_STEPS.indexOf(c.status)
          const live = ['registrada', 'contactada', 'verificada'].includes(c.status)
          return (
            <div key={c.id} className="card flex flex-col gap-2 p-4">
              <span className="flex flex-wrap items-baseline justify-between gap-x-2"><b className="text-[15px]">{c.name}</b><span className="text-xs text-tinta-3">RUT {formatRut(c.rut)}</span></span>
              <div className="flex gap-1" aria-label={`Estado: ${CAP[c.status][0]}`}>
                {CAP_STEPS.map((k, i) => <span key={k} className={`h-1.5 flex-1 rounded-full ${step >= 0 && i <= step ? (c.status === 'activada' ? 'bg-[#1E6B3F]' : 'bg-rosa-accion') : 'bg-[#EFE6EB]'}`} />)}
              </div>
              <span className="text-[13px]"><b className={c.status === 'activada' ? 'text-[#1E6B3F]' : c.status === 'vencida' || c.status === 'anulada' ? 'text-[#912018]' : ''}>{CAP[c.status][0]}</b> · <span className="text-tinta-3">{CAP[c.status][1]}</span></span>
              {live && <span className="text-xs text-tinta-3">{c.status === 'verificada' ? `Quedan ${daysLeft(c.activate_by)} días para publicar` : `Quedan ${daysLeft(c.reserved_until)} días para que acepte`}{c.contact_email ? ` · contacto ${c.contact_email}` : ''}</span>}
              {c.status === 'activada' && <span className="text-xs text-tinta-3">Activada el {fdate(c.activated_at)}</span>}
              {c.note && <span className="text-xs text-tinta-3">Nota de VINKA: {c.note}</span>}
              {c.token && <button className="btn-sm h-9 self-start border border-linea bg-white px-3" onClick={() => copy(c.token)}>Copiar enlace de registro</button>}
              {c.via === 'cliente_gestionado' && c.status === 'registrada' && c.company_id && <Link to="/equipo-consultora" className="text-[13px] font-semibold text-rosa-texto">Invitar a su contacto con rol «cliente»</Link>}
            </div>
          )
        })}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Registrar una empresa">
        <div className="flex flex-col gap-2.5">
          <p className="text-sm text-tinta-2">Para una empresa que tendrá su propia cuenta. Te daremos un enlace para que su contacto se registre con este RUT y este correo.</p>
          <input className="input" placeholder="RUT (76.123.456-7)" value={f.rut} onChange={(e) => setF({ ...f, rut: formatRut(e.target.value) })} />
          <input className="input" placeholder="Razón social" value={f.legal_name} onChange={(e) => setF({ ...f, legal_name: e.target.value })} />
          <input className="input" type="email" placeholder="Correo de tu contacto en la empresa" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <ErrorBox>{e2}</ErrorBox>
          <button className="btn" disabled={busy || !f.rut || !f.legal_name.trim() || !f.email.trim()} onClick={save}>{busy ? 'Registrando…' : 'Registrar y copiar enlace'}</button>
        </div>
      </Sheet>
      <Toast msg={toast} onDone={() => setToast('')} />
    </Screen>
  )
}

/* ───────────── Autorizaciones de representación ───────────── */
const AUTH = { solicitada: 'Pedida, esperando respuesta', vigente: 'Vigente', rechazada: 'No aceptó', revocada: 'Retirada por la persona', vencida: 'Vencida' }

export function AdvisorAuthorizations() {
  const [d, err, load] = useRpc('my_authorizations')
  const [busy, setBusy] = useState('')
  const [e2, setE2] = useState('')
  const [toast, setToast] = useState('')
  const ask = async (c) => {
    setBusy(c.candidate_id); setE2('')
    const { error } = await supabase.rpc('rep_auth_request', { p_candidate: c.candidate_id })
    setBusy('')
    if (error) return setE2(errMsg(error))
    setToast(`Le pedimos autorización a ${c.name}.`); load()
  }
  return (
    <Screen>
      <TopBar back="/" title="Autorizaciones" />
      <div className="flex flex-col gap-3 px-5 pb-28">
        <p className="text-[13px] leading-snug text-tinta-3">Solo puedes proponer a vacantes a quien te autorizó. La autorización dura 12 meses y la persona puede retirarla cuando quiera; si la retira, tus propuestas pendientes se retiran solas.</p>
        <ErrorBox>{err || e2}</ErrorBox>
        {d == null ? <Spinner /> : <>
          {(d.requestable || []).length > 0 && (
            <section className="card flex flex-col gap-1.5 p-4">
              <h2 className="text-[15px] font-semibold">Personas que asesoras</h2>
              {d.requestable.map((c) => (
                <div key={c.candidate_id} className="flex items-center justify-between gap-2 border-b border-[#F4EEF2] py-2 last:border-0">
                  <span className="text-sm">{c.name}</span>
                  <button className="btn-sm h-9 bg-rosa-accion px-3 text-white" disabled={!!busy} onClick={() => ask(c)}>{busy === c.candidate_id ? 'Pidiendo…' : 'Pedir autorización'}</button>
                </div>
              ))}
            </section>
          )}
          <section className="card flex flex-col gap-1.5 p-4">
            <h2 className="text-[15px] font-semibold">Tus autorizaciones</h2>
            {(d.items || []).length === 0 ? <p className="text-[13px] text-tinta-3">Aún no pides autorizaciones.</p> : d.items.map((a) => (
              <div key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-2 border-b border-[#F4EEF2] py-2 text-sm last:border-0">
                <span>{a.name}</span>
                <span className={a.status === 'vigente' ? 'font-semibold text-[#1E6B3F]' : 'text-tinta-3'}>{AUTH[a.status]}{a.status === 'vigente' ? ` hasta el ${fdate(a.expires_at)}` : ''}</span>
              </div>
            ))}
          </section>
        </>}
      </div>
      <Toast msg={toast} onDone={() => setToast('')} />
    </Screen>
  )
}

/** Aviso compacto en Explorar cuando un asesor pide autorización */
export function AuthRequestsBanner() {
  const [d] = useRpc('my_authorizations')
  const n = (d?.items || []).filter((a) => a.status === 'solicitada').length
  if (!n) return null
  return (
    <Link to="/propuestas" className="flex items-center gap-3 rounded-2xl border border-[#E9D3F0] bg-[#F7F0FB] px-3.5 py-3">
      <Svg name="people" size={20} className="text-[#6B2E8F]" />
      <span className="flex-1 text-sm text-[#4A2163]"><b>{n === 1 ? `${d.items.find((a) => a.status === 'solicitada').advisor} pide autorización para presentarte` : `${n} asesores piden autorización para presentarte`}</b><span className="block text-xs opacity-80">Tú decides; puedes retirarla cuando quieras</span></span>
      <Svg name="chevron" size={18} className="text-[#6B2E8F]" />
    </Link>
  )
}

/** Postulante: pedidos de autorización y autorizaciones vigentes, con opción de retirarlas */
export function CandidateAuthorizations() {
  const [d, err, load] = useRpc('my_authorizations')
  const [busy, setBusy] = useState('')
  const [e2, setE2] = useState('')
  const [revoke, setRevoke] = useState(null)
  const answer = async (a, ok) => {
    setBusy(a.id); setE2('')
    const { error } = await supabase.rpc('rep_auth_answer', { p_id: a.id, p_accept: ok })
    setBusy('')
    if (error) return setE2(errMsg(error))
    load()
  }
  const doRevoke = async () => {
    setBusy(revoke.id); setE2('')
    const { error } = await supabase.rpc('rep_auth_revoke', { p_id: revoke.id })
    setBusy('')
    if (error) return setE2(errMsg(error))
    setRevoke(null); load()
  }
  const items = (d?.items || []).filter((a) => ['solicitada', 'vigente'].includes(a.status))
  if (d == null) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[15px] font-semibold">Quién puede presentarte</h2>
      <ErrorBox>{err || e2}</ErrorBox>
      {items.length === 0 ? <p className="rounded-2xl border border-dashed border-linea bg-white px-4 py-3 text-[13px] text-tinta-3">Ningún asesor/a puede presentarte a vacantes. Si tu asesor/a te lo pide, lo verás aquí.</p>
        : items.map((a) => (
          <div key={a.id} className="card flex flex-col gap-2 p-4">
            <b className="text-[15px]">{a.advisor}</b>
            {a.status === 'solicitada' ? <>
              <span className="text-[13px] leading-snug text-tinta-2">Pide tu autorización para proponerte a vacantes durante 12 meses. Cada vez decides tú si la empresa ve tu perfil.</span>
              <span className="flex flex-wrap gap-2">
                <button className="btn-sm h-10 bg-rosa-accion px-4 text-white" disabled={!!busy} onClick={() => answer(a, true)}>Autorizar</button>
                <button className="btn-sm h-10 border border-linea bg-white px-4" disabled={!!busy} onClick={() => answer(a, false)}>No, gracias</button>
              </span>
            </> : <>
              <span className="text-[13px] text-tinta-3">Autorizado/a hasta el {fdate(a.expires_at)}</span>
              <button className="btn-sm h-9 self-start border border-linea bg-white px-3" disabled={!!busy} onClick={() => setRevoke(a)}>Retirar autorización</button>
            </>}
          </div>
        ))}
      {revoke && (
        <Sheet open onClose={() => setRevoke(null)} title="Retirar autorización">
          <div className="flex flex-col gap-2.5">
            <p className="text-sm text-tinta-2">{revoke.advisor} ya no podrá proponerte a vacantes, y sus propuestas que aún no respondiste se retiran. Las vacantes a las que ya postulaste siguen igual.</p>
            <ErrorBox>{e2}</ErrorBox>
            <button className="btn" disabled={!!busy} onClick={doRevoke}>Retirar autorización</button>
          </div>
        </Sheet>
      )}
    </section>
  )
}

/* ───────────── Asesor: Tus beneficios (explicación, sin pagos) ───────────── */
export function Benefits() {
  const [c] = useRpc('my_contributions')
  const rows = [
    ['Captó la empresa', 'Registraste la empresa, aceptó tu invitación y publicó su primera vacante dentro del plazo.'],
    ['Llevó la cuenta', 'Eres el encargado/a de cuenta de esa empresa.'],
    ['Gestionó el proceso', 'Eres responsable de la vacante en la que se contrató.'],
    ['Aportó al candidato', 'Propusiste a la persona y ella aceptó postular, antes de haber postulado por su cuenta.'],
    ['Colaboró', 'Te invitaron a la vacante y tuviste sugerencias aprobadas o tareas hechas.'],
  ]
  return (
    <Screen>
      <TopBar back="/" title="Tus beneficios" />
      <div className="flex flex-col gap-3 px-5 pb-28">
        <div className="rounded-2xl border border-[#F0DDA0] bg-[#FFF9E8] px-4 py-3 text-[13px] leading-snug text-[#5C3E00]">
          <b>Aún no hay pagos.</b> VINKA registra tu participación en cada contratación para definir, con datos reales, cómo se reconocerá. No es una promesa de montos.
        </div>
        {c && !Array.isArray(c) && (
          <div className="card grid grid-cols-3 gap-2 p-4 text-center">
            <div><b className="font-display text-xl">{c.hires_confirmed}</b><span className="block text-[11px] text-tinta-3">Contrataciones acreditadas</span></div>
            <div><b className="font-display text-xl">{c.hires_pending}</b><span className="block text-[11px] text-tinta-3">Por confirmar</span></div>
            <div><b className="font-display text-xl">{c.companies_captured}</b><span className="block text-[11px] text-tinta-3">Empresas activadas</span></div>
          </div>
        )}
        <section className="card flex flex-col gap-2 p-4">
          <h2 className="text-[15px] font-semibold">Qué se registra a tu nombre</h2>
          {rows.map(([t, d]) => <div key={t} className="border-b border-[#F4EEF2] pb-2 text-[13px] last:border-0"><b>{t}</b><span className="block text-tinta-3">{d}</span></div>)}
        </section>
        <section className="card flex flex-col gap-1.5 p-4 text-[13px] leading-snug text-tinta-2">
          <h2 className="text-[15px] font-semibold">Cómo se confirma</h2>
          <p>Cuando alguien pasa a «contratado», la ficha de atribución se arma sola. Lo que registró el sistema se confirma a los 7 días si nadie lo objeta; «Colaboró» lo confirma quien gestiona la vacante.</p>
          <p>Nadie confirma su propio aporte. Si alguien objeta, VINKA revisa el historial y decide. Las contrataciones confirmadas aparecen en tu perfil público.</p>
        </section>
      </div>
    </Screen>
  )
}

/* ───────────── Empresa: vacante abierta a la red y solicitudes ───────────── */
export function NetworkControls({ jobId, onChange }) {
  const [job, setJob] = useState(null)
  const [reqs, reqErr, loadReqs] = useRpc('collab_requests_for_job', { p_job: jobId })
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const loadJob = useCallback(() => supabase.from('jobs').select('network_open,status').eq('id', jobId).maybeSingle().then(({ data }) => setJob(data)), [jobId])
  useEffect(() => { loadJob() }, [loadJob])
  if (!job || reqErr) return null // solo quien gestiona la vacante
  const toggle = async () => {
    setBusy('net'); setErr('')
    const { error } = await supabase.rpc('job_set_network', { p_job: jobId, p_open: !job.network_open })
    setBusy('')
    if (error) return setErr(errMsg(error))
    loadJob()
  }
  const answer = async (r, ok) => {
    setBusy(r.id); setErr('')
    const { error } = await supabase.rpc('collab_request_answer', { p_id: r.id, p_accept: ok })
    setBusy('')
    if (error) return setErr(errMsg(error))
    loadReqs(); onChange?.()
  }
  const pending = (reqs || []).filter?.((r) => r.status === 'pendiente') || []
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-linea bg-white p-3">
      <label className="flex items-center justify-between gap-3">
        <span className="flex flex-col"><span className="text-sm font-semibold">Abierta a la red de asesores</span>
          <span className="text-xs leading-snug text-tinta-3">Los asesores aprobados la ven en «Oportunidades», pueden proponer candidatos que los autorizaron y pedir colaborar. Tú decides a quién aceptas.</span></span>
        <input type="checkbox" role="switch" className="h-6 w-6 shrink-0 accent-[#D02E72]" checked={!!job.network_open} disabled={busy === 'net' || (job.status !== 'published' && !job.network_open)} onChange={toggle} />
      </label>
      {job.status !== 'published' && !job.network_open && <span className="text-[11px] text-tinta-suave">Publica la vacante para poder abrirla.</span>}
      {pending.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-[#F4EEF2] pt-2">
          <b className="text-[13px]">Quieren colaborar · {pending.length}</b>
          {pending.map((r) => (
            <div key={r.id} className="flex flex-col gap-1 rounded-xl bg-[#FAF6F8] px-3 py-2 text-[13px]">
              <span><b>{r.advisor}</b>{r.specialty ? ` · ${r.specialty}` : ''}{r.credited_hires ? ` · ${r.credited_hires} contratación(es) acreditada(s)` : ''}</span>
              {r.message && <span className="text-tinta-3">«{r.message}»</span>}
              <span className="flex gap-2"><button className="btn-sm h-9 bg-rosa-accion px-3 text-white" disabled={!!busy} onClick={() => answer(r, true)}>Aceptar</button><button className="btn-sm h-9 border border-linea bg-white px-3" disabled={!!busy} onClick={() => answer(r, false)}>Rechazar</button></span>
            </div>
          ))}
        </div>
      )}
      <ErrorBox>{err}</ErrorBox>
    </div>
  )
}

/** Empresa: quién la captó y quién lleva su cuenta */
export function CompanyRoles({ companyId }) {
  const [d] = useRpc('company_roles', { p_company: companyId })
  if (!d || Array.isArray(d) || (!d.captador && !d.encargado_cuenta)) return null
  return (
    <div className="card flex flex-col gap-1 p-4 text-[13px]">
      <span className="label">Asesores de VINKA con tu empresa</span>
      {d.captador && <span><b>Te trajo a VINKA:</b> {d.captador.name}</span>}
      {d.encargado_cuenta && <span><b>Encargado/a de tu cuenta:</b> {d.encargado_cuenta.name}</span>}
      <span className="text-[11px] text-tinta-suave">Si necesitas cambiar al encargado/a de cuenta, escríbenos desde Ayuda.</span>
    </div>
  )
}

/* ───────────── Administración ───────────── */
export function AdminCaptures() {
  const [list, err, load] = useRpc('admin_captures', { p_status: null })
  const [pick, setPick] = useState(null)
  const [note, setNote] = useState('')
  const [e2, setE2] = useState('')
  if (!list?.length) return err ? <ErrorBox>{err}</ErrorBox> : null
  const annul = async () => {
    setE2('')
    const { error } = await supabase.rpc('admin_capture_annul', { p_id: pick.id, p_note: note.trim() })
    if (error) return setE2(errMsg(error))
    setPick(null); setNote(''); load()
  }
  const open = list.filter((c) => ['registrada', 'contactada', 'verificada'].includes(c.status))
  return (
    <section className="card flex flex-col gap-2 p-4">
      <h2 className="text-[15px] font-semibold">Captaciones · {open.length} en curso, {list.filter((c) => c.status === 'activada').length} activadas</h2>
      {list.slice(0, 30).map((c) => (
        <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F4EEF2] py-1.5 text-[13px] last:border-0">
          <span><b>{c.name}</b> · {c.advisor} · {CAP[c.status]?.[0]} · {fdate(c.registered_at)}</span>
          {c.status !== 'anulada' && c.status !== 'vencida' && <button className="btn-sm h-8 border border-linea bg-white px-2.5" onClick={() => setPick(c)}>Anular</button>}
        </div>
      ))}
      {pick && (
        <Sheet open onClose={() => setPick(null)} title={`Anular captación de ${pick.name}`}>
          <div className="flex flex-col gap-2.5">
            <textarea className="textarea h-24" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo (lo verá el asesor)" />
            <ErrorBox>{e2}</ErrorBox>
            <button className="btn" disabled={note.trim().length < 10} onClick={annul}>Anular</button>
          </div>
        </Sheet>
      )}
    </section>
  )
}

export function AdminAutoVerified() {
  const [list, err, load] = useRpc('admin_auto_verified')
  const [e2, setE2] = useState('')
  const pending = (list || []).filter?.((c) => !c.reviewed_at) || []
  if (!pending.length) return err ? <ErrorBox>{err}</ErrorBox> : null
  const ok = async (c) => {
    setE2('')
    const { error } = await supabase.rpc('admin_auto_verified_ok', { p_company: c.id })
    if (error) return setE2(errMsg(error))
    load()
  }
  return (
    <section className="card flex flex-col gap-2 p-4">
      <h2 className="text-[15px] font-semibold">Verificadas automáticamente · revisar ({pending.length})</h2>
      <p className="text-[12px] text-tinta-3">Revísalas dentro de 48 horas. Si algo no calza, cámbiale la verificación desde Empresas.</p>
      {pending.map((c) => (
        <div key={c.id} className={`flex flex-col gap-1 rounded-xl px-3 py-2 text-[13px] ${c.overdue ? 'bg-[#FEF3F2]' : 'bg-[#FAF6F8]'}`}>
          <span><b>{c.name}</b> · {c.legal_name} · RUT {c.rut}</span>
          <span className="text-tinta-3">{c.note}{c.website ? ` · ${c.website}` : ''} · {fdate(c.auto_verified_at)}{c.overdue ? ' · pasaron 48 horas' : ''}</span>
          <button className="btn-sm h-8 self-start bg-[#1E6B3F] px-3 text-white" onClick={() => ok(c)}>Revisada, está bien</button>
        </div>
      ))}
      <ErrorBox>{e2}</ErrorBox>
    </section>
  )
}

/** Registro de empresa desde el enlace de un asesor: muestra quién invitó y precarga RUT, razón social y correo */
export function useCaptureInvite(token) {
  const [d, setD] = useState(null)
  useEffect(() => { if (token) supabase.rpc('get_capture_invite', { p_token: token }).then(({ data }) => setD(data || null)) }, [token])
  return d
}
export function CaptureInviteNote({ invite }) {
  if (!invite) return null
  return (
    <div className="mb-3 flex items-start gap-2.5 rounded-2xl border border-[#E9D3F0] bg-[#F7F0FB] px-3.5 py-3 text-[13px] leading-snug text-[#4A2163]">
      <Svg name="people" size={18} />
      <span><b>{invite.advisor}</b>, asesor/a de VINKA, te invitó. Usa el RUT {formatRut(invite.rut)} y el correo {invite.email} para quedar ligados.</span>
    </div>
  )
}
