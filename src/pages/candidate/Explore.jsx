import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, errMsg, withRetry } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { colorFor, initials, salaryText } from '../../lib/catalog'
import { Avatar, Empty, ErrorBox, Sheet, Spinner, Svg, Toast, Verified } from '../../components/ui'
import { SwipeButtons, SwipeCard, SwipeHint } from '../../components/SwipeCard'
import { MatchModal } from '../../components/MatchModal'
import { Bell } from '../../components/Bell'
import { usePresence } from '../../lib/presence'
import { PresenceLine } from '../../components/Presence'
import { ScreeningSheet, jobQuestions } from '../../components/Screening'
import { FeaturedBadge, trackPromo } from '../../lib/promo'
import { pl } from '../../lib/text'
import { PhotoGallery } from '../../components/CompanyPhotos'

function JobCard({ job, onDetail, p }) {
  return (
    <article className="flex min-h-[470px] flex-col gap-3.5 rounded-[24px] border border-[#EEE3EA] bg-white p-5 shadow-[0_12px_32px_rgba(48,37,56,0.12)]">
      {job.invited && (
        <div className="-mx-1 rounded-xl bg-naranja-palido px-3 py-2 text-xs font-bold text-naranja-texto">
          {job.company_name} ya se interesó en ti · si te interesa, es match
        </div>
      )}
      <div className="flex items-center gap-3">
        <Avatar text={initials(job.company_name)} color={colorFor(job.company_name)} />
        <div className="flex flex-col">
          <span className="flex items-center gap-1.5 text-sm font-semibold">{job.company_name}<Verified /></span>
          <span className="text-xs text-tinta-suave">{[job.managed_by && `Gestionado por ${job.managed_by}`, job.company_sector, job.company_size && `${job.company_size} personas`].filter(Boolean).join(' · ')}</span>
          <PresenceLine p={p} company />
        </div>
      </div>
      {job.featured && <FeaturedBadge />}
      <h2 className="text-[23px] font-semibold leading-tight">{job.title}</h2>
      <div className="flex flex-wrap gap-1.5">
        {[job.modality === 'Remota' ? 'Remoto · Chile' : [job.comuna, job.region].filter(Boolean).join(', '), job.modality, job.schedule && `Jornada ${job.schedule.toLowerCase()}`, job.contract].filter(Boolean)
          .map((t) => <span key={t} className="rounded-lg bg-[#F6F1F4] px-2.5 py-1.5 text-[13px] text-tinta-2">{t}</span>)}
      </div>
      <div className="flex flex-col gap-0.5 rounded-2xl bg-naranja-palido px-3.5 py-3">
        <span className="text-xs font-semibold text-naranja-texto">Renta ofrecida</span>
        <span className="font-display text-xl font-bold">{salaryText(job)}</span>
      </div>
      {job.description && <p className="line-clamp-3 text-sm leading-relaxed text-tinta-2">{job.description}</p>}
      {job.out_of_profile && <span className="self-start rounded-full bg-[#F4EEF2] px-2.5 py-1 text-xs font-semibold text-tinta-3">Fuera de tu perfil habitual</span>}
      {job.reasons?.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-[#F1E7ED] pt-3">
          <span className="text-xs font-semibold text-tinta-3">Por qué te la mostramos</span>
          <div className="flex flex-wrap gap-1.5">{job.reasons.map((r) => <span key={r} className="rounded-full bg-[#EAF6EF] px-2.5 py-1 text-xs font-semibold text-[#1E6B3F]">✓ {r}</span>)}</div>
        </div>
      )}
      <div className="flex-1" />
      {onDetail && <button onClick={() => { if (job.promotion_id) trackPromo([job.promotion_id], 'click'); onDetail() }} className="self-start py-1 text-sm font-semibold text-rosa-texto">Ver vacante y empresa</button>}
    </article>
  )
}

