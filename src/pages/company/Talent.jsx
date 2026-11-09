import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { AREAS, REGIONES, colLabel, daysAgo } from '../../lib/catalog'
import { Avatar, Empty, ErrorBox, Sheet, Spinner, Svg, Toast } from '../../components/ui'
import { Bell } from '../../components/Bell'
import { usePresence } from '../../lib/presence'
import { PresenceLine, WithDot } from '../../components/Presence'

const STAGE_TXT = (s) => ({ guardado: 'Guardado', invitado: 'Invitado', postulante: 'Postuló' }[s] || colLabel(s))
const ACTIVE = ['postulante', 'invitado', 'match', 'contacto', 'entrevista', 'oferta']
const NIVELES_CARGO = [[1, 'Operativo'], [2, 'Oficio o técnico'], [3, 'Profesional'], [4, 'Senior o supervisión'], [5, 'Jefatura'], [6, 'Gerencia']]
const SITUACION = [['', 'Todas'], ['activo', 'En proceso'], ['avanzado', 'Entrevista u oferta'], ['contratado', 'Contratados'], ['descartado', 'Descartados'], ['guardado', 'Guardados'], ['dup', 'Posibles duplicados']]
const ACTIVIDAD = [['', 'Cualquier fecha'], ['30', 'Últimos 30 días'], ['90', 'Últimos 3 meses'], ['365', 'Último año'], ['old', 'Hace más de un año']]
const ORDEN = [['rel', 'Más relevantes'], ['reciente', 'Actividad más reciente'], ['nombre', 'Nombre A–Z'], ['procesos', 'Más procesos']]
const KEYS = ['q', 'src', 'sit', 'job', 'nivel', 'exp', 'area', 'region', 'comuna', 'tag', 'act', 'orden']

