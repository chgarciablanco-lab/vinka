import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { ETAPAS, colorFor, fillVars, initials } from '../lib/catalog'
import { useTemplates } from './company/Pipeline'
import { Avatar, Empty, ErrorBox, Sheet, Spinner, Svg, Toast } from '../components/ui'
import { usePresence } from '../lib/presence'
import { AwayBanner, PresenceLine, StatusPill, WithDot } from '../components/Presence'
import { NotifyCard } from '../components/NotifyCard'
import { InterviewCard } from '../components/InterviewCard'
import { Sparkle, callAi } from '../components/AiAssist'
import { Bell } from '../components/Bell'
import { dayNum, fmtDayShort, fmtTime } from '../lib/dates'
import { markRead, useUnread } from '../lib/unread'

const fmt = (d) => new Date(d).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const lastAt = (m) => new Date(m.last_at || m.created_at).getTime()

/**
 * Un chat por empresa (para la persona) o por persona (para la empresa), aunque haya varias vacantes.
 * Cada vacante sigue siendo un proceso propio (etapa, agenda, oferta); en el chat se ven juntas con su etiqueta.
 */
export function groupChats(rows, isCompany) {
  const by = new Map()
  for (const m of rows || []) {
    const k = isCompany ? m.candidate_id : m.company_id
    if (!by.has(k)) by.set(k, [])
    by.get(k).push(m)
  }
  return [...by.values()].map((list) => {
    list.sort((a, b) => lastAt(b) - lastAt(a))
    const open = list.filter((x) => !x.closed)
    return { key: isCompany ? list[0].candidate_id : list[0].company_id, latest: list[0], main: open[0] || list[0], list, open, closed: open.length === 0 }
  }).sort((a, b) => lastAt(b.latest) - lastAt(a.latest))
}

