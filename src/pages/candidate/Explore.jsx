import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { colorFor, initials, salaryText } from '../../lib/catalog'
import { Avatar, Empty, ErrorBox, Sheet, Spinner, Svg, Toast, Verified } from '../../components/ui'

export default function Explore() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState(null)
  const [i, setI] = useState(0)
  const [toast, setToast] = useState({ msg: '', tone: 'dark' })
  const [err, setErr] = useState('')
  const [detail, setDetail] = useState(false)
  const [busy, setBusy] = useState(false)
  const drag = useRef({ x0: null, dx: 0 })
  const [dx, setDx] = useState(0)

  const load = useCallback(async () => {
    setJobs(null); setI(0)
    const { data, error } = await supabase.rpc('job_feed')
    if (error) setErr(errMsg(error))
    setJobs(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const job = jobs?.[i]

  const act = async (action) => {
    if (!job || busy) return
    setBusy(true)
    const { error } = await supabase.from('candidate_job_actions').upsert({ candidate_id: user.id, job_id: job.id, action })
    setBusy(false); setDx(0)
    if (error) return setErr(errMsg(error))
    if (action === 'interest') {
      const { data: m } = await supabase.from('matches').select('id').eq('job_id', job.id).eq('candidate_id', user.id).maybeSingle()
      setToast(m
        ? { msg: `¡Es match con ${job.company_name}! Ya pueden conversar en Chats.`, tone: 'pink' }
        : { msg: `Interés enviado a ${job.company_name}. Será match si la empresa también se interesa en ti para esta vacante.`, tone: 'dark' })
    } else if (action === 'save') setToast({ msg: 'Guardada en Intereses. La empresa no recibe aviso.', tone: 'dark' })
    setDetail(false); setI((n) => n + 1)
  }

  // Gesto opcional: deslizar a la derecha = me interesa, a la izquierda = pasar. Los botones hacen lo mismo.
  const onTouchStart = (e) => { drag.current = { x0: e.touches[0].clientX, dx: 0 } }
  const onTouchMove = (e) => { if (drag.current.x0 == null) return; const d = e.touches[0].clientX - drag.current.x0; drag.current.dx = d; setDx(d) }
  const onTouchEnd = () => {
    const d = drag.current.dx; drag.current = { x0: null, dx: 0 }
    if (d > 110) act('interest'); else if (d < -110) act('pass'); else setDx(0)
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-rosa-fondo pb-24">
      <div className="safe-t flex items-center justify-between px-5 pb-3">
        <div className="flex flex-col">
          <h1 className="text-[22px] font-bold">Explorar</h1>
          <span className="text-[13px] text-tinta-suave">{jobs == null ? '…' : job ? `${i + 1} de ${jobs.length} vacantes para ti` : 'Sin vacantes nuevas'}</span>
        </div>
        <button onClick={load} className="flex h-11 items-center rounded-xl border border-linea bg-white px-3.5 text-sm font-semibold">Actualizar</button>
      </div>
      <div className="flex flex-1 flex-col px-5">
        <ErrorBox>{err}</ErrorBox>
        {jobs == null ? <Spinner /> : !job ? (
          <Empty title={jobs.length ? 'Viste todas las vacantes por ahora' : 'Aún no hay vacantes para tu perfil'}
            action={<button onClick={load} className="btn-sm mt-1.5 border border-rosa-accion bg-white text-rosa-texto">Buscar de nuevo</button>}>
            Te avisaremos en Intereses si una empresa se interesa en ti. También puedes ampliar tus preferencias en Perfil.
          </Empty>
        ) : (
          <article onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
            style={{ transform: `translateX(${dx}px) rotate(${dx / 30}deg)`, transition: drag.current.x0 == null ? 'transform .2s' : 'none' }}
            className="relative flex flex-col gap-3.5 rounded-[22px] border border-[#EEE3EA] bg-white p-5 shadow-[0_10px_30px_rgba(48,37,56,0.10)]">
            {dx > 40 && <span className="pill absolute right-4 top-4 bg-rosa-accion text-white">ME INTERESA</span>}
            {dx < -40 && <span className="pill absolute left-4 top-4 bg-morado text-white">PASAR</span>}
            <div className="flex items-center gap-3">
              <Avatar text={initials(job.company_name)} color={colorFor(job.company_name)} />
              <div className="flex flex-col">
                <span className="flex items-center gap-1.5 text-sm font-semibold">{job.company_name}<Verified /></span>
                <span className="text-xs text-tinta-suave">{[job.company_sector, job.company_size && `${job.company_size} personas`].filter(Boolean).join(' · ')}</span>
              </div>
            </div>
            <h2 className="text-[22px] font-semibold leading-tight">{job.title}</h2>
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
            <button onClick={() => setDetail(true)} className="self-start py-2 text-sm font-semibold text-rosa-texto">Ver vacante completa</button>
          </article>
        )}
      </div>
      {job && (
        <div className="fixed bottom-[76px] left-1/2 z-10 grid w-full max-w-md -translate-x-1/2 grid-cols-3 gap-2.5 bg-gradient-to-t from-rosa-fondo via-rosa-fondo px-5 pb-3 pt-4">
          <button onClick={() => act('pass')} disabled={busy} className="btn-sec h-[52px]"><Svg name="x" size={18} width={2.4} />Pasar</button>
          <button onClick={() => act('save')} disabled={busy} className="btn-sec h-[52px]"><Svg name="bookmark" size={18} />Guardar</button>
          <button onClick={() => act('interest')} disabled={busy} className="btn h-[52px]">Me interesa</button>
        </div>
      )}
      <Sheet open={detail && !!job} onClose={() => setDetail(false)} title={job?.title || ''}>
        {job && (
          <div className="flex flex-col gap-4 text-[15px] leading-relaxed">
            <p className="flex items-center gap-1.5 font-semibold">{job.company_name} <Verified /></p>
            <p><b>Renta:</b> {salaryText(job)}</p>
            {job.level && <p><b>Nivel:</b> {job.level}</p>}
            {job.description && <p className="whitespace-pre-line">{job.description}</p>}
            {job.requirements?.length > 0 && (
              <div className="flex flex-col gap-2"><b>Requisitos</b>
                {job.requirements.map((r, k) => <div key={k} className="flex items-center gap-2 text-sm"><span className={`pill ${r.essential ? 'bg-morado text-white' : 'bg-[#F1EDF0] text-[#3D2F4A]'}`}>{r.essential ? 'ESENCIAL' : 'DESEABLE'}</span>{r.text}</div>)}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              <button className="btn-sec" onClick={() => act('save')}>Guardar</button>
              <button className="btn" onClick={() => act('interest')}>Me interesa</button>
            </div>
          </div>
        )}
      </Sheet>
      <Toast msg={toast.msg} tone={toast.tone} onDone={() => setToast({ msg: '', tone: 'dark' })} />
    </div>
  )
}