/** Fila compacta para la vista de lista: lo esencial y las tres decisiones a la mano */
function JobRow({ job, onOpen, onAct }) {
  return (
    <article className="card flex flex-col gap-2.5 p-3.5">
      <button className="flex items-start gap-3 text-left" onClick={onOpen} aria-label={`Ver detalle: ${job.title}`}>
        <Avatar text={initials(job.company_name)} color={colorFor(job.company_name)} size={42} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-semibold leading-snug">{job.title}</span>
          <span className="truncate text-[13px] text-tinta-3">{job.company_name} · {job.modality === 'Remota' ? 'Remoto' : job.comuna || job.region}{job.schedule ? ` · ${job.schedule.toLowerCase()}` : ''}</span>
          <span className="text-[13px] font-semibold text-naranja-texto">{salaryText(job)}</span>
          {job.invited && <span className="text-xs font-bold text-naranja-texto">Ya se interesó en ti · si te interesa, es match</span>}
          {job.featured && <FeaturedBadge className="mt-0.5 self-start" />}
        </span>
      </button>
      <div className="grid grid-cols-[auto_auto_1fr] gap-2">
        <button className="btn-sm border border-linea bg-white px-3" aria-label={`Pasar: ${job.title}`} onClick={() => onAct(job, 'pass')}><Svg name="x" size={16} /></button>
        <button className="btn-sm border border-linea bg-white px-3 text-naranja-texto" aria-label={`Guardar: ${job.title}`} onClick={() => onAct(job, 'save')}><Svg name="bookmark" size={16} /></button>
        <button className="btn-sm bg-rosa-accion text-white" onClick={() => onAct(job, 'interest')}>Me interesa</button>
      </div>
    </article>
  )
}

/** Detalle de la vacante (desde la tarjeta o desde la lista) */
function DetailSheet({ job, onClose, onSave, onLike }) {
  return (
    <Sheet open={!!job} onClose={onClose} title={job?.title || ''}>
      {job && (
          <div className="flex flex-col gap-4 text-[15px] leading-relaxed">
            <p><b>Renta:</b> {salaryText(job)}</p>
            {job.level && <p><b>Nivel:</b> {job.level}</p>}
            {job.description && <p className="whitespace-pre-line">{job.description}</p>}
            {job.requirements?.length > 0 && (
              <div className="flex flex-col gap-2"><b>Requisitos</b>
                {job.requirements.map((r, k) => <div key={k} className="flex items-center gap-2 text-sm"><span className={`pill ${r.essential ? 'bg-morado text-white' : 'bg-[#F1EDF0] text-[#3D2F4A]'}`}>{r.essential ? 'ESENCIAL' : 'DESEABLE'}</span>{r.text}</div>)}
              </div>
            )}
            <div className="flex flex-col gap-1.5 rounded-2xl bg-rosa-fondo p-3.5">
              <p className="flex items-center gap-1.5 font-semibold">{job.company_name} <Verified /></p>
              {job.managed_by && <p className="text-[13px] text-tinta-3">Proceso gestionado por la consultora <b>{job.managed_by}</b>{job.company_name === 'Empresa confidencial' ? '. La empresa prefiere mantener su nombre en reserva por ahora.' : '.'}</p>}
              {job.company_description && <p className="text-sm">{job.company_description}</p>}
              {job.company_benefits && <p className="text-sm"><b>Beneficios:</b> {job.company_benefits}</p>}
              <PhotoGallery jobId={job.id} companyName={job.company_name} />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button className="btn-sec" onClick={onSave}>Guardar</button>
              <button className="btn" onClick={onLike}>Me interesa</button>
            </div>
          </div>
        )}
    </Sheet>
  )
}

