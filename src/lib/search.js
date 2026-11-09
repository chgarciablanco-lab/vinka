/** Minúsculas y sin tildes: "Técnico" encuentra "tecnico" y al revés */
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Separa la búsqueda en términos: palabras, "frases exactas", #etiquetas y -exclusiones */
export function parseQuery(q) {
  const terms = []
  const re = /(-?)"([^"]+)"|(\S+)/g
  let m
  while ((m = re.exec(q))) {
    if (m[2]) terms.push({ neg: m[1] === '-', text: norm(m[2]), tag: false })
    else {
      let w = m[3]; const neg = w.startsWith('-') && w.length > 1; if (neg) w = w.slice(1)
      const tag = w.startsWith('#') && w.length > 1; if (tag) w = w.slice(1)
      if (w) terms.push({ neg, text: norm(w), tag })
    }
  }
  return terms
}
