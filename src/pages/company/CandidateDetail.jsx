import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { COLUMNAS, CONTRATOS, CRITERIOS, JORNADAS, RECOMENDACION, clp, colLabel, parseCLP } from '../../lib/catalog'
import { fmtDayShort, fmtTime } from '../../lib/dates'
import { Avatar, ErrorBox, Field, Sheet, Spinner, Svg, Toast } from '../../components/ui'
import { Sparkle, callAi } from '../../components/AiAssist'
import { BulkSheet, StagePicker } from './Pipeline'
import { usePresence } from '../../lib/presence'
import { PresenceLine, WithDot } from '../../components/Presence'

const fmtDate = (d) => new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtDT = (d) => `${new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} · ${fmtTime(d)}`

function Stars({ value = 0, onChange, size = 26, label }) {
  return (
    <div className="flex items-center gap-0.5" role={onChange ? 'radiogroup' : undefined} aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onChange} role={onChange ? 'radio' : undefined} aria-checked={value === n} aria-label={`${n} de 5`}
          onClick={() => onChange?.(n)} className={`flex items-center justify-center ${onChange ? 'h-10 w-10' : ''}`}>
          <svg width={size} height={size} viewBox="0 0 24 24" fill={n <= value ? '#FF941E' : 'none'} stroke={n <= value ? '#FF941E' : '#CFC3CB'} strokeWidth="1.8" strokeLinejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" /></svg>
        </button>
      ))}
    </div>
  )
}

