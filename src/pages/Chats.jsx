import { useCallback, useEffect, useRef, useState } from 'react'
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

const fmt = (d) => new Date(d).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function ChatList() {
  const { profile } = useAuth()
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    supabase.rpc('my_matches').then(({ data, error }) => { if (error) setErr(errMsg(error)); setRows(data || []) })
  }, [])
  const isCompany = profile?.role === 'company'
  const pres = usePresence(isCompany ? { users: (rows || []).filter((m) => !m.closed).map((m) => m.candidate_id) } : { companies: (rows || []).filter((m) => !m.closed).map((m) => m.company_id) })
  const [ivs, setIvs] = useState([])
  useEffect(() => { supabase.rpc('my_interviews').then(({ data }) => setIvs((data || []).filter((x) => x.status === 'confirmada' && new Date(x.ends_at) > new Date()))) }, [])
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-rosa-fondo pb-24 lg:max-w-none lg:pb-4">
      <div className="safe-t flex items-center justify-between px-5 pb-3"><h1 className="text-[22px] font-bold">Chats</h1><div className="flex items-center gap-2"><StatusPill /><Bell /></div></div>
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
        ) : rows.map((m) => {
          const name = isCompany ? m.candidate_name : m.company_name
          return (
            <Link key={m.match_id} to={`/chats/${m.match_id}`} className="card flex items-center gap-3 p-3.5">
              <WithDot p={pres[isCompany ? m.candidate_id : m.company_id]} size={14}><Avatar text={initials(name)} color={isCompany ? '#302538' : colorFor(name)} size={46} round={isCompany} /></WithDot>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex justify-between gap-2"><span className="truncate text-[15px] font-semibold">{name}</span>
                  <span className="shrink-0 text-[11px] text-tinta-suave">{fmt(m.last_at || m.created_at)}</span></span>
                {!m.closed && <PresenceLine p={pres[isCompany ? m.candidate_id : m.company_id]} company={!isCompany} />}
                <span className="truncate text-xs font-medium text-rosa-texto">{m.job_title}</span>
                <span className="truncate text-[13px] text-tinta-3">{m.closed ? 'Conversación cerrada' : m.last_message || '¡Nuevo match! Saluda'}</span>
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
  const { user, profile } = useAuth()
  const isCompany = profile?.role === 'company'
  const [m, setM] = useState(null)
  const [msgs, setMsgs] = useState([])
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
    try { const r = await callAi('chat_message', 'improve', { current: draft, role: profile?.role }); if (r.text) setDraft(r.text.slice(0, 2000)) } catch (e) { setErr(e.message) } finally { setPolishing(false) }
  }
  const endRef = useRef()
  const loadIvs = useCallback(async () => {
    const { data } = await supabase.rpc('my_interviews')
    setIvs((data || []).filter((x) => x.match_id === id))
  }, [id])

  const loadMatch = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_matches')
    if (error) return setErr(errMsg(error))
    setM((data || []).find((x) => x.match_id === id) || false)
  }, [id])

  useEffect(() => {
    loadMatch()
    loadIvs()
    supabase.from('offers').select('*').eq('match_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle().then(({ data }) => setOffer(data))
    supabase.rpc('mark_match_seen', { p_match: id })
    supabase.from('messages').select('*').eq('match_id', id).order('created_at').then(({ data }) => setMsgs(data || []))
    const ch = supabase.channel(`chat-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${id}` },
        (p) => setMsgs((prev) => (prev.some((x) => x.id === p.new.id) ? prev : [...prev, p.new])))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interviews', filter: `match_id=eq.${id}` }, () => loadIvs())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id, loadMatch, loadIvs])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [msgs.length])

  const send = async (e) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    setDraft('')
    const { data, error } = await supabase.from('messages').insert({ match_id: id, sender_id: user.id, body }).select().single()
    if (error) { setDraft(body); return setErr(errMsg(error)) }
    setMsgs((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data]))
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
            : <span className="truncate text-xs text-tinta-suave">{m.job_title}</span>}
        </div>
        <button aria-label="Opciones: etapa, denunciar o bloquear" onClick={() => setMenu(true)} className="flex h-11 w-11 items-center justify-center"><Svg name="dots" /></button>
      </div>
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
        return isCompany ? (
          <Link to="/agenda" className="flex items-center gap-3 border-b border-[#EEE3EA] bg-white px-4 py-2.5">
            <Svg name="calendar" size={22} className="text-tinta-suave" />
            <span className="flex-1 text-[13px] leading-snug text-tinta-3">Sin entrevista agendada. Publica horarios en tu <b className="text-rosa-texto">Agenda</b> y esta persona podrá elegir uno.</span>
          </Link>
        ) : (
          <Link to={`/chats/${id}/agendar`} className="flex items-center gap-3 border-b border-rosa-borde bg-rosa-palido px-4 py-2.5">
            <Svg name="calendar" size={22} className="text-rosa-accion" />
            <span className="flex flex-1 flex-col"><span className="text-sm font-semibold text-rosa-oscuro">Agendar entrevista</span><span className="text-xs text-tinta-3">Elige un horario disponible de {m.company_name}</span></span>
            <Svg name="chevron" size={18} className="text-rosa-accion" />
          </Link>
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
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3.5">
        <div className="self-center rounded-xl border border-rosa-borde bg-white px-3 py-2 text-center text-xs leading-relaxed text-tinta-3">
          Match del {new Date(m.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} · Ambos se interesaron en esta vacante.<br />VINKA nunca te pedirá pagar para postular.
        </div>
        {msgs.map((x) => (
          <div key={x.id} className={`max-w-[80%] whitespace-pre-wrap break-words px-3 py-2.5 text-sm leading-snug ${x.sender_id === user.id ? 'self-end rounded-2xl rounded-br-[4px] bg-rosa-accion text-white' : 'self-start rounded-2xl rounded-bl-[4px] border border-[#EEE3EA] bg-white'}`}>
            {x.body}
            <div className={`mt-1 text-[10px] ${x.sender_id === user.id ? 'text-white/80' : 'text-tinta-suave'}`}>{fmt(x.created_at)}</div>
          </div>
        ))}
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
      </div>
      <ErrorBox>{err}</ErrorBox>
      {m.closed ? (
        <div className="safe-b border-t border-[#EEE3EA] bg-white px-4 pt-3 text-center text-sm text-tinta-3">Esta conversación está cerrada.</div>
      ) : !isCompany && !msgs.some((x) => x.sender_id !== user.id) ? (
        <div className="safe-b border-t border-[#EEE3EA] bg-white px-4 pt-3 text-center text-sm leading-snug text-tinta-3">La empresa inicia la conversación. Podrás responder apenas te escriba; te avisaremos.</div>
      ) : (
        <form onSubmit={send} className="safe-b flex items-center gap-2 border-t border-[#EEE3EA] bg-white px-3 pt-2.5">
          <label className="flex-1"><span className="sr-only">Mensaje</span>
            <input value={draft} maxLength={2000} onChange={(e) => setDraft(e.target.value)} placeholder="Escribe un mensaje" className="h-[46px] w-full rounded-full border border-linea px-4 text-[16px] focus:border-rosa-accion focus:outline-none" />
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
