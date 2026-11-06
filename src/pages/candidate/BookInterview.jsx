import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { fmtDayLong, fmtTime, minutes, ymd } from '../../lib/dates'
import { Calendar } from '../../components/Calendar'
import { InterviewCard } from '../../components/InterviewCard'
import { Empty, ErrorBox, Screen, Sheet, Spinner, TopBar } from '../../components/ui'

/** La persona con match elige un horario libre de la empresa y solicita la entrevista. */
export default function BookInterview() {
  const { id } = useParams()
  const nav = useNavigate()
  const [match, setMatch] = useState(null)
  const [slots, setSlots] = useState(null)
  const [day, setDay] = useState(null)
  const [pick, setPick] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [booked, setBooked] = useState(null)

  const load = async () => {
    const [{ data: ms }, { data: sl, error }] = await Promise.all([supabase.rpc('my_matches'), supabase.rpc('available_slots', { p_match: id })])
    if (error) setErr(errMsg(error))
    setMatch((ms || []).find((m) => m.match_id === id) || false)
    setSlots(sl || [])
    if (sl?.length) setDay((d) => d || ymd(sl[0].starts_at))
  }
  useEffect(() => { load() }, [id]) // eslint-disable-line

  const marks = useMemo(() => {
    const m = {}
    for (const s of slots || []) { const k = ymd(s.starts_at); m[k] = m[k] || { free: 0 }; m[k].free++ }
    return m
  }, [slots])
  const daySlots = (slots || []).filter((s) => ymd(s.starts_at) === day)

  const book = async () => {
    setErr(''); setBusy(true)
    const { data: iid, error } = await supabase.rpc('book_slot', { p_slot: pick.slot_id, p_match: id })
    setBusy(false)
    if (error) { setErr(errMsg(error)); setPick(null); return load() }
    const { data: ivs } = await supabase.rpc('my_interviews')
    setPick(null)
    setBooked((ivs || []).find((x) => x.interview_id === iid))
  }

  if (match === null || slots === null) return <Spinner />
  if (match === false) return <Screen><TopBar back title="Agendar" /><div className="p-6"><Empty title="Chat no disponible">No encontramos este match.</Empty></div></Screen>

  if (booked) return (
    <Screen>
      <TopBar back={`/chats/${id}`} title="Entrevista agendada" />
      <div className="flex flex-col gap-4 px-5 pb-10 pt-2">
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF6EF] text-[#1E6B3F]">
            <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
          <h1 className="text-2xl font-bold">¡Listo, quedó agendada!</h1>
          <p className="text-sm text-tinta-3">Le avisamos a {match.company_name}. Te recordaremos una hora antes.</p>
        </div>
        <InterviewCard iv={booked} role="candidate" onChange={() => { setBooked(null); load() }} />
        <Link to={`/chats/${id}`} className="btn-sec">Volver al chat</Link>
      </div>
    </Screen>
  )

  return (
    <Screen className="bg-[#FAF7F9]">
      <TopBar back={`/chats/${id}`} title="Agendar entrevista" />
      <div className="flex flex-col gap-4 px-5 pb-10 pt-1">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-tinta-3">{match.company_name}</span>
          <span className="font-display text-lg font-semibold">{match.job_title}</span>
        </div>
        <ErrorBox>{err}</ErrorBox>
        {slots.length === 0 ? (
          <Empty title="Aún no hay horarios disponibles" action={<Link to={`/chats/${id}`} className="btn-sm mt-1 border border-rosa-accion bg-white text-rosa-texto">Escribir a la empresa</Link>}>
            {match.company_name} todavía no publica su disponibilidad. Puedes pedírsela por el chat; te avisaremos cuando la publique.
          </Empty>
        ) : (
          <>
            <p className="text-sm text-tinta-3">Los días marcados tienen horarios libres. Elige el que te acomode.</p>
            <Calendar selected={day} onSelect={setDay} marks={marks} onlyMarked />
            {day && (
              <div className="flex flex-col gap-2">
                <h2 className="text-[16px] font-semibold">{fmtDayLong(day + 'T12:00:00')}</h2>
                <div className="grid grid-cols-3 gap-2">
                  {daySlots.map((s) => (
                    <button key={s.slot_id} onClick={() => setPick(s)} className="flex h-14 flex-col items-center justify-center rounded-xl border border-rosa-accion bg-white text-rosa-oscuro active:scale-95">
                      <span className="font-display text-[16px] font-semibold">{fmtTime(s.starts_at)}</span>
                      <span className="text-[10px] font-medium text-tinta-3">{s.mode === 'online' ? 'Video' : 'Presencial'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <Sheet open={!!pick} onClose={() => setPick(null)} title="Confirma tu entrevista">
        {pick && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 rounded-2xl bg-rosa-fondo p-4">
              <span className="font-display text-xl font-semibold">{fmtDayLong(pick.starts_at)}</span>
              <span className="text-[15px]">{fmtTime(pick.starts_at)} – {fmtTime(pick.ends_at)} · {minutes(pick.starts_at, pick.ends_at)} min</span>
              <span className="mt-1 text-sm font-semibold text-rosa-texto">{pick.mode === 'online' ? 'Por videollamada' : 'Presencial'}</span>
              {pick.mode === 'presencial' && <span className="text-sm">{[pick.address, pick.comuna].filter(Boolean).join(', ')}</span>}
              {pick.notes && <span className="mt-1 text-sm text-tinta-3">{pick.notes}</span>}
            </div>
            {pick.mode === 'online' && <p className="text-sm text-tinta-3">Recibirás el enlace para conectarte apenas confirmes.</p>}
            <button className="btn" disabled={busy} onClick={book}>{busy ? 'Agendando…' : 'Solicitar entrevista'}</button>
          </div>
        )}
      </Sheet>
    </Screen>
  )
}