/** Minúsculas y sin tildes: "Técnico" encuentra "tecnico" y al revés */
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Separa la búsqueda en términos: palabras, "frases exactas", #etiquetas y -exclusiones */
function parseQuery(q) {
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

// Campos donde se busca, con su peso para ordenar por relevancia y el nombre que se muestra si la coincidencia está ahí
const FIELDS = [
  ['name', 3, null], ['head', 3, null], ['role', 3, 'cargo'], ['skills', 2, 'habilidades'], ['tags', 2, 'etiquetas'],
  ['exp', 1.5, 'experiencia'], ['edu', 1, 'estudios'], ['jobs', 1, 'procesos'], ['place', 1, null], ['email', 1, null],
]

export default function Talent() {
  const { company } = useAuth()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const f = Object.fromEntries(KEYS.map((k) => [k, sp.get(k) || '']))
  const set = (patch) => {
    const next = new URLSearchParams(sp)
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setSp(next, { replace: true })
  }
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')
  const [qInput, setQInput] = useState(f.q)
  const [filters, setFilters] = useState(false)
  const [pick, setPick] = useState(null)
  const [jobs, setJobs] = useState([])
  const [toast, setToast] = useState('')
  const [limit, setLimit] = useState(60)
  const canManage = company?.member_role !== 'viewer'

  useEffect(() => {
    supabase.rpc('talent_pool', { p_company: company.id }).then(({ data, error }) => { if (error) setErr(errMsg(error)); setList(data || []) })
    supabase.from('jobs').select('id, title, status').eq('company_id', company.id).in('status', ['published', 'paused', 'pending', 'draft']).order('created_at', { ascending: false }).then(({ data }) => setJobs(data || []))
  }, [company])
  // la búsqueda escrita se guarda en la dirección (al volver de una ficha sigue ahí) sin recargar en cada tecla
  useEffect(() => { const t = setTimeout(() => { if (qInput !== f.q) set({ q: qInput.trim() ? qInput : '' }) }, 250); return () => clearTimeout(t) }, [qInput]) // eslint-disable-line

  // texto normalizado de cada persona, calculado una sola vez
  const index = useMemo(() => (list || []).map((x) => ({
    x,
    name: norm(x.name), head: norm(x.headline), role: norm(x.role_label), skills: norm((x.skills || []).join(' · ')), tags: norm(x.tags.join(' ')),
    tagList: x.tags.map(norm), exp: norm(x.exp_text), edu: norm(x.edu_text), jobs: norm(x.jobs.map((j) => j.title).join(' · ')),
    place: norm(`${x.comuna} ${x.region} ${(x.areas || []).join(' ')}`), email: norm(x.email),
  })), [list])

  const pres = usePresence({ users: (list || []).map((x) => x.candidate_id).filter(Boolean) })
  const tags = useMemo(() => [...new Set((list || []).flatMap((x) => x.tags))].sort(), [list])
  const regiones = useMemo(() => REGIONES.filter((r) => (list || []).some((x) => x.region === r)), [list])
  const comunas = useMemo(() => [...new Set((list || []).filter((x) => !f.region || x.region === f.region).map((x) => x.comuna).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [list, f.region])
  const procesos = useMemo(() => {
    const m = new Map(); (list || []).forEach((x) => x.jobs.forEach((j) => m.set(j.job_id, j.title))); return [...m].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  }, [list])

  const q = useDeferredValue(f.q)
  const terms = useMemo(() => parseQuery(q), [q])
  const shown = useMemo(() => {
    const now = Date.now()
    const out = []
    for (const r of index) {
      const x = r.x
      if (f.src && x.kind !== f.src) continue
      if (f.area && !(x.areas || []).includes(f.area)) continue
      if (f.tag && !x.tags.includes(f.tag)) continue
      if (f.region && x.region !== f.region) continue
      if (f.comuna && x.comuna !== f.comuna) continue
      if (f.job && !x.jobs.some((j) => j.job_id === f.job)) continue
      if (f.nivel && String(x.role_level || '') !== f.nivel) continue
      if (f.exp === 'si' && x.has_experience !== true) continue
      if (f.exp === 'no' && x.has_experience !== false) continue
      if (f.sit === 'activo' && !x.jobs.some((j) => ACTIVE.includes(j.stage))) continue
      if (f.sit === 'avanzado' && !x.jobs.some((j) => j.stage === 'entrevista' || j.stage === 'oferta')) continue
      if (f.sit === 'contratado' && !x.jobs.some((j) => j.stage === 'contratado')) continue
      if (f.sit === 'descartado' && !x.jobs.some((j) => j.stage === 'descartado')) continue
      if (f.sit === 'guardado' && !x.saved) continue
      if (f.sit === 'dup' && !x.duplicate) continue
      if (f.act) {
        const days = (now - new Date(x.last_at)) / 864e5
        if (f.act === 'old' ? days <= 365 : days > Number(f.act)) continue
      }
      let score = 0; let where = null; let ok = true
      for (const t of terms) {
        if (t.tag) { const hit = r.tagList.some((g) => g.includes(t.text)); if (hit === t.neg) { ok = false; break } score += 2; continue }
        let best = 0; let fld = null
        for (const [k, w, label] of FIELDS) if (r[k].includes(t.text) && w > best) { best = w; fld = label }
        if (t.neg ? best > 0 : best === 0) { ok = false; break }
        if (!t.neg) { score += best; if (fld && best < 3 && !where) where = fld }
      }
      if (!ok) continue
      out.push({ x, score, where: terms.length ? where : null })
    }
    const orden = f.orden || (terms.length ? 'rel' : 'reciente')
    const by = {
      rel: (a, b) => b.score - a.score || new Date(b.x.last_at) - new Date(a.x.last_at),
      reciente: (a, b) => new Date(b.x.last_at) - new Date(a.x.last_at),
      nombre: (a, b) => a.x.name.localeCompare(b.x.name, 'es'),
      procesos: (a, b) => b.x.jobs.length - a.x.jobs.length || new Date(b.x.last_at) - new Date(a.x.last_at),
    }[orden] || (() => 0)
    return out.sort(by)
  }, [index, terms, f.src, f.area, f.tag, f.region, f.comuna, f.job, f.nivel, f.exp, f.sit, f.act, f.orden])
  useEffect(() => { setLimit(60) }, [shown])
  const page = shown.slice(0, limit)

  // filtros activos como etiquetas que se quitan con un toque
  const chips = [
    f.src && ['src', f.src === 'vinka' ? 'VINKA' : 'Otros portales'],
    f.sit && ['sit', SITUACION.find(([k]) => k === f.sit)?.[1]],
    f.job && ['job', `Vacante: ${procesos.find(([id]) => id === f.job)?.[1] || '—'}`],
    f.nivel && ['nivel', NIVELES_CARGO.find(([k]) => String(k) === f.nivel)?.[1]],
    f.exp && ['exp', f.exp === 'si' ? 'Con experiencia' : 'Primer empleo'],
    f.area && ['area', f.area], f.region && ['region', f.region], f.comuna && ['comuna', f.comuna],
    f.tag && ['tag', `#${f.tag}`], f.act && ['act', ACTIVIDAD.find(([k]) => k === f.act)?.[1]],
  ].filter(Boolean)
  const clearAll = () => { setQInput(''); setSp(new URLSearchParams(), { replace: true }) }

  const invite = async (j) => {
    const p = pick; setPick(null)
    if (p.kind === 'vinka') {
      const { data, error } = await supabase.rpc('invite_to_job', { p_candidate: p.candidate_id, p_job: j.id })
      if (error) return setErr(errMsg(error))
      setToast(data === 'match' ? `¡Match con ${p.name} para ${j.title}!` : data === 'ya_en_proceso' ? `${p.name} ya está en ese proceso` : `Invitación enviada a ${p.name}. Si acepta, será match.`)
    } else {
      const { error } = await supabase.rpc('copy_external_to_job', { p_external: p.subject_id, p_job: j.id })
      if (error) return setErr(errMsg(error))
      setToast(`${p.name} agregado/a a ${j.title}`)
    }
  }
  const openPerson = (x) => {
    const j = (f.job && x.jobs.find((y) => y.job_id === f.job)) || x.jobs[0]
    if (!j) return
    nav(x.kind === 'externo' ? `/vacantes/${j.job_id}/externo/${x.subject_id}` : `/vacantes/${j.job_id}/candidato/${x.candidate_id}`)
  }
  const initialsOf = (name) => name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  const roleLine = (x) => [x.role_label, x.role_level ? NIVELES_CARGO.find(([k]) => k === x.role_level)?.[1] : null].filter(Boolean).join(' · ')

  const select = ({ label, k, options, all = 'Todas' }) => (
    <label key={k} className="flex flex-col gap-1.5"><span className="label">{label}</span>
      <select className="input" value={f[k]} onChange={(e) => set({ [k]: e.target.value, ...(k === 'region' ? { comuna: '' } : {}) })}>
        <option value="">{all}</option>{options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o}>{o}</option>))}
      </select></label>
  )
  const chipGroup = ({ legend, k, options }) => (
    <fieldset key={k}><legend className="label mb-2">{legend}</legend><div className="flex flex-wrap gap-2">
      {options.map(([v, l]) => <button key={v} type="button" className={`chip h-9 text-[13px] ${f[k] === String(v) ? 'chip-on' : ''}`} onClick={() => set({ [k]: f[k] === String(v) ? '' : String(v) })}>{l}</button>)}
    </div></fieldset>
  )
  const FilterFields = (
    <div className="flex flex-col gap-4">
      {chipGroup({ legend: 'Situación', k: 'sit', options: SITUACION.slice(1) })}
      {procesos.length > 0 && select({ label: 'Pasó por la vacante', k: 'job', options: procesos, all: 'Cualquier vacante' })}
      {chipGroup({ legend: 'Nivel del cargo que busca', k: 'nivel', options: NIVELES_CARGO })}
      {chipGroup({ legend: 'Experiencia', k: 'exp', options: [['si', 'Con experiencia'], ['no', 'Primer empleo']] })}
      {select({ label: 'Área de interés', k: 'area', options: AREAS })}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-1">
        {select({ label: 'Región', k: 'region', options: regiones })}
        {select({ label: 'Comuna', k: 'comuna', options: comunas })}
      </div>
      {select({ label: 'Última actividad', k: 'act', options: ACTIVIDAD.slice(1), all: 'Cualquier fecha' })}
      {chipGroup({ legend: 'Origen', k: 'src', options: [['vinka', 'VINKA'], ['externo', 'Otros portales']] })}
    </div>
  )

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-[#FAF7F9] pb-28 lg:max-w-7xl lg:pb-10 lg:pt-4">
      <div className="safe-t flex items-start justify-between gap-3 px-5 pb-3">
        <div><h1 className="text-[22px] font-bold">Banco de talento</h1><p className="text-[13px] text-tinta-3">Personas que ya pasaron por tus procesos.</p></div><Bell />
      </div>
      <div className="flex flex-col gap-3 px-5 lg:grid lg:grid-cols-[260px_1fr] lg:items-start lg:gap-6">
        {/* Filtros fijos al costado en computador */}
        <aside className="card sticky top-4 hidden max-h-[calc(100vh-2rem)] flex-col gap-4 overflow-y-auto p-4 lg:flex" aria-label="Filtros">
          <div className="flex items-center justify-between"><span className="text-[15px] font-semibold">Filtros</span>{(chips.length > 0 || f.q) && <button className="text-xs font-semibold text-rosa-texto" onClick={clearAll}>Limpiar todo</button>}</div>
          {FilterFields}
        </aside>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex gap-2">
            <label className="relative flex-1"><span className="sr-only">Buscar</span>
              <Svg name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-suave" />
              <input className="input pl-9 pr-9" placeholder="Nombre, cargo, habilidad, empresa, estudios o #etiqueta" value={qInput} onChange={(e) => setQInput(e.target.value)} enterKeyHint="search" />
              {qInput && <button aria-label="Borrar búsqueda" onClick={() => { setQInput(''); set({ q: '' }) }} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-tinta-suave"><Svg name="x" size={16} /></button>}
            </label>
            <button aria-label="Filtros" onClick={() => setFilters(true)} className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border lg:hidden ${chips.length ? 'border-rosa-accion bg-rosa-palido text-rosa-oscuro' : 'border-linea bg-white'}`}>
              <Svg name="filter" />{chips.length > 0 && <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rosa-accion text-[11px] font-bold text-white">{chips.length}</span>}
            </button>
          </div>
          <p className="-mt-1 text-[11px] leading-snug text-tinta-suave">Tip: usa comillas para una frase exacta ("atención al cliente"), un guion para excluir (-práctica) y # para etiquetas. No importan las tildes ni mayúsculas.</p>

          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {chips.map(([k, l]) => (
                <button key={k} onClick={() => set({ [k]: '', ...(k === 'region' ? { comuna: '' } : {}) })} className="inline-flex h-8 items-center gap-1 rounded-full bg-rosa-palido pl-3 pr-2 text-[13px] font-semibold text-rosa-oscuro" aria-label={`Quitar filtro ${l}`}>
                  {l}<Svg name="x" size={14} />
                </button>
              ))}
              <button onClick={clearAll} className="h-8 px-2 text-[13px] font-semibold text-tinta-3">Limpiar todo</button>
            </div>
          )}
          {tags.length > 0 && !f.tag && (
            <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 lg:mx-0 lg:flex-wrap lg:px-0">
              {tags.map((t) => <button key={t} onClick={() => set({ tag: t })} className="chip h-8 shrink-0 text-[13px]">#{t}</button>)}
            </div>
          )}
          <ErrorBox>{err}</ErrorBox>
          {list == null ? <Spinner /> : list.length === 0 ? (
            <Empty title="Tu banco de talento está vacío">Aquí aparecerán las personas que postulen, hagan match o importes desde otros portales.</Empty>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-tinta-suave" aria-live="polite">{shown.length === list.length ? `${list.length} personas` : `${shown.length} de ${list.length} personas`}</span>
                <label className="flex items-center gap-1.5 text-xs text-tinta-3"><span>Ordenar</span>
                  <select className="h-8 rounded-lg border border-linea bg-white px-2 text-xs font-semibold text-tinta-2" value={f.orden || (terms.length ? 'rel' : 'reciente')} onChange={(e) => set({ orden: e.target.value })}>
                    {ORDEN.filter(([k]) => k !== 'rel' || terms.length).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select></label>
              </div>
              {shown.length === 0 && (
                <div className="card flex flex-col items-center gap-2 p-6 text-center text-sm">
                  <span className="font-semibold">Nadie coincide con esta búsqueda</span>
                  <span className="text-tinta-3">Prueba con menos palabras o quita algún filtro.</span>
                  <button className="btn-sm mt-1 border border-linea bg-white" onClick={clearAll}>Limpiar búsqueda y filtros</button>
                </div>
              )}
              {shown.length > 0 && (
                <div className="card hidden overflow-x-auto lg:block">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-[#EEE3EA] text-xs uppercase tracking-wide text-tinta-suave">
                      <tr><th className="px-4 py-3 font-semibold">Persona</th><th className="px-3 py-3 font-semibold">Cargo y nivel</th><th className="px-3 py-3 font-semibold">Comuna</th><th className="px-3 py-3 font-semibold">Procesos</th><th className="px-3 py-3 font-semibold">Etiquetas</th><th className="px-3 py-3 font-semibold">Último</th><th className="px-3 py-3" /></tr>
                    </thead>
                    <tbody>
                      {page.map(({ x, where }) => (
                        <tr key={x.subject_id} className="border-b border-[#F4EEF2] last:border-0 hover:bg-[#FBF7FA]">
                          <td className="px-4 py-2.5">
                            <button className="flex items-center gap-3 text-left" onClick={() => openPerson(x)}>
                              <WithDot p={pres[x.candidate_id]}><Avatar text={initialsOf(x.name)} color={x.kind === 'externo' ? '#3B5BA9' : '#302538'} size={36} round /></WithDot>
                              <span className="flex min-w-0 flex-col">
                                <span className="flex items-center gap-1.5 font-semibold">{x.name}{x.saved && <Svg name="bookmark" size={13} className="text-naranja" />}{x.featured && <span title="Perfil destacado" className="rounded bg-[#FFF4D6] px-1 text-[10px] font-bold text-[#7A5200]">★ Destacado</span>}{x.duplicate && <span className="rounded bg-naranja-palido px-1 text-[10px] text-naranja-texto">duplicado</span>}</span>
                                <span className="max-w-[240px] truncate text-xs text-tinta-3">{x.headline || '—'}{x.kind === 'externo' ? ' · Otro portal' : ''}</span>
                                {where && <span className="text-[11px] text-[#6B2E8F]">Coincide en {where}</span>}
                              </span>
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-tinta-2"><span className="block max-w-[180px] truncate">{roleLine(x) || '—'}</span>{x.has_experience === false && <span className="text-tinta-suave">Primer empleo</span>}</td>
                          <td className="px-3 py-2.5 text-tinta-2">{x.comuna || '—'}</td>
                          <td className="px-3 py-2.5"><div className="flex max-w-[260px] flex-col gap-0.5 text-xs">{x.jobs.slice(0, 2).map((j) => <span key={j.job_id + j.stage} className="truncate"><span className="text-tinta-2">{j.title}</span> · <b>{STAGE_TXT(j.stage)}</b></span>)}{x.jobs.length > 2 && <span className="text-tinta-suave">+{x.jobs.length - 2} más</span>}</div></td>
                          <td className="px-3 py-2.5"><div className="flex max-w-[180px] flex-wrap gap-1">{x.tags.map((t) => <button key={t} onClick={() => set({ tag: t })} className="rounded-md bg-[#F7F0FB] px-1.5 py-0.5 text-[11px] font-semibold text-[#6B2E8F]">#{t}</button>)}</div></td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-xs text-tinta-suave">{daysAgo(x.last_at)}</td>
                          <td className="px-3 py-2.5 text-right">{canManage && <button className="whitespace-nowrap text-xs font-semibold text-rosa-texto" onClick={() => setPick(x)}>Invitar a otra vacante</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {page.map(({ x, where }) => (
                <div key={x.subject_id} className="card flex flex-col gap-2 p-3.5 lg:hidden">
                  <button className="flex items-center gap-3 text-left" onClick={() => openPerson(x)}>
                    <WithDot p={pres[x.candidate_id]}><Avatar text={initialsOf(x.name)} color={x.kind === 'externo' ? '#3B5BA9' : '#302538'} size={44} round /></WithDot>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-1.5 truncate text-[15px] font-semibold">{x.name}{x.saved && <Svg name="bookmark" size={14} className="text-naranja" />}{x.featured && <span title="Perfil destacado" className="rounded bg-[#FFF4D6] px-1 text-[10px] font-bold text-[#7A5200]">★ Destacado</span>}</span>
                      <span className="truncate text-[13px] text-tinta-3">{x.headline || '—'}{x.comuna ? ` · ${x.comuna}` : ''}</span>
                      {roleLine(x) && <span className="truncate text-xs text-tinta-suave">{roleLine(x)}{x.has_experience === false ? ' · Primer empleo' : ''}</span>}
                      {where && <span className="text-[11px] font-semibold text-[#6B2E8F]">Coincide en {where}</span>}
                      <PresenceLine p={pres[x.candidate_id]} />
                    </span>
                    <span className="text-[11px] text-tinta-suave">{daysAgo(x.last_at)}</span>
                  </button>
                  <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
                    {x.kind === 'externo' && <span className="rounded-md bg-[#EEF2FA] px-1.5 py-0.5 text-[#2C4A8A]">Otro portal</span>}
                    {x.duplicate && <span className="rounded-md bg-naranja-palido px-1.5 py-0.5 text-naranja-texto">Posible duplicado</span>}
                    {x.jobs.slice(0, 3).map((j) => <span key={j.job_id + j.stage} className="rounded-md bg-[#F4EEF2] px-1.5 py-0.5 text-tinta-2">{j.title}: {STAGE_TXT(j.stage)}</span>)}
                    {x.tags.map((t) => <button key={t} onClick={() => set({ tag: t })} className="rounded-md bg-[#F7F0FB] px-1.5 py-0.5 text-[#6B2E8F]">#{t}</button>)}
                  </div>
                  {canManage && <button className="self-start text-sm font-semibold text-rosa-texto" onClick={() => setPick(x)}>Invitar a otra vacante ›</button>}
                </div>
              ))}
              {shown.length > limit && <button className="btn-sec" onClick={() => setLimit(limit + 60)}>Ver más ({shown.length - limit} restantes)</button>}
            </>
          )}
        </div>
      </div>
      <Sheet open={filters} onClose={() => setFilters(false)} title="Filtros">
        <div className="flex flex-col gap-4">
          {FilterFields}
          <div className="grid grid-cols-2 gap-2"><button className="btn-sec" onClick={clearAll}>Limpiar</button><button className="btn" onClick={() => setFilters(false)}>Ver {shown.length}</button></div>
        </div>
      </Sheet>
      <Sheet open={!!pick} onClose={() => setPick(null)} title={pick ? `Invitar a ${pick.name}` : ''}>
        <div className="flex flex-col gap-2">
          {pick?.kind === 'vinka' && <p className="hint mb-1">Le llegará la vacante destacada. Si dice "Me interesa", será match.</p>}
          {jobs.filter((j) => (pick?.kind === 'vinka' ? j.status === 'published' : true) && !pick?.jobs.some((x) => x.job_id === j.id)).map((j) => (
            <button key={j.id} onClick={() => invite(j)} className="flex h-12 items-center justify-between rounded-xl border border-linea px-4 text-left text-sm font-semibold">{j.title}<Svg name="chevron" size={16} /></button>
          ))}
        </div>
      </Sheet>
      <Toast msg={toast} onDone={() => setToast('')} />
    </div>
  )
}
