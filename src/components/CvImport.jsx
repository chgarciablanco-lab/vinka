import { useRef, useState } from 'react'
import { callAi } from './AiAssist'
import { ErrorBox, Sheet, Svg } from './ui'

const MAX = 5 * 1024 * 1024
const keyExp = (x) => `${x.role}|${x.company}`.toLowerCase()
const keyEdu = (x) => `${x.title}|${x.institution}`.toLowerCase()
const period = (x) => [x.from, x.current ? 'actual' : x.to].filter(Boolean).join(' – ')

const toBase64 = (file) => new Promise((ok, fail) => {
  const r = new FileReader()
  r.onload = () => ok(String(r.result).split(',')[1])
  r.onerror = () => fail(new Error('No pudimos abrir el archivo.'))
  r.readAsDataURL(file)
})
// Fotos del celular: se achican a 1800 px para que viajen rápido
const shrinkImage = (file) => new Promise((ok, fail) => {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    const k = Math.min(1, 1800 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    URL.revokeObjectURL(url)
    ok(c.toDataURL('image/jpeg', 0.85).split(',')[1])
  }
  img.onerror = () => { URL.revokeObjectURL(url); fail(new Error('No pudimos abrir la foto. Prueba con otra o sube tu CV en PDF.')) }
  img.src = url
})

async function readCv(file) {
  const name = file.name.toLowerCase()
  if (file.type.startsWith('image/')) return { file: { media_type: 'image/jpeg', data: await shrinkImage(file) } }
  if (file.size > MAX) throw new Error('El archivo pesa más de 5 MB. Prueba con una versión más liviana.')
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return { file: { media_type: 'application/pdf', data: await toBase64(file) } }
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth/mammoth.browser')
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return { text: value }
  }
  if (name.endsWith('.doc')) throw new Error('Los archivos .doc antiguos no se pueden leer. Guárdalo como PDF o .docx e inténtalo de nuevo.')
  throw new Error('Formato no soportado. Sube un PDF, un Word (.docx) o una foto de tu CV.')
}

/**
 * Sube un CV, la IA lo lee y la persona elige qué datos pasar a su perfil.
 * current: datos actuales del perfil; onApply(patch) recibe solo lo elegido.
 */
