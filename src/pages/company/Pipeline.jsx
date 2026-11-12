import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { COLUMNAS, PLANTILLAS_BASE, TIPOS_PLANTILLA, colLabel, daysAgo, fillVars } from '../../lib/catalog'
import { fmtDayShort, fmtTime } from '../../lib/dates'
import { ErrorBox, Sheet, Spinner, Svg, Toast } from '../../components/ui'
import { usePresence } from '../../lib/presence'
import { PresenceLine } from '../../components/Presence'
import { pl, plw } from '../../lib/text'
import { useDialogFocus } from '../../lib/useDialogFocus'

import { CollabBar } from '../community/Community'

const CandidateDetail = lazy(() => import('./CandidateDetail'))

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
export function BulkSheet({ open, onClose, items, job, onDone, stage: initialStage = '', mode = 'move' }) {
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
    <Sheet open={open} onClose={onClose} title={mode === 'message' ? `Mensaje a ${pl(items.length, 'persona', 'personas')}` : `Mover ${pl(items.length, 'persona', 'personas')}`}>
      <div className="flex flex-col gap-4">
        {mode !== 'message' && <fieldset className="flex flex-col gap-2">
          <legend className="label mb-2">Mover a</legend>
          <div className="grid grid-cols-2 gap-2">
            {[['', 'No mover', '#CFC3CB'], ...COLUMNAS.slice(1)].map(([k, l, color]) => (
              <button key={k || 'none'} type="button" aria-pressed={stage === k} onClick={() => setStage(k)}
                className={`flex h-11 items-center gap-2 rounded-xl border px-3 text-left text-[14px] font-semibold ${stage === k ? 'border-rosa-accion bg-rosa-fondo ring-1 ring-rosa-accion' : 'border-linea bg-white'} ${k === 'descartado' ? 'text-[#B42318]' : ''}`}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />{l}
              </button>
            ))}
          </div>
          {stage === 'descartado' && <span className="hint">Las personas con match reciben un aviso amable de cierre. Te recomendamos sumar un mensaje.</span>}
        </fieldset>}
        <div className="flex flex-col gap-2">
          <span className="label">{mode === 'message' ? 'Mensaje por chat' : 'Mensaje por chat (opcional)'}</span>
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
            {templates.map((t) => <button key={t.id} type="button" onClick={() => pick(t)} className="chip h-9 shrink-0 text-[13px]">{t.name}</button>)}
          </div>
          <textarea className="textarea h-36" maxLength={2000} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Hola {nombre}, …" />
          <span className="hint">Usa {'{nombre}'}, {'{cargo}'} y {'{empresa}'}: se reemplazan para cada persona. <Link to="/plantillas" className="font-semibold text-rosa-texto">Editar plantillas</Link></span>
          {msg.trim() && sample && (
            <div className="rounded-xl bg-rosa-fondo p-3 text-[13px] leading-relaxed text-tinta-2"><b className="text-tinta">Vista previa:</b> {fillVars(msg, { nombre: (sample.name || '').split(' ')[0], cargo: job.title, empresa: company?.display_name })}</div>
          )}
          {msg.trim() && silent > 0 && <span className="hint">{pl(silent, 'persona', 'personas')} no {plw(silent, 'recibirá', 'recibirán')} el mensaje: aún no tienen chat (postulantes sin match o de otros portales).</span>}
        </div>
        <ErrorBox>{err}</ErrorBox>
        <button className="btn" disabled={busy} onClick={run}>{busy ? 'Aplicando…' : stage ? `Mover${msg.trim() ? ' y enviar' : ''}` : 'Enviar mensaje'}</button>
      </div>
    </Sheet>
  )
}

// Etapa siguiente en el flujo normal
export const NEXT = { postulante: 'match', match: 'contacto', contacto: 'entrevista', entrevista: 'oferta', oferta: 'contratado' }
const SHORT = { postulante: 'Postulantes', match: 'Match', contacto: 'Contacto', entrevista: 'Entrevista', oferta: 'Oferta', contratado: 'Contratados', descartado: 'Descartados' }
const colorOf = (k) => (COLUMNAS.find((c) => c[0] === k) || [])[2] || '#6B5F6E'

