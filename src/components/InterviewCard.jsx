import { useState } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { calendarLinks, fmtDayLong, fmtTime, minutes } from '../lib/dates'
import { ErrorBox, Svg } from './ui'

const STATUS = {
  confirmada: ['CONFIRMADA', 'bg-[#EAF6EF] text-[#134A2B]'],
  cancelada: ['CANCELADA', 'bg-[#F1F1F1] text-[#3A3A3A]'],
  realizada: ['REALIZADA', 'bg-[#ECE6F2] text-[#3D2F4A]'],
}

/** Detalle de una entrevista con link o dirección, calendario y acciones. */
export function InterviewCard({ iv, role, onChange, compact = false }) {
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const online = iv.mode === 'online'
  const other = role === 'company' ? iv.candidate_name : iv.company_name
  const place = online ? iv.meeting_url : [iv.address, iv.comuna].filter(Boolean).join(', ')
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`
  const cal = calendarLinks({
    title: `Entrevista VINKA · ${iv.job_title || ''} · ${other}`,
    start: iv.starts_at, end: iv.ends_at, location: place,
    details: `${online ? 'Videollamada: ' + iv.meeting_url : 'Dirección: ' + place}${iv.notes ? '\n' + iv.notes : ''}`,
  })
  const ended = new Date(iv.ends_at) < new Date()
  const soon = !ended && new Date(iv.starts_at) - new Date() < 15 * 60000

  const cancel = async () => {
    setErr('')
    const { error } = await supabase.rpc('cancel_interview', { p_interview: iv.interview_id, p_reason: reason })
    if (error) return setErr(errMsg(error))
    setCancelling(false); onChange?.()
  }
  const done = async () => {
    const { error } = await supabase.rpc('complete_interview', { p_interview: iv.interview_id })
    if (error) return setErr(errMsg(error)); onChange?.()
  }

  return (
    <div className={`flex flex-col gap-3 rounded-2xl border ${iv.status === 'confirmada' ? 'border-rosa-borde' : 'border-[#EEE3EA]'} bg-white p-4`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-rosa-texto">Entrevista {online ? 'por videollamada' : 'presencial'}</span>
          <span className="font-display text-[19px] font-semibold leading-tight">{fmtDayLong(iv.starts_at)}</span>
          <span className="text-[15px] font-medium">{fmtTime(iv.starts_at)} – {fmtTime(iv.ends_at)} <span className="text-tinta-suave">· {minutes(iv.starts_at, iv.ends_at)} min</span></span>
        </div>
        <span className={`pill whitespace-nowrap ${STATUS[iv.status]?.[1]}`}>{STATUS[iv.status]?.[0]}</span>
      </div>
      {!compact && <span className="text-sm text-tinta-3">{iv.job_title} · con <b className="text-tinta">{other}</b></span>}

      {iv.status === 'confirmada' && (
        <>
          {online ? (
            <a href={iv.meeting_url} target="_blank" rel="noreferrer" className={`btn ${soon ? '' : 'bg-morado'}`}>
              <Svg name="video" size={20} stroke="#fff" />{soon ? 'Unirse ahora' : 'Enlace de la videollamada'}
            </a>
          ) : (
            <div className="flex flex-col gap-2 rounded-xl bg-rosa-fondo p-3">
              <span className="text-xs font-semibold text-tinta-3">Dirección</span>
              <span className="text-[15px] font-medium">{place}</span>
              <a href={maps} target="_blank" rel="noreferrer" className="btn-sm self-start bg-morado text-white">Cómo llegar</a>
            </div>
          )}
          {online && <span className="break-all text-xs text-tinta-suave">{iv.meeting_url}</span>}
          {iv.notes && <p className="rounded-xl bg-[#F6F1F4] px-3 py-2 text-sm leading-relaxed">{iv.notes}</p>}
          {!compact && (
            <div className="grid grid-cols-2 gap-2">
              <a href={cal.ics} download="entrevista-vinka.ics" className="btn-sm border border-linea bg-white">Calendario del teléfono</a>
              <a href={cal.google} target="_blank" rel="noreferrer" className="btn-sm border border-linea bg-white">Google Calendar</a>
            </div>
          )}
          {!compact && !cancelling && (
            <div className="flex flex-wrap gap-2">
              {role === 'company' && ended && <button className="btn-sm bg-[#1E6B3F] text-white" onClick={done}>Marcar realizada</button>}
              {!ended && <button className="btn-sm px-2 text-[#B42318]" onClick={() => setCancelling(true)}>{role === 'candidate' ? 'Cancelar o cambiar horario' : 'Cancelar entrevista'}</button>}
            </div>
          )}
          {cancelling && (
            <div className="flex flex-col gap-2 rounded-xl border border-[#F4C7C3] bg-[#FEF3F2] p-3">
              <label className="flex flex-col gap-1.5 text-sm"><span className="font-semibold">Motivo (opcional)</span>
                <input className="input h-11" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: me surgió un imprevisto" /></label>
              {role === 'candidate' && <span className="text-xs text-tinta-3">El horario queda libre y podrás elegir otro.</span>}
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-sm border border-linea bg-white" onClick={() => setCancelling(false)}>Volver</button>
                <button className="btn-sm bg-[#B42318] text-white" onClick={cancel}>Cancelar entrevista</button>
              </div>
            </div>
          )}
        </>
      )}
      {iv.status === 'cancelada' && (
        <span className="text-sm text-tinta-3">Cancelada por {iv.cancelled_by === 'candidate' ? (role === 'candidate' ? 'ti' : 'la persona') : (role === 'company' ? 'tu empresa' : 'la empresa')}{iv.cancel_reason ? `: ${iv.cancel_reason}` : '.'}</span>
      )}
      <ErrorBox>{err}</ErrorBox>
    </div>
  )
}
