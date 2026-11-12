import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { CV_ACCEPT, fmtDate, fmtDateTime, uploadCv, useSignedUrls } from '../lib/files'
import { FileLink } from './FileLink'
import { ErrorBox, Spinner, Svg } from './ui'
import { ServiceChat } from './ServiceChat'
import { fromInputLocal, toInputLocal, ymd } from '../lib/dates'

export const LOG_KIND = { cv: ['CV', '#6B2E8F'], sesion: ['Sesión', '#1F6F78'], busqueda: ['Búsqueda', '#3B5BA9'], oferta: ['Oferta', '#B85F00'], nota: ['Nota', '#6B5F6E'], entrega: ['Entrega', '#2F7A4F'], revision: ['Revisión', '#D02E72'], estado: ['Estado', '#8A8090'], seguimiento: ['Seguimiento', '#1E6B3F'] }
export const PICK_STATUS = { sugerida: 'Sugerida', postulo: 'Postuló', entrevista: 'En entrevista', descartada: 'Descartada' }
export const SESSION_STATUS = { agendada: 'Agendada', realizada: 'Realizada', cancelada: 'Cancelada', no_asistio: 'No asistió' }
const AUTHOR = { advisor: 'Asesor/a', admin: 'VINKA', candidate: 'Postulante', system: 'Sistema' }

function Tabs({ tabs, tab, setTab }) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map(([k, l, n]) => (
        <button key={k} type="button" onClick={() => setTab(k)} className={`h-9 shrink-0 rounded-full border px-3 text-[13px] font-semibold ${tab === k ? 'border-morado bg-morado text-white' : 'border-linea bg-white text-tinta-2'}`}>
          {l}{n ? <span className="ml-1 opacity-70">{n}</span> : null}
        </button>
      ))}
    </div>
  )
}

/* ---------- CV y versiones ---------- */
export function CvTab({ requestId, canUpload, asCandidate = false }) {
  const [d, setD] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const input = useRef()
  const urls = useSignedUrls('cvs', (d?.files || []).map((f) => f.file_path))
  const load = useCallback(() => { supabase.rpc('request_cvs', { p_request: requestId }).then(({ data, error }) => { if (error) setErr(errMsg(error)); setD(data) }) }, [requestId])
  useEffect(() => { load() }, [load])
  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy(true); setErr('')
    try { await uploadCv(d.candidate_id, f, { requestId, note }); setNote(''); load() } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  if (!d) return err ? <ErrorBox>{err}</ErrorBox> : <Spinner />
  return (
    <div className="flex flex-col gap-2">
      {d.files.length === 0 && <p className="text-sm text-tinta-3">{asCandidate ? 'Sube tu CV en Perfil → «CV para mis asesorías» para que tu asesor/a pueda trabajarlo. Aquí verás también las versiones mejoradas.' : 'La persona aún no sube su CV a VINKA. Pídeselo por el chat: lo puede subir en Perfil → «CV para mis asesorías».'}</p>}
      {d.files.map((f) => (
        <div key={f.id} className="flex items-center gap-3 rounded-xl border border-linea bg-white p-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${f.kind === 'mejorado' ? 'bg-[#EAF6EF] text-[#134A2B]' : 'bg-[#F4EEF2] text-tinta-2'}`}>v{f.version}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold">{f.file_name || 'CV'}</span>
            <span className="text-xs text-tinta-3">{f.kind === 'mejorado' ? 'Versión mejorada' : 'Subido por la persona'} · {fmtDate(f.created_at)}{f.request_id === requestId ? ' · esta asesoría' : ''}</span>
            {f.note && <span className="text-xs text-tinta-2">«{f.note}»</span>}
          </span>
          <FileLink url={urls[f.file_path]} className="btn-sm shrink-0 border border-linea bg-white">Abrir</FileLink>
        </div>
      ))}
      {canUpload && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-[#D9CCE6] bg-[#FBF7FD] p-3">
          <span className="text-[13px] font-semibold text-[#4A2163]">Subir versión mejorada</span>
          <input className="input h-11 bg-white" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Qué cambiaste (queda en el historial)" />
          <input ref={input} type="file" accept={CV_ACCEPT} className="hidden" onChange={onFile} />
          <button className="btn-sm self-start bg-morado text-white" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Subiendo…' : 'Elegir archivo'}</button>
        </div>
      )}
      <ErrorBox>{err}</ErrorBox>
    </div>
  )
}