/** Lista ordenada de etapas para mover a una persona; "Descartar" va aparte */
export function StagePicker({ current, onPick, kind }) {
  const steps = COLUMNAS.filter(([k]) => k !== 'postulante' && k !== 'descartado')
  const next = NEXT[current]
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col">
        {steps.map(([k, l, color], i) => {
          const here = current === k
          return (
            <li key={k} className="flex items-stretch gap-3">
              <div className="flex w-7 flex-col items-center">
                <span className={`mt-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${here ? 'text-white' : 'border-2 bg-white'}`} style={here ? { background: color } : { borderColor: color, color }}>{i + 1}</span>
                {i < steps.length - 1 && <span className="w-0.5 flex-1 bg-[#EEE3EA]" />}
              </div>
              <button type="button" disabled={here} onClick={() => onPick(k)}
                className={`my-1 flex min-h-[48px] flex-1 items-center justify-between gap-2 rounded-xl px-3 text-left text-[15px] font-semibold ${here ? 'bg-[#F4EEF2] text-tinta-3' : next === k ? 'border-2 border-rosa-accion bg-rosa-fondo' : 'border border-linea bg-white'}`}>
                {l}
                {here ? <span className="text-xs font-medium">Etapa actual</span> : next === k ? <span className="rounded-full bg-rosa-accion px-2 py-0.5 text-[11px] font-bold text-white">Siguiente</span> : null}
              </button>
            </li>
          )
        })}
      </ol>
      {current !== 'descartado' && (
        <button type="button" onClick={() => onPick('descartado')} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#F4C7C3] bg-[#FEF3F2] text-[15px] font-semibold text-[#B42318]">
          <Svg name="x" size={16} />Descartar
        </button>
      )}
      {kind === 'interesado' && <p className="hint">Al avanzarlo se crea el match y podrán conversar por chat.</p>}
    </div>
  )
}

