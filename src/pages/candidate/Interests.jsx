import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { colorFor, initials } from '../../lib/catalog'
import { Avatar, Empty, ErrorBox, Sheet, Spinner, Svg } from '../../components/ui'
import { InterviewCard } from '../../components/InterviewCard'
import { fmtDayShort, fmtTime } from '../../lib/dates'
import { useUnread } from '../../lib/unread'
import { MatchModal } from '../../components/MatchModal'
import { Bell } from '../../components/Bell'
import { InstallBanner } from '../../components/InstallBanner'
import { ScreeningSheet, jobQuestions } from '../../components/Screening'

const TABS = [
  ['match', 'Matches', 'Ambos se interesaron en la misma vacante. Ya pueden conversar.'],
  ['invited', 'Te invitaron', 'Una empresa verificada se interesó en ti para una vacante concreta. Si aceptas, es match.'],
  ['sent', 'Enviados', 'Mostraste interés. Será match si la empresa también se interesa. Si elige a otras personas o cierra la vacante, te lo mostramos aquí.'],
  ['saved', 'Guardadas', 'Solo tú ves lo que guardas. La empresa no recibe aviso.'],
]
const STATUS_PILL = { no_seleccionado: ['NO SELECCIONADO', 'bg-[#F4EEF2] text-tinta-3'], cerrada: ['VACANTE CERRADA', 'bg-[#F4EEF2] text-tinta-3'] }
// Etapa del proceso con palabras para la persona (sin notas ni evaluaciones internas de la empresa)
const STAGE_PILL = {
  match: ['MATCH', 'bg-rosa-accion text-white', 'Ambos se interesaron. La empresa te escribirá por el chat.'],
  contacto: ['EN CONVERSACIÓN', 'bg-[#F7F0FB] text-[#6B2E8F]', 'La empresa está en contacto contigo por el chat.'],
  entrevista: ['ENTREVISTA', 'bg-[#E7F1FB] text-[#1F4E86]', 'Tienes una entrevista en este proceso.'],
  oferta: ['OFERTA RECIBIDA', 'bg-[#FFF4D6] text-[#7A5200]', 'Te enviaron una carta oferta.'],
  contratado: ['CONTRATADO/A', 'bg-[#EAF6EF] text-[#134A2B]', '¡Felicitaciones! Coordina tu ingreso con la empresa.'],
  descartado: ['PROCESO CERRADO', 'bg-[#F4EEF2] text-tinta-3', 'La empresa decidió no seguir contigo en esta vacante.'],
  cerrado: ['PROCESO CERRADO', 'bg-[#F4EEF2] text-tinta-3', 'Este proceso terminó.'],
}
const STATUS_TXT = { no_seleccionado: 'La empresa decidió avanzar con otras personas. ¡Sigue postulando!', cerrada: 'La empresa cerró o pausó esta vacante.' }
const ORDER = { pendiente: 0, no_seleccionado: 1, cerrada: 2 }
const PILL = { match: ['MATCH', 'bg-rosa-accion text-white'], invited: ['TE INVITARON', 'bg-[#FFE7CC] text-naranja-texto'], sent: ['ENVIADO', 'bg-[#ECE6F2] text-[#3D2F4A]'], saved: ['GUARDADA', 'bg-[#F1F1F1] text-[#3A3A3A]'] }

