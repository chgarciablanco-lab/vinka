import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { atLocal, fmtDayLong, fmtDayShort, fmtTime, minutes, ymd } from '../../lib/dates'
import { Calendar } from '../../components/Calendar'
import { InterviewCard } from '../../components/InterviewCard'
import { Chips, Empty, ErrorBox, Field, Sheet, Spinner, Svg, Toast } from '../../components/ui'

const DURS = [20, 30, 45, 60]
const HOURS = Array.from({ length: 29 }, (_, i) => { const m = 7 * 60 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }) // 07:00–21:00

export default function Agenda() {
  const { company, refresh } = useAuth()
  const [day, setDay] = useState(ymd(new Date()))
  const [rows, setRows] = useState(null)
  const [jobs, setJobs] = useState([])
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [err, setErr] = useState('')
  const [detail, setDetail] = useState(null)

  const load = useCallback(async () => {
    const from = new Date(); from.setDate(1); from.setMonth(from.getMonth() - 1); from.setHours(0, 0, 0, 0)
    const to = new Date(); to.setMonth(to.getMonth() + 4)
    const { data, error } = await supabase.rpc('company_agenda', { p_company: company.id, p_from: from.toISOString(), p_to: to.toISOString() })
    if (error) setErr(errMsg(error))
    setRows(data || [])
  }, [company])
  useEffect(() => { load() }, [load])
  useEffect(() => { supabase.from('jobs').select('id,title').eq('company_id', company.id).eq('status', 'published').then(({ data }) => setJobs(data || [])) }, [company])
  useEffect(() => {
    const ch = supabase.channel('agenda').on('postgres_changes', { event: '*', schema: 'public', table: 'interviews' }, () => load()).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  const marks = useMemo(() => {
    const m = {}
    for (const r of rows || []) {
      const k = ymd(r.starts_at); m[k] = m[k] || { free: 0, booked: 0 }
      if (r.interview_id) m[k].booked++; else if (r.slot_status === 'open' && new Date(r.starts_at) > new Date()) m[k].free++
    }
    return m
  }, [rows])
  const dayRows = (rows || []).filter((r) => ymd(r.starts_at) === day)
  const upcoming = (rows || []).filter((r) => r.interview_id && r.interview_status === 'confirmada' && new Date(r.ends_at) > new Date()).slice(0, 5)

  const del = async (id) => {
    const { error } = await supabase.rpc('delete_slot', { p_slot: id })
    if (error) return setErr(errMsg(error)); load()
  }

  const verified = company?.verification_status === 'verified'
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-[#FAF7F9] pb-28">
      <div className="safe-t flex items-end justify-between px-5 pb-3">
        <div><h1 className="text-[22px] font-bold">Agenda</h1><p className="text-[13px] text-tinta-3">Publica tus horarios libres y tus matches eligen uno.</p></div>
      </div>
      <div className="flex flex-col gap-4 px-5">
        {!verified && <div className="rounded-2xl border border-[#F5C892] bg-naranja-palido p-3.5 text-sm text-[#4A2A00]">Podrás publicar horarios cuando tu empresa esté verificada.</div>}
        <button className="btn" disabled={!verified} onClick={() => setOpen(true)}><Svg name="plus" size={20} stroke="#fff" />Agregar disponibilidad</button>
        <ErrorBox>{err}</ErrorBox>
        {upcoming.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-[16px] font-semibold">Próximas entrevistas</h2>
            {upcoming.map((r) => (
              <button key={r.slot_id} onClick={() => setDetail(r)} className="card flex items-center gap-3 p-3 text-left">
                <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-rosa-palido py-1.5 text-rosa-oscuro">
                  <span className="text-[11px] font-semibold uppercase">{fmtDayShort(r.starts_at).split(' ')[0]}</span>
                  <span className="font-display text-lg font-bold leading-none">{new Date(r.starts_at).getDate()}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{fmtTime(r.starts_at)} · {r.candidate_name}</span>
                  <span className="truncate text-xs text-tinta-3">{r.booked_job_title} · {r.mode === 'online' ? 'Videollamada' : 'Presencial'}</span>
                </div>
                <Svg name="chevron" size={18} className="text-tinta-suave" />
              </button>
            ))}
          </div>
        )}
        {rows == null ? <Spinner /> : <Calendar selected={day} onSelect={setDay} marks={marks} allowPast />}
        <div className="flex items-center gap-4 text-xs text-tinta-3">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rosa" />Horarios libres</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-naranja" />Entrevistas reservadas</span>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-[16px] font-semibold">{fmtDayLong(day + 'T12:00:00')}</h2>
          {dayRows.length === 0 ? <p className="text-sm text-tinta-3">Sin horarios este día.</p> : dayRows.map((r) => {
            const booked = !!r.interview_id
            const past = new Date(r.starts_at) < new Date()
            return (
              <div key={r.slot_id} className={`flex items-center gap-3 rounded-xl border p-3 ${booked ? 'border-[#F5C892] bg-naranja-palido' : 'border-[#EEE3EA] bg-white'}`}>
                <div className="flex w-[74px] shrink-0 flex-col">
                  <span className="font-display text-[16px] font-semibold">{fmtTime(r.starts_at)}</span>
                  <span className="text-[11px] text-tinta-suave">{minutes(r.starts_at, r.ends_at)} min</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  {booked ? <>
                    <span className="truncate text-sm font-semibold">{r.candidate_name}</span>
                    <span className="truncate text-xs text-tinta-3">{r.booked_job_title} · {r.interview_status === 'realizada' ? 'Realizada' : 'Reservado'}</span>
                  </> : <>
                    <span className="text-sm font-medium">{past ? 'No se usó' : 'Libre'}</span>
                    <span className="truncate text-xs text-tinta-3">{r.mode === 'online' ? 'Videollamada' : `Presencial · ${r.address}`}{r.job_title ? ` · ${r.job_title}` : ''}</span>
                  </>}
                </div>
                {booked
                  ? <button onClick={() => setDetail(r)} className="btn-sm border border-linea bg-white px-3">Ver</button>
                  : !past && <button aria-label={`Borrar horario de las ${fmtTime(r.starts_at)}`} onClick={() => del(r.slot_id)} className="flex h-11 w-11 items-center justify-center text-tinta-suave"><Svg name="x" size={18} /></button>}
              </div>
            )
          })}
        </div>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Agregar disponibilidad">
        {open && <AvailabilityForm company={company} jobs={jobs} onDone={(n) => { setOpen(false); setToast(n ? `Publicaste ${n} horario(s). Tus matches ya pueden reservar.` : 'No se agregaron horarios nuevos (ya existían o eran pasados).'); load(); refresh() }} />}
      </Sheet>
      <Sheet open={!!detail} onClose={() => setDetail(null)} title="Entrevista">
        {detail && (
          <div className="flex flex-col gap-3">
            <InterviewCard role="company" onChange={() => { setDetail(null); load() }}
              iv={{ interview_id: detail.interview_id, starts_at: detail.starts_at, ends_at: detail.ends_at, mode: detail.mode, meeting_url: detail.meeting_url,
                address: detail.address, comuna: detail.comuna, notes: detail.notes, status: detail.interview_status, job_title: detail.booked_job_title, candidate_name: detail.candidate_name }} />
            <Link to={`/chats/${detail.match_id}`} className="btn-sec">Abrir chat</Link>
          </div>
        )}
      </Sheet>
      <Toast msg={toast} onDone={() => setToast('')} />
    </div>
  )
}

function AvailabilityForm({ company, jobs, onDone }) {
  const [days, setDays] = useState([])
  const [from, setFrom] = useState('09:00')
  const [to, setTo] = useState('12:00')
  const [dur, setDur] = useState(30)
  const [gap, setGap] = useState(0)
  const [mode, setMode] = useState(company.interview_address && !company.interview_link ? 'presencial' : 'online')
  const [url, setUrl] = useState(company.interview_link || '')
  const [address, setAddress] = useState(company.interview_address || '')
  const [comuna, setComuna] = useState(company.comuna || '')
  const [notes, setNotes] = useState('')
  const [job, setJob] = useState('')
  const [remember, setRemember] = useState(true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const slots = useMemo(() => {
    const out = []
    for (const d of days) {
      let s = atLocal(d, from); const end = atLocal(d, to)
      while (s.getTime() + dur * 60000 <= end.getTime()) {
        const e = new Date(s.getTime() + dur * 60000)
        if (s > new Date()) out.push({ s: s.toISOString(), e: e.toISOString() })
        s = new Date(e.getTime() + gap * 60000)
      }
    }
    return out
  }, [days, from, to, dur, gap])

  const jitsi = () => setUrl(`https://meet.jit.si/VINKA-${(company.display_name || 'empresa').normalize('NFD').replace(/[^\w]/g, '')}-${Math.random().toString(36).slice(2, 8)}`)
  const toggle = (d) => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort()))

  const save = async () => {
    setErr('')
    if (!days.length) return setErr('Elige al menos un día en el calendario.')
    if (!slots.length) return setErr('Con ese rango no caben entrevistas. Revisa las horas.')
    if (mode === 'online' && !/^https:\/\//i.test(url.trim())) return setErr('Pega un enlace de videollamada que empiece con https:// o genera uno.')
    if (mode === 'presencial' && !address.trim()) return setErr('Escribe la dirección.')
    setBusy(true)
    const { data, error } = await supabase.rpc('add_slots', { p_company: company.id, p_times: slots, p_mode: mode, p_url: url, p_address: address, p_comuna: comuna, p_notes: notes, p_job: job || null })
    if (!error && remember) await supabase.from('companies').update(mode === 'online' ? { interview_link: url.trim() } : { interview_address: address.trim() }).eq('id', company.id)
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone(data)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="label">1. Elige uno o varios días</span>
        <Calendar multi selected={days} onSelect={toggle} />
        {days.length > 0 && <span className="hint">{days.map((d) => fmtDayShort(d)).join(' · ')}</span>}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="label">2. ¿En qué horario?</span>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Desde"><select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>{HOURS.map((h) => <option key={h}>{h}</option>)}</select></Field>
          <Field label="Hasta"><select className="input" value={to} onChange={(e) => setTo(e.target.value)}>{HOURS.filter((h) => h > from).map((h) => <option key={h}>{h}</option>)}</select></Field>
        </div>
      </div>
      <Chips legend="Duración de cada entrevista" multi={false} options={DURS.map((d) => `${d} min`)} value={`${dur} min`} onChange={(v) => v && setDur(parseInt(v, 10))} />
      <Chips legend="Pausa entre entrevistas" multi={false} options={['Sin pausa', '5 min', '10 min', '15 min']} value={gap ? `${gap} min` : 'Sin pausa'} onChange={(v) => setGap(v && v !== 'Sin pausa' ? parseInt(v, 10) : 0)} />
      <Chips legend="Modalidad" multi={false} options={['Videollamada', 'Presencial']} value={mode === 'online' ? 'Videollamada' : 'Presencial'} onChange={(v) => v && setMode(v === 'Videollamada' ? 'online' : 'presencial')} />
      {mode === 'online' ? (
        <Field label="Enlace de videollamada" hint="Pega tu enlace de Google Meet, Zoom o Teams, o genera uno gratis con Jitsi.">
          <input className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://meet.google.com/…" />
          <button type="button" onClick={jitsi} className="btn-sm mt-1 self-start border border-rosa-accion bg-white text-rosa-texto">Generar enlace Jitsi</button>
        </Field>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label="Dirección"><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ej.: 1 Sur 1234, oficina 502" /></Field>
          <Field label="Comuna"><input className="input" value={comuna} onChange={(e) => setComuna(e.target.value)} /></Field>
        </div>
      )}
      <Field label="Indicaciones (opcional)" hint="Ej.: pregunta por Ana en recepción, trae tu carnet.">
        <input className="input" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Field label="¿Para qué vacante?">
        <select className="input" value={job} onChange={(e) => setJob(e.target.value)}>
          <option value="">Cualquier vacante con match</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
      </Field>
      <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" className="h-5 w-5 accent-[#D02E72]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Recordar {mode === 'online' ? 'este enlace' : 'esta dirección'} para la próxima vez</label>
      <div className="rounded-xl bg-rosa-fondo px-3.5 py-3 text-sm">
        Se publicarán <b>{slots.length}</b> horario(s) de {dur} min{days.length > 1 ? ` en ${days.length} días` : ''}.
      </div>
      <ErrorBox>{err}</ErrorBox>
      <button className="btn" disabled={busy} onClick={save}>{busy ? 'Publicando…' : 'Publicar horarios'}</button>
    </div>
  )
}
