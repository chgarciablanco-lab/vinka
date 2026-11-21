import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { ErrorBox, Logo, Spinner } from '../components/ui'

// Test DISC VINKA: se responde con un enlace de un solo uso, sin cuenta. La persona no ve resultados.
const SESSION_KEY = 'vinka-disc-session'
function sessionFor(token) {
  try {
    const all = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}')
    if (!all[token]) { all[token] = crypto.randomUUID(); localStorage.setItem(SESSION_KEY, JSON.stringify(all)) }
    return all[token]
  } catch { return crypto.randomUUID() }
}

const Shell = ({ children }) => (
  <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-rosa-fondo px-5 pb-10 pt-10">
    <Logo />
    <div className="mt-6 flex flex-1 flex-col gap-4">{children}</div>
  </div>
)

export default function TestDisc() {
  const { token } = useParams()
  const session = useMemo(() => sessionFor(token), [token])
  const [t, setT] = useState(null)
  const [step, setStep] = useState('intro') // intro | test | done
  const [i, setI] = useState(0)
  const [picks, setPicks] = useState({}) // { block: { m, l } }
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [agree, setAgree] = useState(false)

  useEffect(() => {
    supabase.rpc('disc_open', { p_token: token }).then(({ data, error }) => {
      if (error) return setT({ status: 'error' })
      setT(data)
      if (data?.status === 'en_curso') {
        const done = new Set(data.answered || [])
        const next = (data.blocks || []).findIndex((b) => !done.has(b.block))
        setI(next < 0 ? data.blocks.length - 1 : next)
        setPicks(Object.fromEntries([...done].map((b) => [b, { m: -1, l: -1, saved: true }])))
      }
    })
  }, [token])

  if (!t) return <Spinner />
  if (['no_existe', 'vencido', 'error', 'completado'].includes(t.status) && step !== 'done') {
    const msg = t.status === 'completado' ? ['Test respondido', 'Este test ya fue respondido. ¡Gracias!']
      : t.status === 'vencido' ? ['Enlace vencido', 'El enlace venció. Pide uno nuevo a quien te lo envió.']
      : ['Enlace no disponible', 'El enlace no es válido. Revisa que esté completo o pide uno nuevo a quien te lo envió.']
    return <Shell><h1 className="text-[24px] font-bold leading-tight">{msg[0]}</h1><p className="text-[15px] leading-relaxed text-tinta-2">{msg[1]}</p></Shell>
  }

  const blocks = t.blocks || []
  const answered = Object.keys(picks).length

  const start = async () => {
    setErr(''); setBusy(true)
    const { error } = await supabase.rpc('disc_begin', { p_token: token, p_session: session })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setStep('test')
  }

  if (step === 'intro') return (
    <Shell>
      <span className="text-sm font-semibold uppercase tracking-wide text-rosa-texto">Test de estilo laboral</span>
      <h1 className="text-[26px] font-bold leading-tight">Hola {t.name}</h1>
      <p className="text-[15px] leading-relaxed text-tinta-2">
        {t.company} te invita a responder este test como parte del proceso para <b>{t.title}</b>. Son 24 grupos de 4 palabras: en cada uno eliges la que <b>más</b> te describe y la que <b>menos</b> te describe en el trabajo.
      </p>
      <ul className="card flex list-disc flex-col gap-1.5 p-4 pl-8 text-[14px] leading-snug text-tinta-2">
        <li>Toma entre 8 y 15 minutos. Hazlo de una vez, en un solo dispositivo.</li>
        <li>No hay respuestas buenas ni malas: responde como eres, no como crees que deberías ser.</li>
        <li>No usa cámara. Se registra cuánto tardas y desde cuántos dispositivos respondes.</li>
        <li>Describe tu estilo de trabajo, no tu capacidad. El resultado lo ve solo {t.company} y es un apoyo para la entrevista.</li>
      </ul>
      {t.status === 'en_curso' && <p className="text-[13px] text-tinta-3">Ya habías comenzado: continuarás donde quedaste.</p>}
      <label className="flex items-start gap-2.5 text-[14px] leading-snug">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#E8457A]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>Acepto responder el test y que {t.company} use el resultado en este proceso de selección. Los datos se guardan hasta 12 meses.</span>
      </label>
      <ErrorBox>{err}</ErrorBox>
      <button className="btn mt-auto" disabled={!agree || busy} onClick={start}>{busy ? 'Abriendo…' : t.status === 'en_curso' ? 'Continuar' : 'Comenzar'}</button>
    </Shell>
  )

  if (step === 'done') return (
    <Shell>
      <h1 className="text-[26px] font-bold leading-tight">¡Listo, gracias!</h1>
      <p className="text-[15px] leading-relaxed text-tinta-2">Tus respuestas quedaron enviadas a {t.company}. Ya puedes cerrar esta página.</p>
    </Shell>
  )

  const b = blocks[i]
  const cur = picks[b.block] || { m: -1, l: -1 }
  const choose = (kind, w) => {
    const next = { ...cur, saved: false, [kind]: w }
    if (kind === 'm' && next.l === w) next.l = -1
    if (kind === 'l' && next.m === w) next.m = -1
    setPicks({ ...picks, [b.block]: next })
  }
  const ready = cur.m >= 0 && cur.l >= 0
  const advance = async () => {
    setErr(''); setBusy(true)
    try {
      if (!cur.saved) {
        const { error } = await supabase.rpc('disc_answer', { p_token: token, p_session: session, p_block: b.block, p_most: cur.m, p_least: cur.l })
        if (error) throw error
        setPicks((p) => ({ ...p, [b.block]: { ...cur, saved: true } }))
      }
      if (i < blocks.length - 1) { setI(i + 1); window.scrollTo(0, 0) }
      else {
        const { error } = await supabase.rpc('disc_submit', { p_token: token, p_session: session })
        if (error) throw error
        setStep('done')
      }
    } catch (e) { setErr(errMsg(e)) }
    setBusy(false)
  }

  return (
    <Shell>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-[13px] text-tinta-3"><span>Grupo {i + 1} de {blocks.length}</span><span>{Math.round((answered / blocks.length) * 100)}%</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuenow={answered} aria-valuemin={0} aria-valuemax={blocks.length} aria-label="Avance del test">
          <div className="h-full rounded-full bg-[#E8457A] transition-all" style={{ width: `${(answered / blocks.length) * 100}%` }} />
        </div>
      </div>
      <p className="text-[15px] leading-snug">En el trabajo, ¿qué palabra te describe <b>más</b> y cuál <b>menos</b>?</p>
      <div className="flex flex-col gap-2" role="group" aria-label={`Grupo ${i + 1}`}>
        <div className="grid grid-cols-[1fr_64px_64px] px-1 text-[12px] font-semibold text-tinta-3"><span /><span className="text-center">Más</span><span className="text-center">Menos</span></div>
        {b.words.map((w, j) => (
          <div key={w} className={`card grid grid-cols-[1fr_64px_64px] items-center px-3 py-2.5 ${cur.m === j ? 'ring-2 ring-[#1E6B3F]' : cur.l === j ? 'ring-2 ring-[#B42318]' : ''}`}>
            <span className="text-[16px] font-medium">{w}</span>
            <button aria-label={`${w}: me describe más`} aria-pressed={cur.m === j} onClick={() => choose('m', j)}
              className={`mx-auto flex h-11 w-11 items-center justify-center rounded-full border text-[18px] font-bold ${cur.m === j ? 'border-[#1E6B3F] bg-[#1E6B3F] text-white' : 'border-linea bg-white text-[#1E6B3F]'}`}>+</button>
            <button aria-label={`${w}: me describe menos`} aria-pressed={cur.l === j} onClick={() => choose('l', j)}
              className={`mx-auto flex h-11 w-11 items-center justify-center rounded-full border text-[18px] font-bold ${cur.l === j ? 'border-[#B42318] bg-[#B42318] text-white' : 'border-linea bg-white text-[#B42318]'}`}>−</button>
          </div>
        ))}
      </div>
      {cur.saved && cur.m < 0 && <p className="text-[13px] text-tinta-3">Este grupo ya está respondido. Puedes seguir o elegir de nuevo.</p>}
      <ErrorBox>{err}</ErrorBox>
      <div className="mt-auto flex gap-2">
        {i > 0 && <button className="btn-sm h-12 flex-1 border border-linea bg-white" disabled={busy} onClick={() => setI(i - 1)}>Anterior</button>}
        <button className="btn flex-[2]" disabled={busy || !(ready || cur.saved)} onClick={advance}>
          {busy ? 'Guardando…' : i < blocks.length - 1 ? 'Siguiente' : 'Enviar respuestas'}
        </button>
      </div>
    </Shell>
  )
}
