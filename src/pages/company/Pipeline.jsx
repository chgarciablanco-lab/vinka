import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { COLUMNAS, PLANTILLAS_BASE, TIPOS_PLANTILLA, colLabel, daysAgo, fillVars } from '../../lib/catalog'
import { fmtDayShort, fmtTime } from '../../lib/dates'
import { ErrorBox, Sheet, Spinner, Svg, Toast } from '../../components/ui'

export function useTemplates() {
  const { company } = useAuth()
  const [list, setList] = useState(null)
  const load = useCallback(() => {
    if (!company) return
    supabase.from('message_templates').select('*').eq('company_id', company.id).order('created_at').then(({ data }) => setList(data || []))
  }, [company])
  useEffect(() => { load() }, [load])
  return { templates: list?.length ? list : PLANTILLAS_BASE, custom: list || [], reload: load, loading: list == null }
}

/** Mensaje con plantilla y, opcionalmente, cambio de etapa para varios candidatos */
export function BulkSheet({ open, onClose, items, job, onDone, stage: initialStage = '' }) {
  const { company } = useAuth()
  const { templates } = useTemplates()
  const [stage, setStage] = useState(initialStage)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { if (open) { setStage(initialStage); setErr(''); setMsg('') } }, [open, initialStage])
  const chatable = items.filter((x) => x.kind === 'match' || (x.kind === 'interesado' && stage && stage !== 'descartado'))
  const silent = items.length - chatable.length
  const pick = (t) => setMsg(t.body)
  const run = async () => {
    setErr('')
    if (!stage && !msg.trim()) return setErr('Elige una etapa o escribe un mensaje.')
    setBusy(true)
    const { data, error } = await supabase.rpc('bulk_pipeline', {
      p_job: job.id, p_items: items.map((x) => ({ kind: x.kind, id: x.id })), p_stage: stage || null, p_message: msg.trim() || null,
    })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone?.(data)
  }
  const sample = items.find((x) => x.kind !== 'externo')
  return (
    <Sheet open={open} onClose={onClose} title={`${items.length} seleccionado${items.length === 1 ? '' : 's'}`}>
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="label mb-2">Mover a</legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`chip ${!stage ? 'chip-on' : ''}`} onClick={() => setStage('')}>No mover</button>
            {COLUMNAS.slice(1).map(([k, l]) => <button key={k} type="button" className={`chip ${stage === k ? 'chip-on' : ''}`} onClick={() => setStage(k)}>{l}</button>)}
          </div>
          {stage === 'descartado' && <span className="hint">Las personas con match reciben un aviso amable de cierre. Te recomendamos sumar un mensaje.</span>}
        </fieldset>
        <div className="flex flex-col gap-2">
          <span className="label">Mensaje por chat (opcional)</span>
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
            {templates.map((t) => <button key={t.id} type="button" onClick={() => pick(t)} className="chip h-9 shrink-0 text-[13px]">{t.name}</button>)}
          </div>
          <textarea className="textarea h-36" maxLength={2000} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Hola {nombre}, …" />
          <span className="hint">Usa {'{nombre}'}, {'{cargo}'} y {'{empresa}'}: se reemplazan para cada persona. <Link to="/plantillas" className="font-semibold text-rosa-texto">Editar plantillas</Link></span>
          {msg.trim() && sample && (
            <div className="rounded-xl bg-rosa-fondo p-3 text-[13px] leading-relaxed text-tinta-2"><b className="text-tinta">Vista previa:</b> {fillVars(msg, { nombre: (sample.name || '').split(' ')[0], cargo: job.title, empresa: company?.display_name })}</div>
          )}
          {msg.trim() && silent > 0 && <span className="hint">{silent} persona(s) no recibirán el mensaje: aún no tienen chat (postulantes sin match o de otros portales).</span>}
        </div>
        <ErrorBox>{err}</ErrorBox>
        <button className="btn" disabled={busy} onClick={run}>{busy ? 'Aplicando…' : stage ? `Mover${msg.trim() ? ' y enviar' : ''}` : 'Enviar mensaje'}</button>
      </div>
    </Sheet>
  )
}

