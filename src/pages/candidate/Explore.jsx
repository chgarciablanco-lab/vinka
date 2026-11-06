import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { colorFor, initials, salaryText } from '../../lib/catalog'
import { Avatar, Empty, ErrorBox, Sheet, Spinner, Toast, Verified } from '../../components/ui'
import { SwipeButtons, SwipeCard, SwipeHint } from '../../components/SwipeCard'
import { MatchModal } from '../../components/MatchModal'

function JobCard({ job, onDetail }) {
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
          <span className="text-xs text-tinta-suave">{[job.company_sector, job.company_size && `${job.company_size} personas`].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
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
      {job.reasons?.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-[#F1E7ED] pt-3">
          <span className="text-xs font-semibold text-tinta-3">Por qué te la mostramos</span>
          <div className="flex flex-wrap gap-1.5">{job.reasons.map((r) => <span key={r} className="rounded-full bg-[#EAF6EF] px-2.5 py-1 text-xs font-semibold text-[#1E6B3F]">✓ {r}</span>)}</div>
        </div>
      )}
      <div className="flex-1" />
      {onDetail && <button onClick={onDetail} className="self-start py-1 text-sm font-semibold text-rosa-texto">Ver vacante y empresa</button>}
    </article>
  )
}

export default function Explore() {
  const { user, profile } = useAuth()
  const [jobs, setJobs] = useState(null)
  const [i, setI] = useState(0)
  const [toast, setToast] = useState('')
  const [err, setErr] = useState('')
  const [detail, setDetail] = useState(false)
  const [match, setMatch] = useState(null)
  const card = useRef()

  const load = useCallback(async () => {
    setJobs(null); setI(0)
    const { data, error } = await supabase.rpc('job_feed')
    if (error) setErr(errMsg(error))
    setJobs(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const job = jobs?.[i]
  const next = jobs?.[i + 1]
  const ACTION = { right: 'interest', left: 'pass', up: 'save' }

  // Se llama cuando la tarjeta terminó de salir de la pantalla
  const onSwipe = async (dir) => {
    const j = jobs[i]
    setDetail(false)
    setI((n) => n + 1)
    const action = ACTION[dir]
    const { error } = await supabase.from('candidate_job_actions').upsert({ candidate_id: user.id, job_id: j.id, action })
    if (error) return setErr(errMsg(error))
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
          <span className="text-[13px] text-tinta-suave">{jobs == null ? '…' : job ? `${i + 1} de ${jobs.length} vacantes para ti` : 'Sin vacantes nuevas'}</span>
        </div>
        <button onClick={load} className="flex h-11 items-center rounded-xl border border-linea bg-white px-3.5 text-sm font-semibold">Actualizar</button>
      </div>
      <div className="flex flex-1 flex-col gap-4 px-5">
        <ErrorBox>{err}</ErrorBox>
        {jobs == null ? <Spinner /> : !job ? (
          <Empty title={jobs.length ? 'Viste todas las vacantes por ahora' : 'Aún no hay vacantes para tu perfil'}
            action={<button onClick={load} className="btn-sm mt-1.5 border border-rosa-accion bg-white text-rosa-texto">Buscar de nuevo</button>}>
            Te avisaremos en Intereses si una empresa se interesa en ti. También puedes ampliar tus preferencias en Perfil.
          </Empty>
        ) : (
          <>
            <SwipeCard key={job.id} ref={card} onSwipe={onSwipe} behind={next ? <JobCard job={next} /> : null}>
              <JobCard job={job} onDetail={() => setDetail(true)} />
            </SwipeCard>
            <SwipeButtons onPass={() => card.current?.swipe('left')} onSave={() => card.current?.swipe('up')} onLike={() => card.current?.swipe('right')} />
            <SwipeHint />
          </>
        )}
      </div>
      <Sheet open={detail && !!job} onClose={() => setDetail(false)} title={job?.title || ''}>
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
              {job.company_description && <p className="text-sm">{job.company_description}</p>}
              {job.company_benefits && <p className="text-sm"><b>Beneficios:</b> {job.company_benefits}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button className="btn-sec" onClick={() => { setDetail(false); card.current?.swipe('up') }}>Guardar</button>
              <button className="btn" onClick={() => { setDetail(false); card.current?.swipe('right') }}>Me interesa</button>
            </div>
          </div>
        )}
      </Sheet>
      <Toast msg={toast} onDone={() => setToast('')} />
      <MatchModal match={match} onClose={() => setMatch(null)} />
    </div>
  )
}