/* ---------- Evaluaciones ---------- */
function Evaluations({ d, subject, onSaved }) {
  const mine = d.evaluations.find((e) => e.author_id === d.my_id)
  const [f, setF] = useState(() => ({ scores: mine?.scores || {}, overall: mine?.overall || 0, recommendation: mine?.recommendation || '', note: mine?.note || '' }))
  const [edit, setEdit] = useState(!mine)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const avg = d.evaluations.length ? (d.evaluations.reduce((a, e) => a + e.overall, 0) / d.evaluations.length).toFixed(1) : null
  const save = async () => {
    setErr('')
    if (!f.overall || !f.recommendation) return setErr('Elige una nota general y una recomendación.')
    setBusy(true)
    const row = { ...subject, scores: f.scores, overall: f.overall, recommendation: f.recommendation, note: f.note.trim() }
    const { error } = mine ? await supabase.from('evaluations').update(row).eq('id', mine.id) : await supabase.from('evaluations').insert(row)
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setEdit(false); onSaved('Evaluación guardada')
  }
  return (
    <div className="flex flex-col gap-4">
      {avg && (
        <div className="card flex items-center gap-4 p-4">
          <div className="flex flex-col items-center"><span className="font-display text-[32px] font-bold leading-none">{avg}</span><Stars value={Math.round(avg)} size={14} /></div>
          <div className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-semibold">{d.evaluations.length} {d.evaluations.length === 1 ? 'evaluación' : 'evaluaciones'} del equipo</span>
            <span className="flex flex-wrap gap-1.5">{Object.entries(RECOMENDACION).map(([k, [l, cls]]) => { const n = d.evaluations.filter((e) => e.recommendation === k).length; return n ? <span key={k} className={`pill ${cls}`}>{l}: {n}</span> : null })}</span>
          </div>
        </div>
      )}
      {edit ? (
        <div className="card flex flex-col gap-3 p-4">
          <span className="text-[15px] font-semibold">{mine ? 'Editar mi evaluación' : 'Mi evaluación'}</span>
          {CRITERIOS.map(([k, l]) => (
            <div key={k} className="flex items-center justify-between gap-2"><span className="text-sm">{l}</span>
              <Stars size={22} label={l} value={f.scores[k] || 0} onChange={(n) => setF({ ...f, scores: { ...f.scores, [k]: n } })} /></div>
          ))}
          <div className="flex items-center justify-between gap-2 border-t border-[#F1E7ED] pt-3"><span className="text-sm font-semibold">Nota general</span>
            <Stars size={26} label="Nota general" value={f.overall} onChange={(n) => setF({ ...f, overall: n })} /></div>
          <fieldset><legend className="label mb-2">Recomendación</legend>
            <div className="grid grid-cols-3 gap-2">{Object.entries(RECOMENDACION).map(([k, [l]]) => (
              <button key={k} type="button" aria-pressed={f.recommendation === k} onClick={() => setF({ ...f, recommendation: k })} className={`chip h-11 justify-center px-2 text-[13px] ${f.recommendation === k ? 'chip-on' : ''}`}>{l}</button>
            ))}</div></fieldset>
          <Field label="Comentario (solo lo ve tu equipo)"><textarea className="textarea h-24" maxLength={2000} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Fortalezas, dudas, impresión general…" /></Field>
          <ErrorBox>{err}</ErrorBox>
          <div className="grid grid-cols-2 gap-2">{mine && <button className="btn-sec h-12" onClick={() => setEdit(false)}>Cancelar</button>}<button className={`btn h-12 ${mine ? '' : 'col-span-2'}`} disabled={busy} onClick={save}>Guardar evaluación</button></div>
        </div>
      ) : <button className="btn-sec" onClick={() => setEdit(true)}>Editar mi evaluación</button>}
      {d.evaluations.map((e) => (
        <div key={e.id} className="card flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{e.author_id === d.my_id ? 'Tú' : e.author}</span><span className={`pill ${RECOMENDACION[e.recommendation][1]}`}>{RECOMENDACION[e.recommendation][0]}</span></div>
          <div className="flex items-center gap-2"><Stars value={e.overall} size={16} /><span className="text-xs text-tinta-suave">{fmtDate(e.updated_at)}</span></div>
          {Object.keys(e.scores || {}).length > 0 && <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-tinta-3">{CRITERIOS.filter(([k]) => e.scores[k]).map(([k, l]) => <span key={k}>{l}: <b className="text-tinta">{e.scores[k]}/5</b></span>)}</div>}
          {e.note && <p className="whitespace-pre-wrap text-sm leading-relaxed text-tinta-2">{e.note}</p>}
        </div>
      ))}
    </div>
  )
}

/* ---------- Notas con @menciones ---------- */
function Notes({ d, subject, onSaved }) {
  const [body, setBody] = useState('')
  const [mentions, setMentions] = useState([])
  const [err, setErr] = useState('')
  const ta = useRef()
  const query = (body.match(/@([\wáéíóúñÁÉÍÓÚÑ]*)$/) || [])[1]
  const options = query != null ? d.team.filter((t) => t.id !== d.my_id && t.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5) : []
  const pickMention = (t) => { setBody(body.replace(/@([\wáéíóúñÁÉÍÓÚÑ]*)$/, `@${t.name.split(' ')[0]} `)); setMentions((m) => [...new Set([...m, t.id])]); ta.current?.focus() }
  const add = async () => {
    setErr('')
    if (!body.trim()) return
    const used = mentions.filter((uid) => { const t = d.team.find((x) => x.id === uid); return t && body.includes(`@${t.name.split(' ')[0]}`) })
    const { error } = await supabase.from('candidate_notes').insert({ ...subject, body: body.trim(), mentions: used })
    if (error) return setErr(errMsg(error))
    setBody(''); setMentions([]); onSaved(used.length ? `Nota guardada · avisamos a ${used.length} persona(s)` : 'Nota guardada')
  }
  const del = async (id) => { const { error } = await supabase.from('candidate_notes').delete().eq('id', id); if (error) setErr(errMsg(error)); else onSaved('Nota eliminada') }
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl bg-[#F4EEF2] px-3 py-2 text-xs text-tinta-3">Las notas son internas: el candidato nunca las ve. Escribe <b>@</b> para avisarle a alguien del equipo.</div>
      {d.notes.length === 0 && <p className="py-4 text-center text-sm text-tinta-suave">Aún no hay notas.</p>}
      {d.notes.map((n) => (
        <div key={n.id} className="card flex flex-col gap-1 p-3.5">
          <div className="flex items-center justify-between gap-2 text-xs text-tinta-suave"><b className="text-sm text-tinta">{n.author_id === d.my_id ? 'Tú' : n.author}</b><span>{fmtDT(n.created_at)}</span></div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{n.body.split(/(@[\wáéíóúñÁÉÍÓÚÑ]+)/g).map((p, i) => (p.startsWith('@') ? <b key={i} className="text-rosa-texto">{p}</b> : p))}</p>
          {n.author_id === d.my_id && <button className="self-end text-xs font-semibold text-tinta-suave" onClick={() => del(n.id)}>Eliminar</button>}
        </div>
      ))}
      <div className="relative flex flex-col gap-2">
        {options.length > 0 && (
          <div className="absolute bottom-full z-10 mb-1 flex w-full flex-col overflow-hidden rounded-xl border border-linea bg-white shadow-lg">
            {options.map((t) => <button key={t.id} type="button" onClick={() => pickMention(t)} className="flex h-11 items-center gap-2 px-3 text-left text-sm hover:bg-rosa-fondo"><Avatar text={t.name.slice(0, 2).toUpperCase()} color="#302538" size={28} round />{t.name}</button>)}
          </div>
        )}
        <textarea ref={ta} className="textarea h-24" maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escribe una nota… (@ para mencionar)" aria-label="Nueva nota" />
        <ErrorBox>{err}</ErrorBox>
        <button className="btn h-12" disabled={!body.trim()} onClick={add}>Agregar nota</button>
      </div>
    </div>
  )
}

/* ---------- Historial ---------- */
const EV = {
  applied: () => 'Dijo "Me interesa"', match: () => 'Se generó el match', imported: (x) => `Importado desde ${x.source || 'otro portal'}`,
  stage: (x) => `Etapa: ${colLabel(x.from === 'nuevo' ? 'match' : x.from === 'contactado' ? 'contacto' : x.from)} → ${colLabel(x.to === 'nuevo' ? 'match' : x.to === 'contactado' ? 'contacto' : x.to)}`,
  note: () => 'Agregó una nota', evaluation: (x) => `${x.updated ? 'Actualizó' : 'Agregó'} una evaluación (${x.overall}/5)`,
  offer_sent: () => 'Envió la carta oferta', offer_accepted: () => 'Aceptó la oferta', offer_rejected: () => 'Rechazó la oferta',
}
function History({ events }) {
  if (!events.length) return <p className="py-4 text-center text-sm text-tinta-suave">Sin movimientos registrados.</p>
  return (
    <ol className="flex flex-col">
      {events.map((e, i) => (
        <li key={i} className="flex gap-3">
          <div className="flex flex-col items-center"><span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${e.kind.startsWith('offer') ? 'bg-naranja' : e.kind === 'stage' ? 'bg-rosa-accion' : 'bg-[#CFC3CB]'}`} />{i < events.length - 1 && <span className="w-px flex-1 bg-[#EEE3EA]" />}</div>
          <div className="flex flex-1 flex-col pb-4"><span className="text-sm font-medium">{(EV[e.kind] || (() => e.kind))(e.detail || {})}</span>
            <span className="text-xs text-tinta-suave">{fmtDT(e.at)}{e.actor ? ` · ${e.actor}` : ''}</span></div>
        </li>
      ))}
    </ol>
  )
}

/* ---------- IA: calce y preguntas ---------- */
function AiPanel({ d, jobId, candidateId, onDone }) {
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const fit = d.ai.fit
  const qs = d.ai.questions
  const run = async (task) => {
    setErr(''); setBusy(task)
    try { await callAi(task, 'write', { job_id: jobId, candidate_id: candidateId }); onDone() } catch (e) { setErr(e.message) } finally { setBusy('') }
  }
  const tone = fit ? (fit.score >= 70 ? ['#2F7A4F', '#EAF6EF'] : fit.score >= 45 ? ['#B85F00', '#FFF4E8'] : ['#912018', '#FEF3F2']) : null
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-[#F7F0FB] px-3 py-2.5 text-xs leading-snug text-[#4A2163]">La IA solo mira datos laborales (nunca nombre, edad, sexo u otros datos personales) y <b>sugiere</b>. La decisión siempre es de tu equipo.</div>
      <div className="card flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2"><span className="text-[15px] font-semibold">Calce con la vacante</span>{fit && <span className="text-xs text-tinta-suave">{fmtDate(fit.at)}</span>}</div>
        {fit ? (
          <>
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(${tone[0]} ${fit.score * 3.6}deg, #F1E7ED 0)` }}>
                <div className="flex h-[66px] w-[66px] items-center justify-center rounded-full bg-white font-display text-[22px] font-bold" style={{ color: tone[0] }}>{fit.score}%</div>
              </div>
              <p className="text-sm leading-relaxed">{fit.summary}</p>
            </div>
            {fit.meets?.length > 0 && <div className="flex flex-col gap-1"><span className="text-xs font-semibold text-tinta-3">Cumple</span>{fit.meets.map((x) => <span key={x} className="text-sm text-[#134A2B]">✓ {x}</span>)}</div>}
            {fit.missing?.length > 0 && <div className="flex flex-col gap-1"><span className="text-xs font-semibold text-tinta-3">No se ve en el perfil</span>{fit.missing.map((x) => <span key={x} className="text-sm text-[#912018]">– {x}</span>)}</div>}
            {fit.check?.length > 0 && <div className="flex flex-col gap-1"><span className="text-xs font-semibold text-tinta-3">Confirmar en la entrevista</span>{fit.check.map((x) => <span key={x} className="text-sm">? {x}</span>)}</div>}
          </>
        ) : <p className="text-sm text-tinta-3">Obtén un resumen del perfil y un porcentaje de calce explicado.</p>}
        <button className="btn-sec h-12 border-[#E9D3F0] text-[#6B2E8F]" disabled={!!busy} onClick={() => run('candidate_fit')}><Sparkle />{busy === 'candidate_fit' ? 'Analizando…' : fit ? 'Volver a analizar' : 'Analizar con IA'}</button>
      </div>
      <div className="card flex flex-col gap-3 p-4">
        <span className="text-[15px] font-semibold">Preguntas para la entrevista</span>
        {qs?.items?.length ? qs.items.map((x, i) => (
          <div key={i} className="flex flex-col gap-0.5 border-b border-[#F1E7ED] pb-2.5 last:border-0"><span className="text-sm font-medium">{i + 1}. {x.q}</span>{x.why && <span className="text-xs text-tinta-suave">Evalúa: {x.why}</span>}</div>
        )) : <p className="text-sm text-tinta-3">Preguntas a la medida de esta persona y este cargo.</p>}
        <button className="btn-sec h-12 border-[#E9D3F0] text-[#6B2E8F]" disabled={!!busy} onClick={() => run('interview_questions')}><Sparkle />{busy === 'interview_questions' ? 'Preparando…' : qs ? 'Otras preguntas' : 'Sugerir preguntas'}</button>
      </div>
      <ErrorBox>{err}</ErrorBox>
    </div>
  )
}