export function ChatList({ extra = null }) {
  const { profile, actsAs } = useAuth()
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    supabase.rpc('my_matches').then(({ data, error }) => { if (error) setErr(errMsg(error)); setRows(data || []) })
  }, [])
  const isCompany = actsAs === 'company'
  const { byMatch } = useUnread()
  const pres = usePresence(isCompany ? { users: (rows || []).filter((m) => !m.closed).map((m) => m.candidate_id) } : { companies: (rows || []).filter((m) => !m.closed).map((m) => m.company_id) })
  const [ivs, setIvs] = useState([])
  useEffect(() => { supabase.rpc('my_interviews').then(({ data }) => setIvs((data || []).filter((x) => x.status === 'confirmada' && new Date(x.ends_at) > new Date()))) }, [])
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-rosa-fondo pb-24 lg:max-w-none lg:pb-4">
      <div className="safe-t flex items-center justify-between px-5 pb-3"><h1 className="text-[22px] font-bold">Chats</h1><div className="flex items-center gap-2"><StatusPill /><Bell /></div></div>
      {extra}
      <div className="flex flex-col gap-2 px-5">
        <NotifyCard compact />
        {ivs.length > 0 && (
          <div className="mb-2 flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-tinta-3">Próximas entrevistas</span>
            {ivs.map((iv) => (
              <Link key={iv.interview_id} to={`/chats/${iv.match_id}`} className="flex items-center gap-3 rounded-2xl border border-rosa-borde bg-white p-3">
                <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-rosa-palido py-1.5 text-rosa-oscuro">
                  <span className="text-[11px] font-semibold uppercase">{fmtDayShort(iv.starts_at).split(' ')[0]}</span>
                  <span className="font-display text-lg font-bold leading-none">{dayNum(iv.starts_at)}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{fmtTime(iv.starts_at)} · {isCompany ? iv.candidate_name : iv.company_name}</span>
                  <span className="truncate text-xs text-tinta-3">{iv.job_title} · {iv.mode === 'online' ? 'Videollamada' : 'Presencial'}</span>
                </div>
                <Svg name="chevron" size={18} className="text-tinta-suave" />
              </Link>
            ))}
          </div>
        )}
        <ErrorBox>{err}</ErrorBox>
        {rows == null ? <Spinner /> : rows.length === 0 ? (
          <Empty title="Aún no tienes matches">El chat se abre cuando ambos se interesan en la misma vacante.</Empty>
        ) : groupChats(rows, isCompany).map((g) => {
          const m = g.latest
          const name = isCompany ? m.candidate_name : m.company_name
          const jobs = (g.open.length ? g.open : g.list).map((x) => x.job_title)
          const unread = g.list.reduce((a, x) => a + (byMatch[x.match_id]?.n || 0), 0)
          // Si hay no leídos, se abre en la vacante que los tiene
          const target = g.list.find((x) => byMatch[x.match_id]) || g.main
          return (
            <Link key={g.key} to={`/chats/${target.match_id}`} className={`card flex items-center gap-3 p-3.5 ${unread ? 'border-rosa-accion/40' : ''}`}>
              <WithDot p={pres[isCompany ? m.candidate_id : m.company_id]} size={14}><Avatar text={initials(name)} color={isCompany ? '#302538' : colorFor(name)} size={46} round={isCompany} /></WithDot>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex justify-between gap-2"><span className="truncate text-[15px] font-semibold">{name}</span>
                  <span className={`shrink-0 text-[11px] ${unread ? 'font-semibold text-rosa-texto' : 'text-tinta-suave'}`}>{fmt(m.last_at || m.created_at)}</span></span>
                {!g.closed && <PresenceLine p={pres[isCompany ? m.candidate_id : m.company_id]} company={!isCompany} />}
                <span className="truncate text-xs font-medium text-rosa-texto">{jobs.length > 1 ? `${jobs.length} vacantes: ${jobs.join(' · ')}` : jobs[0]}</span>
                <span className="flex items-center gap-2"><span className={`min-w-0 flex-1 truncate text-[13px] ${unread ? 'font-semibold text-tinta' : 'text-tinta-3'}`}>{g.closed ? 'Conversación cerrada' : m.last_message || '¡Nuevo match! Saluda'}</span>
                  {unread > 0 && <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-rosa-accion px-1.5 text-[11px] font-bold text-white" aria-label={`${unread} sin leer`}>{unread > 99 ? '99+' : unread}</span>}</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export function ChatRoom() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user, profile, actsAs } = useAuth()
  const isCompany = actsAs === 'company'
  const [m, setM] = useState(null)
  const [sibs, setSibs] = useState([]) // todas las vacantes con esta misma empresa/persona (incluida la actual)
  const [allMsgs, setAllMsgs] = useState([])
  const { byMatch } = useUnread()
  const [firstNew, setFirstNew] = useState(null) // dónde empezaban los no leídos al abrir (para la línea «Mensajes nuevos»)
  const [below, setBelow] = useState(0) // mensajes nuevos que llegaron mientras mirabas más arriba
  const listRef = useRef()
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState('')
  const [menu, setMenu] = useState(false)
  const [report, setReport] = useState('')
  const [reporting, setReporting] = useState(false)
  const [toast, setToast] = useState('')
  const [ivs, setIvs] = useState([])
  const [ivOpen, setIvOpen] = useState(false)
  const [offer, setOffer] = useState(null)
  const [tplOpen, setTplOpen] = useState(false)
  const { templates } = useTemplates()
  const [polishing, setPolishing] = useState(false)
  const polish = async () => {
    if (!draft.trim() || polishing) return
    setPolishing(true); setErr('')
    try { const r = await callAi('chat_message', 'improve', { current: draft, role: actsAs }); if (r.text) setDraft(r.text.slice(0, 2000)) } catch (e) { setErr(e.message) } finally { setPolishing(false) }
  }
  const endRef = useRef()
  const loadIvs = useCallback(async () => {
    const { data } = await supabase.rpc('my_interviews')
    setIvs((data || []).filter((x) => x.match_id === id))
  }, [id])

  const loadMatch = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_matches')
    if (error) return setErr(errMsg(error))
    const cur = (data || []).find((x) => x.match_id === id) || false
    setM(cur)
    if (cur) {
      const same = (data || []).filter((x) => (isCompany ? x.candidate_id === cur.candidate_id : x.company_id === cur.company_id))
      same.sort((a, b) => (a.closed - b.closed) || (new Date(b.last_at || b.created_at) - new Date(a.last_at || a.created_at)))
      setSibs(same)
    }
  }, [id, isCompany])
  const sibKey = sibs.map((x) => x.match_id).sort().join(',')

  useEffect(() => {
    loadMatch()
    loadIvs()
    setOffer(null)
    supabase.from('offers').select('*').eq('match_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle().then(({ data }) => setOffer(data))
  }, [id, loadMatch, loadIvs])

  // Mensajes y avisos en vivo de todas las vacantes de esta conversación
  useEffect(() => {
    const ids = sibKey ? sibKey.split(',') : [id]
    ids.forEach((mid) => supabase.rpc('mark_match_seen', { p_match: mid }))
    // Carga completa; se repite al recuperar internet o volver a la app, por si llegaron mensajes mientras tanto
    const fetchMsgs = () => supabase.from('messages').select('*').in('match_id', ids).order('created_at').then(({ data, error }) => {
      if (error || !data) return
      setAllMsgs((prev) => {
        const known = new Set(prev.map((x) => x.id))
        const fresh = data.filter((x) => !known.has(x.id))
        if (prev.length && fresh.some((x) => x.sender_id !== user?.id) && !atBottom()) setBelow((n) => n + fresh.filter((x) => x.sender_id !== user?.id).length)
        return fresh.length || data.length !== prev.length ? data : prev
      })
    })
    fetchMsgs()
    const onBack = () => { if (document.visibilityState === 'visible') fetchMsgs() }
    window.addEventListener('online', onBack)
    document.addEventListener('visibilitychange', onBack)
    const ch = supabase.channel(`chat-${ids.join('-').slice(0, 180)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: ids.length > 1 ? `match_id=in.(${ids.join(',')})` : `match_id=eq.${ids[0]}` },
        (p) => {
          setAllMsgs((prev) => (prev.some((x) => x.id === p.new.id) ? prev : [...prev, p.new]))
          if (p.new.sender_id !== user?.id && !atBottom()) setBelow((n) => n + 1)
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interviews', filter: `match_id=eq.${id}` }, () => loadIvs())
      .subscribe()
    return () => { supabase.removeChannel(ch); window.removeEventListener('online', onBack); document.removeEventListener('visibilitychange', onBack) }
  }, [sibKey, id, loadIvs])
  const msgs = allMsgs.filter((x) => x.match_id === id) // los de la vacante elegida (para la regla «la empresa escribe primero»)
  const multi = sibs.length > 1
  const jobOf = Object.fromEntries(sibs.map((x) => [x.match_id, x.job_title]))
  // ¿Se está viendo el final de la conversación?
  const atBottom = () => {
    const el = listRef.current
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }
  // Al abrir: recordar dónde empezaban los no leídos (antes de marcarlos) para mostrar la línea «Mensajes nuevos»
  useEffect(() => {
    if (firstNew !== null || !sibs.length) return
    const firsts = sibs.map((x) => byMatch[x.match_id]?.first).filter(Boolean).sort()
    setFirstNew(firsts[0] || '')
  }, [sibs, byMatch, firstNew])
  // Marcar leído solo hasta el último mensaje mostrado, con la pantalla visible y viendo el final
  const lastShown = allMsgs.length ? allMsgs[allMsgs.length - 1].created_at : null
  const marked = useRef('')
  const readNow = useCallback(() => {
    if (!lastShown || !sibKey || !atBottom()) return
    setBelow(0)
    if (marked.current === `${sibKey}|${lastShown}`) return // ya marcado hasta aquí
    marked.current = `${sibKey}|${lastShown}`
    markRead(sibKey.split(','), lastShown).then((ok) => { if (!ok) marked.current = '' })
  }, [lastShown, sibKey])
  useEffect(() => { readNow() }, [readNow])
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') readNow() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', onVis) }
  }, [readNow])
  // Al abrir se baja al final; después solo si ya estabas abajo o si el mensaje es tuyo. Luego se marca lo que quedó a la vista.
  const opened = useRef(false)
  useEffect(() => {
    if (!allMsgs.length) return
    if (!opened.current || atBottom() || allMsgs[allMsgs.length - 1]?.sender_id === user?.id) {
      opened.current = true
      endRef.current?.scrollIntoView({ block: 'end' })
      requestAnimationFrame(() => readNow())
    }
  }, [allMsgs.length]) // eslint-disable-line

  const send = async (e) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    setDraft('')
    const { data, error } = await supabase.from('messages').insert({ match_id: id, sender_id: user.id, body }).select().single()
    if (error) { setDraft(body); return setErr(errMsg(error)) }
    setAllMsgs((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data]))
  }
  const inviteSchedule = async () => {
    setErr('')
    const { error } = await supabase.rpc('invite_to_schedule', { p_match: id })
    if (error) return setErr(errMsg(error))
    setToast('Listo: le avisamos que puede elegir un horario.'); loadMatch()
  }
  const action = async (a, stage) => {
    const { error } = await supabase.rpc('match_update', { p_match: id, p_action: a, p_stage: stage || null })
    if (error) return setErr(errMsg(error))
    setMenu(false); loadMatch()
  }
  const sendReport = async () => {
    if (!report.trim()) return
    const { error } = await supabase.from('reports').insert({ reporter_id: user.id, match_id: id, reason: report.trim() })
    if (error) return setErr(errMsg(error))
    setReport(''); setReporting(false); setMenu(false); setToast('Denuncia enviada. La revisaremos pronto.')
  }

  const pres = usePresence(m ? (isCompany ? { users: [m.candidate_id] } : { companies: [m.company_id] }) : {})
  if (m === null) return <Spinner />
  if (m === false) return <div className="p-6"><Empty title="Chat no disponible" action={<Link to="/chats" className="btn-sm text-rosa-texto">Volver</Link>}>Este chat no existe o no tienes acceso.</Empty></div>

  const name = isCompany ? m.candidate_name : m.company_name
  const stageIdx = ETAPAS.findIndex((s) => s[0] === m.stage)

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col bg-rosa-fondo lg:max-w-none">
      <div className="safe-t flex items-center gap-2 border-b border-[#EEE3EA] bg-white px-3 pb-2.5">
        <button aria-label="Volver" onClick={() => nav('/chats')} className="flex h-11 w-11 items-center justify-center"><Svg name="back" /></button>
        <WithDot p={pres[isCompany ? m.candidate_id : m.company_id]}><Avatar text={initials(name)} color={isCompany ? '#302538' : colorFor(name)} size={40} round={isCompany} /></WithDot>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold">{name}</span>
          {!m.closed && pres[isCompany ? m.candidate_id : m.company_id]
            ? <PresenceLine p={pres[isCompany ? m.candidate_id : m.company_id]} company={!isCompany} />
            : <span className="truncate text-xs text-tinta-suave">{multi ? `${sibs.length} vacantes` : m.job_title}</span>}
        </div>
        <button aria-label="Opciones: etapa, denunciar o bloquear" onClick={() => setMenu(true)} className="flex h-11 w-11 items-center justify-center"><Svg name="dots" /></button>
      </div>
      {multi && (
        <div className="flex flex-col gap-1.5 border-b border-[#EEE3EA] bg-white px-4 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-tinta-3">Vacante de este proceso</span>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {sibs.map((x) => (
              <button key={x.match_id} onClick={() => x.match_id !== id && nav(`/chats/${x.match_id}`, { replace: true })} aria-pressed={x.match_id === id}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${x.match_id === id ? 'border-rosa-accion bg-rosa-palido text-rosa-oscuro' : 'border-linea bg-white text-tinta-3'}`}>
                {x.job_title}{x.closed ? ' · cerrada' : ''}
                {byMatch[x.match_id] && x.match_id !== id && <span className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rosa-accion px-1 align-middle text-[10px] font-bold text-white" aria-label={`${byMatch[x.match_id].n} sin leer`}>{byMatch[x.match_id].n}</span>}
              </button>
            ))}
          </div>
          <span className="text-[11px] leading-snug text-tinta-suave">La etapa, la agenda y la oferta de abajo son de la vacante marcada. Tus mensajes se envían con esa etiqueta.</span>
        </div>
      )}
      {!m.closed && <AwayBanner p={pres[isCompany ? m.candidate_id : m.company_id]} name={isCompany ? (m.candidate_name || '').split(' ')[0] : m.company_name} />}
      <div className="flex gap-1 overflow-x-auto border-b border-[#EEE3EA] bg-white px-4 py-2.5 text-xs font-semibold">
        {ETAPAS.slice(0, 5).map(([k, l], idx) => (
          <span key={k} className={`whitespace-nowrap rounded-md px-2 py-1 ${idx < stageIdx ? 'bg-rosa-accion text-white' : idx === stageIdx ? 'border border-rosa-accion bg-rosa-palido text-rosa-oscuro' : 'bg-[#F4EEF2] text-tinta-3'}`}>{l}</span>
        ))}
        {m.stage === 'descartado' && <span className="whitespace-nowrap rounded-md bg-[#F4EEF2] px-2 py-1 text-tinta-3">Proceso cerrado</span>}
      </div>
      {!m.closed && (() => {
        const active = ivs.find((x) => x.status === 'confirmada' && new Date(x.ends_at) > new Date())
        if (active) return (
          <button onClick={() => setIvOpen(true)} className="flex items-center gap-3 border-b border-rosa-borde bg-rosa-palido px-4 py-2.5 text-left">
            <Svg name="calendar" size={22} className="text-rosa-accion" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold text-rosa-oscuro">Entrevista {fmtDayShort(active.starts_at)} · {fmtTime(active.starts_at)}</span>
              <span className="truncate text-xs text-tinta-3">{active.mode === 'online' ? 'Videollamada · toca para ver el enlace' : `Presencial · ${active.address}`}</span>
            </span>
            <span className="text-sm font-semibold text-rosa-texto">Ver</span>
          </button>
        )
        if (isCompany) return m.can_schedule ? (
          <Link to="/agenda" className="flex items-center gap-3 border-b border-[#EEE3EA] bg-white px-4 py-2.5">
            <Svg name="calendar" size={22} className="text-[#2F7A4F]" />
            <span className="flex-1 text-[13px] leading-snug text-tinta-3"><b className="text-[#134A2B]">Agenda habilitada.</b> Esta persona puede elegir un horario de tu <b className="text-rosa-texto">Agenda</b>.</span>
          </Link>
        ) : (
          <div className="flex items-center gap-3 border-b border-[#EEE3EA] bg-white px-4 py-2.5">
            <Svg name="calendar" size={22} className="text-tinta-suave" />
            <span className="flex-1 text-[13px] leading-snug text-tinta-3">Esta persona aún no ve tus horarios. Invítala cuando quieras entrevistarla.</span>
            <button className="btn-sm shrink-0 bg-rosa-accion text-white" onClick={inviteSchedule}>Invitar a agendar</button>
          </div>
        )
        return m.can_schedule ? (
          <Link to={`/chats/${id}/agendar`} className="flex items-center gap-3 border-b border-rosa-borde bg-rosa-palido px-4 py-2.5">
            <Svg name="calendar" size={22} className="text-rosa-accion" />
            <span className="flex flex-1 flex-col"><span className="text-sm font-semibold text-rosa-oscuro">Agendar entrevista</span><span className="text-xs text-tinta-3">{m.company_name} te invitó a elegir un horario</span></span>
            <Svg name="chevron" size={18} className="text-rosa-accion" />
          </Link>
        ) : (
          <div className="flex items-center gap-3 border-b border-[#EEE3EA] bg-white px-4 py-2.5">
            <Svg name="calendar" size={22} className="text-tinta-suave" />
            <span className="flex-1 text-[13px] leading-snug text-tinta-3">La empresa te avisará cuando puedas agendar tu entrevista.</span>
          </div>
        )
      })()}
      {offer && offer.status !== 'retirada' && (
        <Link to={`/ofertas/${offer.id}`} className="flex items-center gap-3 border-b border-[#F5C892] bg-naranja-palido px-4 py-2.5">
          <Svg name="doc" size={22} className="text-naranja-texto" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold text-[#6B3800]">{offer.status === 'por_aprobar' ? 'Carta oferta esperando aprobación interna' : offer.status === 'enviada' ? (isCompany ? 'Carta oferta enviada · esperando respuesta' : 'Tienes una carta oferta') : offer.status === 'aceptada' ? 'Oferta aceptada' : 'Oferta no aceptada'}</span>
            <span className="truncate text-xs text-[#4A2A00]">{offer.position}</span>
          </span>
          <span className="text-sm font-semibold text-naranja-texto">{!isCompany && offer.status === 'enviada' ? 'Responder' : 'Ver'}</span>
        </Link>
      )}
      <div ref={listRef} onScroll={() => { if (atBottom()) readNow() }} className="relative flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3.5">
        <div className="self-center rounded-xl border border-rosa-borde bg-white px-3 py-2 text-center text-xs leading-relaxed text-tinta-3">
          {multi ? <>Tienen match en {sibs.length} vacantes; aquí ves la conversación de todas.</> : <>Match del {new Date(m.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} · Ambos se interesaron en esta vacante.</>}<br />VINKA nunca te pedirá pagar para postular.
        </div>
        {allMsgs.map((x, i) => {
          const mine = x.sender_id === user.id
          const tag = multi && (i === 0 || allMsgs[i - 1].match_id !== x.match_id)
          const fn = firstNew ? new Date(firstNew).getTime() : 0
          const divider = fn > 0 && !mine && new Date(x.created_at).getTime() >= fn && (i === 0 || new Date(allMsgs[i - 1].created_at).getTime() < fn)
          return (
            <Fragment key={x.id}>
            {divider && <div className="flex items-center gap-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-rosa-texto"><span className="h-px flex-1 bg-rosa-accion/40" />Mensajes nuevos<span className="h-px flex-1 bg-rosa-accion/40" /></div>}
            <div className={`flex max-w-[80%] flex-col gap-1 ${mine ? 'self-end items-end' : 'self-start items-start'}`}>
              {tag && <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${x.match_id === id ? 'bg-rosa-palido text-rosa-oscuro' : 'bg-[#F4EEF2] text-tinta-3'}`}>{jobOf[x.match_id] || 'Vacante'}</span>}
              <div className={`whitespace-pre-wrap break-words px-3 py-2.5 text-sm leading-snug ${mine ? 'rounded-2xl rounded-br-[4px] bg-rosa-accion text-white' : 'rounded-2xl rounded-bl-[4px] border border-[#EEE3EA] bg-white'}`}>
                {x.body}
                <div className={`mt-1 text-[10px] ${mine ? 'text-white/80' : 'text-tinta-suave'}`}>{fmt(x.created_at)}</div>
              </div>
            </div>
            </Fragment>
          )
        })}
        {/* Datos de contacto: solo con consentimiento del candidato */}
        {!isCompany && m.contact_requested && !m.contact_shared && (
          <div className="flex flex-col gap-2.5 rounded-2xl border border-[#EEE3EA] bg-white p-3.5">
            <span className="text-sm leading-snug"><b>{m.company_name}</b> pide tu teléfono y correo para coordinar.</span>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-sm border border-linea bg-white" onClick={() => action('decline_contact')}>Ahora no</button>
              <button className="btn-sm bg-morado text-white" onClick={() => action('share_contact')}>Compartir</button>
            </div>
          </div>
        )}
        {m.contact_shared && (
          <div className="rounded-2xl border border-[#A9D9BC] bg-[#EAF6EF] p-3 text-sm leading-relaxed text-[#134A2B]">
            {isCompany ? <>Contacto de {m.candidate_name}: <b>{m.candidate_phone || 'sin teléfono'}</b> · <b>{m.candidate_email}</b></> : 'Compartiste tu teléfono y correo con esta empresa.'}
          </div>
        )}
        <div ref={endRef} />
        {below > 0 && (
          <button onClick={() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); setTimeout(readNow, 400) }}
            className="sticky bottom-1 self-center rounded-full bg-rosa-accion px-4 py-2 text-[13px] font-semibold text-white shadow-lg">
            {below === 1 ? 'Mensaje nuevo' : `${below} mensajes nuevos`} ↓
          </button>
        )}
      </div>
      <ErrorBox>{err}</ErrorBox>
      {m.closed ? (
        <div className="safe-b border-t border-[#EEE3EA] bg-white px-4 pt-3 text-center text-sm text-tinta-3">{multi && sibs.some((x) => !x.closed) ? 'El proceso de esta vacante está cerrado. Elige otra vacante arriba para escribir.' : 'Esta conversación está cerrada.'}</div>
      ) : !isCompany && !msgs.some((x) => x.sender_id !== user.id) ? (
        <div className="safe-b border-t border-[#EEE3EA] bg-white px-4 pt-3 text-center text-sm leading-snug text-tinta-3">La empresa inicia la conversación. Podrás responder apenas te escriba; te avisaremos.</div>
      ) : (
        <form onSubmit={send} className="safe-b flex items-center gap-2 border-t border-[#EEE3EA] bg-white px-3 pt-2.5">
          <label className="flex-1"><span className="sr-only">Mensaje</span>
            <input value={draft} maxLength={2000} onChange={(e) => setDraft(e.target.value)} placeholder={multi ? `Mensaje sobre ${m.job_title}` : 'Escribe un mensaje'} className="h-[46px] w-full rounded-full border border-linea px-4 text-[16px] focus:border-rosa-accion focus:outline-none" />
          </label>
          {isCompany && !draft.trim() && (
            <button type="button" onClick={() => setTplOpen(true)} aria-label="Usar una plantilla" title="Plantillas"
              className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border border-linea bg-white text-tinta-3"><Svg name="doc" size={20} /></button>
          )}
          {draft.trim().length > 3 && (
            <button type="button" onClick={polish} disabled={polishing} aria-label="Mejorar mensaje con IA" title="Mejorar con IA"
              className={`flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border border-[#E9D3F0] bg-[#F7F0FB] text-[#6B2E8F] ${polishing ? 'animate-pulse' : ''}`}><Sparkle size={20} /></button>
          )}
          <button aria-label="Enviar" className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-rosa-accion"><Svg name="send" size={20} stroke="#fff" /></button>
        </form>
      )}
      <Sheet open={menu} onClose={() => { setMenu(false); setReporting(false) }} title="Opciones">
        {reporting ? (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5"><span className="label">¿Qué pasó?</span>
              <textarea className="textarea h-32" maxLength={1000} value={report} onChange={(e) => setReport(e.target.value)} placeholder="Ej.: me pidieron dinero para postular" /></label>
            <button className="btn" onClick={sendReport} disabled={!report.trim()}>Enviar denuncia</button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {isCompany && !m.closed && (
              <>
                <span className="label mb-1">Etapa del proceso</span>
                <div className="mb-2 flex flex-wrap gap-2">
                  {ETAPAS.map(([k, l]) => <button key={k} onClick={() => action('stage', k)} className={`chip ${m.stage === k ? 'chip-on' : ''}`}>{l}</button>)}
                </div>
                {!m.contact_shared && <button className="btn-sec" disabled={m.contact_requested} onClick={() => action('request_contact')}>{m.contact_requested ? 'Contacto solicitado' : 'Pedir teléfono y correo'}</button>}
                <Link to={`/vacantes/${m.job_id}/candidato/${m.candidate_id}`} className="btn-sec">Ver ficha, evaluaciones y oferta</Link>
              </>
            )}
            <button className="btn-sec" onClick={() => setReporting(true)}>Denunciar</button>
            {!m.closed && <button className="btn-sec text-[#B42318]" onClick={() => action('block')}>Bloquear y cerrar chat</button>}
          </div>
        )}
      </Sheet>
      <Sheet open={ivOpen} onClose={() => setIvOpen(false)} title="Entrevista">
        <div className="flex flex-col gap-3">
          {ivs.filter((x) => x.status === 'confirmada').map((iv) => (
            <InterviewCard key={iv.interview_id} iv={iv} role={isCompany ? 'company' : 'candidate'} onChange={() => { setIvOpen(false); loadIvs() }} />
          ))}
        </div>
      </Sheet>
      <Sheet open={tplOpen} onClose={() => setTplOpen(false)} title="Plantillas">
        <div className="flex flex-col gap-2">
          {templates.map((t) => (
            <button key={t.id} onClick={() => { setDraft(fillVars(t.body, { nombre: (m.candidate_name || '').split(' ')[0], cargo: m.job_title, empresa: m.company_name }).slice(0, 2000)); setTplOpen(false) }}
              className="card flex flex-col gap-1 p-3 text-left"><span className="text-sm font-semibold">{t.name}</span><span className="line-clamp-2 text-xs text-tinta-3">{t.body}</span></button>
          ))}
          <Link to="/plantillas" className="py-2 text-center text-sm font-semibold text-rosa-texto">Editar plantillas</Link>
        </div>
      </Sheet>
      <Toast msg={toast} onDone={() => setToast('')} />
    </div>
  )
}
