import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { salaryText } from '../../lib/catalog'
import { ErrorBox, Screen, Spinner, Toast, TopBar } from '../../components/ui'
import { PhotoGallery } from '../../components/CompanyPhotos'
import { logoUrl } from '../../components/OfferLetter'
import { ScreeningSheet, jobQuestions } from '../../components/Screening'

const ACTION_TXT = { save: 'La tienes guardada. Solo tú lo sabes.', interest: 'Ya dijiste «Me interesa». Será match si la empresa también se interesa.', pass: 'La pasaste.' }

/** Vacante completa para la persona: la abre desde Intereses (guardadas, enviadas, invitaciones o matches) */
export default function JobView() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const [d, setD] = useState(undefined)
  const [err, setErr] = useState('')
  const [ask, setAsk] = useState(null)
  const [toast, setToast] = useState('')
  const load = useCallback(() => { supabase.rpc('candidate_job_detail', { p_job: id }).then(({ data, error }) => { if (error) setErr(errMsg(error)); setD(data || null) }) }, [id])
  useEffect(() => { load() }, [load])

  const act = async (action, answers = null) => {
    setErr('')
    if (action === 'interest' && !answers && d.job.has_questions) {
      const qs = await jobQuestions(id)
      if (qs.length) return setAsk(qs)
    }
    const { error } = await supabase.from('candidate_job_actions').upsert({ candidate_id: user.id, job_id: id, action, ...(answers ? { answers } : {}) })
    if (error) return setErr(errMsg(error))
    setToast(action === 'interest' ? 'Listo: le mostraste tu interés.' : action === 'save' ? 'Guardada.' : 'Listo.')
    load()
  }
  const unsave = async () => { await supabase.from('candidate_job_actions').delete().eq('candidate_id', user.id).eq('job_id', id); nav('/intereses') }

  if (d === undefined) return <Spinner />
  if (!d) return (
    <Screen><TopBar back="/intereses" title="Vacante" />
      <div className="px-6"><ErrorBox>{err || 'Esta vacante ya no está disponible.'}</ErrorBox></div>
    </Screen>
  )
  const { job: j, company: c } = d
  const reqs = Array.isArray(j.requirements) ? j.requirements : []
  return (
    <Screen className="bg-[#FAF7F9]">
      <TopBar back="/intereses" title="Vacante" />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3.5 px-5 pb-32">
        {!j.open && <p className="rounded-xl bg-[#F4EEF2] px-3 py-2.5 text-[13px] text-tinta-2">La empresa cerró o pausó esta vacante. Puedes revisarla, pero ya no recibe interesados.</p>}
        <section className="card flex flex-col gap-3 p-5">
          <span className="text-sm font-semibold text-rosa-texto">{c.display_name}{c.managed_by && <span className="font-normal text-tinta-suave"> · gestionado por {c.managed_by}</span>}</span>
          <h1 className="text-[24px] font-bold leading-tight">{j.title}</h1>
          <span className="text-sm text-tinta-3">{[j.modality === 'Remota' ? 'Remoto' : [j.comuna, j.region].filter(Boolean).join(', '), j.modality, j.schedule && `Jornada ${j.schedule.toLowerCase()}`, j.contract].filter(Boolean).join(' · ')}</span>
          {salaryText(j) && <span className="rounded-xl bg-naranja-palido/70 px-3 py-2 text-[15px] font-bold">{salaryText(j)}</span>}
          {j.description && <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-tinta-2">{j.description}</p>}
          {reqs.length > 0 && (
            <div className="flex flex-col gap-1"><span className="text-sm font-semibold">Requisitos</span>
              <ul className="list-disc pl-5 text-[15px] text-tinta-2">{reqs.map((r, i) => <li key={i}>{typeof r === 'string' ? r : r.text || r.label || ''}</li>)}</ul></div>
          )}
          <span className="text-xs text-tinta-suave">Publicada el {new Date(j.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </section>
        <section className="card flex flex-col gap-3 p-5">
          <div className="flex items-center gap-3">
            {c.logo_path && <img src={logoUrl(c.logo_path)} alt="" className="h-12 w-12 rounded-xl border border-linea bg-white object-contain p-1" />}
            <span className="flex flex-col"><b className="text-[16px]">{c.display_name}</b><span className="text-xs text-tinta-3">{[c.sector, c.size && `${c.size} personas`, c.comuna].filter(Boolean).join(' · ')}</span></span>
          </div>
          {c.confidential && <p className="text-[13px] text-tinta-3">La empresa prefiere mantener su nombre en reserva por ahora.</p>}
          {c.description && <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-tinta-2">{c.description}</p>}
          {c.benefits && <p className="text-sm text-tinta-2"><b>Beneficios:</b> {c.benefits}</p>}
          <PhotoGallery jobId={j.id} companyName={c.confidential ? '' : c.display_name} />
          {c.slug && <Link to={`/empleos/${c.slug}`} className="text-sm font-semibold text-rosa-texto">Ver más vacantes de {c.display_name} →</Link>}
        </section>
        {d.my_action && <p className="text-center text-[13px] text-tinta-3">{ACTION_TXT[d.my_action]}</p>}
        <ErrorBox>{err}</ErrorBox>
      </div>
      <div className="safe-b fixed inset-x-0 bottom-0 z-20 border-t border-[#EEE3EA] bg-white/95 px-5 pt-3 backdrop-blur lg:left-64">
        <div className="mx-auto grid max-w-2xl grid-cols-2 gap-2 pb-3">
          {d.match_id ? <Link to={`/chats/${d.match_id}`} className="btn col-span-2">Abrir chat con la empresa</Link>
            : !j.open ? (d.my_action === 'save' ? <button className="btn-sec col-span-2" onClick={unsave}>Quitar de guardadas</button> : <Link to="/" className="btn-sec col-span-2">Seguir explorando</Link>)
            : d.my_action === 'interest' ? <Link to="/" className="btn-sec col-span-2">Seguir explorando</Link>
            : <>
              {d.my_action === 'save' ? <button className="btn-sec" onClick={unsave}>Quitar guardada</button> : <button className="btn-sec" onClick={() => act('save')}>Guardar</button>}
              <button className="btn" onClick={() => act('interest')}>Me interesa</button>
            </>}
        </div>
      </div>
      <ScreeningSheet open={!!ask} title={j.title} questions={ask || []} onClose={() => setAsk(null)}
        onSubmit={async (answers) => { setAsk(null); await act('interest', answers) }} />
      <Toast msg={toast} onDone={() => setToast('')} />
    </Screen>
  )
}
