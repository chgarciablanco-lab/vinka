import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { markAdvisorRead } from '../../lib/advisorUnread'
import { colorFor, initials } from '../../lib/catalog'
import { TopIcons } from '../advisor/Hub'
import { Avatar, ErrorBox, Screen, Sheet, Spinner, Svg, Toast } from '../../components/ui'

// VINKA Comunidad: muro abierto solo para asesores. Publican lo que necesitan cerrar, todos comentan,
// y quien publicó puede invitar al proceso de su vacante a quien comentó (ve el proceso y conversan por chat).

const ago = (d) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `hace ${h} h`
  const dd = Math.round(h / 24)
  return dd < 7 ? `hace ${dd} d` : new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}
const PRIVACY = 'No escribas nombres, RUT ni datos de contacto de candidatos: el muro lo ven todos los asesores.'

/** Muro de la comunidad. admin: vista de VINKA (no publica, puede ocultar) */
export default function CommunityFeed({ admin = false }) {
  const { companies } = useAuth()
  const { hash } = useLocation()
  const [posts, setPosts] = useState(null)
  const [more, setMore] = useState(false)
  const [collabs, setCollabs] = useState([])
  const [jobs, setJobs] = useState([])
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('community_feed', { p_before: null, p_limit: 30 })
    if (error) { setErr(errMsg(error)); setPosts((p) => p || []); return }
    setErr(''); setPosts(data || []); setMore((data || []).length === 30)
  }, [])
  useEffect(() => {
    load()
    if (!admin) supabase.rpc('my_collaborations').then(({ data }) => setCollabs(data || []))
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [load, admin])
  // Vacantes abiertas que gestiono (para ligarlas a una publicación)
  useEffect(() => {
    const ids = (companies || []).filter((c) => ['owner', 'admin', 'recruiter'].includes(c.member_role)).map((c) => c.id)
    if (admin || !ids.length) return
    supabase.from('jobs').select('id, title, comuna, status').in('company_id', ids).neq('status', 'closed').order('created_at', { ascending: false })
      .then(({ data }) => setJobs(data || []))
  }, [companies, admin])
  // Al llegar desde un aviso (#publicación), ir a esa publicación
  useEffect(() => {
    if (!posts || !hash) return
    document.getElementById('p-' + hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [posts, hash])
  const loadMore = async () => {
    const last = posts[posts.length - 1]
    const { data, error } = await supabase.rpc('community_feed', { p_before: last.created_at, p_limit: 30 })
    if (error) return setErr(errMsg(error))
    setPosts([...posts, ...(data || [])]); setMore((data || []).length === 30)
  }
  return (
    <Screen className="bg-[#FAF7F9]" wide>
      {!admin && (
        <div className="safe-t flex items-start justify-between gap-3 px-5 pb-3 pt-2 lg:px-8 lg:pt-6">
          <div><h1 className="text-[22px] font-bold">Comunidad</h1>
          <p className="text-[13px] text-tinta-3">Solo para asesores de VINKA: pide recomendaciones y ayuda a otros a cerrar sus procesos.</p></div>
          <TopIcons />
        </div>
      )}
      <div className={`mx-auto flex w-full max-w-2xl flex-col gap-3 ${admin ? '' : 'px-5 pb-28 lg:px-8 lg:pb-10'}`}>
        <ErrorBox>{err}</ErrorBox>
        {collabs.length > 0 && (
          <section className="card flex flex-col gap-1 p-2">
            <span className="px-2 pt-1.5 text-[15px] font-semibold">Procesos compartidos contigo</span>
            {collabs.map((c) => (
              <Link key={c.job_id} to={`/vacantes/${c.job_id}/proceso`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[#FAF7F9]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rosa-palido text-rosa-oscuro"><Svg name="people" size={18} /></span>
                <span className="flex min-w-0 flex-1 flex-col"><b className="text-sm">{c.title}</b><span className="text-xs text-tinta-3">De {c.owner}{c.comuna ? ` · ${c.comuna}` : ''}{c.closed ? ' · cerrada' : ''}</span></span>
                <Svg name="chevron" size={18} className="text-tinta-suave" />
              </Link>
            ))}
          </section>
        )}
        {!admin && <Composer jobs={jobs} onDone={() => { setToast('Publicado'); load() }} />}
        {posts == null ? <Spinner /> : posts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-linea bg-white px-4 py-6 text-center text-sm text-tinta-3">Aún no hay publicaciones. {admin ? '' : '¡Sé el primero en pedir una recomendación!'}</p>
        ) : posts.map((p) => <Post key={p.id} p={p} admin={admin} onChange={(msg) => { if (msg) setToast(msg); load() }} />)}
        {more && <button className="btn-sec self-center" onClick={loadMore}>Ver publicaciones anteriores</button>}
      </div>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </Screen>
  )
}

function Composer({ jobs, onDone }) {
  const [body, setBody] = useState('')
  const [job, setJob] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const send = async () => {
    if (!body.trim()) return
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('community_post', { p_body: body.trim(), p_job: job || null })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setBody(''); setJob(''); onDone()
  }
  return (
    <section className="card flex flex-col gap-2.5 p-3.5">
      <textarea className="textarea h-24" maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Nueva publicación"
        placeholder="Ej.: Hola, necesito un jefe de tienda en Talca, ¿alguna recomendación?" />
      {jobs.length > 0 && (
        <label className="flex flex-col gap-1"><span className="text-[12px] font-semibold text-tinta-2">Ligar a una de tus vacantes (para poder invitar a quien comente)</span>
          <select className="input h-11" value={job} onChange={(e) => setJob(e.target.value)}>
            <option value="">Sin vacante</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}{j.comuna ? ` · ${j.comuna}` : ''}</option>)}
          </select>
        </label>
      )}
      <span className="text-[12px] leading-snug text-tinta-suave">{PRIVACY}</span>
      <ErrorBox>{err}</ErrorBox>
      <button className="btn-sm h-11 self-end bg-rosa-accion px-5 text-white" disabled={busy || !body.trim()} onClick={send}>{busy ? 'Publicando…' : 'Publicar'}</button>
    </section>
  )
}