export default function Explore() {
  const { user, profile } = useAuth()
  const [jobs, setJobs] = useState(null)
  const [i, setI] = useState(0)
  const [toast, setToast] = useState('')
  const [err, setErr] = useState('')
  const [detail, setDetail] = useState(false)
  // Vista: tarjetas (principal) o lista (segunda opción, más rápida para revisar). Se recuerda en este dispositivo.
  const [view, setView] = useState(() => { try { return localStorage.getItem('vinka-explore-view') === 'lista' ? 'lista' : 'tarjetas' } catch { return 'tarjetas' } })
  const pickView = (v) => { setView(v); setDetail(false); try { localStorage.setItem('vinka-explore-view', v) } catch { /* sin almacenamiento */ } }
  const [listJob, setListJob] = useState(null) // vacante abierta desde la lista
  const [shown, setShown] = useState(20)
  const [match, setMatch] = useState(null)
  const card = useRef()
  const [ask, setAsk] = useState(null)

  const [broad, setBroad] = useState(false)
  const load = useCallback(async (wide = false) => {
    setJobs(null); setI(0); setBroad(wide)
    const { data, error } = await supabase.rpc('job_feed', { p_broad: wide })
    if (error) setErr(errMsg(error))
    setJobs(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const job = jobs?.[i]
  const next = jobs?.[i + 1]
  const pres = usePresence({ companies: [job?.company_id, next?.company_id] })
  // Vistas del aviso (para el embudo de la empresa)
  useEffect(() => { if (job?.id) supabase.rpc('log_views', { p_jobs: [job.id] }).then(() => {}) }, [job?.id])
  useEffect(() => { if (job?.promotion_id) trackPromo([job.promotion_id]) }, [job?.promotion_id])
  const ACTION = { right: 'interest', left: 'pass', up: 'save' }

  // Lista: la vacante sale de la lista de inmediato; si no se guarda, vuelve (ver commit)
  const act = async (j, action) => {
    setErr(''); setListJob(null)
    setJobs((js) => js.filter((x) => x.id !== j.id))
    if (action === 'interest') {
      const qs = await jobQuestions(j.id)
      if (qs.length) return setAsk({ job: j, questions: qs, fromList: true })
    }
    await commit(j, action, null, true)
  }
  const rest = view === 'lista' && jobs ? jobs.slice(i) : []
  // Vistas del aviso y apariciones de destacados también en la lista
  const restKey = rest.slice(0, shown).map((x) => x.id).join(',')
  useEffect(() => {
    if (!restKey) return
    const vis = rest.slice(0, shown)
    supabase.rpc('log_views', { p_jobs: vis.map((x) => x.id) }).then(() => {})
    trackPromo(vis.map((x) => x.promotion_id).filter(Boolean))
  }, [restKey]) // eslint-disable-line

  // Se llama cuando la tarjeta terminó de salir de la pantalla
  const onSwipe = async (dir) => {
    const j = jobs[i]
    setDetail(false); setErr('')
    setI((n) => n + 1)
    const action = ACTION[dir]
    if (action === 'interest') {
      const qs = await jobQuestions(j.id)
      if (qs.length) return setAsk({ job: j, questions: qs })
    }
    await commit(j, action)
  }
  const commit = async (j, action, answers = null, fromList = false) => {
    // Se reintenta si falla la red; si igual no se guarda, la vacante vuelve a la pantalla para decidir de nuevo
    const { error } = await withRetry(() => supabase.from('candidate_job_actions').upsert({ candidate_id: user.id, job_id: j.id, action, ...(answers ? { answers } : {}) }))
    if (error) {
      if (fromList) setJobs((js) => (js && !js.some((x) => x.id === j.id) ? [...js.slice(0, i), j, ...js.slice(i)] : js)) // vuelve a la lista
      else {
        const back = jobs.findIndex((x) => x.id === j.id)
        if (back >= 0) setI(back)
      }
      return setErr(error.code ? errMsg(error) : `No se guardó tu decisión por un problema de conexión. La vacante volvió a ${fromList ? 'la lista' : 'la pantalla'}: inténtalo de nuevo.`)
    }
    if (action === 'interest') {
      const { data: m } = await supabase.from('matches').select('id').eq('job_id', j.id).eq('candidate_id', user.id).maybeSingle()
      if (m) {
        setMatch({
          matchId: m.id, jobTitle: j.title, otherName: j.company_name,
          leftInitials: `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}`.toUpperCase(), leftColor: '#D02E72',
          rightInitials: initials(j.company_name), rightColor: colorFor(j.company_name),
        })
      } else setToast(`Interés enviado a ${j.company_name}. Será match si la empresa también se interesa en ti.`)
    } else if (action === 'save') setToast('Guardada en Intereses. La empresa no recibe aviso.')
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col overflow-hidden bg-rosa-fondo pb-24">
      <div className="safe-t flex items-center justify-between px-5 pb-3">
        <div className="flex flex-col">
          <h1 className="text-[22px] font-bold">Explorar</h1>
          <span className="text-[13px] text-tinta-suave">{jobs == null ? '…' : !job ? 'Sin vacantes nuevas' : view === 'lista' ? `${pl(rest.length, 'vacante', 'vacantes')} para ti` : `${i + 1} de ${pl(jobs.length, 'vacante', 'vacantes')} para ti`}</span>
        </div>
        <div className="flex items-center gap-2"><button onClick={() => load(broad)} className="flex h-11 items-center rounded-xl border border-linea bg-white px-3.5 text-sm font-semibold">Actualizar</button><Bell /></div>
      </div>
      <div className="flex flex-1 flex-col gap-4 px-5">
        <div className="flex gap-1 rounded-xl bg-white p-[3px] shadow-sm" role="group" aria-label="Forma de ver las vacantes">
          {[['tarjetas', 'Tarjetas', 'card'], ['lista', 'Lista', 'grid']].map(([k, l, ic]) => (
            <button key={k} type="button" aria-pressed={view === k} onClick={() => pickView(k)}
              className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[9px] text-[13px] font-semibold ${view === k ? 'bg-rosa-palido text-rosa-oscuro' : 'text-tinta-3'}`}><Svg name={ic} size={16} />{l}</button>
          ))}
        </div>
        <ErrorBox>{err}</ErrorBox>
        {jobs == null ? <Spinner /> : !job ? (
          <Empty title={broad ? 'Viste todas las vacantes' : jobs.length ? 'Viste todas las vacantes para tu perfil' : 'Aún no hay vacantes para tu perfil'}
            action={<div className="mt-1.5 flex flex-col items-center gap-2">
              {!broad && <button onClick={() => load(true)} className="btn-sm bg-rosa-accion text-white">Ver otras vacantes</button>}
              <button onClick={() => load(false)} className="btn-sm border border-rosa-accion bg-white text-rosa-texto">Buscar de nuevo</button>
            </div>}>
            {broad ? 'Te avisaremos en Intereses si una empresa se interesa en ti.' : 'Te mostramos solo vacantes acordes a tu tipo de cargo y nivel. "Ver otras vacantes" muestra el resto, aunque no calcen tanto con tu perfil.'}
          </Empty>
        ) : view === 'lista' ? (
          <div className="flex flex-col gap-2.5">
            {rest.slice(0, shown).map((x) => <JobRow key={x.id} job={x} onOpen={() => { if (x.promotion_id) trackPromo([x.promotion_id], 'click'); setListJob(x) }} onAct={act} />)}
            {rest.length > shown && <button className="btn-sec" onClick={() => setShown(shown + 20)}>Ver más ({rest.length - shown})</button>}
          </div>
        ) : (
          <>
            <SwipeCard key={job.id} ref={card} onSwipe={onSwipe} behind={next ? <JobCard job={next} p={pres[next.company_id]} /> : null}>
              <JobCard job={job} p={pres[job.company_id]} onDetail={() => setDetail(true)} />
            </SwipeCard>
            <SwipeButtons onPass={() => card.current?.swipe('left')} onSave={() => card.current?.swipe('up')} onLike={() => card.current?.swipe('right')} />
            <SwipeHint />
          </>
        )}
      </div>
      <DetailSheet job={listJob || (detail ? job : null)} onClose={() => { setDetail(false); setListJob(null) }}
        onSave={() => { if (listJob) act(listJob, 'save'); else { setDetail(false); card.current?.swipe('up') } }}
        onLike={() => { if (listJob) act(listJob, 'interest'); else { setDetail(false); card.current?.swipe('right') } }} />
      <ScreeningSheet open={!!ask} title={ask?.job.title} questions={ask?.questions} onClose={() => { const a = ask; setAsk(null); if (a?.fromList) { setJobs((js) => (js && !js.some((x) => x.id === a.job.id) ? [...js.slice(0, i), a.job, ...js.slice(i)] : js)); setToast('No enviamos tu interés. La vacante sigue en la lista.') } else setToast('No enviamos tu interés. La vacante volverá a aparecer más adelante.') }}
        onSubmit={async (answers) => { const a = ask; setAsk(null); await commit(a.job, 'interest', answers, !!a.fromList) }} />
      <Toast msg={toast} onDone={() => setToast('')} />
      <MatchModal match={match} onClose={() => setMatch(null)} />
    </div>
  )
}