/* ---------- Búsquedas y ofertas sugeridas ---------- */
export function PicksTab({ requestId, canEdit, asCandidate = false }) {
  const [picks, setPicks] = useState(null)
  const [q, setQ] = useState('')
  const [comuna, setComuna] = useState('')
  const [res, setRes] = useState(null)
  const [ext, setExt] = useState(null)
  const [err, setErr] = useState('')
  const load = useCallback(() => { supabase.from('service_job_picks').select('*').eq('request_id', requestId).order('created_at', { ascending: false }).then(({ data }) => setPicks(data || [])) }, [requestId])
  useEffect(() => { load() }, [load])
  const search = async (e) => {
    e.preventDefault(); setErr('')
    const { data, error } = await supabase.rpc('advisor_search_jobs', { p_request: requestId, p_q: q, p_comuna: comuna })
    if (error) return setErr(errMsg(error))
    setRes(data || [])
  }
  const add = async (job, extra = {}) => {
    setErr('')
    const { error } = await supabase.rpc('add_job_pick', { p_request: requestId, p_job: job?.id || null, p_title: extra.title || null, p_company: extra.company || null, p_comuna: extra.comuna || null, p_url: extra.url || null, p_note: extra.note || '' })
    if (error) return setErr(errMsg(error))
    setExt(null); load()
  }
  const status = async (p, s) => {
    const { error } = await supabase.rpc('set_job_pick_status', { p_id: p.id, p_status: s })
    if (error) setErr(errMsg(error)); else load()
  }
  const picked = new Set((picks || []).map((p) => p.job_id).filter(Boolean))
  return (
    <div className="flex flex-col gap-3">
      {canEdit && (
        <form onSubmit={search} className="flex flex-col gap-2 rounded-xl bg-[#FAF7F9] p-3">
          <span className="text-[13px] font-semibold">Buscar vacantes en VINKA</span>
          <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
            <input className="input h-11 bg-white" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cargo, área o empresa" />
            <input className="input h-11 bg-white" value={comuna} onChange={(e) => setComuna(e.target.value)} placeholder="Comuna o región" />
            <button className="btn-sm h-11 bg-morado px-4 text-white">Buscar</button>
          </div>
          <span className="text-[11px] text-tinta-suave">Cada búsqueda queda registrada en el historial de la asesoría.</span>
          {res && (res.length === 0 ? <span className="text-sm text-tinta-3">Sin resultados. Prueba con otras palabras o agrega una oferta externa.</span> : res.map((j) => (
            <div key={j.id} className="flex items-center gap-2 rounded-lg bg-white p-2.5 text-sm">
              <span className="flex min-w-0 flex-1 flex-col"><b className="truncate">{j.title}</b><span className="truncate text-xs text-tinta-3">{j.company} · {j.comuna || j.region || 'Remoto'} · {j.modality}</span></span>
              {picked.has(j.id) ? <span className="text-xs text-tinta-suave">Sugerida</span> : <button type="button" className="btn-sm shrink-0 border border-rosa-accion bg-white text-rosa-texto" onClick={() => add(j)}>Sugerir</button>}
            </div>
          )))}
          {!ext ? <button type="button" className="self-start text-xs font-semibold text-rosa-texto" onClick={() => setExt({ title: '', company: '', comuna: '', url: '', note: '' })}>+ Agregar oferta de otro portal</button> : (
            <div className="flex flex-col gap-2 rounded-lg bg-white p-2.5">
              <div className="grid grid-cols-2 gap-2">
                <input className="input h-10" placeholder="Cargo" value={ext.title} onChange={(e) => setExt({ ...ext, title: e.target.value })} />
                <input className="input h-10" placeholder="Empresa" value={ext.company} onChange={(e) => setExt({ ...ext, company: e.target.value })} />
              </div>
              <input className="input h-10" placeholder="Enlace de la oferta (https://…)" value={ext.url} onChange={(e) => setExt({ ...ext, url: e.target.value })} />
              <input className="input h-10" placeholder="Por qué le sirve (opcional)" value={ext.note} onChange={(e) => setExt({ ...ext, note: e.target.value })} />
              <div className="flex gap-2"><button type="button" className="btn-sm border border-linea bg-white" onClick={() => setExt(null)}>Cancelar</button><button type="button" className="btn-sm bg-morado text-white" onClick={() => add(null, ext)}>Agregar</button></div>
            </div>
          )}
        </form>
      )}
      <ErrorBox>{err}</ErrorBox>
      <span className="text-[13px] font-semibold">{asCandidate ? 'Ofertas que te recomendó tu asesor/a' : 'Ofertas sugeridas'} ({picks?.length || 0})</span>
      {picks == null ? <Spinner /> : picks.length === 0 ? <p className="text-sm text-tinta-3">{asCandidate ? 'Aún no hay ofertas sugeridas.' : 'Todavía no sugieres ofertas.'}</p> : picks.map((p) => (
        <div key={p.id} className="flex flex-col gap-1.5 rounded-xl border border-linea bg-white p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <span className="flex flex-col"><b>{p.title}</b><span className="text-xs text-tinta-3">{[p.company, p.comuna].filter(Boolean).join(' · ')}{p.job_id ? ' · en VINKA' : ' · otro portal'}</span></span>
            <span className="pill shrink-0 bg-[#F4EEF2] text-tinta-2">{PICK_STATUS[p.status]}</span>
          </div>
          {p.note && <span className="text-xs text-tinta-2">«{p.note}»</span>}
          <div className="flex flex-wrap gap-2">
            {p.job_id && <a className="text-xs font-semibold text-rosa-texto" href={`/empleo/${p.job_id}`} target="_blank" rel="noreferrer">Ver vacante</a>}
            {p.url && <a className="text-xs font-semibold text-rosa-texto" href={p.url} target="_blank" rel="noreferrer noopener">Abrir oferta</a>}
            {(asCandidate || canEdit) && Object.entries(PICK_STATUS).filter(([k]) => k !== p.status && k !== 'sugerida').map(([k, l]) => (
              <button key={k} className="text-xs font-semibold text-tinta-3 underline" onClick={() => status(p, k)}>{asCandidate && k === 'postulo' ? 'Ya postulé' : l}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------- Calendario de sesiones ---------- */
const localInput = (d) => toInputLocal(d)
export function SessionsTab({ requestId, canEdit, asCandidate = false }) {
  const [list, setList] = useState(null)
  const [f, setF] = useState(null)
  const [err, setErr] = useState('')
  const load = useCallback(() => { supabase.from('service_sessions').select('*').eq('request_id', requestId).order('starts_at').then(({ data }) => setList(data || [])) }, [requestId])
  useEffect(() => { load() }, [load])
  const save = async () => {
    setErr('')
    if (!f.starts) return setErr('Elige fecha y hora')
    const { error } = await supabase.rpc('save_service_session', { p_id: f.id || null, p_request: requestId, p_starts: fromInputLocal(f.starts).toISOString(), p_minutes: Number(f.minutes) || 45, p_mode: f.mode, p_link: f.link.trim(), p_place: f.place, p_status: f.status, p_summary: f.summary })
    if (error) return setErr(errMsg(error))
    setF(null); load()
  }
  const now = Date.now()
  return (
    <div className="flex flex-col gap-2">
      {list == null ? <Spinner /> : list.length === 0 && !f ? <p className="text-sm text-tinta-3">{asCandidate ? 'Tu asesor/a agendará las sesiones aquí.' : 'Aún no hay sesiones agendadas.'}</p> : list.map((s) => (
        <div key={s.id} className={`flex flex-col gap-1 rounded-xl border p-3 text-sm ${s.status === 'agendada' && new Date(s.starts_at) > now ? 'border-[#1F6F78] bg-[#EEF7F8]' : 'border-linea bg-white'}`}>
          <div className="flex items-start justify-between gap-2"><b>{fmtDateTime(s.starts_at)} · {s.minutes} min</b><span className="pill shrink-0 bg-white text-tinta-2">{SESSION_STATUS[s.status]}</span></div>
          <span className="text-xs text-tinta-3">{s.mode === 'videollamada' ? 'Videollamada' : `Presencial${s.place ? ` · ${s.place}` : ''}`}</span>
          {s.link && s.status === 'agendada' && <a href={s.link} target="_blank" rel="noreferrer noopener" className="btn-sm self-start bg-[#1F6F78] text-white">Entrar a la videollamada</a>}
          {s.summary && <span className="text-xs text-tinta-2">{s.summary}</span>}
          {canEdit && <button className="self-start text-xs font-semibold text-rosa-texto" onClick={() => setF({ id: s.id, starts: localInput(s.starts_at), minutes: s.minutes, mode: s.mode, link: s.link, place: s.place, status: s.status, summary: s.summary })}>Actualizar</button>}
        </div>
      ))}
      {canEdit && !f && <button className="btn-sm self-start bg-morado text-white" onClick={() => setF({ starts: '', minutes: 45, mode: 'videollamada', link: '', place: '', status: 'agendada', summary: '' })}>Agendar sesión</button>}
      {f && (
        <div className="flex flex-col gap-2 rounded-xl bg-[#FAF7F9] p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1"><span className="text-xs text-tinta-3">Fecha y hora (de Chile)</span><input type="datetime-local" className="input h-11 bg-white" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} /></label>
            <label className="flex flex-col gap-1"><span className="text-xs text-tinta-3">Duración (min)</span><input type="number" min={10} max={240} className="input h-11 bg-white" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} /></label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select className="input h-11 bg-white" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="videollamada">Videollamada</option><option value="presencial">Presencial</option></select>
            <select className="input h-11 bg-white" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{Object.entries(SESSION_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </div>
          {f.mode === 'videollamada' ? <input className="input h-11 bg-white" placeholder="Enlace de Meet, Zoom o Teams (https://…)" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} />
            : <input className="input h-11 bg-white" placeholder="Lugar (ej.: oficina VINKA, Talca)" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} />}
          <textarea className="textarea h-20 bg-white" maxLength={2000} placeholder="Resumen de la sesión (lo verá la persona)" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
          <div className="flex gap-2"><button className="btn-sm border border-linea bg-white" onClick={() => setF(null)}>Cancelar</button><button className="btn-sm bg-morado text-white" onClick={save}>Guardar</button></div>
        </div>
      )}
      <ErrorBox>{err}</ErrorBox>
    </div>
  )
}

/* ---------- Historial de trabajo ---------- */
export function LogTab({ requestId, canEdit, asCandidate = false }) {
  const [list, setList] = useState(null)
  const [f, setF] = useState(null)
  const [err, setErr] = useState('')
  const load = useCallback(() => { supabase.from('service_logs').select('*').eq('request_id', requestId).order('created_at', { ascending: false }).then(({ data }) => setList(data || [])) }, [requestId])
  useEffect(() => { load() }, [load])
  const save = async () => {
    setErr('')
    const { error } = await supabase.rpc('add_service_log', { p_request: requestId, p_kind: f.kind, p_title: f.title, p_detail: f.detail, p_minutes: f.minutes ? Number(f.minutes) : null, p_visible: f.visible })
    if (error) return setErr(errMsg(error))
    setF(null); load()
  }
  const total = (list || []).reduce((a, l) => a + (l.minutes || 0), 0)
  return (
    <div className="flex flex-col gap-2">
      {!asCandidate && total > 0 && <span className="text-xs text-tinta-3">Tiempo registrado: <b>{Math.floor(total / 60)} h {total % 60} min</b></span>}
      {canEdit && !f && <button className="btn-sm self-start bg-morado text-white" onClick={() => setF({ kind: 'cv', title: '', detail: '', minutes: '', visible: true })}>Registrar trabajo</button>}
      {f && (
        <div className="flex flex-col gap-2 rounded-xl bg-[#FAF7F9] p-3">
          <div className="grid grid-cols-[1fr_110px] gap-2">
            <select className="input h-11 bg-white" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{['cv', 'sesion', 'busqueda', 'oferta', 'seguimiento', 'nota'].map((k) => <option key={k} value={k}>{k === 'seguimiento' ? 'Seguimiento (WhatsApp o chat)' : LOG_KIND[k][0]}</option>)}</select>
            <input type="number" min={0} max={600} className="input h-11 bg-white" placeholder="Minutos" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} />
          </div>
          <input className="input h-11 bg-white" maxLength={200} placeholder="Qué hiciste (ej.: reescribí el resumen profesional)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <textarea className="textarea h-20 bg-white" maxLength={3000} placeholder="Detalle (opcional)" value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.visible} onChange={(e) => setF({ ...f, visible: e.target.checked })} className="h-4 w-4 accent-[#D02E72]" />Visible para la persona (si no, solo lo ve VINKA)</label>
          <div className="flex gap-2"><button className="btn-sm border border-linea bg-white" onClick={() => setF(null)}>Cancelar</button><button className="btn-sm bg-morado text-white" onClick={save}>Guardar</button></div>
        </div>
      )}
      <ErrorBox>{err}</ErrorBox>
      {list == null ? <Spinner /> : list.length === 0 ? <p className="text-sm text-tinta-3">Sin registros todavía.</p> : (
        <ol className="flex flex-col">
          {list.map((l, i) => (
            <li key={l.id} className="flex gap-3">
              <div className="flex flex-col items-center"><span className="mt-1.5 h-2.5 w-2.5 rounded-full" style={{ background: LOG_KIND[l.kind]?.[1] || '#CFC3CB' }} />{i < list.length - 1 && <span className="w-px flex-1 bg-[#EEE3EA]" />}</div>
              <div className="flex flex-1 flex-col pb-3">
                <span className="text-sm font-medium">{l.title}{!l.visible && <span className="ml-1.5 rounded bg-[#F4EEF2] px-1 text-[10px] font-semibold text-tinta-3">interno</span>}</span>
                {l.detail && <span className="whitespace-pre-wrap text-xs text-tinta-2">{l.detail}</span>}
                <span className="text-[11px] text-tinta-suave">{fmtDateTime(l.created_at)} · {LOG_KIND[l.kind]?.[0]}{!asCandidate ? ` · ${AUTHOR[l.author_kind]}` : ''}{l.minutes ? ` · ${l.minutes} min` : ''}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/* ---------- Avance de lo vendido (se mide en el expediente) ---------- */
// Plazos: días entre hoy y la fecha comprometida, en días calendario de Chile
const daysLeft = (due) => Math.round((new Date(ymd(new Date(due))) - new Date(ymd(new Date()))) / 864e5)
export function dueText(x) {
  if (!x) return ''
  const d = daysLeft(x.due)
  if (x.late) return d === 0 ? 'Atrasado: vencía hoy' : `Atrasado ${-d} ${-d === 1 ? 'día' : 'días'}`
  return d <= 0 ? 'Vence hoy' : d === 1 ? 'Vence mañana' : `Vence en ${d} días`
}

/** Próximo hito en una línea (listas de asesorías): qué toca, quién, para cuándo y si está atrasado */
export function NextStep({ next }) {
  if (!next) return null
  const tone = next.late ? 'border-[#F5C2C0] bg-[#FEF3F2] text-[#912018]' : daysLeft(next.due) <= 1 ? 'border-[#F6D9A8] bg-naranja-palido text-[#4A2A00]' : 'border-[#E4D8EE] bg-[#F7F0FB] text-[#3D2350]'
  return (
    <div className={`flex flex-col gap-0.5 rounded-xl border px-3 py-2 text-[13px] leading-snug ${tone}`}>
      <span><b>Próximo hito:</b> {next.label}</span>
      <span className="text-xs">Responsable: <b>{next.who}</b> · Fecha comprometida: <b>{fmtDateTime(next.due)}</b> · <b>{dueText(next)}</b></span>
    </div>
  )
}

/** Todos los hitos de la asesoría con su fecha comprometida */
export function ServiceTimeline({ requestId }) {
  const [d, setD] = useState(null)
  useEffect(() => { supabase.rpc('service_deadline', { p_id: requestId }).then(({ data }) => setD(data)) }, [requestId])
  if (!d || !(d.milestones || []).length) return null
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-linea bg-white p-3">
      <span className="text-sm font-semibold">Plazos de la asesoría</span>
      <ol className="flex flex-col gap-1.5">
        {d.milestones.map((x) => (
          <li key={x.key} className="flex items-start gap-2 text-[13px] leading-snug">
            <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${x.done ? 'bg-[#2F7A4F]' : x.late ? 'bg-[#B42318]' : 'bg-[#C9BDC6]'}`}>{x.done ? '✓' : x.late ? '!' : ''}</span>
            <span className="flex flex-col"><span className={x.done ? 'text-tinta-3 line-through' : 'text-tinta'}>{x.label}</span>
              <span className="text-xs text-tinta-3">{x.who} · {fmtDateTime(x.due)}{x.done ? ' · listo' : ` · ${dueText(x)}`}</span></span>
          </li>
        ))}
      </ol>
      <span className="text-[11px] text-tinta-suave">Días hábiles de lunes a viernes, hora de Chile.</span>
    </div>
  )
}

export function ServiceProgress({ requestId, as, onLoad, refresh = 0 }) {
  const [items, setItems] = useState(null)
  useEffect(() => {
    supabase.rpc('service_progress', { p_id: requestId }).then(({ data }) => { setItems(data || []); onLoad?.(data || []) })
    const t = setInterval(() => supabase.rpc('service_progress', { p_id: requestId }).then(({ data }) => { setItems(data || []); onLoad?.(data || []) }), 20000)
    return () => clearInterval(t)
  }, [requestId, refresh]) // eslint-disable-line
  if (!items || items.length === 0) return null
  const done = items.filter((x) => x.ok).length
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-[#E4D8EE] bg-white p-3">
      <span className="text-[13px] font-semibold">{as === 'candidate' ? 'Lo que incluye tu asesoría' : 'Lo que se vendió'} · {done} de {items.length} listo</span>
      {items.map((x) => (
        <span key={x.key} className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2"><span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${x.ok ? 'bg-[#EAF6EF] text-[#1E6B3F]' : 'bg-[#F4EEF2] text-tinta-suave'}`}>{x.ok ? '✓' : ''}</span>{x.label}</span>
          <span className={`shrink-0 text-xs font-semibold ${x.ok ? 'text-[#1E6B3F]' : 'text-tinta-3'}`}>{x.have} de {x.need}</span>
        </span>
      ))}
      {as !== 'candidate' && done < items.length && <span className="text-[11px] text-tinta-suave">Se cuenta solo: CV mejorado en Word y en PDF (subido en «Entregables», en la pestaña CV o por el chat), sesiones marcadas como realizadas, ofertas sugeridas y seguimientos registrados en el historial.</span>}
    </div>
  )
}

/**
 * Entregables del asesor/a: el CV mejorado en Word y en PDF se sube aquí mismo, sin cambiar de pestaña.
 * Queda como versión mejorada del CV de la persona (igual que en la pestaña CV) y cuenta para poder entregar.
 */
export function Deliverables({ requestId, onChange }) {
  const [items, setItems] = useState(null)
  const [cand, setCand] = useState(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const word = useRef(); const pdf = useRef()
  const load = useCallback(() => {
    supabase.rpc('service_progress', { p_id: requestId }).then(({ data }) => setItems((data || []).filter((x) => x.key.startsWith('advisor_files'))))
  }, [requestId])
  useEffect(() => { load(); supabase.rpc('request_cvs', { p_request: requestId }).then(({ data }) => setCand(data?.candidate_id || null)) }, [load, requestId])
  if (!items || items.length === 0) return null
  const onFile = (kind) => async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    const ok = kind === 'word' ? /\.(docx?|DOCX?)$/.test(f.name) : /\.(pdf|PDF)$/.test(f.name)
    if (!ok) return setErr(kind === 'word' ? 'Ese archivo no es Word (.docx o .doc).' : 'Ese archivo no es PDF.')
    if (!cand) return setErr('No pudimos identificar a la persona. Recarga la página.')
    setBusy(kind); setErr('')
    try { await uploadCv(cand, f, { requestId, note: kind === 'word' ? 'CV mejorado (Word)' : 'CV mejorado (PDF)' }); load(); onChange?.() } catch (x) { setErr(x.message) } finally { setBusy('') }
  }
  const slot = (key, label, ref, kind, accept) => {
    const it = items.find((x) => x.key === key)
    if (!it) return null
    return (
      <div className={`flex items-center gap-3 rounded-xl border p-3 ${it.ok ? 'border-[#A9D9BC] bg-[#EFF9F2]' : 'border-dashed border-[#D9CCE6] bg-[#FBF7FD]'}`}>
        <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${it.ok ? 'bg-[#1E6B3F] text-white' : 'bg-white text-tinta-3'}`}>{it.ok ? '✓' : kind === 'word' ? 'W' : 'PDF'}</span>
        <span className="flex min-w-0 flex-1 flex-col"><span className="text-sm font-semibold">{label}</span><span className="text-xs text-tinta-3">{it.ok ? 'Listo. Puedes subir otra versión si la corriges.' : 'Pendiente'}</span></span>
        <input ref={ref} type="file" accept={accept} className="hidden" onChange={onFile(kind)} />
        <button className={`btn-sm shrink-0 ${it.ok ? 'border border-linea bg-white' : 'bg-morado text-white'}`} disabled={!!busy} onClick={() => ref.current?.click()}>{busy === kind ? 'Subiendo…' : it.ok ? 'Reemplazar' : 'Subir'}</button>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold">Entregables</span>
      {slot('advisor_files_word', 'CV mejorado en Word', word, 'word', '.docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword')}
      {slot('advisor_files_pdf', 'CV mejorado en PDF', pdf, 'pdf', '.pdf,application/pdf')}
      <ErrorBox>{err}</ErrorBox>
    </div>
  )
}

/* ---------- Notas internas asesor ↔ VINKA ---------- */
const CASE_ST = { solicitada: 'solicitada', pago_pendiente: 'pago pendiente', en_curso: 'en curso', entregada: 'entregada', aprobada: 'aprobada', cancelada: 'cancelada' }
/** Notas internas asesor/a ↔ VINKA. Cada nota indica el caso (persona, servicio, estado) y enlaza a él. */
export function TeamNotes({ advisorId = null, requestId = null, as }) {
  const [d, setD] = useState(null)
  const [body, setBody] = useState('')
  const [about, setAbout] = useState('')
  const [err, setErr] = useState('')
  const end = useRef()
  const load = useCallback(() => {
    supabase.rpc('team_notes_list', { p_advisor: advisorId, p_request: requestId }).then(({ data, error }) => { if (error) setErr(errMsg(error)); else setD(data) })
  }, [advisorId, requestId])
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t) }, [load])
  const list = d?.notes
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [list?.length])
  const caseLink = (id) => (as === 'admin' ? `/asesorias?caso=${id}` : `/?caso=${id}`)
  const send = async () => {
    setErr('')
    const { error } = await supabase.rpc('send_team_note', { p_advisor: advisorId, p_request: requestId || about || null, p_body: body })
    if (error) return setErr(errMsg(error))
    setBody(''); load()
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] text-tinta-suave">Solo lo ven {as === 'admin' ? 'el asesor/a y VINKA' : 'tú y el equipo de VINKA'}. La persona asesorada no ve estas notas.</span>
      <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto rounded-xl bg-[#F6F4F8] p-3">
        {list == null ? <span className="text-center text-xs text-tinta-suave">Cargando…</span> : list.length === 0 ? <span className="py-2 text-center text-xs text-tinta-suave">Sin notas todavía.</span> : list.map((m) => {
          const mine = m.sender_kind === as
          return (
            <div key={m.id} className={`flex max-w-[85%] flex-col gap-0.5 ${mine ? 'self-end items-end' : 'self-start items-start'}`}>
              <span className="text-[11px] font-semibold text-tinta-suave">{mine ? 'Tú' : m.sender_kind === 'admin' ? 'VINKA' : 'Asesor/a'} · {fmtDateTime(m.created_at)}</span>
              {!requestId && (m.case ? (
                <a href={caseLink(m.request_id)} className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-morado underline-offset-2 hover:underline">
                  Caso: {m.case.name} · {m.case.service} · {CASE_ST[m.case.status] || m.case.status} →
                </a>
              ) : <span className="text-[11px] text-tinta-suave">Nota general (sin caso)</span>)}
              <span className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-morado text-white' : 'border border-linea bg-white'}`}>{m.body}</span>
            </div>
          )
        })}
        <div ref={end} />
      </div>
      {!requestId && (d?.cases || []).length > 0 && (
        <label className="flex items-center gap-2 text-[13px]"><span className="shrink-0 font-semibold text-tinta-3">Sobre</span>
          <select className="h-10 min-w-0 flex-1 rounded-lg border border-linea bg-white px-2 text-[13px]" value={about} onChange={(e) => setAbout(e.target.value)}>
            <option value="">Tema general (sin caso)</option>
            {d.cases.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.service} · {CASE_ST[c.status] || c.status}</option>)}
          </select>
        </label>
      )}
      <div className="flex items-end gap-2">
        <textarea className="textarea min-h-[44px] flex-1 py-2.5" rows={1} maxLength={3000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={as === 'admin' ? 'Escribe al asesor/a' : 'Escribe a VINKA (dudas, avances, problemas)'} />
        <button aria-label="Enviar" disabled={!body.trim()} onClick={send} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-morado text-white disabled:opacity-40"><Svg name="send" size={20} /></button>
      </div>
      <ErrorBox>{err}</ErrorBox>
    </div>
  )
}

/** Expediente completo de una asesoría para el asesor/a o la administración */
export function Dossier({ r, as, counts = {}, onProgress }) {
  const closed = ['aprobada', 'cancelada'].includes(r.status)
  const canEdit = !closed && (as === 'admin' || r.status !== 'cancelada')
  const [tab, setTab] = useState('chat')
  const [bump, setBump] = useState(0)
  const tabs = [
    ['chat', 'Chat con la persona', counts.messages], ['cv', 'CV', counts.cvs], ['ofertas', 'Búsquedas y ofertas', counts.picks],
    ['sesiones', 'Sesiones', counts.sessions], ['historial', 'Historial', counts.logs], ['notas', 'Notas con VINKA', counts.notes],
  ]
  return (
    <div className="flex flex-col gap-3">
      <ServiceTimeline requestId={r.id} />
      <ServiceProgress requestId={r.id} as={as} refresh={bump} />
      {canEdit && ['en_curso', 'entregada'].includes(r.status) && <Deliverables requestId={r.id} onChange={() => { setBump((n) => n + 1); onProgress?.() }} />}
      <Tabs tabs={tabs} tab={tab} setTab={setTab} />
      {tab === 'chat' && <ServiceChat requestId={r.id} as={as} disabled={r.status === 'cancelada'} advisorName={r.assigned_name || r.advisor || ''} />}
      {tab === 'cv' && <CvTab key={bump} requestId={r.id} canUpload={canEdit} />}
      {tab === 'ofertas' && <PicksTab requestId={r.id} canEdit={canEdit} />}
      {tab === 'sesiones' && <SessionsTab requestId={r.id} canEdit={canEdit} />}
      {tab === 'historial' && <LogTab requestId={r.id} canEdit={canEdit} />}
      {tab === 'notas' && <TeamNotes requestId={r.id} advisorId={as === 'admin' ? r.advisor_id : null} as={as} />}
    </div>
  )
}

/** Vista de la persona asesorada: conversación, CV, sesiones, ofertas e historial visible */
export function CandidateDossier({ r }) {
  const [tab, setTab] = useState('chat')
  const tabs = [['chat', 'Conversación'], ['cv', 'Mi CV'], ['sesiones', 'Sesiones'], ['ofertas', 'Ofertas sugeridas'], ['historial', 'Avance']]
  return (
    <div className="flex flex-col gap-3">
      <Tabs tabs={tabs} tab={tab} setTab={setTab} />
      {tab === 'chat' && <ServiceChat requestId={r.id} as="candidate" disabled={r.status === 'cancelada'} advisorName={r.assigned_name || ''} />}
      {tab === 'cv' && <CvTab requestId={r.id} canUpload={false} asCandidate />}
      {tab === 'sesiones' && <SessionsTab requestId={r.id} canEdit={false} asCandidate />}
      {tab === 'ofertas' && <PicksTab requestId={r.id} canEdit={false} asCandidate />}
      {tab === 'historial' && <LogTab requestId={r.id} canEdit={false} asCandidate />}
    </div>
  )
}
