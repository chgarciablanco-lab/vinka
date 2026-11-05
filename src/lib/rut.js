export function cleanRut(r) { return String(r || '').replace(/[^0-9kK]/g, '').toUpperCase() }
export function validRut(r) {
  const c = cleanRut(r)
  if (c.length < 8) return false
  const body = c.slice(0, -1), dv = c.slice(-1)
  let s = 0, m = 2
  for (let i = body.length - 1; i >= 0; i--) { s += parseInt(body[i], 10) * m; m = m === 7 ? 2 : m + 1 }
  const r2 = 11 - (s % 11)
  const exp = r2 === 11 ? '0' : r2 === 10 ? 'K' : String(r2)
  return exp === dv
}
export function formatRut(r) {
  const c = cleanRut(r)
  if (c.length < 2) return c
  const body = c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${body}-${c.slice(-1)}`
}