export function CvImport({ current, onApply }) {
  const input = useRef()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [cv, setCv] = useState(null)
  const [pick, setPick] = useState(null)

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErr(''); setBusy(true)
    try {
      const payload = await readCv(file)
      const { data } = await callAi('cv_parse', 'write', payload)
      const haveExp = new Set((current.experiences || []).map(keyExp))
      const haveEdu = new Set((current.education || []).map(keyEdu))
      setCv(data)
      setPick({
        headline: !!data.headline, place: !!(data.region || data.comuna), bio: !!data.bio && !current.bio,
        exp: data.experiences.map((x) => !haveExp.has(keyExp(x))), edu: data.education.map((x) => !haveEdu.has(keyEdu(x))),
        skills: data.skills.filter((s) => !(current.skills || []).some((c) => c.toLowerCase() === s.toLowerCase())),
        areas: data.areas,
      })
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  const apply = () => {
    const patch = {}
    if (pick.headline && cv.headline) patch.headline = cv.headline
    const exps = cv.experiences.filter((_, i) => pick.exp[i])
    if (exps.length) { patch.experiences = [...exps, ...(current.experiences || [])]; patch.has_experience = true }
    const edu = cv.education.filter((_, i) => pick.edu[i])
    if (edu.length) patch.education = [...edu, ...(current.education || [])]
    if (pick.skills.length) patch.skills = [...new Set([...(current.skills || []), ...pick.skills])].slice(0, 20)
    if (pick.place) { if (cv.region) patch.region = cv.region; if (cv.comuna) patch.comuna = cv.comuna }
    if (pick.bio && cv.bio) patch.bio = cv.bio
    if (pick.areas.length) patch.areas = pick.areas
    onApply(patch)
    setCv(null)
  }
  const toggleIn = (k, i) => setPick((p) => ({ ...p, [k]: p[k].map((v, j) => (j === i ? !v : v)) }))
  const toggleTag = (k, v) => setPick((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] }))
  const count = pick ? [pick.headline, pick.place, pick.bio].filter(Boolean).length + pick.exp.filter(Boolean).length + pick.edu.filter(Boolean).length + pick.skills.length + pick.areas.length : 0

  const Row = ({ on, onClick, title, sub }) => (
    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${on ? 'border-rosa-accion bg-rosa-fondo' : 'border-linea bg-white'}`}>
      <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#D02E72]" checked={on} onChange={onClick} />
      <span className="flex min-w-0 flex-col gap-0.5"><span className="text-sm font-semibold">{title}</span>{sub && <span className="text-xs text-tinta-3">{sub}</span>}</span>
    </label>
  )

  return (
    <>
      <div className="flex flex-col gap-3 rounded-2xl border border-[#E9D3F0] bg-[#F7F0FB] p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#6B2E8F]"><Svg name="doc" /></span>
          <div className="flex flex-col gap-0.5">
            <span className="text-[15px] font-semibold text-[#4A2163]">¿Tienes tu CV? Te ahorramos el trabajo</span>
            <span className="text-[13px] leading-snug text-[#5B3A70]">Súbelo en PDF, Word o como foto y completamos tu perfil. Tú revisas antes de guardar.</span>
          </div>
        </div>
        <input ref={input} type="file" accept=".pdf,.docx,.doc,application/pdf,image/*" className="sr-only" onChange={onFile} aria-label="Subir CV" />
        {busy ? (
          <div className="flex h-12 items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-[#6B2E8F]" role="status">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#6B2E8F] border-t-transparent" />Leyendo tu CV… puede tardar unos segundos
          </div>
        ) : (
          <button type="button" onClick={() => input.current?.click()} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#6B2E8F] text-[15px] font-semibold text-white">
            <Svg name="download" size={18} className="rotate-180" />Subir mi CV
          </button>
        )}
        <ErrorBox>{err}</ErrorBox>
        <span className="text-[11px] leading-snug text-[#5B3A70]">No guardamos tu archivo: solo usamos los datos laborales que elijas. Nunca tomamos RUT, edad, foto ni datos personales.</span>
      </div>

      <Sheet open={!!cv} onClose={() => setCv(null)} title="Esto encontramos en tu CV">
        {cv && pick && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-tinta-3">Marca lo que quieres agregar a tu perfil. Después puedes editar todo.</p>
            {cv.headline && <div className="flex flex-col gap-2"><span className="label">Cargo que buscas</span>
              <Row on={pick.headline} onClick={() => setPick({ ...pick, headline: !pick.headline })} title={cv.headline} sub={current.headline && current.headline !== cv.headline ? `Reemplaza: ${current.headline}` : null} /></div>}
            {cv.experiences.length > 0 && <div className="flex flex-col gap-2"><span className="label">Experiencia ({cv.experiences.length})</span>
              {cv.experiences.map((x, i) => <Row key={i} on={pick.exp[i]} onClick={() => toggleIn('exp', i)} title={`${x.role} · ${x.company}`} sub={[period(x) || 'Sin fechas: agrégalas después', x.description].filter(Boolean).join(' · ')} />)}</div>}
            {cv.education.length > 0 && <div className="flex flex-col gap-2"><span className="label">Estudios ({cv.education.length})</span>
              {cv.education.map((x, i) => <Row key={i} on={pick.edu[i]} onClick={() => toggleIn('edu', i)} title={x.title || x.level} sub={[x.institution, x.level, x.status].filter(Boolean).join(' · ')} />)}</div>}
            {cv.skills.length > 0 && <fieldset className="flex flex-col gap-2"><legend className="label mb-2">Habilidades</legend>
              <div className="flex flex-wrap gap-1.5">{cv.skills.map((s) => <button key={s} type="button" aria-pressed={pick.skills.includes(s)} onClick={() => toggleTag('skills', s)} className={`chip h-9 text-[13px] ${pick.skills.includes(s) ? 'chip-on' : ''}`}>{pick.skills.includes(s) && <Svg name="check" size={14} width={3} className="mr-1" />}{s}</button>)}</div></fieldset>}
            {(cv.region || cv.comuna) && <div className="flex flex-col gap-2"><span className="label">Ubicación</span>
              <Row on={pick.place} onClick={() => setPick({ ...pick, place: !pick.place })} title={[cv.comuna, cv.region].filter(Boolean).join(', ')} /></div>}
            {cv.areas.length > 0 && <fieldset className="flex flex-col gap-2"><legend className="label mb-2">Áreas de interés</legend>
              <div className="flex flex-wrap gap-1.5">{cv.areas.map((s) => <button key={s} type="button" aria-pressed={pick.areas.includes(s)} onClick={() => toggleTag('areas', s)} className={`chip h-9 text-[13px] ${pick.areas.includes(s) ? 'chip-on' : ''}`}>{s}</button>)}</div></fieldset>}
            {cv.bio && <div className="flex flex-col gap-2"><span className="label">Presentación sugerida</span>
              <Row on={pick.bio} onClick={() => setPick({ ...pick, bio: !pick.bio })} title={cv.bio} sub={current.bio ? 'Reemplaza tu presentación actual' : null} /></div>}
            <p className="text-xs leading-snug text-tinta-suave">Leído con IA: revisa cargos, fechas y nombres antes de guardar. Puede equivocarse.</p>
            <button className="btn" disabled={!count} onClick={apply}>Agregar a mi perfil ({count})</button>
          </div>
        )}
      </Sheet>
    </>
  )
}