function Post({ p, admin, onChange }) {
  const [txt, setTxt] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(p.comments.length <= 3)
  const call = async (fn, args, msg) => {
    setErr('')
    const { error } = await supabase.rpc(fn, args)
    if (error) { setErr(errMsg(error)); return false }
    onChange(msg); return true
  }
  const comment = async () => {
    if (!txt.trim()) return
    setBusy(true)
    const ok = await call('community_comment', { p_post: p.id, p_body: txt.trim() })
    setBusy(false)
    if (ok) { setTxt(''); setOpen(true) }
  }
  const shown = open ? p.comments : p.comments.slice(-2)
  return (
    <article id={'p-' + p.id} className={`card flex scroll-mt-4 flex-col gap-2.5 p-3.5 ${p.hidden ? 'opacity-60' : ''}`}>
      <header className="flex items-start gap-2.5">
        <Avatar text={initials(p.author)} color={colorFor(p.author || '')} size={40} round />
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="text-[15px]">{p.author}{p.mine && <span className="font-normal text-tinta-3"> (tú)</span>}</b>
          <span className="text-[12px] text-tinta-3">{[p.specialty, ago(p.created_at)].filter(Boolean).join(' · ')}{p.hidden ? ' · oculta' : ''}</span>
        </span>
        {(p.mine || admin) && !p.hidden && (
          <button className="text-[12px] font-semibold text-tinta-3" onClick={() => call('community_hide', { p_kind: 'post', p_id: p.id }, admin ? 'Publicación oculta' : 'Publicación borrada')}>{admin ? 'Ocultar' : 'Borrar'}</button>
        )}
      </header>
      <p className="whitespace-pre-line text-[15px] leading-relaxed">{p.body}</p>
      {p.job && (
        <span className="flex items-center gap-2 self-start rounded-xl bg-[#FAF7F9] px-3 py-2 text-[13px] text-tinta-2">
          <Svg name="building" size={16} />Vacante: <b>{p.job.title}</b>{p.job.comuna ? ` · ${p.job.comuna}` : ''}{p.job.closed ? ' · cerrada' : ''}
        </span>
      )}
      {p.comments.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-[#F4EEF2] pt-2.5">
          {!open && <button className="self-start text-[13px] font-semibold text-tinta-3" onClick={() => setOpen(true)}>Ver los {p.comments.length} comentarios</button>}
          {shown.map((c) => (
            <div key={c.id} className={`flex gap-2 ${c.hidden ? 'opacity-60' : ''}`}>
              <Avatar text={initials(c.author)} color={colorFor(c.author || '')} size={30} round />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="rounded-2xl bg-[#FAF7F9] px-3 py-2">
                  <b className="text-[13px]">{c.author}{c.mine && <span className="font-normal text-tinta-3"> (tú)</span>}</b>
                  <p className="whitespace-pre-line text-sm leading-snug">{c.body}</p>
                </div>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[12px] text-tinta-3">
                  {ago(c.created_at)}{c.hidden ? ' · oculto' : ''}
                  {c.invited && <span className="font-semibold text-[#1E6B3F]">✓ En el proceso</span>}
                  {p.can_invite && !c.mine && !c.invited && !c.hidden && (
                    <button className="font-semibold text-rosa-texto" onClick={() => call('community_invite_to_process', { p_comment: c.id }, `${c.author} ya puede ver tu proceso y conversar contigo`)}>Invitar al proceso</button>
                  )}
                  {(c.mine || admin) && !c.hidden && <button className="font-semibold" onClick={() => call('community_hide', { p_kind: 'comment', p_id: c.id }, admin ? 'Comentario oculto' : 'Comentario borrado')}>{admin ? 'Ocultar' : 'Borrar'}</button>}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      <ErrorBox>{err}</ErrorBox>
      {!admin && !p.hidden && (
        <div className="flex items-end gap-2">
          <textarea rows={1} className="textarea min-h-11 flex-1 py-2.5" maxLength={1000} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Escribe un comentario" aria-label="Comentario" />
          <button aria-label="Comentar" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rosa-accion text-white disabled:opacity-50" disabled={busy || !txt.trim()} onClick={comment}><Svg name="send" size={18} /></button>
        </div>
      )}
    </article>
  )
}

const STAGE_L = { postulante: 'Postulantes', match: 'Match', contacto: 'Contacto', entrevista: 'Entrevista', oferta: 'Oferta', contratado: 'Contratado', descartado: 'Descartado' }
export const suggestionText = (x) => (x.action === 'avanzar' ? `sugiere avanzar a ${STAGE_L[x.to_stage] || x.to_stage}` : 'sugiere descartar')

/** En el proceso de una vacante: asesores invitados, sus sugerencias (con visto bueno) y el chat interno */
export function CollabBar({ jobId, suggestions = [], onChange }) {
  const nav = useNavigate()
  const { search } = useLocation()
  const [info, setInfo] = useState(null)
  const [chat, setChat] = useState(null) // { collab, name, other }
  const [decide, setDecide] = useState(null)
  const [err, setErr] = useState('')
  const load = useCallback(() => supabase.rpc('job_collab_info', { p_job: jobId }).then(({ data, error }) => { if (!error) setInfo(data) }), [jobId])
  useEffect(() => { load() }, [load])
  const { user } = useAuth()
  // Abrir el chat directo al llegar desde un aviso (?chat=…)
  useEffect(() => {
    const q = new URLSearchParams(search).get('chat')
    if (!q || !info) return
    if (info.role === 'invitado') setChat({ collab: user?.id, name: info.owner, other: info.owner_id })
    else { const c = (info.collaborators || []).find((x) => x.user_id === q); if (c) setChat({ collab: c.user_id, name: c.name, other: c.user_id, removable: true }) }
  }, [search, info, user])
  if (!info) return null
  const remove = async (uid, self) => {
    setErr('')
    const { error } = await supabase.rpc('collab_remove', { p_job: jobId, p_user: uid })
    if (error) return setErr(errMsg(error))
    setChat(null)
    if (self) nav('/comunidad'); else load()
  }
  const pending = suggestions.filter((x) => x.status === 'pendiente')
  if (info.role === 'invitado') return (
    <div className="mt-2 flex flex-col gap-2 rounded-2xl bg-[#FFFAEE] px-3.5 py-2.5 text-[13px] text-tinta-2">
      <span><b>{info.owner}</b> te invitó a este proceso. Abre a un postulante para sugerir avanzarlo o descartarlo: {info.owner} lo aprueba con un check.</span>
      {suggestions.length > 0 && (
        <ul className="flex flex-col gap-1">
          {suggestions.slice(0, 4).map((x) => (
            <li key={x.id} className="flex flex-wrap gap-x-1.5"><b>{x.candidate}</b>· {x.action === 'avanzar' ? `avanzar a ${STAGE_L[x.to_stage]}` : 'descartar'} ·
              <span className={x.status === 'aprobada' ? 'font-semibold text-[#1E6B3F]' : x.status === 'rechazada' ? 'font-semibold text-[#912018]' : 'text-tinta-3'}>{x.status === 'pendiente' ? 'esperando su ✓' : x.status === 'aprobada' ? '✓ aprobada' : '✗ no aprobada'}</span></li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn-sm h-10 bg-rosa-accion text-white" onClick={() => setChat({ collab: user?.id, name: info.owner, other: info.owner_id })}><Svg name="chat" size={16} />&nbsp;Chat y tareas con {info.owner}</button>
        <button className="btn-sm h-10 border border-linea bg-white" onClick={() => remove(user?.id, true)}>Salir del proceso</button>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {chat && <CollabChat jobId={jobId} collab={chat.collab} name={chat.name} other={chat.other} onClose={() => setChat(null)} />}
    </div>
  )
  if (!info.collaborators?.length && !pending.length) return null
  return (
    <div className="mt-2 flex flex-col gap-2">
      {pending.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-2xl border border-[#F3D9A4] bg-[#FFFAEE] p-3 text-[13px]">
          <b>Sugerencias por revisar · {pending.length}</b>
          {pending.map((x) => (
            <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
              <span className="min-w-0 flex-1"><b>{x.by_name}</b> {suggestionText(x)} a <b>{x.candidate}</b>{x.note ? <span className="block text-tinta-3">«{x.note}»</span> : null}</span>
              <span className="flex gap-1.5">
                <button className="btn-sm h-9 border border-linea bg-white px-3" onClick={() => setDecide({ x, ok: false })}>✗ No</button>
                <button className="btn-sm h-9 bg-[#1E6B3F] px-3 text-white" onClick={() => setDecide({ x, ok: true })}>✓ Aprobar</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {info.collaborators?.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-tinta-3">Asesores invitados:</span>
          {info.collaborators.map((c) => (
            <button key={c.user_id} className="btn-sm h-9 border border-linea bg-white" onClick={() => setChat({ collab: c.user_id, name: c.name, other: c.user_id, removable: true })}><Svg name="chat" size={15} />&nbsp;{c.name}</button>
          ))}
        </div>
      )}
      <ErrorBox>{err}</ErrorBox>
      {chat && <CollabChat jobId={jobId} collab={chat.collab} name={chat.name} other={chat.other} onClose={() => setChat(null)} onRemove={chat.removable ? () => remove(chat.collab, false) : null} />}
      {decide && <DecideSheet item={decide} onClose={() => setDecide(null)} onDone={() => { setDecide(null); onChange?.() }} />}
    </div>
  )
}

function DecideSheet({ item, onClose, onDone }) {
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const { x, ok } = item
  const send = async () => {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('collab_decide', { p_suggestion: x.id, p_approve: ok, p_note: note.trim() })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone()
  }
  return (
    <Sheet open onClose={onClose} title={ok ? 'Aprobar sugerencia' : 'No aprobar sugerencia'}>
      <div className="flex flex-col gap-2.5">
        <p className="text-sm leading-snug text-tinta-2"><b>{x.by_name}</b> {suggestionText(x)} a <b>{x.candidate}</b>.
          {ok ? (x.action === 'avanzar' ? ` Al aprobar, pasa a ${STAGE_L[x.to_stage]} en tu proceso.` : ' Al aprobar, queda descartado/a.') : ' El postulante queda donde está.'}</p>
        <textarea className="textarea h-20" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Mensaje para ${x.by_name} (opcional)`} />
        <span className="text-[12px] text-tinta-suave">Queda registrado en el historial del postulante y en el chat.</span>
        <ErrorBox>{err}</ErrorBox>
        <button className="btn" disabled={busy} onClick={send}>{busy ? 'Guardando…' : ok ? '✓ Aprobar' : '✗ No aprobar'}</button>
      </div>
    </Sheet>
  )
}

/** Ficha del postulante, para el asesor invitado: sugerir avanzar o descartar */
export function SuggestBox({ jobId, candidateId }) {
  const [list, setList] = useState(null)
  const [mode, setMode] = useState(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => supabase.rpc('collab_suggestions_for_job', { p_job: jobId }).then(({ data }) => setList((data || []).filter((x) => x.candidate_id === candidateId))), [jobId, candidateId])
  useEffect(() => { load() }, [load])
  const send = async () => {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('collab_suggest', { p_job: jobId, p_candidate: candidateId, p_action: mode, p_note: note.trim() })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setMode(null); setNote(''); load()
  }
  if (list == null) return null
  const pending = list.find((x) => x.status === 'pendiente')
  const last = list.find((x) => x.status !== 'pendiente')
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[#F3D9A4] bg-[#FFFAEE] p-3 text-[13px]">
      <b>Tu sugerencia al responsable</b>
      {pending ? <span>Sugeriste {pending.action === 'avanzar' ? `avanzar a ${STAGE_L[pending.to_stage]}` : 'descartar'}. Esperando su ✓.</span> : mode ? (
        <>
          <span>{mode === 'avanzar' ? 'Sugerir que avance a la siguiente etapa.' : 'Sugerir descartar a esta persona.'} El responsable decide con un check.</span>
          <textarea className="textarea h-20 bg-white" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="¿Por qué? (opcional)" />
          <ErrorBox>{err}</ErrorBox>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-sm h-10 border border-linea bg-white" onClick={() => setMode(null)}>Cancelar</button>
            <button className="btn-sm h-10 bg-rosa-accion text-white" disabled={busy} onClick={send}>{busy ? 'Enviando…' : 'Enviar sugerencia'}</button>
          </div>
        </>
      ) : (
        <>
          {last && <span className="text-tinta-3">Última: {last.action === 'avanzar' ? 'avanzar' : 'descartar'} · {last.status === 'aprobada' ? '✓ aprobada' : '✗ no aprobada'}{last.response ? ` («${last.response}»)` : ''}</span>}
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-sm h-10 border border-linea bg-white" onClick={() => setMode('descartar')}>Sugerir descartar</button>
            <button className="btn-sm h-10 bg-[#1E6B3F] text-white" onClick={() => setMode('avanzar')}>Sugerir avanzar</button>
          </div>
        </>
      )}
    </div>
  )
}

function CollabChat({ jobId, collab, name, other, onClose, onRemove }) {
  const { user } = useAuth()
  const [msgs, setMsgs] = useState(null)
  const [tasks, setTasks] = useState([])
  const [txt, setTxt] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [task, setTask] = useState(null) // { title, assignee, due }
  const end = useRef(null)
  const load = useCallback(() => {
    supabase.rpc('collab_thread', { p_job: jobId, p_collab: collab }).then(({ data, error }) => {
      if (error) { setErr(errMsg(error)); setMsgs((m) => m || []) } else setMsgs(data || [])
    })
    supabase.rpc('collab_task_list', { p_job: jobId, p_collab: collab }).then(({ data }) => setTasks(data || []))
  }, [jobId, collab])
  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t) }, [load])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs?.length])
  // Con el chat a la vista, lo del otro queda leído
  const lastOther = (msgs || []).filter((m) => !m.mine).slice(-1)[0]?.id
  useEffect(() => { if (lastOther) markAdvisorRead(`collab:${jobId}:${collab}`, true) }, [lastOther, jobId, collab])
  const send = async () => {
    if (!txt.trim()) return
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('collab_send', { p_job: jobId, p_collab: collab, p_body: txt.trim() })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setTxt(''); load()
  }
  const saveTask = async () => {
    if (!task.title.trim()) return
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('collab_task_create', { p_job: jobId, p_collab: collab, p_title: task.title.trim(), p_assignee: task.assignee, p_due: task.due || null })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setTask(null); load()
  }
  const toggle = async (t) => {
    const { error } = await supabase.rpc('collab_task_done', { p_task: t.id, p_done: !t.done })
    if (error) setErr(errMsg(error)); else load()
  }
  const newTask = (title = '') => setTask({ title: title.slice(0, 300), assignee: other || user?.id, due: '' })
  const open = tasks.filter((t) => !t.done)
  return (
    <Sheet open onClose={onClose} title={`Chat con ${name}`}>
      <div className="flex flex-col gap-2.5">
        <section className="flex flex-col gap-1.5 rounded-xl border border-linea p-2.5">
          <div className="flex items-center justify-between"><b className="text-[13px]">Tareas · {open.length} pendiente{open.length === 1 ? '' : 's'}</b>
            {!task && <button className="text-[13px] font-semibold text-rosa-texto" onClick={() => newTask()}>+ Nueva tarea</button>}</div>
          {tasks.map((t) => (
            <label key={t.id} className="flex items-start gap-2 text-[13px]">
              <input type="checkbox" checked={t.done} onChange={() => toggle(t)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#1E6B3F]" aria-label={`Marcar «${t.title}»`} />
              <span className={t.done ? 'text-tinta-suave line-through' : ''}>{t.title} <span className="text-tinta-3">· {t.mine ? 'tú' : t.assignee}{t.due_on ? ` · ${new Date(t.due_on + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}` : ''}</span></span>
            </label>
          ))}
          {task && (
            <div className="flex flex-col gap-1.5">
              <input className="input h-10" maxLength={300} value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} placeholder="Ej.: Llamar a Rocío para validar referencias" aria-label="Tarea" />
              <div className="grid grid-cols-2 gap-1.5">
                <select className="input h-10" value={task.assignee} onChange={(e) => setTask({ ...task, assignee: e.target.value })} aria-label="A cargo de">
                  <option value={user?.id}>A cargo: yo</option>
                  {other && other !== user?.id && <option value={other}>A cargo: {name}</option>}
                </select>
                <input className="input h-10" type="date" value={task.due} onChange={(e) => setTask({ ...task, due: e.target.value })} aria-label="Para cuándo" />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button className="btn-sm h-10 border border-linea bg-white" onClick={() => setTask(null)}>Cancelar</button>
                <button className="btn-sm h-10 bg-rosa-accion text-white" disabled={busy || !task.title.trim()} onClick={saveTask}>Crear tarea</button>
              </div>
            </div>
          )}
        </section>
        <div className="flex max-h-[45vh] min-h-[8rem] flex-col gap-1.5 overflow-y-auto rounded-xl bg-[#FAF7F9] p-2.5">
          {msgs == null ? <Spinner /> : msgs.length === 0 ? <span className="m-auto text-[13px] text-tinta-3">Aún no hay mensajes.</span> : msgs.map((m) => m.kind === 'evento' ? (
            <div key={m.id} className="self-center rounded-full bg-white px-3 py-1 text-center text-[12px] text-tinta-2 shadow-sm">
              <b>{m.mine ? 'Tú' : m.sender}</b> · {m.body.charAt(0).toLowerCase() + m.body.slice(1)} <span className="text-tinta-suave">· {new Date(m.created_at).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ) : (
            <div key={m.id} className={`group max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.mine ? 'self-end bg-rosa-accion text-white' : 'self-start bg-white'}`}>
              <p className="whitespace-pre-line leading-snug">{m.body}</p>
              <span className={`flex items-center gap-2 text-[11px] ${m.mine ? 'text-white/80' : 'text-tinta-suave'}`}>{m.mine ? '' : `${m.sender} · `}{new Date(m.created_at).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                <button className="font-semibold underline" onClick={() => newTask(m.body)}>Hacer tarea</button></span>
            </div>
          ))}
          <span ref={end} />
        </div>
        <ErrorBox>{err}</ErrorBox>
        <div className="flex items-end gap-2">
          <textarea rows={2} className="textarea flex-1" maxLength={2000} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Escribe un mensaje" aria-label="Mensaje" />
          <button aria-label="Enviar" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rosa-accion text-white disabled:opacity-50" disabled={busy || !txt.trim()} onClick={send}><Svg name="send" size={18} /></button>
        </div>
        {onRemove && <button className="self-start text-[13px] font-semibold text-[#912018]" onClick={onRemove}>Quitar a {name} del proceso</button>}
      </div>
    </Sheet>
  )
}
