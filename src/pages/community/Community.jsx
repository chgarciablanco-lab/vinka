import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
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

/** En el proceso de una vacante: asesores invitados y su chat interno */
export function CollabBar({ jobId }) {
  const nav = useNavigate()
  const { search } = useLocation()
  const [info, setInfo] = useState(null)
  const [chat, setChat] = useState(null) // { collab, name }
  const [err, setErr] = useState('')
  const load = useCallback(() => supabase.rpc('job_collab_info', { p_job: jobId }).then(({ data, error }) => { if (!error) setInfo(data) }), [jobId])
  useEffect(() => { load() }, [load])
  const { user } = useAuth()
  // Abrir el chat directo al llegar desde un aviso (?chat=…)
  useEffect(() => {
    const q = new URLSearchParams(search).get('chat')
    if (!q || !info) return
    if (info.role === 'invitado') setChat({ collab: user?.id, name: info.owner })
    else { const c = (info.collaborators || []).find((x) => x.user_id === q); if (c) setChat({ collab: c.user_id, name: c.name, removable: true }) }
  }, [search, info, user])
  if (!info) return null
  const remove = async (uid, self) => {
    setErr('')
    const { error } = await supabase.rpc('collab_remove', { p_job: jobId, p_user: uid })
    if (error) return setErr(errMsg(error))
    setChat(null)
    if (self) nav('/comunidad'); else load()
  }
  if (info.role === 'invitado') return (
    <div className="mt-2 flex flex-col gap-2 rounded-2xl bg-[#FFFAEE] px-3.5 py-2.5 text-[13px] text-tinta-2">
      <span><b>{info.owner}</b> te invitó a ver este proceso desde la Comunidad. Puedes revisarlo, pero solo su equipo mueve candidatos.</span>
      <div className="flex flex-wrap gap-2">
        <button className="btn-sm h-10 bg-rosa-accion text-white" onClick={() => setChat({ collab: user?.id, name: info.owner })}><Svg name="chat" size={16} />&nbsp;Chat con {info.owner}</button>
        <button className="btn-sm h-10 border border-linea bg-white" onClick={() => remove(user?.id, true)}>Salir del proceso</button>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {chat && <CollabChat jobId={jobId} collab={chat.collab} name={chat.name} onClose={() => setChat(null)} />}
    </div>
  )
  if (!info.collaborators?.length) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
      <span className="text-tinta-3">Asesores invitados:</span>
      {info.collaborators.map((c) => (
        <button key={c.user_id} className="btn-sm h-9 border border-linea bg-white" onClick={() => setChat({ collab: c.user_id, name: c.name, removable: true })}><Svg name="chat" size={15} />&nbsp;{c.name}</button>
      ))}
      <ErrorBox>{err}</ErrorBox>
      {chat && <CollabChat jobId={jobId} collab={chat.collab} name={chat.name} onClose={() => setChat(null)} onRemove={chat.removable ? () => remove(chat.collab, false) : null} />}
    </div>
  )
}

function CollabChat({ jobId, collab, name, onClose, onRemove }) {
  const [msgs, setMsgs] = useState(null)
  const [txt, setTxt] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef(null)
  const load = useCallback(() => supabase.rpc('collab_thread', { p_job: jobId, p_collab: collab }).then(({ data, error }) => {
    if (error) { setErr(errMsg(error)); setMsgs((m) => m || []) } else setMsgs(data || [])
  }), [jobId, collab])
  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t) }, [load])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs?.length])
  const send = async () => {
    if (!txt.trim()) return
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('collab_send', { p_job: jobId, p_collab: collab, p_body: txt.trim() })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setTxt(''); load()
  }
  return (
    <Sheet open onClose={onClose} title={`Chat con ${name}`}>
      <div className="flex flex-col gap-2.5">
        <p className="text-[12px] leading-snug text-tinta-3">Conversación privada entre ustedes sobre este proceso: compartan ideas y repártanse tareas.</p>
        <div className="flex max-h-[50vh] min-h-[8rem] flex-col gap-1.5 overflow-y-auto rounded-xl bg-[#FAF7F9] p-2.5">
          {msgs == null ? <Spinner /> : msgs.length === 0 ? <span className="m-auto text-[13px] text-tinta-3">Aún no hay mensajes.</span> : msgs.map((m) => (
            <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.mine ? 'self-end bg-rosa-accion text-white' : 'self-start bg-white'}`}>
              <p className="whitespace-pre-line leading-snug">{m.body}</p>
              <span className={`text-[11px] ${m.mine ? 'text-white/80' : 'text-tinta-suave'}`}>{m.mine ? '' : `${m.sender} · `}{new Date(m.created_at).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
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
