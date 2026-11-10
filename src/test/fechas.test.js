import { describe, expect, it } from 'vitest'
import { atLocal, fmtTime, hm, installChileTime, toInputLocal, fromInputLocal, ymd } from '../lib/dates'

// Se corre también con TZ=America/Los_Angeles: el resultado debe ser el mismo en cualquier zona
describe('hora de Chile', () => {
  it('10:00 de Chile en noviembre (horario de verano, UTC-3) es 13:00 UTC', () => {
    expect(atLocal('2026-11-10', '10:00').toISOString()).toBe('2026-11-10T13:00:00.000Z')
  })
  it('10:00 de Chile en julio (horario de invierno, UTC-4) es 14:00 UTC', () => {
    expect(atLocal('2026-07-10', '10:00').toISOString()).toBe('2026-07-10T14:00:00.000Z')
  })
  it('una hora guardada se muestra como hora de Chile', () => {
    const t = '2026-11-10T13:00:00.000Z'
    expect(hm(t)).toBe('10:00')
    expect(fmtTime(t)).toBe('10:00')
    expect(ymd('2026-11-11T02:30:00.000Z')).toBe('2026-11-10')
  })
  it('el campo de fecha y hora va y vuelve sin correrse', () => {
    const t = new Date('2026-11-10T13:00:00.000Z')
    expect(toInputLocal(t)).toBe('2026-11-10T10:00')
    expect(fromInputLocal('2026-11-10T10:00').toISOString()).toBe(t.toISOString())
  })
  it('los formatos de toda la app usan hora de Chile por defecto', () => {
    installChileTime()
    const s = new Date('2026-11-10T13:00:00.000Z').toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    expect(s).toBe('10:00')
  })
})
