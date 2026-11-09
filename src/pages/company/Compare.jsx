import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { CRITERIOS, RECOMENDACION, colLabel } from '../../lib/catalog'
import { ErrorBox, Spinner, Svg } from '../../components/ui'

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const fix = (n) => (n == null ? '—' : n.toFixed(1))

/** Comparación lado a lado de 2 a 4 personas de una misma vacante */
export default function Compare() {
  const { id: jobId } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    const items = (sp.get('c') || '').split(',').map((x) => x.split(':')).filter(([k, v]) => k && v).slice(0, 4)
    Promise.all(items.map(async ([kind, id]) => {
      const { data, error } = kind === 'externo'
        ? await supabase.rpc('external_detail', { p_id: id })
        : await supabase.rpc('subject_detail', { p_job: jobId, p_candidate: id })
      if (error) throw error
      return { kind, id, d: data }
    })).then(setRows, (e) => setErr(errMsg(e)))
  }, [sp, jobId])

  if (err) return <div className="p-6"><ErrorBox>{err}</ErrorBox></div>
  if (!rows) return <Spinner />

  const people = rows.filter(({ kind, d }) => d && (kind === 'externo' ? d.external : d.candidate)).map(({ kind, id, d }) => {
    const ext = kind === 'externo'
    const c = ext ? null : d.candidate
    const e = ext ? d.external : null
    const ev = d.evaluations || []
    return {
      id, ext,
      link: ext ? `/vacantes/${jobId}/externo/${id}` : `/vacantes/${jobId}/candidato/${id}`,
      name: ext ? e.full_name : c.name,
      headline: (ext ? e.headline : c.headline) || '—',
      stage: colLabel(ext ? e.col : d.match ? d.match.stage : 'postulante'),
      place: ext ? (e.source || 'Otro portal') : [c.comuna, c.region].filter(Boolean).join(', ') || '—',
      availability: ext ? '—' : c.availability || '—',
      fit: ext ? null : d.ai?.fit?.score ?? null,
      overall: avg(ev.map((x) => x.overall).filter(Boolean)),
      n: ev.length,
      crit: Object.fromEntries(CRITERIOS.map(([k]) => [k, avg(ev.map((x) => x.scores?.[k]).filter(Boolean))])),
      recs: Object.fromEntries(Object.keys(RECOMENDACION).map((k) => [k, ev.filter((x) => x.recommendation === k).length])),
      answers: ext ? [] : d.answers || [],
      ko: !ext && d.knocked_out,
      exp: ext ? [] : (c.has_experience ? (c.experiences || []).slice(0, 3) : []),
      skills: ext ? [] : (c.skills || []).slice(0, 8),
    }
  })
  const best = (vals) => { const xs = vals.filter((v) => v != null); return xs.length > 1 ? Math.max(...xs) : null }
  const bestOverall = best(people.map((p) => p.overall))
  const bestFit = best(people.map((p) => p.fit))
  const questions = people.find((p) => p.answers.length)?.answers.map((a) => a.text) || []

  const Row = ({ label, children }) => (
    <tr className="border-b border-[#F1E7ED] align-top last:border-0">
      <th scope="row" className="sticky left-0 z-[1] w-36 bg-white px-3 py-2.5 text-left text-xs font-semibold text-tinta-3">{label}</th>
      {children}
    </tr>
  )
  const Cell = ({ children, hi }) => <td className={`min-w-[170px] px-3 py-2.5 text-sm ${hi ? 'bg-[#EAF6EF]/60' : ''}`}>{children}</td>

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-[#FAF7F9] pb-10 lg:max-w-6xl">
      <div className="safe-t sticky top-0 z-10 border-b border-[#EEE3EA] bg-white px-4 pb-3">
        <div className="-ml-2 flex items-center gap-1">
          <button aria-label="Volver al proceso" onClick={() => nav(`/vacantes/${jobId}/proceso`)} className="flex h-11 w-11 items-center justify-center"><Svg name="back" /></button>
          <div className="flex flex-col"><span className="text-[11px] text-tinta-suave">Comparación</span><span className="text-[16px] font-semibold">{people.length} personas lado a lado</span></div>
        </div>
      </div>
      <p className="px-4 pt-3 text-xs leading-relaxed text-tinta-3">Promedios de las evaluaciones del equipo. Sirve para ordenar la conversación: la decisión final es de las personas, no del puntaje.</p>
      <div className="m-4 overflow-x-auto rounded-2xl border border-[#EEE3EA] bg-white">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[#EEE3EA]">
              <th className="sticky left-0 z-[1] w-36 bg-white" />
              {people.map((p) => (
                <th key={p.id} className="min-w-[170px] px-3 py-3 text-left align-top">
                  <Link to={p.link} className="text-[15px] font-semibold text-tinta hover:text-rosa-texto">{p.name}</Link>
                  <span className="block text-xs font-normal text-tinta-3">{p.headline}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Etapa">{people.map((p) => <Cell key={p.id}>{p.stage}{p.ko && <span className="ml-1 text-xs font-semibold text-[#B42318]">· no cumple filtro</span>}</Cell>)}</Row>
            <Row label={p0(people) ? 'Ubicación / fuente' : 'Ubicación'}>{people.map((p) => <Cell key={p.id}>{p.place}</Cell>)}</Row>
            <Row label="Disponibilidad">{people.map((p) => <Cell key={p.id}>{p.availability}</Cell>)}</Row>
            <Row label="Nota general del equipo">{people.map((p) => <Cell key={p.id} hi={p.overall != null && p.overall === bestOverall}><b>{fix(p.overall)}</b>{p.n ? <span className="text-xs text-tinta-suave"> · {p.n} {p.n === 1 ? 'evaluación' : 'evaluaciones'}</span> : <span className="text-xs text-tinta-suave"> · sin evaluar</span>}</Cell>)}</Row>
            {CRITERIOS.map(([k, l]) => <Row key={k} label={l}>{people.map((p) => <Cell key={p.id}>{fix(p.crit[k])}</Cell>)}</Row>)}
            <Row label="Recomendaciones">{people.map((p) => (
              <Cell key={p.id}><div className="flex flex-wrap gap-1">{Object.entries(RECOMENDACION).map(([k, [l, cls]]) => (p.recs[k] ? <span key={k} className={`pill ${cls}`}>{l}: {p.recs[k]}</span> : null))}{!p.n && '—'}</div></Cell>
            ))}</Row>
            <Row label="Ajuste según IA">{people.map((p) => <Cell key={p.id} hi={p.fit != null && p.fit === bestFit}>{p.fit == null ? <span className="text-tinta-suave">—</span> : `${p.fit}%`}</Cell>)}</Row>
            {questions.map((q, i) => (
              <Row key={i} label={q}>{people.map((p) => { const a = p.answers[i]; return <Cell key={p.id}>{!a || a.answer == null ? <span className="text-tinta-suave">—</span> : <span className={a.ko ? 'font-semibold text-[#B42318]' : ''}>{a.type === 'yesno' ? (a.answer === 'si' ? 'Sí' : 'No') : a.answer}</span>}</Cell> })}</Row>
            ))}
            <Row label="Experiencia">{people.map((p) => <Cell key={p.id}>{p.exp.length ? <div className="flex flex-col gap-1">{p.exp.map((x, i) => <span key={i}><b>{x.role}</b><span className="text-tinta-3"> · {x.company}</span></span>)}</div> : <span className="text-tinta-suave">—</span>}</Cell>)}</Row>
            <Row label="Habilidades">{people.map((p) => <Cell key={p.id}>{p.skills.length ? <div className="flex flex-wrap gap-1">{p.skills.map((s) => <span key={s} className="rounded-full border border-linea px-2 py-0.5 text-xs">{s}</span>)}</div> : <span className="text-tinta-suave">—</span>}</Cell>)}</Row>
          </tbody>
        </table>
      </div>
    </div>
  )
}
const p0 = (people) => people.some((p) => p.ext)
