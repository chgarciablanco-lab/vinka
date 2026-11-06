import { useMemo, useState } from 'react'
import { pad, ymd } from '../lib/dates'
import { Svg } from './ui'

const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/**
 * Calendario mensual (lunes primero).
 * marks: { 'YYYY-MM-DD': { free: n, booked: n } } para mostrar puntos
 * selected: string (un día) o string[] (varios días, modo multi)
 * onlyMarked: solo se pueden tocar días con horarios libres (vista candidato)
 */
export function Calendar({ selected, onSelect, marks = {}, multi = false, onlyMarked = false, allowPast = false, onMonthChange }) {
  const today = ymd(new Date())
  const [view, setView] = useState(() => {
    const base = Array.isArray(selected) ? selected[0] : selected
    const d = base ? new Date(base + 'T12:00:00') : new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1)
    const offset = (first.getDay() + 6) % 7
    const days = new Date(view.y, view.m + 1, 0).getDate()
    const arr = Array(offset).fill(null)
    for (let d = 1; d <= days; d++) arr.push(`${view.y}-${pad(view.m + 1)}-${pad(d)}`)
    while (arr.length % 7) arr.push(null)
    return arr
  }, [view])
  const go = (delta) => {
    const d = new Date(view.y, view.m + delta, 1)
    const v = { y: d.getFullYear(), m: d.getMonth() }
    setView(v); onMonthChange?.(v)
  }
  const isSel = (day) => (multi ? (selected || []).includes(day) : selected === day)
  const thisMonth = new Date().getFullYear() === view.y && new Date().getMonth() === view.m

  return (
    <div className="card p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Mes anterior" disabled={thisMonth && !allowPast} onClick={() => go(-1)} className="flex h-11 w-11 items-center justify-center disabled:opacity-30"><Svg name="back" /></button>
        <span className="font-display text-[16px] font-semibold capitalize">{MONTHS[view.m]} {view.y}</span>
        <button type="button" aria-label="Mes siguiente" onClick={() => go(1)} className="flex h-11 w-11 items-center justify-center"><Svg name="chevron" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DOW.map((d, i) => <span key={i} className="pb-1 text-[11px] font-semibold text-tinta-suave">{d}</span>)}
        {cells.map((day, i) => {
          if (!day) return <span key={i} />
          const past = day < today
          const mk = marks[day]
          const disabled = (past && !allowPast) || (onlyMarked && !mk?.free)
          const sel = isSel(day)
          return (
            <button key={day} type="button" disabled={disabled} aria-pressed={sel}
              aria-label={`${Number(day.slice(8))} de ${MONTHS[view.m]}${mk?.free ? `, ${mk.free} horarios libres` : ''}${mk?.booked ? `, ${mk.booked} reservados` : ''}`}
              onClick={() => onSelect(day)}
              className={`relative flex h-11 flex-col items-center justify-center rounded-xl text-[15px] font-medium transition
                ${sel ? 'bg-rosa-accion text-white' : day === today ? 'border border-rosa-accion text-rosa-oscuro' : 'text-tinta'}
                ${disabled ? 'opacity-30' : !sel ? 'hover:bg-rosa-palido' : ''}
                ${onlyMarked && mk?.free && !sel ? 'bg-rosa-palido font-semibold text-rosa-oscuro' : ''}`}>
              {Number(day.slice(8))}
              {(mk?.free || mk?.booked) ? (
                <span className="absolute bottom-1 flex gap-0.5">
                  {mk.free ? <span className={`h-1.5 w-1.5 rounded-full ${sel ? 'bg-white' : 'bg-rosa'}`} /> : null}
                  {mk.booked ? <span className={`h-1.5 w-1.5 rounded-full ${sel ? 'bg-white' : 'bg-naranja'}`} /> : null}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