/* ---------- Etiquetas ---------- */
function Tags({ tags, companyId, subjectId, canManage, onChange }) {
  const [t, setT] = useState('')
  const [adding, setAdding] = useState(false)
  const add = async () => {
    const v = t.trim().toLowerCase().replace(/^#/, '').slice(0, 30)
    if (!v) return
    const { error } = await supabase.from('candidate_tags').insert({ company_id: companyId, subject_id: subjectId, tag: v })
    setT(''); setAdding(false)
    if (!error || error.code === '23505') onChange()
  }
  const del = async (tag) => { await supabase.from('candidate_tags').delete().match({ company_id: companyId, subject_id: subjectId, tag }); onChange() }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((x) => (
        <span key={x} className="inline-flex h-8 items-center gap-1 rounded-full bg-[#F4EEF2] pl-3 pr-1 text-[13px] font-medium text-tinta-2">#{x}
          {canManage && <button aria-label={`Quitar etiqueta ${x}`} onClick={() => del(x)} className="flex h-7 w-7 items-center justify-center"><Svg name="x" size={12} /></button>}</span>
      ))}
      {canManage && (adding ? (
        <form onSubmit={(e) => { e.preventDefault(); add() }} className="flex items-center gap-1">
          <input autoFocus className="input h-8 w-36 rounded-full px-3 text-[14px]" value={t} onChange={(e) => setT(e.target.value)} placeholder="ej.: bodega" onBlur={() => !t && setAdding(false)} />
          <button className="h-8 rounded-full bg-morado px-3 text-xs font-semibold text-white">OK</button>
        </form>
      ) : <button onClick={() => setAdding(true)} className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-linea px-3 text-[13px] font-semibold text-tinta-3"><Svg name="tag" size={14} />Etiqueta</button>)}
    </div>
  )
}

/* ---------- Carta oferta (empresa) ---------- */
export function OfferForm({ open, onClose, matchId, job, onSent }) {
  const { company } = useAuth()
  const [f, setF] = useState({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setF({ position: job?.title || '', salary: job?.salary_max || job?.salary_min || null, salary_type: job?.salary_type || 'liquido', contract: job?.contract || '', schedule: job?.schedule || '',
      location: job?.modality === 'Remota' ? 'Remoto' : [job?.comuna, job?.region].filter(Boolean).join(', '), start_date: '', expires_on: '', benefits: company?.benefits || '', message: '' })
  }, [open, job, company])
  const set = (k, v) => setF({ ...f, [k]: v })
  const send = async () => {
    setErr('')
    if (!f.position?.trim()) return setErr('Indica el cargo.')
    setBusy(true)
    const { error } = await supabase.rpc('send_offer', { p_match: matchId, p: { ...f, salary: f.salary ? String(f.salary) : '' } })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onSent()
  }
  return (
    <Sheet open={open} onClose={onClose} title="Carta oferta">
      <div className="flex flex-col gap-3.5">
        <Field label="Cargo"><input className="input" value={f.position || ''} onChange={(e) => set('position', e.target.value)} /></Field>
        <div className="flex flex-col gap-1.5"><span className="label">Renta mensual</span>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input className="input" inputMode="numeric" aria-label="Renta" placeholder="$" value={clp(f.salary)} onChange={(e) => set('salary', parseCLP(e.target.value))} />
            <select className="input w-28" aria-label="Tipo de renta" value={f.salary_type} onChange={(e) => set('salary_type', e.target.value)}><option value="liquido">Líquida</option><option value="bruto">Bruta</option></select>
          </div></div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Contrato"><select className="input" value={f.contract || ''} onChange={(e) => set('contract', e.target.value)}><option value="">—</option>{CONTRATOS.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Jornada"><select className="input" value={f.schedule || ''} onChange={(e) => set('schedule', e.target.value)}><option value="">—</option>{JORNADAS.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Fecha de inicio"><input type="date" className="input" value={f.start_date || ''} onChange={(e) => set('start_date', e.target.value)} /></Field>
          <Field label="Responder antes del"><input type="date" className="input" value={f.expires_on || ''} onChange={(e) => set('expires_on', e.target.value)} /></Field>
        </div>
        <Field label="Lugar de trabajo"><input className="input" value={f.location || ''} onChange={(e) => set('location', e.target.value)} /></Field>
        <Field label="Beneficios"><textarea className="textarea h-20" maxLength={1500} value={f.benefits || ''} onChange={(e) => set('benefits', e.target.value)} /></Field>
        <Field label="Mensaje personal (opcional)"><textarea className="textarea h-24" maxLength={2000} value={f.message || ''} onChange={(e) => set('message', e.target.value)} placeholder="Nos encantaría que te sumes al equipo…" /></Field>
        <p className="hint">La persona recibe un aviso y un correo, y puede aceptar o rechazar desde VINKA. La carta oferta no reemplaza al contrato de trabajo.</p>
        <ErrorBox>{err}</ErrorBox>
        <button className="btn" disabled={busy} onClick={send}>{busy ? 'Enviando…' : 'Enviar carta oferta'}</button>
      </div>
    </Sheet>
  )
}

const OFFER_ST = { enviada: ['Esperando respuesta', 'bg-naranja-palido text-naranja-texto'], aceptada: ['Aceptada', 'bg-[#EAF6EF] text-[#134A2B]'], rechazada: ['Rechazada', 'bg-[#FEF3F2] text-[#912018]'], retirada: ['Retirada', 'bg-[#F1F1F1] text-[#3A3A3A]'] }
export function OfferSummary({ o, onWithdraw }) {
  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-[15px] font-semibold"><Svg name="doc" size={20} />Carta oferta</span><span className={`pill ${OFFER_ST[o.status][1]}`}>{OFFER_ST[o.status][0]}</span></div>
      <span className="text-sm">{o.position}{o.salary ? ` · ${clp(o.salary)} ${o.salary_type === 'bruto' ? 'bruto' : 'líquido'}` : ''}</span>
      <span className="text-xs text-tinta-suave">Enviada el {fmtDate(o.created_at)}{o.responded_at ? ` · respondida el ${fmtDate(o.responded_at)}` : ''}</span>
      {o.response_note && <span className="text-sm italic text-tinta-2">“{o.response_note}”</span>}
      {o.status === 'enviada' && onWithdraw && <button className="self-start text-sm font-semibold text-[#B42318]" onClick={onWithdraw}>Retirar oferta</button>}
    </div>
  )
}

/* ---------- Página ---------- */
const TABS = [['perfil', 'Perfil'], ['ia', 'IA'], ['evaluacion', 'Evaluación'], ['notas', 'Notas'], ['historial', 'Historial']]

export default function CandidateDetail() {
  const { job: jobId, cid, eid } = useParams()
  const nav = useNavigate()
  const { company } = useAuth()
  const ext = !!eid
  const [d, setD] = useState(null)
  const [job, setJob] = useState(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('perfil')
  const [toast, setToast] = useState('')
  const [moveOpen, setMoveOpen] = useState(false)
  const [msgOpen, setMsgOpen] = useState(false)
  const [offerOpen, setOfferOpen] = useState(false)
  const [video, setVideo] = useState('')
  const [copyOpen, setCopyOpen] = useState(false)
  const [jobs, setJobs] = useState([])

  const load = useCallback(async () => {
    const { data, error } = ext ? await supabase.rpc('external_detail', { p_id: eid }) : await supabase.rpc('subject_detail', { p_job: jobId, p_candidate: cid })
    if (error) return setErr(errMsg(error))
    setD(data)
  }, [ext, eid, jobId, cid])
  useEffect(() => { load() }, [load])
  useEffect(() => { supabase.from('jobs').select('*').eq('id', jobId).single().then(({ data }) => setJob(data)) }, [jobId])

  const pres = usePresence({ users: ext ? [] : [cid] })
  const subject = useMemo(() => (ext ? { job_id: jobId, external_id: eid } : { job_id: jobId, candidate_id: cid }), [ext, jobId, eid, cid])
  const saved = (m) => { setToast(m); load() }

  if (err && !d) return <div className="p-6"><ErrorBox>{err}</ErrorBox><Link to={`/vacantes/${jobId}/proceso`} className="btn-sec mt-3">Volver al proceso</Link></div>
  if (!d) return <Spinner />

  const canManage = d.can_manage
  const c = ext ? null : d.candidate
  const e = ext ? d.external : null
  const name = ext ? e.full_name : c.name
  const stage = ext ? e.col : d.match ? d.match.stage : 'postulante'
  const stageColor = (COLUMNAS.find((x) => x[0] === stage) || [])[2]
  const item = ext ? { kind: 'externo', id: eid, name } : { kind: d.kind, id: cid, name }

  const move = async (s) => {
    setMoveOpen(false)
    const { error } = await supabase.rpc('pipeline_move', { p_kind: item.kind, p_id: item.id, p_job: jobId, p_stage: s })
    if (error) return setErr(errMsg(error))
    saved(`${name} → ${colLabel(s)}`)
  }
  const playVideo = async () => {
    const { data: path } = await supabase.rpc('candidate_video_path', { p_candidate: cid })
    if (!path) return setErr('El video no está disponible.')
    const { data } = await supabase.storage.from('videos').createSignedUrl(path, 600)
    setVideo(data?.signedUrl || '')
  }
  const withdraw = async () => { const { error } = await supabase.rpc('withdraw_offer', { p_id: d.offer.id }); if (error) setErr(errMsg(error)); else saved('Oferta retirada') }
  const invite = async () => { const { data: n, error } = await supabase.rpc('invite_external', { p_ids: [eid] }); if (error) setErr(errMsg(error)); else saved(n ? 'Invitación enviada por correo' : 'No se pudo invitar (revisa el correo)') }
  const openCopy = async () => {
    const { data } = await supabase.from('jobs').select('id, title, status').eq('company_id', company.id).neq('id', jobId).in('status', ['published', 'paused', 'pending', 'draft']).order('created_at', { ascending: false })
    setJobs(data || []); setCopyOpen(true)
  }
  const copyTo = async (j) => { setCopyOpen(false); const { error } = await supabase.rpc('copy_external_to_job', { p_external: eid, p_job: j.id }); if (error) setErr(errMsg(error)); else setToast(`${name} agregado/a a ${j.title}`) }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-[#FAF7F9] pb-10">
      <div className="safe-t sticky top-0 z-10 border-b border-[#EEE3EA] bg-white px-3 pb-0">
        <div className="flex items-center gap-1">
          <button aria-label="Volver al proceso" onClick={() => nav(`/vacantes/${jobId}/proceso`)} className="flex h-11 w-11 items-center justify-center"><Svg name="back" /></button>
          <span className="truncate text-[13px] text-tinta-suave">{d.job.title}</span>
        </div>
        <div className="flex items-center gap-3 px-2 pb-3 pt-1">
          <WithDot p={pres[cid]} size={14}><Avatar text={name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()} color="#302538" size={52} round /></WithDot>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate font-display text-[19px] font-semibold">{name}</span>
            <span className="truncate text-sm text-tinta-2">{(ext ? e.headline : c.headline) || '—'}</span>
            {!ext && <PresenceLine p={pres[cid]} />}
            <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: stageColor }}><span className="h-2 w-2 rounded-full" style={{ background: stageColor }} />{colLabel(stage)}{ext && ` · ${e.source || 'Otro portal'}`}</span>
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {TABS.filter(([k]) => !(ext && k === 'ia')).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`h-11 shrink-0 border-b-2 px-2.5 text-sm font-semibold ${tab === k ? 'border-rosa-accion text-rosa-texto' : 'border-transparent text-tinta-3'}`}>
              {l}{k === 'notas' && d.notes.length ? ` (${d.notes.length})` : k === 'evaluacion' && d.evaluations.length ? ` (${d.evaluations.length})` : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pt-4">
        <ErrorBox>{err}</ErrorBox>
        <Tags tags={d.tags} companyId={d.job.company_id} subjectId={ext ? eid : cid} canManage={canManage} onChange={load} />
        {canManage && (
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-sm h-11 bg-rosa-accion text-white" onClick={() => setMoveOpen(true)}>{d.kind === 'interesado' ? 'Avanzar o descartar' : 'Cambiar etapa'}</button>
            {d.match ? <Link to={`/chats/${d.match.id}`} className="btn-sm h-11 border border-linea bg-white">Abrir chat</Link>
              : ext ? <button className="btn-sm h-11 border border-linea bg-white" onClick={openCopy}>Copiar a otra vacante</button>
                : <span className="btn-sm h-11 bg-[#F4EEF2] text-xs text-tinta-3">Chat al hacer match</span>}
            {d.match && !d.match.closed && <button className="btn-sm h-11 border border-linea bg-white" onClick={() => setMsgOpen(true)}>Usar plantilla</button>}
            {d.match && !d.match.closed && <button className="btn-sm h-11 border border-naranja bg-naranja-palido text-naranja-texto" onClick={() => setOfferOpen(true)}>{d.offer?.status === 'enviada' ? 'Nueva oferta' : 'Carta oferta'}</button>}
          </div>
        )}
        {d.offer && <OfferSummary o={d.offer} onWithdraw={canManage ? withdraw : null} />}

        {tab === 'perfil' && !ext && (
          <div className="flex flex-col gap-4">
            {d.knocked_out && <div className="rounded-xl border border-[#F4C7C3] bg-[#FEF3F2] p-3 text-sm text-[#912018]"><b>No cumple una pregunta eliminatoria.</b> Revisa las respuestas antes de decidir.</div>}
            {d.answers.length > 0 && (
              <div className="card flex flex-col gap-2 p-4">
                <span className="text-[15px] font-semibold">Preguntas de filtro</span>
                {d.answers.map((a, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 border-b border-[#F1E7ED] pb-2 text-sm last:border-0 last:pb-0">
                    <span className="text-tinta-2">{a.text}</span>
                    <span className={`shrink-0 font-semibold ${a.ko ? 'text-[#B42318]' : ''}`}>{a.answer == null ? <i className="font-normal text-tinta-suave">sin respuesta</i> : a.type === 'yesno' ? (a.answer === 'si' ? 'Sí' : 'No') : a.answer}{a.ko && ' ✕'}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="card grid grid-cols-2 gap-3 p-4 text-sm">
              {[['Ubicación', [c.comuna, c.region].filter(Boolean).join(', ')], ['Disponibilidad', c.availability], ['Modalidad', (c.modalities || []).join(', ')], ['Jornada', (c.schedules || []).join(', ')]].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5"><span className="text-xs text-tinta-suave">{k}</span><span className="font-medium">{v || '—'}</span></div>
              ))}
              {d.applied_at && <div className="col-span-2 text-xs text-tinta-suave">Postuló el {fmtDate(d.applied_at)}</div>}
            </div>
            {(c.phone || c.email) && <div className="rounded-2xl border border-[#A9D9BC] bg-[#EAF6EF] p-3 text-sm text-[#134A2B]">Contacto: <b>{c.phone || 'sin teléfono'}</b> · <b>{c.email}</b></div>}
            {(c.bio || c.has_video) && (
              <div className="card flex flex-col gap-2 p-4"><span className="text-[15px] font-semibold">Presentación</span>
                {c.bio && <p className="text-sm leading-relaxed">{c.bio}</p>}
                {c.has_video && (video ? <video src={video} controls autoPlay playsInline className="w-full rounded-xl bg-morado" /> : <button onClick={playVideo} className="btn-sm self-start bg-morado text-white"><Svg name="video" size={18} className="mr-1.5" />Ver video</button>)}
              </div>
            )}
            <div className="card flex flex-col gap-3 p-4"><span className="text-[15px] font-semibold">Experiencia</span>
              {!c.has_experience ? <span className="text-sm text-tinta-3">Busca su primer empleo.</span> : (c.experiences || []).map((x, i) => (
                <div key={i} className="flex flex-col gap-0.5 text-sm"><b>{x.role}</b><span className="text-tinta-2">{x.company}</span><span className="text-xs text-tinta-suave">{x.from || '?'} – {x.current ? 'actual' : x.to || '?'}</span>{x.description && <span className="text-tinta-2">{x.description}</span>}</div>
              ))}
            </div>
            {(c.education || []).length > 0 && (
              <div className="card flex flex-col gap-2 p-4"><span className="text-[15px] font-semibold">Estudios</span>
                {c.education.map((x, i) => <div key={i} className="text-sm"><b>{x.title || x.level}</b>{x.institution && ` · ${x.institution}`}{x.status && <span className="text-tinta-suave"> · {x.status}</span>}</div>)}
              </div>
            )}
            {(c.skills || []).length > 0 && <div className="flex flex-wrap gap-1.5">{c.skills.map((s) => <span key={s} className="rounded-full border border-linea bg-white px-2.5 py-1 text-xs">{s}</span>)}</div>}
            {d.interviews.length > 0 && (
              <div className="card flex flex-col gap-1.5 p-4"><span className="text-[15px] font-semibold">Entrevistas</span>
                {d.interviews.map((iv, i) => <span key={i} className="text-sm">{fmtDayShort(iv.starts_at)} · {fmtTime(iv.starts_at)} · {iv.mode === 'online' ? 'Videollamada' : 'Presencial'} <span className="text-tinta-suave">({iv.status})</span></span>)}
              </div>
            )}
          </div>
        )}
        {tab === 'perfil' && ext && (
          <div className="flex flex-col gap-4">
            <div className="card grid grid-cols-1 gap-2.5 p-4 text-sm">
              {[['Correo', e.email], ['Teléfono', e.phone], ['Fuente', e.source], ['Importado', fmtDate(e.created_at)], ['Invitación a VINKA', e.invite_status ? e.invite_status.replace(/_/g, ' ') : 'No enviada']].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><span className="text-tinta-suave">{k}</span><span className="text-right font-medium">{v || '—'}</span></div>
              ))}
            </div>
            {e.notes && <div className="card p-4 text-sm leading-relaxed"><span className="mb-1 block text-xs font-semibold text-tinta-3">Notas del portal de origen</span>{e.notes}</div>}
            {d.duplicates.length > 0 && (
              <div className="rounded-xl border border-[#F5C892] bg-naranja-palido p-3 text-sm text-[#4A2A00]"><b>Posible duplicado:</b> el mismo correo aparece en {d.duplicates.map((x) => x.job_title).join(', ')}.</div>
            )}
            {canManage && e.email && !e.linked_user_id && <button className="btn-sec" onClick={invite}>{e.invited_at ? 'Reenviar invitación a VINKA' : 'Invitar a continuar en VINKA'}</button>}
            {e.linked_user_id && <div className="rounded-xl bg-[#EAF6EF] p-3 text-sm text-[#134A2B]">Esta persona aceptó la invitación y ya tiene cuenta en VINKA.</div>}
          </div>
        )}
        {tab === 'ia' && !ext && <AiPanel d={d} jobId={jobId} candidateId={cid} onDone={() => saved('Listo')} />}
        {tab === 'evaluacion' && <Evaluations d={d} subject={subject} onSaved={saved} />}
        {tab === 'notas' && <Notes d={d} subject={subject} onSaved={saved} />}
        {tab === 'historial' && <History events={d.events} />}
      </div>

      <Sheet open={moveOpen} onClose={() => setMoveOpen(false)} title={`Mover a ${name}`}>
        <StagePicker current={stage} kind={d.kind} onPick={move} />
      </Sheet>
      {d.match && <BulkSheet open={msgOpen} onClose={() => setMsgOpen(false)} items={[{ kind: 'match', id: cid, name }]} job={d.job} onDone={() => { setMsgOpen(false); saved('Mensaje enviado') }} />}
      {d.match && <OfferForm open={offerOpen} onClose={() => setOfferOpen(false)} matchId={d.match.id} job={job} onSent={() => { setOfferOpen(false); saved('Carta oferta enviada') }} />}
      <Sheet open={copyOpen} onClose={() => setCopyOpen(false)} title="Copiar a otra vacante">
        <div className="flex flex-col gap-2">
          {jobs.length === 0 && <p className="text-sm text-tinta-3">No tienes otras vacantes.</p>}
          {jobs.map((j) => <button key={j.id} onClick={() => copyTo(j)} className="flex h-12 items-center justify-between rounded-xl border border-linea px-4 text-left text-sm font-semibold">{j.title}<Svg name="chevron" size={16} /></button>)}
        </div>
      </Sheet>
      <Toast msg={toast} onDone={() => setToast('')} />
    </div>
  )
}