function Card({ c, selecting, selected, onToggle, onOpen, onMove, canManage }) {
  return (
    <div draggable={canManage} onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify({ kind: c.kind, id: c.id }))}
      className={`card relative flex flex-col gap-1.5 p-3 ${selected ? 'border-rosa-accion ring-2 ring-rosa-accion/30' : ''}`}>
      <button type="button" onClick={selecting ? onToggle : onOpen} className="flex flex-col gap-1 text-left">
        <span className="flex items-center gap-2 pr-8">
          {selecting && <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${selected ? 'border-rosa-accion bg-rosa-accion text-white' : 'border-linea'}`}>{selected && <Svg name="check" size={14} width={3} />}</span>}
          <span className="truncate text-[15px] font-semibold">{c.name}</span>
        </span>
        <span className="truncate text-[13px] text-tinta-3">{c.headline || '—'}{c.comuna ? ` · ${c.comuna}` : ''}</span>
      </button>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
        {c.knocked_out && <span className="rounded-md bg-[#FEF3F2] px-1.5 py-0.5 text-[#912018]">No cumple filtro</span>}
        {c.kind === 'externo' && <span className="rounded-md bg-[#EEF2FA] px-1.5 py-0.5 text-[#2C4A8A]">{c.source === 'externo' ? 'Otro portal' : c.source}</span>}
        {c.fit != null && <span className="rounded-md bg-[#F7F0FB] px-1.5 py-0.5 text-[#6B2E8F]">IA {c.fit}%</span>}
        {c.eval_n > 0 && <span className="rounded-md bg-naranja-palido px-1.5 py-0.5 text-naranja-texto">★ {c.eval_avg} · {c.eval_n}</span>}
        {c.next_interview && <span className="rounded-md bg-[#E8F4F5] px-1.5 py-0.5 text-[#1F6F78]">{fmtDayShort(c.next_interview)} {fmtTime(c.next_interview)}</span>}
        {(c.tags || []).slice(0, 2).map((t) => <span key={t} className="rounded-md bg-[#F4EEF2] px-1.5 py-0.5 text-tinta-3">#{t}</span>)}
        <span className="ml-auto font-medium text-tinta-suave">{daysAgo(c.since)}</span>
      </div>
      {canManage && !selecting && (
        <button type="button" aria-label={`Mover a ${c.name}`} onClick={onMove} className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-full text-tinta-suave">
          <Svg name="chevron" size={18} />
        </button>
      )}
    </div>
  )
}

export default function Pipeline() {
  const { id } = useParams()
  const nav = useNavigate()
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [hideKo, setHideKo] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [sel, setSel] = useState([])
  const [bulk, setBulk] = useState(false)
  const [moving, setMoving] = useState(null)
  const [toast, setToast] = useState('')
  const [col, setCol] = useState('postulante')
  const strip = useRef()

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('job_pipeline', { p_job: id })
    if (error) return setErr(errMsg(error))
    setD(data)
  }, [id])
  useEffect(() => { load() }, [load])

  const cards = useMemo(() => (d?.cards || []).filter((c) => (!hideKo || !c.knocked_out) &&
    (!q.trim() || `${c.name} ${c.headline} ${(c.tags || []).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()))), [d, q, hideKo])
  const byCol = useMemo(() => Object.fromEntries(COLUMNAS.map(([k]) => [k, cards.filter((c) => c.stage === k)])), [cards])
  const key = (c) => `${c.kind}:${c.id}`
  const toggle = (c) => setSel((s) => (s.includes(key(c)) ? s.filter((x) => x !== key(c)) : [...s, key(c)]))
  const selected = (d?.cards || []).filter((c) => sel.includes(key(c)))

  const move = async (c, stage) => {
    setMoving(null)
    if (c.stage === stage) return
    const prev = d
    setD({ ...d, cards: d.cards.map((x) => (key(x) === key(c) ? { ...x, stage, kind: x.kind === 'interesado' && stage !== 'descartado' ? 'match' : x.kind, since: new Date().toISOString() } : x)) })
    const { error } = await supabase.rpc('pipeline_move', { p_kind: c.kind, p_id: c.id, p_job: id, p_stage: stage })
    if (error) { setD(prev); return setErr(errMsg(error)) }
    setToast(`${c.name} → ${colLabel(stage)}`)
    load()
  }
  const onDrop = (e, stage) => {
    e.preventDefault()
    try { const { kind, id: cid } = JSON.parse(e.dataTransfer.getData('text/plain')); const c = d.cards.find((x) => x.kind === kind && x.id === cid); if (c) move(c, stage) } catch { /* nada */ }
  }
  const goCol = (k) => {
    setCol(k)
    const el = document.getElementById(`col-${k}`)
    if (el && strip.current) strip.current.scrollTo({ left: el.offsetLeft - 16, behavior: 'smooth' })
  }
  const open = (c) => nav(c.kind === 'externo' ? `/vacantes/${id}/externo/${c.id}` : `/vacantes/${id}/candidato/${c.candidate_id || c.id}`)

  if (err && !d) return <div className="p-6"><ErrorBox>{err}</ErrorBox></div>
  if (!d) return <Spinner />
  const canManage = d.can_manage
  const total = d.cards.length
  const ko = d.cards.filter((c) => c.knocked_out).length

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col bg-[#FAF7F9] lg:max-w-none">
      <div className="safe-t border-b border-[#EEE3EA] bg-white px-3 pb-2">
        <div className="flex items-center gap-1">
          <button aria-label="Volver" onClick={() => nav('/')} className="flex h-11 w-11 items-center justify-center"><Svg name="back" /></button>
          <div className="flex min-w-0 flex-1 flex-col"><span className="text-[11px] text-tinta-suave">Proceso de selección · {total} personas</span><span className="truncate text-[15px] font-semibold">{d.job.title}</span></div>
          {canManage && <button onClick={() => { setSelecting(!selecting); setSel([]) }} className={`btn-sm h-10 px-3 ${selecting ? 'bg-morado text-white' : 'border border-linea bg-white'}`}>{selecting ? 'Listo' : 'Seleccionar'}</button>}
        </div>
        <div className="mt-1 flex items-center gap-2 px-1">
          <label className="relative flex-1"><span className="sr-only">Buscar</span>
            <Svg name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-suave" />
            <input className="input h-10 pl-9 text-[15px]" placeholder="Buscar nombre, cargo o #etiqueta" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          {d.job.questions?.length > 0 && (
            <button onClick={() => setHideKo(!hideKo)} aria-pressed={hideKo} className={`chip h-10 shrink-0 px-3 text-[13px] ${hideKo ? 'chip-on' : ''}`}>Ocultar no cumplen ({ko})</button>
          )}
        </div>
        <div className="-mx-3 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {COLUMNAS.map(([k, l, color]) => (
            <button key={k} onClick={() => goCol(k)} className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold ${col === k ? 'border-transparent text-white' : 'border-linea bg-white text-tinta-2'}`} style={col === k ? { background: color } : {}}>
              {l}<span className={`rounded-full px-1.5 text-[11px] ${col === k ? 'bg-white/25' : 'bg-[#F4EEF2]'}`}>{byCol[k].length}</span>
            </button>
          ))}
        </div>
      </div>
      <ErrorBox>{err}</ErrorBox>
      <div ref={strip} className="flex flex-1 snap-x snap-mandatory gap-3 overflow-x-auto px-4 py-3"
        onScroll={(e) => { const i = Math.round(e.currentTarget.scrollLeft / (e.currentTarget.firstChild?.offsetWidth + 12 || 1)); if (COLUMNAS[i] && COLUMNAS[i][0] !== col) setCol(COLUMNAS[i][0]) }}>
        {COLUMNAS.map(([k, l, color]) => (
          <section key={k} id={`col-${k}`} aria-label={l} onDragOver={(e) => canManage && e.preventDefault()} onDrop={(e) => onDrop(e, k)}
            className="flex w-[85%] shrink-0 snap-start flex-col gap-2 lg:w-72">
            <div className="flex items-center gap-2 px-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} /><span className="text-sm font-bold">{l}</span><span className="text-xs text-tinta-suave">{byCol[k].length}</span>
              {selecting && byCol[k].length > 0 && <button className="ml-auto text-xs font-semibold text-rosa-texto" onClick={() => setSel((s) => [...new Set([...s, ...byCol[k].map(key)])])}>Todos</button>}
            </div>
            <div className="flex flex-col gap-2 overflow-y-auto pb-28">
              {byCol[k].length === 0 && <div className="rounded-2xl border border-dashed border-linea px-3 py-6 text-center text-xs text-tinta-suave">{k === 'postulante' ? 'Aquí llegan quienes dicen "Me interesa" a esta vacante.' : 'Sin personas en esta etapa.'}</div>}
              {byCol[k].map((c) => (
                <Card key={key(c)} c={c} canManage={canManage} selecting={selecting} selected={sel.includes(key(c))} onToggle={() => toggle(c)} onOpen={() => open(c)} onMove={() => setMoving(c)} />
              ))}
            </div>
          </section>
        ))}
      </div>
      {selecting && sel.length > 0 && (
        <div className="safe-b fixed bottom-0 left-1/2 z-30 flex w-full max-w-md -translate-x-1/2 items-center gap-2 border-t border-[#EEE3EA] bg-white px-4 pt-3">
          <span className="flex-1 text-sm font-semibold">{sel.length} seleccionado{sel.length === 1 ? '' : 's'}</span>
          <button className="btn-sm bg-rosa-accion text-white" onClick={() => setBulk(true)}>Mover o escribir</button>
        </div>
      )}
      <BulkSheet open={bulk} onClose={() => setBulk(false)} items={selected} job={d.job}
        onDone={(r) => { setBulk(false); setSelecting(false); setSel([]); setToast(`Listo: ${r.moved} movido(s), ${r.sent} mensaje(s) enviado(s).`); load() }} />
      <Sheet open={!!moving} onClose={() => setMoving(null)} title={moving ? `Mover a ${moving.name}` : ''}>
        {moving && (
          <div className="flex flex-col gap-2">
            {COLUMNAS.slice(1).map(([k, l, color]) => (
              <button key={k} disabled={moving.stage === k} onClick={() => move(moving, k)}
                className="flex h-12 items-center gap-3 rounded-xl border border-linea px-4 text-left text-[15px] font-semibold disabled:opacity-40">
                <span className="h-3 w-3 rounded-full" style={{ background: color }} />{l}{moving.stage === k && <span className="ml-auto text-xs font-medium text-tinta-suave">Etapa actual</span>}
              </button>
            ))}
            {moving.kind === 'interesado' && <p className="hint mt-1">Al moverlo a cualquier etapa (salvo Descartado) se crea el match y podrán conversar.</p>}
            <button className="btn-sec mt-2" onClick={() => { const c = moving; setMoving(null); open(c) }}>Ver ficha completa</button>
          </div>
        )}
      </Sheet>
      <Toast msg={toast} onDone={() => setToast('')} />
    </div>
  )
}
