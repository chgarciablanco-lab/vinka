import { describe, expect, it } from 'vitest'
import { formatRut, validRut } from '../lib/rut'

describe('RUT', () => {
  it('acepta dígito verificador correcto (con o sin puntos, K incluida)', () => {
    expect(validRut('77.812.345-2')).toBe(true)
    expect(validRut('778123452')).toBe(true)
    expect(validRut('7.654.321-6')).toBe(true)
  })
  it('rechaza dígito verificador incorrecto o RUT corto', () => {
    expect(validRut('77.812.345-5')).toBe(false)
    expect(validRut('1-9')).toBe(false)
  })
  it('da formato con puntos y guion', () => {
    expect(formatRut('778123452')).toBe('77.812.345-2')
  })
})