function Card({ c, selecting, selected, onToggle, onOpen, onMove, onAdvance, canManage, showStage, p }) {
  const next = NEXT[c.stage]
  return (
    <div draggable={canManage && !selecting} onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify({ kind: c.kind, id: c.id }))}
      className={`card flex flex-col gap-2 p-3.5 ${selected ? 'border-rosa-accion ring-2 ring-rosa-accion/30' : ''}`}>
      <button type="button" onClick={selecting ? onToggle : onOpen} className="flex items-start gap-2.5 text-left">
        {selecting && <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${selected ? 'border-rosa-accion bg-rosa-accion text-white' : 'border-linea'}`}>{selected && <Svg name="check" size={15} width={3} />}</span>}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-semibold">{c.name}</span>
          <span className="line-clamp-2 text-[13px] leading-snug text-tinta-3">{c.headline || '—'}{c.comuna ? ` · ${c.comuna}` : ''}</span>
          <PresenceLine p={p} />
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[11px] text-tinta-suave">{daysAgo(c.since)}</span>
          {showStage && <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: colorOf(c.stage) }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: colorOf(c.stage) }} />{SHORT[c.stage]}</span>}
        </span>
      </button>
      {(c.knocked_out || c.kind === 'externo' || c.fit != null || c.eval_n > 0 || c.next_interview || c.tags?.length > 0) && (
        <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
          {c.knocked_out && <span className="rounded-md bg-[#FEF3F2] px-1.5 py-0.5 text-[#912018]">No cumple filtro</span>}
          {c.kind === 'externo' && <span className="rounded-md bg-[#EEF2FA] px-1.5 py-0.5 text-[#2C4A8A]">{c.source === 'externo' ? 'Otro portal' : c.source}</span>}
          {c.fit != null && <span className="rounded-md bg-[#F7F0FB] px-1.5 py-0.5 text-[#6B2E8F]">IA {c.fit}%</span>}
          {c.eval_n > 0 && <span className="rounded-md bg-naranja-palido px-1.5 py-0.5 text-naranja-texto">★ {c.eval_avg} · {c.eval_n}</span>}
          {c.next_interview && <span className="rounded-md bg-[#E8F4F5] px-1.5 py-0.5 text-[#1F6F78]">Entrevista {fmtDayShort(c.next_interview)} {fmtTime(c.next_interview)}</span>}
          {(c.tags || []).slice(0, 2).map((t) => <span key={t} className="rounded-md bg-[#F4EEF2] px-1.5 py-0.5 text-tinta-3">#{t}</span>)}
        </div>
      )}
      {canManage && !selecting && (
        <div className="flex flex-wrap gap-2 border-t border-[#F1E7ED] pt-2.5">
          {next && (
            <button type="button" onClick={onAdvance} title={c.stage === 'postulante' ? 'Hacer match' : `Avanzar a ${colLabel(next)}`}
              className="flex min-h-10 flex-[1_1_10rem] items-center justify-center gap-1 rounded-xl bg-rosa-palido px-2.5 py-1.5 text-center text-[13px] font-semibold leading-tight text-rosa-oscuro">
              <span>{c.stage === 'postulante' ? 'Hacer match' : <>Avanzar a <b className="font-bold">{colLabel(next)}</b></>}</span><Svg name="chevron" size={14} className="shrink-0" />
            </button>
          )}
          <button type="button" onClick={onMove} className={`flex min-h-10 items-center justify-center rounded-xl border border-linea px-3 py-1.5 text-[13px] font-semibold text-tinta-2 ${next ? 'flex-[0_1_auto]' : 'flex-1'}`}>
            {next ? 'Otra etapa' : 'Cambiar etapa'}
          </button>
        </div>
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
  const [tipSeen, setTipSeen] = useState(() => { try { return localStorage.getItem('vinka-tip-bulk') === '1' } catch { return false } })
  const [sel, setSel] = useState([])
  const [bulk, setBulk] = useState(false)
  const [moving, setMoving] = useState(null)
  const [toast, setToast] = useState('')
  const [col, setCol] = useState(null)
  const [peek, setPeek] = useState(null)
  // Computador: tablero o lista; las etapas vacías se contraen salvo que la persona las abra
  const [view, setView] = useState(() => { try { return localStorage.getItem('vinka-pipeline-view') || 'tablero' } catch { return 'tablero' } })
  const [opened, setOpened] = useState([])
  const pickView = (v) => { setView(v); try { localStorage.setItem('vinka-pipeline-view', v) } catch { /* sin almacenamiento */ } }

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('job_pipeline', { p_job: id })
    if (error) return setErr(errMsg(error))
    setD(data)
  }, [id])
  useEffect(() => { load() }, [load])

  const cards = useMemo(() => (d?.cards || []).filter((c) => (!hideKo || !c.knocked_out) &&
    (!q.trim() || `${c.name} ${c.headline} ${(c.tags || []).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase().replace(/^#/, '')))), [d, q, hideKo])
  const byCol = useMemo(() => Object.fromEntries(COLUMNAS.map(([k]) => [k, cards.filter((c) => c.stage === k)])), [cards])
  // Al abrir, muestra la primera etapa con personas (las activas antes que las cerradas)
  useEffect(() => {
    if (d && col == null) setCol((COLUMNAS.find(([k]) => k !== 'contratado' && k !== 'descartado' && byCol[k].length) || ['todas'])[0])
  }, [d, col, byCol])
  const pres = usePresence({ users: (d?.cards || []).map((c) => c.candidate_id).filter(Boolean) })
  const key = (c) => `${c.kind}:${c.id}`
  const toggle = (c) => setSel((s) => (s.includes(key(c)) ? s.filter((x) => x !== key(c)) : [...s, key(c)]))
  const selected = (d?.cards || []).filter((c) => sel.includes(key(c)))

  const move = async (c, stage) => {
    setMoving(null)
    if (!stage || c.stage === stage) return
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
  const peekRef = useDialogFocus(!!peek, () => setPeek(null))
  // En computador la ficha se abre al costado del tablero; en celular, como pantalla aparte
  const open = (c) => {
    if (window.matchMedia('(min-width: 1024px)').matches) return setPeek(c.kind === 'externo' ? { jobId: id, eid: c.id } : { jobId: id, cid: c.candidate_id || c.id })
    nav(c.kind === 'externo' ? `/vacantes/${id}/externo/${c.id}` : `/vacantes/${id}/candidato/${c.candidate_id || c.id}`)
  }

  if (err && !d) return <div className="p-6"><ErrorBox>{err}</ErrorBox></div>
  if (!d || col == null) return <Spinner />
  const canManage = d.can_manage
  const ko = d.cards.filter((c) => c.knocked_out).length
  const list = col === 'todas' ? cards : byCol[col]
  const cardProps = (c) => ({ c, p: pres[c.candidate_id], canManage, selecting, selected: sel.includes(key(c)), onToggle: () => toggle(c), onOpen: () => open(c), onMove: () => setMoving(c), onAdvance: () => move(c, NEXT[c.stage]) })
  const tiles = [['todas', 'Todas', '#302538'], ...COLUMNAS.map(([k, , color]) => [k, SHORT[k], color])]

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-[#FAF7F9] lg:max-w-none">
      <div className="safe-t sticky top-0 z-20 border-b border-[#EEE3EA] bg-white px-4 pb-3 lg:px-6">
        <div className="-ml-2 flex items-center gap-1">
          <button aria-label="Volver" onClick={() => nav('/')} className="flex h-11 w-11 shrink-0 items-center justify-center"><Svg name="back" /></button>
          <div className="flex min-w-0 flex-1 flex-col"><span className="text-[11px] text-tinta-suave">Proceso de selección · {pl(d.cards.length, 'persona', 'personas')}</span><span className="truncate text-[16px] font-semibold">{d.job.title}</span></div>
          {canManage && <button onClick={() => { setSelecting(!selecting); setSel([]); setTipSeen(true); try { localStorage.setItem('vinka-tip-bulk', '1') } catch { /* sin almacenamiento */ } }} className={`btn-sm h-10 shrink-0 px-3 ${selecting ? 'bg-morado text-white' : 'border border-linea bg-white'}`}>{selecting ? 'Listo' : <><Svg name="check" size={16} className="mr-1" />Seleccionar varios</>}</button>}
        </div>
        {!selecting && <CollabBar jobId={id} />}
        {canManage && !selecting && !tipSeen && d.cards.length >= 3 && (
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-[#F7F0FB] px-3 py-2 text-[12px] leading-snug text-[#4A2163]">
            <span className="flex-1">¿Varias personas a la vez? Con <b>Seleccionar varios</b> las mueves de etapa o les envías un mensaje común.</span>
            <button aria-label="Entendido, ocultar" className="flex h-8 w-8 shrink-0 items-center justify-center" onClick={() => { setTipSeen(true); try { localStorage.setItem('vinka-tip-bulk', '1') } catch { /* sin almacenamiento */ } }}><Svg name="x" size={16} /></button>
          </div>
        )}
        {/* Etapas: cuadrícula de 4 × 2 que cabe completa en la pantalla (solo celular) */}
        <div className="mt-2 grid grid-cols-4 gap-1.5 lg:hidden" role="tablist" aria-label="Etapas">
          {tiles.map(([k, l, color]) => {
            const on = col === k
            const n = k === 'todas' ? cards.length : byCol[k].length
            return (
              <button key={k} role="tab" aria-selected={on} onClick={() => setCol(k)}
                className={`flex h-[58px] min-w-0 flex-col items-center justify-center rounded-xl border border-t-[3px] px-0.5 ${on ? 'border-transparent text-white' : 'border-[#EEE3EA] bg-white'}`} style={on ? { background: color } : { borderTopColor: color }}>
                <span className={`font-display text-[19px] font-bold leading-none ${on ? '' : n ? 'text-tinta' : 'text-tinta-suave'}`}>{n}</span>
                <span className={`mt-1 max-w-full truncate text-[11px] font-semibold ${on ? 'text-white' : 'text-tinta-3'}`}>{l}</span>
              </button>
            )
          })}
        </div>
        <label className="relative mt-2.5 block"><span className="sr-only">Buscar</span>
          <Svg name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-suave" />
          <input className="input h-11 pl-9 text-[15px]" placeholder="Buscar por nombre, cargo o #etiqueta" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {d.job.questions?.length > 0 && ko > 0 && (
          <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 text-[13px] text-tinta-2">
            <span>Ocultar a quienes no cumplen el filtro <b className="text-tinta">({ko})</b></span>
            <span className="relative inline-flex">
              <input type="checkbox" className="peer sr-only" checked={hideKo} onChange={(e) => setHideKo(e.target.checked)} />
              <span className="h-6 w-11 rounded-full bg-[#DDD3DA] transition peer-checked:bg-rosa-accion peer-focus-visible:ring-2 peer-focus-visible:ring-rosa-accion/40" />
              <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
            </span>
          </label>
        )}
      </div>
      <ErrorBox>{err}</ErrorBox>

      {/* Celular: una etapa a la vez, a todo el ancho */}
      <div className="flex flex-col gap-2.5 px-4 pb-32 pt-3 lg:hidden">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-sm font-bold">{col === 'todas' ? 'Todas las etapas' : colLabel(col)} <span className="font-medium text-tinta-suave">· {list.length}</span></span>
          {selecting && list.length > 0 && <button className="h-9 text-[13px] font-semibold text-rosa-texto" onClick={() => setSel((s) => [...new Set([...s, ...list.map(key)])])}>Seleccionar todos</button>}
        </div>
        {list.length === 0 && (
          <div className="rounded-2xl border border-dashed border-linea px-4 py-8 text-center text-sm text-tinta-suave">
            {col === 'postulante' ? 'Aquí llegan quienes dicen "Me interesa" a esta vacante.' : q || hideKo ? 'Nadie coincide con la búsqueda.' : 'Nadie en esta etapa por ahora.'}
          </div>
        )}
        {list.map((c) => <Card key={key(c)} {...cardProps(c)} showStage={col === 'todas'} />)}
      </div>

      {/* Computador: tablero (etapas vacías contraídas) o lista */}
      <div className="hidden items-center justify-between gap-3 px-6 pt-4 lg:flex">
        <div className="flex rounded-xl bg-[#F4EEF2] p-[3px]" role="tablist" aria-label="Vista">
          {[['tablero', 'Tablero'], ['lista', 'Lista']].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => pickView(k)} className={`h-9 rounded-[9px] px-4 text-[13px] font-semibold ${view === k ? 'bg-white text-tinta shadow-sm' : 'text-tinta-3'}`}>{l}</button>
          ))}
        </div>
        {view === 'tablero' && <span className="text-xs text-tinta-suave">Las etapas sin personas se muestran contraídas. Haz clic en una para abrirla o arrastra a alguien sobre ella.</span>}
      </div>
      {view === 'tablero' ? (
        <div className="hidden flex-1 gap-2 overflow-x-auto px-6 py-4 lg:flex">
          {COLUMNAS.map(([k, l, color]) => {
            const n = byCol[k].length
            const small = n === 0 && !opened.includes(k)
            return small ? (
              <button key={k} type="button" aria-label={`${l}: sin personas. Abrir etapa`} title={`${l} · 0`} onClick={() => setOpened((o) => [...o, k])}
                onDragOver={(e) => canManage && e.preventDefault()} onDrop={(e) => onDrop(e, k)}
                className="flex w-11 shrink-0 flex-col items-center gap-2 rounded-2xl bg-[#F4EEF2]/60 py-3 hover:bg-[#F4EEF2]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                <span className="text-xs text-tinta-suave">0</span>
                <span className="text-[13px] font-bold text-tinta-3 [writing-mode:vertical-rl]">{l}</span>
              </button>
            ) : (
              <section key={k} aria-label={l} onDragOver={(e) => canManage && e.preventDefault()} onDrop={(e) => onDrop(e, k)} className="flex min-w-[16rem] max-w-[22rem] flex-1 flex-col gap-2 rounded-2xl bg-[#F4EEF2]/60 p-2">
                <div className="flex items-center gap-2 px-1 py-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} /><span className="text-sm font-bold">{l}</span><span className="text-xs text-tinta-suave">{n}</span>
                  {n === 0 && <button type="button" className="ml-auto text-xs font-semibold text-tinta-3" onClick={() => setOpened((o) => o.filter((x) => x !== k))}>Contraer</button>}</div>
                {byCol[k].map((c) => <Card key={key(c)} {...cardProps(c)} />)}
                {n === 0 && <span className="rounded-xl border border-dashed border-linea px-3 py-6 text-center text-xs text-tinta-suave">Arrastra aquí para mover a esta etapa</span>}
              </section>
            )
          })}
        </div>
      ) : (
        <div className="hidden flex-col gap-4 px-6 py-4 lg:flex">
          {cards.length === 0 && <div className="rounded-2xl border border-dashed border-linea px-4 py-8 text-center text-sm text-tinta-suave">{q || hideKo ? 'Nadie coincide con la búsqueda.' : 'Aún no hay personas en este proceso.'}</div>}
          {COLUMNAS.filter(([k]) => byCol[k].length).map(([k, l, color]) => (
            <section key={k} aria-label={l} className="flex flex-col gap-2">
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} /><span className="text-sm font-bold">{l}</span><span className="text-xs text-tinta-suave">{byCol[k].length}</span>
                {selecting && <button className="ml-auto text-[13px] font-semibold text-rosa-texto" onClick={() => setSel((s) => [...new Set([...s, ...byCol[k].map(key)])])}>Seleccionar todos</button>}</div>
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">{byCol[k].map((c) => <Card key={key(c)} {...cardProps(c)} />)}</div>
            </section>
          ))}
        </div>
      )}

      {selecting && (
        <div className="safe-b fixed bottom-0 left-1/2 z-30 flex w-full max-w-md -translate-x-1/2 lg:left-[calc(50%+8rem)] lg:max-w-2xl lg:rounded-t-2xl lg:border-x flex-wrap items-center gap-2 border-t border-[#EEE3EA] bg-white px-4 pt-3">
          <span className="w-full text-sm font-semibold sm:w-auto sm:flex-1">{sel.length ? `${sel.length} seleccionado${sel.length === 1 ? '' : 's'}` : 'Toca las personas'}{selected.length > 4 ? ' · máx. 4 para comparar' : ''}</span>
          {selected.length >= 2 && selected.length <= 4 && <button className="btn-sm border border-linea bg-white" onClick={() => nav(`/vacantes/${id}/comparar?c=${selected.map((c) => (c.kind === 'externo' ? `externo:${c.id}` : `vinka:${c.candidate_id || c.id}`)).join(',')}`)}>Comparar</button>}
          <button className="btn-sm border border-rosa-accion bg-white text-rosa-texto" disabled={!sel.length} onClick={() => setBulk('message')}>Enviar mensaje</button>
          <button className="btn-sm bg-rosa-accion text-white" disabled={!sel.length} onClick={() => setBulk('move')}>Mover de etapa</button>
        </div>
      )}
      <BulkSheet open={!!bulk} mode={bulk || 'move'} onClose={() => setBulk(false)} items={selected} job={d.job}
        onDone={(r) => { setBulk(false); setSelecting(false); setSel([]); setToast(`Listo: ${pl(r.moved, 'persona movida', 'personas movidas')}, ${pl(r.sent, 'mensaje enviado', 'mensajes enviados')}.`); load() }} />
      <Sheet open={!!moving} onClose={() => setMoving(null)} title={moving ? `Mover a ${moving.name}` : ''}>
        {moving && (
          <div className="flex flex-col gap-3">
            <StagePicker current={moving.stage} kind={moving.kind} onPick={(k) => move(moving, k)} />
            <button className="btn-sec" onClick={() => { const c = moving; setMoving(null); open(c) }}>Ver ficha completa</button>
          </div>
        )}
      </Sheet>
      {peek && (
        <div className="fixed inset-0 z-40 hidden lg:block" onClick={() => setPeek(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <aside ref={peekRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Ficha del candidato" onClick={(e) => e.stopPropagation()}
            className="outline-none absolute inset-y-0 right-0 w-[min(600px,calc(100vw-18rem))] overflow-y-auto border-l border-[#EEE3EA] bg-[#FAF7F9] shadow-2xl">
            <Suspense fallback={<Spinner />}>
              <CandidateDetail key={peek.cid || peek.eid} panel={{ ...peek, onClose: () => setPeek(null), onChange: load }} />
            </Suspense>
          </aside>
        </div>
      )}
      <Toast msg={toast} onDone={() => setToast('')} />
    </div>
  )
}
