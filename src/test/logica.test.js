// Pruebas de la lógica de la app que no necesitan base de datos. Corren en GitHub en cada cambio (npm test).
import { describe, expect, it } from 'vitest'
import { clp, parseCLP, salaryText } from '../lib/catalog'
import { iva, daysLeft } from '../lib/promo'
import { norm, parseQuery } from '../lib/search'
import { isStaleChunk } from '../components/ErrorBoundary'
import { DEFAULT_CLOSING, defaultIntro, letterText, offerRows } from '../components/OfferLetter'

describe('montos en pesos', () => {
  it('formatea y lee montos chilenos', () => {
    expect(clp(1234567)).toBe('$1.234.567')
    expect(parseCLP('$1.234.567')).toBe(1234567)
    expect(parseCLP('')).toBeNull()
  })
  it('calcula el IVA de los destacados como en la base', () => {
    expect([4990, 8990, 14990].map((n) => n + iva(n))).toEqual([5938, 10698, 17838])
  })
  it('describe la renta de una vacante', () => {
    expect(salaryText({ salary_min: 600000, salary_max: 800000, salary_type: 'liquido' })).toBe('$600.000 – $800.000 líquido')
    expect(salaryText({ salary_max: 900000, salary_type: 'bruto' })).toBe('$900.000 bruto')
    expect(salaryText({})).toBe('Renta a convenir')
  })
})

describe('días restantes de un destacado', () => {
  it('cuenta hacia arriba y nunca es negativo', () => {
    expect(daysLeft(new Date(Date.now() + 2.5 * 86400000).toISOString())).toBe(3)
    expect(daysLeft(new Date(Date.now() - 86400000).toISOString())).toBe(0)
  })
})

describe('búsqueda en el banco de talentos', () => {
  it('ignora tildes y mayúsculas', () => expect(norm('Técnico ELÉCTRICO')).toBe('tecnico electrico'))
  it('entiende frases, etiquetas y exclusiones', () => {
    expect(parseQuery('ventas "jefe de local" #talca -practica')).toEqual([
      { neg: false, text: 'ventas', tag: false },
      { neg: false, text: 'jefe de local', tag: false },
      { neg: false, text: 'talca', tag: true },
      { neg: true, text: 'practica', tag: false },
    ])
  })
})

describe('recarga tras publicar una versión nueva', () => {
  it('reconoce los errores de archivos antiguos en Chrome, Safari y Firefox', () => {
    expect(isStaleChunk("'text/html' is not a valid JavaScript MIME type.")).toBe(true)
    expect(isStaleChunk('Failed to fetch dynamically imported module: /assets/x.js')).toBe(true)
    expect(isStaleChunk('Importing a module script failed.')).toBe(true)
    expect(isStaleChunk('Cannot read properties of undefined')).toBe(false)
  })
})

describe('carta oferta', () => {
  const offer = { position: 'Vendedor', salary: 750000, salary_type: 'liquido', contract: 'Indefinido', start_date: '2026-12-01', location: 'Talca', benefits: 'Seguro', expires_on: '2026-11-20', letter: { signer_name: 'Ana Pérez', signer_title: 'Gerenta', city: 'Talca' }, created_at: '2026-11-09T15:00:00Z' }
  const company = { display_name: 'Nova', legal_name: 'Nova SpA', rut: '76.123.456-7', comuna: 'Talca' }
  it('arma las condiciones sin filas vacías', () => {
    expect(offerRows(offer).map(([k]) => k)).toEqual(['Cargo', 'Renta mensual', 'Contrato', 'Fecha de inicio', 'Lugar de trabajo'])
    expect(offerRows({ position: 'X' })).toEqual([['Cargo', 'X'], ['Renta mensual', 'A conversar']])
  })
  it('usa textos formales por defecto', () => {
    expect(defaultIntro('Vendedor', 'Nova')).toContain('cargo de Vendedor en Nova')
    expect(DEFAULT_CLOSING).toContain('no reemplaza al contrato de trabajo')
  })
  it('genera el texto para enviar por correo con todos los datos', () => {
    const t = letterText({ offer, company, candidate: { name: 'Camila Rojas' } })
    for (const s of ['Nova SpA', 'RUT 76.123.456-7', 'CARTA OFERTA', 'Estimado/a Camila Rojas', '$750.000 líquido', 'Beneficios: Seguro', 'Ana Pérez', 'Gerenta']) expect(t).toContain(s)
  })
})
