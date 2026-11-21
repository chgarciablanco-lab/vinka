// Colaboración y crédito de asesores (sin dinero): embudo de indicadores, propuestas de candidatos,
// invitación de asesores a una vacante y ficha de atribución de cada contratación.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { ErrorBox, Sheet, Spinner, Svg } from './ui'

const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—')

/** Embudo de 4 indicadores: empresas que publican → candidatos pertinentes → entrevistas realizadas → contrataciones */
export function Funnel({ days = 30, company = null, advisor = null, includeDemo = false, title = 'Resultados', hint }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    setD(null); setErr('')
    supabase.rpc('funnel_metrics', { p_days: days || 0, p_company: company, p_advisor: advisor, p_include_demo: includeDemo })
      .then(({ data, error }) => { if (error) setErr(errMsg(error)); else setD(data) })
  }, [days, company, advisor, includeDemo])
  if (err) return <ErrorBox>{err}</ErrorBox>
  if (!d) return <Spinner />
  const steps = [
    [company ? 'Vacantes publicadas' : 'Empresas que publican', company ? d.jobs_published : d.companies_publishing],
    ['Candidatos pertinentes', d.relevant_candidates],
    ['Entrevistas realizadas', d.interviews_done],
    ['Contrataciones', d.hires],
  ]
  return (
    <section className="card flex flex-col gap-3 p-4" aria-label={title}>
      <div className="flex items-baseline justify-between gap-2"><h2 className="text-[15px] font-semibold">{title}</h2><span className="text-xs text-tinta-3">{days ? `últimos ${days === 365 ? '12 meses' : `${days} días`}` : 'todo el historial'}</span></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map(([l, v], i) => (
          <div key={l} className="flex flex-col gap-0.5 rounded-xl bg-[#FAF6F8] p-3">
            <span className="font-display text-[22px] font-bold">{v ?? 0}</span>
            <span className="text-xs leading-tight text-tinta-3">{l}</span>
            {i > 0 && <span className="text-[11px] text-tinta-suave">{i === 1 ? '' : `${pct(v, steps.at(i - 1)[1])} del paso anterior`}</span>}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-tinta-3">
        {d.avg_days_to_hire != null && <span>Días promedio hasta contratar: <b>{d.avg_days_to_hire}</b></span>}
        {d.hires_with_advisor_proposal > 0 && <span>Con candidato aportado por un asesor: <b>{d.hires_with_advisor_proposal}</b></span>}
        {d.hires_external > 0 && <span>Contrataciones de otros portales: <b>{d.hires_external}</b></span>}
        {d.hires_credited != null && <span>Contrataciones acreditadas a ti: <b>{d.hires_credited}</b></span>}
      </div>
      {hint && <p className="text-[11px] leading-snug text-tinta-suave">{hint}</p>}
    </section>
  )
}

/** Panel del asesor: su embudo, contrataciones acreditadas y propuestas */
export function AdvisorResults({ userId }) {
  const [c, setC] = useState(null)
  useEffect(() => { supabase.rpc('my_contributions').then(({ data }) => setC(data || null)) }, [])
  return (
    <div className="flex flex-col gap-2">
      <Funnel advisor={userId} days={90} title="Tus resultados" hint="Cuenta las vacantes de las que eres responsable o en que colaboras, y las de empresas que captaste o atiendes." />
      {c && (
        <div className="card flex flex-col gap-2 p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><b className="font-display text-xl">{c.hires_confirmed}</b><span className="block text-[11px] text-tinta-3">Contrataciones acreditadas</span></div>
            <div><b className="font-display text-xl">{c.companies_captured}</b><span className="block text-[11px] text-tinta-3">Empresas activadas</span></div>
            <div><b className="font-display text-xl">{c.proposals_accepted}</b><span className="block text-[11px] text-tinta-3">Propuestas aceptadas</span></div>
          </div>
          {c.hires_pending > 0 && <p className="text-[12px] text-tinta-3">{c.hires_pending === 1 ? '1 contratación tiene' : `${c.hires_pending} contrataciones tienen`} aportes tuyos por confirmar o en revisión.</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold text-rosa-texto">
            <Link to="/oportunidades">Oportunidades</Link><Link to="/captaciones">Captaciones{c.captures_open ? ` (${c.captures_open})` : ''}</Link>
            <Link to="/autorizaciones">Autorizaciones{c.authorizations ? ` (${c.authorizations})` : ''}</Link><Link to="/beneficios">Tus beneficios</Link>
          </div>
          {c.items?.length > 0 && (
            <ul className="flex flex-col gap-1 text-[13px]">
              {c.items.slice(0, 5).map((x, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-x-2"><span><b>{x.label}</b> · {x.candidate} · {x.job}</span><span className={x.status === 'confirmada' ? 'font-semibold text-[#1E6B3F]' : x.status === 'desacuerdo' ? 'font-semibold text-[#912018]' : 'text-tinta-3'}>{STATUS[x.status]}</span></li>
              ))}
            </ul>
          )}
          <p className="text-[11px] leading-snug text-tinta-suave">Tu participación se registra con fecha y evidencia. VINKA no calcula ni paga montos todavía; este registro es la base. <Link to="/beneficios" className="font-semibold">Cómo funciona</Link></p>
        </div>
      )}
    </div>
  )
}
export const STATUS = { por_confirmar: 'por confirmar', confirmada: '✓ confirmada', desacuerdo: 'en revisión de VINKA', anulada: 'anulada' }
const fdate = (d) => (d ? new Date(d).toLocaleDateString('es-CL') : '')

/** Proponer a alguien de la cartera del asesor para una vacante (la persona decide antes de que la empresa la vea) */
export function ProposeSheet({ jobId, onClose, onDone }) {
  const [list, setList] = useState(null)
  const [pick, setPick] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { supabase.rpc('my_proposable_candidates', { p_job: jobId }).then(({ data, error }) => { if (error) { setErr(errMsg(error)); setList([]) } else setList(data || []) }) }, [jobId])
  const STATE = { en_proceso: 'ya está en el proceso', ya_postulo: 'ya postuló', ya_presentado: 'ya fue presentado/a' }
  const send = async () => {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('proposal_create', { p_job: jobId, p_candidate: pick, p_note: note.trim() })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone?.('Propuesta enviada. La persona decide si quiere que la empresa vea su perfil.')
  }
  return (
    <Sheet open onClose={onClose} title="Proponer un candidato">
      <div className="flex flex-col gap-2.5">
        <p className="text-sm leading-snug text-tinta-2">Elige a alguien que te autorizó a presentarlo. Le llegará la propuesta y <b>la empresa solo verá su perfil si acepta</b>. Si acepta y lo contratan, queda registrado que tú lo aportaste.</p>
        {list == null ? <Spinner /> : list.length === 0 ? (
          <p className="rounded-xl bg-[#FAF6F8] px-3 py-2.5 text-[13px] text-tinta-3">Nadie te ha autorizado todavía. Pide autorización a las personas que asesoras desde <Link to="/autorizaciones" className="font-semibold text-rosa-texto">Autorizaciones</Link>.</p>
        ) : (
          <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {list.map((c) => {
              const off = c.state !== 'disponible'
              return (
                <label key={c.candidate_id} className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 ${pick === c.candidate_id ? 'border-rosa-accion bg-rosa-palido' : 'border-linea bg-white'} ${off ? 'opacity-60' : ''}`}>
                  <input type="radio" name="cand" className="h-4 w-4 accent-[#D02E72]" disabled={off} checked={pick === c.candidate_id} onChange={() => setPick(c.candidate_id)} />
                  <span className="flex min-w-0 flex-col"><b className="truncate text-sm">{c.name}</b><span className="truncate text-xs text-tinta-3">{[c.headline, c.comuna].filter(Boolean).join(' · ') || 'Sin titular'}{off ? ` · ${STATE[c.state]}` : ''}</span></span>
                </label>
              )
            })}
          </div>
        )}
        <textarea className="textarea h-20" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Por qué encaja (opcional, lo verá la persona)" />
        <ErrorBox>{err}</ErrorBox>
        <button className="btn" disabled={busy || !pick} onClick={send}>{busy ? 'Enviando…' : 'Enviar propuesta'}</button>
      </div>
    </Sheet>
  )
}

/** Invitar asesores a colaborar en una vacante (quien gestiona la vacante) */
export function InviteAdvisorSheet({ jobId, onClose, onDone }) {
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const load = useCallback(() => supabase.rpc('advisors_for_job', { p_job: jobId }).then(({ data, error }) => { if (error) { setErr(errMsg(error)); setList([]) } else setList(data || []) }), [jobId])
  useEffect(() => { load() }, [load])
  const invite = async (a) => {
    setBusy(a.user_id); setErr('')
    const { error } = await supabase.rpc('job_invite_advisor', { p_job: jobId, p_advisor: a.user_id })
    setBusy('')
    if (error) return setErr(errMsg(error))
    load(); onDone?.(`${a.name} fue invitado/a. Podrá proponer candidatos y sugerir avances.`)
  }
  return (
    <Sheet open onClose={onClose} title="Invitar asesores a esta vacante">
      <div className="flex flex-col gap-2.5">
        <p className="text-sm leading-snug text-tinta-2">Un asesor invitado ve solo esta vacante y el perfil laboral de sus postulantes, sin contacto, notas ni evaluaciones. Puede proponer candidatos que lo autorizaron y sugerir avances. Tú decides cada paso, y su participación queda registrada.</p>
        {list == null ? <Spinner /> : list.length === 0 ? (
          <p className="rounded-xl bg-[#FAF6F8] px-3 py-2.5 text-[13px] text-tinta-3">Por ahora no hay asesores disponibles para invitar.</p>
        ) : (
          <div className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
            {list.map((a) => (
              <div key={a.user_id} className="flex items-center justify-between gap-2 rounded-xl border border-linea bg-white px-3 py-2.5">
                <span className="flex min-w-0 flex-col"><b className="truncate text-sm">{a.name}</b><span className="truncate text-xs text-tinta-3">{a.specialty || 'Asesor/a de VINKA'}</span></span>
                {a.invited ? <span className="text-xs font-semibold text-[#1E6B3F]">✓ Invitado/a</span>
                  : <button className="btn-sm h-9 bg-rosa-accion px-3 text-white" disabled={!!busy} onClick={() => invite(a)}>{busy === a.user_id ? 'Invitando…' : 'Invitar'}</button>}
              </div>
            ))}
          </div>
        )}
        <ErrorBox>{err}</ErrorBox>
      </div>
    </Sheet>
  )
}

/** Ficha de atribución de una contratación: quién captó la empresa, quién llevó la cuenta, quién gestionó, quién aportó al candidato y quién colaboró.
 *  Cada aporte se confirma o se objeta por separado; nadie confirma lo propio. Los del sistema se confirman solos a los 7 días. */
export function AttributionCard({ matchId }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [dispute, setDispute] = useState(null) // item
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const load = useCallback(() => supabase.rpc('hire_attribution', { p_match: matchId }).then(({ data, error }) => { if (error) setErr(errMsg(error)); else setD(data) }), [matchId])
  useEffect(() => { load() }, [load])
  if (err && !d) return null
  if (!d || !d.items?.length) return null
  const confirm = async (x) => {
    setBusy(x.id); setErr('')
    const { error } = await supabase.rpc('contribution_confirm', { p_id: x.id })
    setBusy('')
    if (error) return setErr(errMsg(error))
    load()
  }
  const sendDispute = async () => {
    setBusy(dispute.id); setErr('')
    const { error } = await supabase.rpc('contribution_dispute', { p_id: dispute.id, p_note: note.trim() })
    setBusy('')
    if (error) return setErr(errMsg(error))
    setDispute(null); setNote(''); load()
  }
  const ev = (x) => {
    const e = x.evidence || {}
    if (x.role === 'capto_empresa') return `Registró la empresa el ${fdate(e.registered_at)}${e.activated_at ? ` · activada el ${fdate(e.activated_at)}` : ''}`
    if (x.role === 'llevo_cuenta') return e.since ? `Encargado/a de la cuenta desde el ${fdate(e.since)}` : ''
    if (x.role === 'propuso_candidato') return e.accepted_at ? `Propuesta del ${fdate(e.proposed_at)}, aceptada por la persona el ${fdate(e.accepted_at)}` : ''
    if (x.role === 'gestiono') return `Responsable de la vacante · ${e.interviews || 0} entrevista(s) realizada(s)${e.offer ? ' y oferta' : ''}`
    if (x.role === 'colaboro') return `${e.approved_suggestions || 0} sugerencia(s) aprobada(s), ${e.done_tasks || 0} tarea(s) hecha(s)`
    return ''
  }
  return (
    <section className="card flex flex-col gap-2.5 p-4" aria-label="Ficha de atribución">
      <div className="flex items-center gap-2"><Svg name="people" size={18} /><h3 className="text-[15px] font-semibold">Quién ayudó en esta contratación</h3></div>
      <ul className="flex flex-col gap-1.5">
        {d.items.map((x) => (
          <li key={x.id} className="flex flex-col gap-1 rounded-xl bg-[#FAF6F8] px-3 py-2 text-[13px]">
            <span className="flex flex-wrap justify-between gap-x-2"><span><b>{x.label}</b> · {x.advisor}{x.mine ? ' (tú)' : ''}</span><span className={x.status === 'confirmada' ? 'font-semibold text-[#1E6B3F]' : x.status === 'desacuerdo' ? 'font-semibold text-[#912018]' : 'text-tinta-3'}>{STATUS[x.status]}</span></span>
            {ev(x) && <span className="text-xs text-tinta-3">{ev(x)}</span>}
            {x.status === 'por_confirmar' && x.source === 'sistema' && x.auto_confirm_at && <span className="text-[11px] text-tinta-suave">Se confirma solo el {fdate(x.auto_confirm_at)} si nadie lo objeta.</span>}
            {x.status === 'por_confirmar' && x.source === 'manual' && <span className="text-[11px] text-tinta-suave">Lo confirma quien gestiona la vacante.</span>}
            {x.status === 'desacuerdo' && x.note && <span className="text-[11px] text-tinta-3">Motivo: «{x.note}»</span>}
            {(x.rights?.confirm || x.rights?.dispute) && (
              <span className="flex flex-wrap gap-2 pt-0.5">
                {x.rights.confirm && <button className="btn-sm h-9 bg-[#1E6B3F] px-3 text-white" disabled={!!busy} onClick={() => confirm(x)}>{busy === x.id ? 'Guardando…' : '✓ Confirmar'}</button>}
                {x.rights.dispute && <button className="btn-sm h-9 border border-linea bg-white px-3" disabled={!!busy} onClick={() => { setDispute(x); setNote('') }}>No corresponde</button>}
              </span>
            )}
          </li>
        ))}
      </ul>
      <ErrorBox>{err}</ErrorBox>
      <p className="text-[11px] leading-snug text-tinta-suave">Se arma sola con lo registrado en VINKA. Nadie confirma su propio aporte, y los desacuerdos los resuelve VINKA con el historial.</p>
      {dispute && (
        <Sheet open onClose={() => setDispute(null)} title={`Objetar: ${dispute.label}`}>
          <div className="flex flex-col gap-2.5">
            <p className="text-sm text-tinta-2">{dispute.advisor} · VINKA lo revisará con el historial y les avisará a ambos.</p>
            <textarea className="textarea h-24" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="¿Qué no corresponde? (al menos 10 caracteres)" />
            <ErrorBox>{err}</ErrorBox>
            <button className="btn" disabled={!!busy || note.trim().length < 10} onClick={sendDispute}>Enviar a revisión</button>
          </div>
        </Sheet>
      )}
    </section>
  )
}

/** Propuestas recibidas por el postulante (la empresa no ve el perfil hasta que acepta) */
export function ProposalsInbox({ compact = false }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState('')
  const load = useCallback(() => supabase.rpc('my_proposals').then(({ data, error }) => { if (error) setErr(errMsg(error)); else setD(data) }), [])
  useEffect(() => { load() }, [load])
  if (!d) return compact ? null : (err ? <ErrorBox>{err}</ErrorBox> : <Spinner />)
  const open = (d.received || []).filter((p) => p.status === 'enviada' && p.open)
  if (compact) return open.length ? (
    <Link to="/propuestas" className="flex items-center gap-3 rounded-2xl border border-[#E7B6CB] bg-rosa-palido px-3.5 py-3">
      <Svg name="star" size={20} className="text-rosa-oscuro" />
      <span className="flex-1 text-sm"><b>{open.length === 1 ? `${open[0].advisor} te propone para «${open[0].job}»` : `Tienes ${open.length} propuestas de tu asesor/a`}</b><span className="block text-xs text-tinta-3">Revisa y decide si la empresa puede ver tu perfil</span></span>
      <Svg name="chevron" size={18} className="text-tinta-suave" />
    </Link>
  ) : null
  const answer = async (p, ok) => {
    setBusy(p.id); setErr('')
    const { error } = await supabase.rpc('proposal_answer', { p_id: p.id, p_accept: ok })
    setBusy('')
    if (error) return setErr(errMsg(error))
    setToast(ok ? 'Listo: ya apareces entre los interesados de la vacante.' : 'Listo, no se compartió tu perfil.'); load()
  }
  const list = d.received || []
  return (
    <div className="flex flex-col gap-2.5">
      {toast && <div className="rounded-xl bg-[#EFF9F2] px-3 py-2 text-sm font-semibold text-[#134A2B]">{toast}</div>}
      <ErrorBox>{err}</ErrorBox>
      {list.length === 0 && <p className="rounded-2xl border border-dashed border-linea bg-white px-4 py-3 text-[13px] text-tinta-3">Aún no tienes propuestas. Tu asesor/a puede proponerte para vacantes que calcen contigo; aquí decides si quieres postular.</p>}
      {list.map((p) => (
        <div key={p.id} className="card flex flex-col gap-2 p-4">
          <span className="text-xs text-tinta-3">{p.advisor} te propone · {new Date(p.created_at).toLocaleDateString('es-CL')}</span>
          <b className="text-[15px]">{p.job}</b>
          <span className="text-[13px] text-tinta-3">{[p.company, p.comuna, p.modality].filter(Boolean).join(' · ')}</span>
          {p.note && <p className="rounded-xl bg-[#FAF6F8] px-3 py-2 text-[13px]">«{p.note}»</p>}
          {p.status === 'enviada' && p.open ? (
            <div className="flex flex-wrap gap-2">
              <button className="btn-sm h-10 bg-rosa-accion px-4 text-white" disabled={!!busy} onClick={() => answer(p, true)}>Me interesa, postular</button>
              <button className="btn-sm h-10 border border-linea bg-white px-4" disabled={!!busy} onClick={() => answer(p, false)}>No, gracias</button>
              <Link to={`/vacante/${p.job_id}`} className="btn-sm h-10 border border-linea bg-white px-4">Ver vacante</Link>
            </div>
          ) : <span className="text-[13px] font-semibold text-tinta-3">{p.status === 'aceptada' ? '✓ Postulaste' : p.status === 'rechazada' ? 'No postulaste' : p.status === 'vencida' ? 'Venció (14 días)' : 'Ya no está disponible'}</span>}
          <span className="text-[11px] text-tinta-suave">La empresa solo ve tu perfil si eliges postular.</span>
        </div>
      ))}
    </div>
  )
}

/** Administración: desacuerdos de atribución por resolver (con el historial como evidencia) */
export function ContributionDisputes() {
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState(null) // { x, status }
  const [note, setNote] = useState('')
  const load = useCallback(() => supabase.rpc('admin_contributions', { p_status: 'desacuerdo', p_include_demo: true }).then(({ data, error }) => { if (error) setErr(errMsg(error)); else setList(data || []) }), [])
  useEffect(() => { load() }, [load])
  if (!list?.length) return err ? <ErrorBox>{err}</ErrorBox> : null
  const resolve = async () => {
    setErr('')
    const { error } = await supabase.rpc('admin_contribution_resolve', { p_id: pick.x.id, p_status: pick.status, p_note: note.trim() })
    if (error) return setErr(errMsg(error))
    setPick(null); setNote(''); load()
  }
  return (
    <section className="card flex flex-col gap-2 p-4">
      <h2 className="text-[15px] font-semibold">Desacuerdos de atribución · {list.length}</h2>
      {list.map((x) => (
        <div key={x.id} className="flex flex-col gap-1 rounded-xl bg-[#FFFAEE] px-3 py-2 text-[13px]">
          <span><b>{x.label}</b> · {x.advisor} · {x.candidate} · {x.job} ({x.company})</span>
          {x.note && <span className="text-tinta-3">Motivo{x.disputed_by ? ` (${x.disputed_by})` : ''}: «{x.note}»</span>}
          <span className="flex gap-2"><button className="btn-sm h-9 bg-[#1E6B3F] px-3 text-white" onClick={() => setPick({ x, status: 'confirmada' })}>Confirmar crédito</button><button className="btn-sm h-9 border border-linea bg-white px-3" onClick={() => setPick({ x, status: 'anulada' })}>Anular</button></span>
        </div>
      ))}
      <ErrorBox>{err}</ErrorBox>
      {pick && (
        <Sheet open onClose={() => setPick(null)} title={pick.status === 'confirmada' ? 'Confirmar crédito' : 'Anular crédito'}>
          <div className="flex flex-col gap-2.5">
            <textarea className="textarea h-24" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Explica la decisión (queda registrada y la ve el asesor)" />
            <button className="btn" onClick={resolve}>Guardar decisión</button>
          </div>
        </Sheet>
      )}
    </section>
  )
}

/** Contrataciones acreditadas (confirmadas) de un asesor, para su perfil */
export function CreditedHires({ advisorId }) {
  const [n, setN] = useState(null)
  useEffect(() => { if (advisorId) supabase.rpc('advisor_credited_hires', { p_advisor: advisorId }).then(({ data }) => setN(data ?? null)) }, [advisorId])
  if (!(n > 0)) return null
  return <span className="text-[12px] font-semibold text-[#1E6B3F]">✓ {n === 1 ? '1 contratación acreditada en VINKA' : `${n} contrataciones acreditadas en VINKA`}</span>
}