export default function Interests() {
  const { user, profile } = useAuth()
  const nav = useNavigate()
  const [match, setMatch] = useState(null)
  const [tab, setTab] = useState('invited')
  const [rows, setRows] = useState(null)
  const [matches, setMatches] = useState([])
  const [err, setErr] = useState('')
  const [ivs, setIvs] = useState([])
  const [offers, setOffers] = useState([])
  const [ivOpen, setIvOpen] = useState(null)
  const [recs, setRecs] = useState([])
  const { byMatch } = useUnread()

  const load = useCallback(async () => {
    const [a, b, c, d, e] = await Promise.all([
      supabase.rpc('my_interests'), supabase.rpc('my_matches'), supabase.rpc('my_interviews'),
      supabase.from('offers').select('id, match_id, status, position, expires_on, created_at').eq('candidate_id', user.id).neq('status', 'retirada').order('created_at', { ascending: false }),
      supabase.rpc('my_recommendations'),
    ])
    if (a.error || b.error) setErr(errMsg(a.error || b.error))
    // Recomendaciones de asesores de VINKA (Comunidad): si fallan, el resto de la pantalla sigue funcionando
    setRecs(e.error ? [] : e.data || [])
    setRows(a.data || []); setMatches(b.data || []); setIvs(c.data || []); setOffers(d.data || [])
  }, [user.id])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (rows && tab === 'invited' && !rows.some((r) => r.kind === 'invited') && !recs.length) setTab(matches.length ? 'match' : 'sent') }, [rows]) // eslint-disable-line

  const [ask, setAsk] = useState(null)
  // rec: recomendación de la Comunidad. Se postula por el camino normal (con preguntas de filtro si las hay) y luego se da el consentimiento.
  const respond = async (job_id, action, answers = null, rec = null) => {
    setErr('')
    if (action === 'interest' && !answers) {
      const qs = await jobQuestions(job_id)
      if (qs.length) return setAsk({ job_id, rec, questions: qs, title: rec?.title || (rows || []).find((x) => x.job_id === job_id)?.title })
    }
    const { error } = await supabase.from('candidate_job_actions').upsert({ candidate_id: user.id, job_id, action, ...(answers ? { answers } : {}) })
    if (error) return setErr(errMsg(error))
    if (rec && action === 'interest') {
      const { error: e2 } = await supabase.rpc('community_consent', { p_presentation: rec.id, p_accept: true })
      if (e2) setErr(errMsg(e2))
    }
    if (action === 'interest') {
      const { data } = await supabase.from('matches').select('id').eq('job_id', job_id).eq('candidate_id', user.id).maybeSingle()
      const r = (rows || []).find((x) => x.job_id === job_id) || (rec && { title: rec.title, company_name: rec.company })
      if (data) {
        setMatch({ matchId: data.id, jobTitle: r?.title, otherName: r?.company_name, continueLabel: 'Volver a Intereses',
          leftInitials: `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}`.toUpperCase(), leftColor: '#D02E72',
          rightInitials: initials(r?.company_name), rightColor: colorFor(r?.company_name || '') })
      }
    }
    load()
  }
  const declineRec = async (rec) => {
    setErr('')
    const { error } = await supabase.rpc('community_consent', { p_presentation: rec.id, p_accept: false })
    if (error) setErr(errMsg(error))
    load()
  }
  const unsave = async (job_id) => { await supabase.from('candidate_job_actions').delete().eq('candidate_id', user.id).eq('job_id', job_id); load() }

  const count = (k) => (k === 'match' ? matches.length : (rows || []).filter((r) => r.kind === k && (r.status === 'pendiente' || !r.status)).length + (k === 'invited' ? recs.length : 0))
  const list = tab === 'match'
    ? matches.map((m) => ({ key: m.match_id, job_id: m.job_id, title: m.job_title, company: m.company_name, match_id: m.match_id, stage: m.closed ? 'cerrado' : m.stage, closed: m.closed, can_schedule: m.can_schedule }))
    : (rows || []).filter((r) => r.kind === tab).sort((a, b) => (ORDER[a.status] || 0) - (ORDER[b.status] || 0))
      .map((r) => ({ key: r.job_id, job_id: r.job_id, title: r.title, status: r.status, company: [r.company_name, r.comuna, r.modality].filter(Boolean).join(' · ') }))

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-rosa-fondo pb-24 lg:max-w-4xl lg:pb-10 lg:pt-4">
      <div className="safe-t px-5 pb-3">
        <div className="flex items-center justify-between"><h1 className="text-[22px] font-bold">Intereses</h1><Bell /></div>
        <div className="mt-3"><InstallBanner /></div>
        <div role="tablist" className="mt-3.5 flex flex-wrap gap-1.5">
          {TABS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`h-10 whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold ${tab === k ? 'border-morado bg-morado text-white' : 'border-linea bg-white text-tinta-2'}`}>
              {label} · {count(k)}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[13px] leading-snug text-tinta-3">{TABS.find((t) => t[0] === tab)[2]}{tab === 'invited' && recs.length > 0 ? ' También verás aquí las vacantes que te recomienda un asesor/a de VINKA.' : ''}</p>
      </div>
      <div className="flex flex-col gap-2.5 px-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3">
        {err && <div className="lg:col-span-2"><ErrorBox>{err}</ErrorBox></div>}
        {rows != null && tab === 'invited' && recs.map((x) => (
          <div key={x.id} className="card flex flex-col gap-2.5 border-[#F3D9A4] p-3.5">
            <Link to={`/vacante/${x.job_id}`} className="flex items-center gap-3" aria-label={`Ver vacante completa: ${x.title}`}>
              <Avatar text={initials(x.company)} color={colorFor(x.company || '')} size={44} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-semibold">{x.title}</span>
                <span className="truncate text-[13px] text-tinta-3">{[x.company, x.comuna, x.modality].filter(Boolean).join(' · ')}</span>
              </div>
              <span className="pill whitespace-nowrap bg-[#FFF4D6] text-[#7A5200]">RECOMENDADA</span>
            </Link>
            <Link to={`/vacante/${x.job_id}`} className="-mt-1 self-start text-[13px] font-semibold text-rosa-texto">Ver vacante completa →</Link>
            <div className="rounded-xl bg-[#FFFAEE] px-3 py-2 text-[13px] leading-snug text-tinta-2">
              <b>Te recomienda: {x.recommended_by}</b>
              {x.note && <span className="mt-0.5 block whitespace-pre-line text-tinta-3">«{x.note}»</span>}
            </div>
            <span className="text-[13px] leading-snug text-tinta-3">Si te interesa, postulas como siempre y tus datos se comparten con quien gestiona esta vacante. Si no, nadie más sabrá de esta recomendación.</span>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-sm border border-linea bg-white" onClick={() => declineRec(x)}>No, gracias</button>
              <button className="btn-sm bg-rosa-accion text-white" onClick={() => respond(x.job_id, 'interest', null, x)}>Me interesa</button>
            </div>
          </div>
        ))}
        {rows == null ? <div className="lg:col-span-2"><Spinner /></div> : list.length === 0 && !(tab === 'invited' && recs.length) ? (
          <div className="lg:col-span-2"><Empty title="Nada por aquí todavía">{tab === 'invited' ? 'Cuando una empresa se interese en ti, aparecerá aquí.' : <>Sigue explorando en <Link to="/" className="font-semibold text-rosa-texto">Explorar</Link>.</>}</Empty></div>
        ) : list.map((r) => (
          <div key={r.key} className="card flex flex-col gap-2.5 p-3.5">
            <Link to={`/vacante/${r.job_id}`} className="flex items-center gap-3" aria-label={`Ver vacante completa: ${r.title}`}>
              <Avatar text={initials(r.company)} color={colorFor(r.company)} size={44} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-semibold">{r.title}</span>
                <span className="truncate text-[13px] text-tinta-3">{r.company}</span>
              </div>
              <span className={`pill whitespace-nowrap ${(STAGE_PILL[r.stage] || STATUS_PILL[r.status] || PILL[tab])[1]}`}>{(STAGE_PILL[r.stage] || STATUS_PILL[r.status] || PILL[tab])[0]}</span>
            </Link>
            <Link to={`/vacante/${r.job_id}`} className="-mt-1 self-start text-[13px] font-semibold text-rosa-texto">Ver vacante completa →</Link>
            {(STAGE_PILL[r.stage]?.[2] || STATUS_TXT[r.status]) && <span className="text-[13px] leading-snug text-tinta-3">{STAGE_PILL[r.stage]?.[2] || STATUS_TXT[r.status]}</span>}
            {tab === 'invited' && (
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-sm border border-linea bg-white" onClick={() => respond(r.job_id, 'pass')}>No, gracias</button>
                <button className="btn-sm bg-rosa-accion text-white" onClick={() => respond(r.job_id, 'interest')}>Me interesa</button>
              </div>
            )}
            {tab === 'match' && <ProcessSteps r={r} ivs={ivs} offers={offers} onInterview={setIvOpen} />}
            {tab === 'match' && <Link to={`/chats/${r.match_id}`} className={`btn-sm ${byMatch[r.match_id] ? 'bg-rosa-accion text-white' : 'bg-rosa-palido text-rosa-oscuro'}`}>{byMatch[r.match_id] ? `Abrir chat · ${byMatch[r.match_id].n} sin leer` : 'Abrir chat'}</Link>}
            {tab === 'saved' && r.status !== 'pendiente' && <button className="btn-sm self-start border border-linea bg-white" onClick={() => unsave(r.job_id)}>Quitar de guardadas</button>}
            {tab === 'saved' && r.status === 'pendiente' && (
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-sm border border-linea bg-white" onClick={() => unsave(r.job_id)}>Quitar</button>
                <button className="btn-sm bg-rosa-accion text-white" onClick={() => respond(r.job_id, 'interest')}>Me interesa</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <ScreeningSheet open={!!ask} title={ask?.title} questions={ask?.questions} onClose={() => setAsk(null)}
        onSubmit={async (answers) => { const a = ask; setAsk(null); await respond(a.job_id, 'interest', answers, a.rec) }} />
      <MatchModal match={match} onClose={() => setMatch(null)} />
      <Sheet open={!!ivOpen} onClose={() => setIvOpen(null)} title="Tu entrevista">
        {ivOpen && <InterviewCard iv={ivOpen} role="candidate" onChange={() => { setIvOpen(null); load() }} />}
      </Sheet>
    </div>
  )
}

/** Lo que está en curso en esta postulación (agenda, entrevista, carta oferta), con su acción directa */
function ProcessSteps({ r, ivs, offers, onInterview }) {
  const now = Date.now()
  const iv = ivs.filter((x) => x.match_id === r.match_id && x.status === 'confirmada' && new Date(x.ends_at) > now).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0]
  const offer = offers.find((o) => o.match_id === r.match_id)
  const rows = []
  if (iv) rows.push(
    <div key="iv" className="flex items-center gap-3 rounded-xl border border-rosa-borde bg-rosa-palido px-3 py-2.5">
      <Svg name="calendar" size={20} className="shrink-0 text-rosa-accion" />
      <span className="flex min-w-0 flex-1 flex-col"><span className="text-sm font-semibold text-rosa-oscuro">Entrevista {fmtDayShort(iv.starts_at)} · {fmtTime(iv.starts_at)}</span>
        <span className="truncate text-xs text-tinta-3">{iv.mode === 'online' ? 'Videollamada' : `Presencial${iv.address ? ` · ${iv.address}` : ''}`}</span></span>
      <button className="btn-sm shrink-0 bg-white text-rosa-texto" onClick={() => onInterview(iv)}>Ver</button>
    </div>,
  )
  else if (r.can_schedule && !r.closed) rows.push(
    <Link key="ag" to={`/chats/${r.match_id}/agendar`} className="flex items-center gap-3 rounded-xl border border-rosa-borde bg-rosa-palido px-3 py-2.5">
      <Svg name="calendar" size={20} className="shrink-0 text-rosa-accion" />
      <span className="flex flex-1 flex-col"><span className="text-sm font-semibold text-rosa-oscuro">Puedes agendar tu entrevista</span><span className="text-xs text-tinta-3">La empresa te invitó a elegir un horario</span></span>
      <span className="text-sm font-semibold text-rosa-texto">Elegir</span>
    </Link>,
  )
  if (offer) {
    const t = { enviada: ['Tienes una carta oferta', 'Responder'], aceptada: ['Aceptaste la oferta', 'Ver'], vencida: ['La oferta venció', 'Ver'], rechazada: ['No aceptaste la oferta', 'Ver'] }[offer.status] || ['Carta oferta', 'Ver']
    rows.push(
      <Link key="of" to={`/ofertas/${offer.id}`} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${offer.status === 'enviada' ? 'border-[#F5C892] bg-naranja-palido' : 'border-linea bg-white'}`}>
        <Svg name="doc" size={20} className="shrink-0 text-naranja-texto" />
        <span className="flex min-w-0 flex-1 flex-col"><span className="text-sm font-semibold text-[#6B3800]">{t[0]}</span>
          <span className="text-xs leading-snug text-[#4A2A00]">{offer.position}{offer.status === 'enviada' && offer.expires_on ? ` · responde antes del ${new Date(offer.expires_on + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}` : ''}</span></span>
        <span className="text-sm font-semibold text-naranja-texto">{t[1]}</span>
      </Link>,
    )
  }
  return rows.length ? <div className="flex flex-col gap-2">{rows}</div> : null
}
