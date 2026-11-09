import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { AREAS, colLabel, daysAgo } from '../../lib/catalog'
import { Avatar, Empty, ErrorBox, Sheet, Spinner, Svg, Toast } from '../../components/ui'
import { Bell } from '../../components/Bell'
import { usePresence } from '../../lib/presence'
import { PresenceLine, WithDot } from '../../components/Presence'

const STAGE_TXT = (s) => ({ guardado: 'Guardado', invitado: 'Invitado', postulante: 'Postuló' }[s] || colLabel(s))

/** Banco de talento: todas las personas que pasaron por algún proceso de la empresa */
export default function Talent() {
  const { company } = useAuth()
  const nav = useNavigate()
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [f, setF] = useState({ source: '', area: '', tag: '', stage: '', comuna: '' })
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

  const pres = usePresence({ users: (list || []).map((x) => x.candidate_id).filter(Boolean) })
  const tags = useMemo(() => [...new Set((list || []).flatMap((x) => x.tags))].sort(), [list])
  const comunas = useMemo(() => [...new Set((list || []).map((x) => x.comuna).filter(Boolean))].sort(), [list])
  const shown = useMemo(() => (list || []).filter((x) => {
    const text = `${x.name} ${x.headline} ${x.email} ${(x.skills || []).join(' ')} ${x.tags.join(' ')} ${x.jobs.map((j) => j.title).join(' ')}`.toLowerCase()
    if (q.trim() && !q.trim().toLowerCase().split(/\s+/).every((w) => text.includes(w.replace(/^#/, '')))) return false
    if (f.source && x.kind !== f.source) return false
    if (f.area && !(x.areas || []).includes(f.area)) return false
    if (f.tag && !x.tags.includes(f.tag)) return false
    if (f.comuna && x.comuna !== f.comuna) return false
    if (f.stage === 'contratado' && !x.jobs.some((j) => j.stage === 'contratado')) return false
    if (f.stage === 'descartado' && !x.jobs.some((j) => j.stage === 'descartado')) return false
    if (f.stage === 'guardado' && !x.saved) return false
    if (f.stage === 'dup' && !x.duplicate) return false
    return true
  }), [list, q, f])
  const active = Object.values(f).filter(Boolean).length
  useEffect(() => { setLimit(60) }, [q, f])
  const page = shown.slice(0, limit)

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
    const j = x.jobs[0]
    if (!j) return
    nav(x.kind === 'externo' ? `/vacantes/${j.job_id}/externo/${x.subject_id}` : `/vacantes/${j.job_id}/candidato/${x.candidate_id}`)
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-[#FAF7F9] pb-28 lg:max-w-6xl lg:pb-10 lg:pt-4">
      <div className="safe-t flex items-start justify-between gap-3 px-5 pb-3">
        <div><h1 className="text-[22px] font-bold">Banco de talento</h1><p className="text-[13px] text-tinta-3">Personas que ya pasaron por tus procesos.</p></div><Bell />
      </div>
      <div className="flex flex-col gap-3 px-5">
        <div className="flex gap-2">
          <label className="relative flex-1"><span className="sr-only">Buscar</span>
            <Svg name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-suave" />
            <input className="input pl-9" placeholder="Nombre, cargo, habilidad o #etiqueta" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <button aria-label="Filtros" onClick={() => setFilters(true)} className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${active ? 'border-rosa-accion bg-rosa-palido text-rosa-oscuro' : 'border-linea bg-white'}`}>
            <Svg name="filter" />{active > 0 && <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rosa-accion text-[11px] font-bold text-white">{active}</span>}
          </button>
        </div>
        {tags.length > 0 && (
          <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5">
            {tags.map((t) => <button key={t} onClick={() => setF({ ...f, tag: f.tag === t ? '' : t })} className={`chip h-8 shrink-0 text-[13px] ${f.tag === t ? 'chip-on' : ''}`}>#{t}</button>)}
          </div>
        )}
        <ErrorBox>{err}</ErrorBox>
        {list == null ? <Spinner /> : list.length === 0 ? (
          <Empty title="Tu banco de talento está vacío">Aquí aparecerán las personas que postulen, hagan match o importes desde otros portales.</Empty>
        ) : (
          <>
            <span className="text-xs text-tinta-suave">{shown.length} de {list.length} personas</span>
            <div className="card hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[#EEE3EA] text-xs uppercase tracking-wide text-tinta-suave">
                  <tr><th className="px-4 py-3 font-semibold">Persona</th><th className="px-3 py-3 font-semibold">Comuna</th><th className="px-3 py-3 font-semibold">Procesos</th><th className="px-3 py-3 font-semibold">Etiquetas</th><th className="px-3 py-3 font-semibold">Último</th><th className="px-3 py-3" /></tr>
                </thead>
                <tbody>
                  {page.map((x) => (
                    <tr key={x.subject_id} className="border-b border-[#F4EEF2] last:border-0 hover:bg-[#FBF7FA]">
                      <td className="px-4 py-2.5">
                        <button className="flex items-center gap-3 text-left" onClick={() => openPerson(x)}>
                          <WithDot p={pres[x.candidate_id]}><Avatar text={x.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()} color={x.kind === 'externo' ? '#3B5BA9' : '#302538'} size={36} round /></WithDot>
                          <span className="flex min-w-0 flex-col">
                            <span className="flex items-center gap-1.5 font-semibold">{x.name}{x.saved && <Svg name="bookmark" size={13} className="text-naranja" />}{x.duplicate && <span className="rounded bg-naranja-palido px-1 text-[10px] text-naranja-texto">duplicado</span>}</span>
                            <span className="max-w-[260px] truncate text-xs text-tinta-3">{x.headline || '—'}{x.kind === 'externo' ? ' · Otro portal' : ''}</span>
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-tinta-2">{x.comuna || '—'}</td>
                      <td className="px-3 py-2.5"><div className="flex max-w-[280px] flex-col gap-0.5 text-xs">{x.jobs.slice(0, 2).map((j) => <span key={j.job_id + j.stage} className="truncate"><span className="text-tinta-2">{j.title}</span> · <b>{STAGE_TXT(j.stage)}</b></span>)}{x.jobs.length > 2 && <span className="text-tinta-suave">+{x.jobs.length - 2} más</span>}</div></td>
                      <td className="px-3 py-2.5"><div className="flex max-w-[200px] flex-wrap gap-1">{x.tags.map((t) => <span key={t} className="rounded-md bg-[#F7F0FB] px-1.5 py-0.5 text-[11px] font-semibold text-[#6B2E8F]">#{t}</span>)}</div></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-tinta-suave">{daysAgo(x.last_at)}</td>
                      <td className="px-3 py-2.5 text-right">{canManage && <button className="whitespace-nowrap text-xs font-semibold text-rosa-texto" onClick={() => setPick(x)}>Invitar a otra vacante</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {page.map((x) => (
              <div key={x.subject_id} className="card flex flex-col gap-2 p-3.5 lg:hidden">
                <button className="flex items-center gap-3 text-left" onClick={() => openPerson(x)}>
                  <WithDot p={pres[x.candidate_id]}><Avatar text={x.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()} color={x.kind === 'externo' ? '#3B5BA9' : '#302538'} size={44} round /></WithDot>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5 truncate text-[15px] font-semibold">{x.name}{x.saved && <Svg name="bookmark" size={14} className="text-naranja" />}</span>
                    <span className="truncate text-[13px] text-tinta-3">{x.headline || '—'}{x.comuna ? ` · ${x.comuna}` : ''}</span>
                    <PresenceLine p={pres[x.candidate_id]} />
                  </span>
                  <span className="text-[11px] text-tinta-suave">{daysAgo(x.last_at)}</span>
                </button>
                <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
                  {x.kind === 'externo' && <span className="rounded-md bg-[#EEF2FA] px-1.5 py-0.5 text-[#2C4A8A]">Otro portal</span>}
                  {x.duplicate && <span className="rounded-md bg-naranja-palido px-1.5 py-0.5 text-naranja-texto">Posible duplicado</span>}
                  {x.jobs.slice(0, 3).map((j) => <span key={j.job_id + j.stage} className="rounded-md bg-[#F4EEF2] px-1.5 py-0.5 text-tinta-2">{j.title}: {STAGE_TXT(j.stage)}</span>)}
                  {x.tags.map((t) => <span key={t} className="rounded-md bg-[#F7F0FB] px-1.5 py-0.5 text-[#6B2E8F]">#{t}</span>)}
                </div>
                {canManage && <button className="self-start text-sm font-semibold text-rosa-texto" onClick={() => setPick(x)}>Invitar a otra vacante ›</button>}
              </div>
            ))}
            {shown.length > limit && <button className="btn-sec" onClick={() => setLimit(limit + 60)}>Ver más ({shown.length - limit} restantes)</button>}
          </>
        )}
      </div>
      <Sheet open={filters} onClose={() => setFilters(false)} title="Filtros">
        <div className="flex flex-col gap-4">
          <fieldset><legend className="label mb-2">Origen</legend><div className="flex flex-wrap gap-2">
            {[['', 'Todos'], ['vinka', 'VINKA'], ['externo', 'Otros portales']].map(([k, l]) => <button key={k} className={`chip ${f.source === k ? 'chip-on' : ''}`} onClick={() => setF({ ...f, source: k })}>{l}</button>)}</div></fieldset>
          <fieldset><legend className="label mb-2">Situación</legend><div className="flex flex-wrap gap-2">
            {[['', 'Todas'], ['guardado', 'Guardados'], ['contratado', 'Contratados'], ['descartado', 'Descartados'], ['dup', 'Posibles duplicados']].map(([k, l]) => <button key={k} className={`chip ${f.stage === k ? 'chip-on' : ''}`} onClick={() => setF({ ...f, stage: k })}>{l}</button>)}</div></fieldset>
          <label className="flex flex-col gap-1.5"><span className="label">Área de interés</span>
            <select className="input" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}><option value="">Todas</option>{AREAS.map((a) => <option key={a}>{a}</option>)}</select></label>
          <label className="flex flex-col gap-1.5"><span className="label">Comuna</span>
            <select className="input" value={f.comuna} onChange={(e) => setF({ ...f, comuna: e.target.value })}><option value="">Todas</option>{comunas.map((a) => <option key={a}>{a}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-2"><button className="btn-sec" onClick={() => setF({ source: '', area: '', tag: '', stage: '', comuna: '' })}>Limpiar</button><button className="btn" onClick={() => setFilters(false)}>Ver {shown.length}</button></div>
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
