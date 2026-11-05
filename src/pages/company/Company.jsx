import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { AREAS, CONTRATOS, JORNADAS, MODALIDADES, NIVELES, REGIONES, clp, parseCLP, salaryText } from '../../lib/catalog'
import { Avatar, Chips, Empty, ErrorBox, Field, Screen, Sheet, Spinner, Svg, Toast, TopBar, Verified } from '../../components/ui'
import { DangerZone } from '../Account'

const STATUS = {
  draft: ['BORRADOR', 'bg-[#F1EDF0] text-[#3D2F4A]'], pending: ['ESPERA VERIFICACIÓN', 'bg-naranja-palido text-naranja-texto'],
  published: ['PUBLICADA', 'bg-[#EAF6EF] text-[#134A2B]'], paused: ['PAUSADA', 'bg-[#F1F1F1] text-[#3A3A3A]'], closed: ['CERRADA', 'bg-[#F1F1F1] text-[#3A3A3A]'],
}

export function VerificationBanner({ company }) {
  if (company.verification_status === 'verified') return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-[#A9D9BC] bg-[#EAF6EF] px-3.5 py-3">
      <Verified size={22} /><span className="text-sm font-semibold text-[#134A2B]">Empresa verificada · tus vacantes son visibles</span>
    </div>
  )
  if (company.verification_status === 'pending') return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[#F5C892] bg-naranja-palido p-3.5">
      <span className="text-[15px] font-bold text-[#6B3800]">Verificación en revisión</span>
      <span className="text-[13px] leading-snug text-[#4A2A00]">Puedes preparar vacantes. Se publicarán automáticamente cuando aprobemos tu empresa. Te avisaremos por correo.</span>
    </div>
  )
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-[#F4C7C3] bg-[#FEF3F2] p-3.5">
      <span className="text-[15px] font-bold text-[#912018]">{company.verification_status === 'rejected' ? 'Verificación rechazada' : 'Cuenta suspendida'}</span>
      {company.verification_note && <span className="text-[13px] text-[#912018]">{company.verification_note}</span>}
      <span className="text-[13px] text-[#912018]">Escríbenos para revisar tu caso.</span>
    </div>
  )
}

export function CompanyPanel() {
  const { company } = useAuth()
  const [jobs, setJobs] = useState(null)
  const [stats, setStats] = useState({})
  useEffect(() => {
    if (!company) return
    supabase.from('jobs').select('*').eq('company_id', company.id).order('created_at', { ascending: false }).then(({ data }) => setJobs(data || []))
    supabase.rpc('company_stats', { p_company: company.id }).then(({ data }) => setStats(Object.fromEntries((data || []).map((s) => [s.job_id, s]))))
  }, [company])
  const tot = Object.values(stats).reduce((a, s) => ({ i: a.i + s.interests, m: a.m + s.matches }), { i: 0, m: 0 })
  const verified = company?.verification_status === 'verified'
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-[#FAF7F9] pb-28">
      <div className="safe-t px-5 pb-3">
        <span className="text-[13px] text-tinta-suave">VINKA Company</span>
        <h1 className="text-[22px] font-bold">{company?.display_name}</h1>
      </div>
      <div className="flex flex-col gap-3.5 px-5">
        <VerificationBanner company={company} />
        <div className="grid grid-cols-3 gap-2">
          {[[jobs?.filter((j) => j.status === 'published').length ?? '—', 'Publicadas'], [verified ? tot.i : '—', 'Intereses'], [verified ? tot.m : '—', 'Matches']].map(([v, l]) => (
            <div key={l} className="card flex flex-col gap-0.5 p-3"><span className="font-display text-[22px] font-bold">{v}</span><span className="text-xs text-tinta-3">{l}</span></div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">Vacantes</h2>
          <Link to="/vacantes/nueva" className="flex h-11 items-center text-sm font-semibold text-rosa-texto">+ Crear vacante</Link>
        </div>
        {jobs == null ? <Spinner /> : jobs.length === 0 ? (
          <Empty title="Crea tu primera vacante" action={<Link to="/vacantes/nueva" className="btn-sm mt-1 bg-rosa-accion text-white">Crear vacante</Link>}>
            {verified ? 'Publícala y empieza a recibir intereses.' : 'Puedes dejarla lista mientras verificamos tu empresa.'}
          </Empty>
        ) : jobs.map((j) => (
          <div key={j.id} className="card flex flex-col gap-2.5 p-3.5">
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold">{j.title}</span>
                <span className="text-xs text-tinta-3">{[j.comuna, j.modality, stats[j.id] && `${stats[j.id].interests} intereses · ${stats[j.id].matches} matches`].filter(Boolean).join(' · ')}</span>
              </div>
              <span className={`pill whitespace-nowrap ${STATUS[j.status][1]}`}>{STATUS[j.status][0]}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Link to={`/vacantes/${j.id}`} className="btn-sm border border-linea bg-white">Editar</Link>
              {j.status === 'published'
                ? <Link to={`/vacantes/${j.id}/candidatos`} className="btn-sm bg-rosa-accion text-white">Ver candidatos</Link>
                : <span className="btn-sm bg-[#F4EEF2] text-tinta-3">{j.status === 'pending' ? 'Se publica al verificar' : 'No visible'}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const EMPTY_JOB = { title: '', area: '', level: '', description: '', requirements: [], modality: '', schedule: '', contract: '', region: '', comuna: '', salary_min: null, salary_max: null, salary_type: 'liquido', status: 'draft' }

export function JobForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const { company } = useAuth()
  const [j, setJ] = useState(id ? null : { ...EMPTY_JOB, region: company?.region || '', comuna: company?.comuna || '' })
  const [req, setReq] = useState('')
  const [ok, setOk] = useState(!!id)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (id) supabase.from('jobs').select('*').eq('id', id).single().then(({ data, error }) => { if (error) setErr(errMsg(error)); setJ(data) })
  }, [id])
  if (!j) return <Spinner />
  const set = (k, v) => setJ({ ...j, [k]: v })
  const save = async (status) => {
    setErr('')
    if (!j.title.trim() || !j.area || !j.modality || !j.schedule) return setErr('Completa título, área, modalidad y jornada.')
    if (j.modality !== 'Remota' && (!j.region || !j.comuna.trim())) return setErr('Indica región y comuna.')
    if (j.salary_min && j.salary_max && j.salary_min > j.salary_max) return setErr('La renta "desde" no puede ser mayor que "hasta".')
    if (status === 'published' && !ok) return setErr('Confirma que la oferta es real, no cobra a postulantes y no discrimina.')
    setBusy(true)
    const row = { ...j, title: j.title.trim(), comuna: j.comuna.trim(), status, company_id: company.id }
    delete row.id; delete row.created_at; delete row.updated_at
    const q = id ? supabase.from('jobs').update(row).eq('id', id) : supabase.from('jobs').insert(row)
    const { error } = await q
    setBusy(false)
    if (error) return setErr(errMsg(error))
    nav('/')
  }
  const verified = company?.verification_status === 'verified'
  return (
    <Screen>
      <TopBar back="/" title={id ? 'Editar vacante' : 'Nueva vacante'} />
      <div className="flex flex-col gap-4 px-6 pb-6 pt-2">
        <Field label="Título del cargo"><input className="input" maxLength={90} value={j.title} onChange={(e) => set('title', e.target.value)} placeholder="Ej.: Vendedor/a de tienda" /></Field>
        <Field label="Área"><select className="input" value={j.area} onChange={(e) => set('area', e.target.value)}><option value="">Selecciona</option>{AREAS.map((a) => <option key={a}>{a}</option>)}</select></Field>
        <Chips legend="Nivel" multi={false} options={NIVELES} value={j.level} onChange={(v) => set('level', v)} />
        <Chips legend="Modalidad" multi={false} options={MODALIDADES} value={j.modality} onChange={(v) => set('modality', v)} />
        <Chips legend="Jornada" multi={false} options={JORNADAS} value={j.schedule} onChange={(v) => set('schedule', v)} />
        <Chips legend="Tipo de contrato" multi={false} options={CONTRATOS} value={j.contract} onChange={(v) => set('contract', v)} />
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Región"><select className="input" value={j.region} onChange={(e) => set('region', e.target.value)}><option value="">Selecciona</option>{REGIONES.map((r) => <option key={r}>{r}</option>)}</select></Field>
          <Field label="Comuna"><input className="input" value={j.comuna} onChange={(e) => set('comuna', e.target.value)} /></Field>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="label">Renta mensual (CLP)</span>
          <div className="flex gap-1 rounded-xl bg-[#F4EEF2] p-[3px]">
            {[['liquido', 'Líquida'], ['bruto', 'Bruta']].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={j.salary_type === k} onClick={() => set('salary_type', k)}
                className={`h-[38px] flex-1 rounded-[9px] text-[13px] font-semibold ${j.salary_type === k ? 'bg-white text-tinta shadow-sm' : 'text-tinta-3'}`}>{l}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <input className="input" inputMode="numeric" aria-label="Desde" placeholder="Desde" value={clp(j.salary_min)} onChange={(e) => set('salary_min', parseCLP(e.target.value))} />
            <input className="input" inputMode="numeric" aria-label="Hasta" placeholder="Hasta" value={clp(j.salary_max)} onChange={(e) => set('salary_max', parseCLP(e.target.value))} />
          </div>
          <span className="hint">Recomendado. Los candidatos ven este rango antes de mostrar interés.</span>
        </div>
        <Field label="Descripción" hint="Funciones principales, horario, beneficios."><textarea className="textarea h-36" maxLength={3000} value={j.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <div className="flex flex-col gap-2">
          <span className="label">Requisitos</span>
          {j.requirements.map((r, k) => (
            <div key={k} className="flex items-center gap-2 rounded-xl border border-[#EEE3EA] px-3 py-2 text-sm">
              <button type="button" onClick={() => set('requirements', j.requirements.map((x, n) => (n === k ? { ...x, essential: !x.essential } : x)))}
                className={`pill ${r.essential ? 'bg-morado text-white' : 'bg-[#F1EDF0] text-[#3D2F4A]'}`} aria-label="Cambiar entre esencial y deseable">{r.essential ? 'ESENCIAL' : 'DESEABLE'}</button>
              <span className="flex-1">{r.text}</span>
              <button type="button" aria-label={`Quitar ${r.text}`} onClick={() => set('requirements', j.requirements.filter((_, n) => n !== k))} className="flex h-9 w-9 items-center justify-center text-tinta-suave"><Svg name="x" size={16} /></button>
            </div>
          ))}
          <div className="flex gap-2">
            <input className="input" value={req} onChange={(e) => setReq(e.target.value)} placeholder="Ej.: Licencia clase B" />
            <button type="button" className="btn-sm shrink-0 border border-rosa-accion bg-white text-rosa-texto"
              onClick={() => { if (req.trim()) { set('requirements', [...j.requirements, { text: req.trim(), essential: true }]); setReq('') } }}>Agregar</button>
          </div>
        </div>
        <label className="flex items-start gap-2.5 rounded-xl border border-rosa-borde bg-rosa-fondo p-3 text-[13px] leading-snug">
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D02E72]" />
          Confirmo que esta oferta es real, no cobra a postulantes y no excluye por motivos ilegales.
        </label>
        {id && j.status === 'published' && (
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-sm border border-linea bg-white" onClick={() => save('paused')}>Pausar</button>
            <button className="btn-sm border border-linea bg-white" onClick={() => save('closed')}>Cerrar vacante</button>
          </div>
        )}
        <ErrorBox>{err}</ErrorBox>
      </div>
      <div className="safe-b sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-[#F1E7ED] bg-white px-6 pt-3">
        {!verified && <span className="text-center text-xs text-[#6B3800]">Se publicará automáticamente cuando tu empresa esté verificada.</span>}
        <div className="grid grid-cols-2 gap-2.5">
          <button className="btn-sec h-[50px] text-[15px]" disabled={busy} onClick={() => save('draft')}>Guardar borrador</button>
          <button className="btn h-[50px] text-[15px]" disabled={busy} onClick={() => save('published')}>{verified ? 'Publicar' : 'Enviar a publicar'}</button>
        </div>
      </div>
    </Screen>
  )
}

export function JobCandidates() {
  const { id } = useParams()
  const { user } = useAuth()
  const nav = useNavigate()
  const [job, setJob] = useState(null)
  const [list, setList] = useState(null)
  const [i, setI] = useState(0)
  const [toast, setToast] = useState({ msg: '', tone: 'dark' })
  const [err, setErr] = useState('')
  const [video, setVideo] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setList(null); setI(0)
    const [{ data: jd }, { data, error }] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', id).single(),
      supabase.rpc('candidates_for_job', { p_job: id }),
    ])
    if (error) setErr(errMsg(error))
    setJob(jd); setList(data || [])
  }, [id])
  useEffect(() => { load() }, [load])

  const c = list?.[i]
  const act = async (action) => {
    if (!c || busy) return
    setBusy(true)
    const { error } = await supabase.from('company_candidate_actions').upsert({ job_id: id, candidate_id: c.candidate_id, action, created_by: user.id })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    if (action === 'interest') {
      const { data: m } = await supabase.from('matches').select('id').eq('job_id', id).eq('candidate_id', c.candidate_id).maybeSingle()
      setToast(m ? { msg: `¡Es match con ${c.display_name}! Ya pueden conversar.`, tone: 'pink', match: m.id }
        : { msg: `Invitación enviada a ${c.display_name} para esta vacante. Será match si acepta.`, tone: 'dark' })
    } else if (action === 'save') setToast({ msg: `${c.display_name} guardado/a. No recibe aviso.`, tone: 'dark' })
    else setToast({ msg: '', tone: 'dark' })
    setI((n) => n + 1)
  }
  const playVideo = async () => {
    const { data: path } = await supabase.rpc('candidate_video_path', { p_candidate: c.candidate_id })
    if (!path) return setErr('El video no está disponible.')
    const { data } = await supabase.storage.from('videos').createSignedUrl(path, 600)
    setVideo(data?.signedUrl || '')
  }

  const yrs = (exps) => {
    let months = 0
    for (const x of exps || []) {
      if (!x.from) continue
      const a = new Date(x.from + '-01'), b = x.current || !x.to ? new Date() : new Date(x.to + '-01')
      months += Math.max(0, (b - a) / 2.63e9)
    }
    return months >= 12 ? `${Math.round(months / 12)} año(s)` : months > 0 ? `${Math.round(months)} mes(es)` : 'Sin datos'
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-[#FAF7F9] pb-32">
      <div className="safe-t flex items-center gap-1.5 px-4 pb-3">
        <button aria-label="Volver" onClick={() => nav('/')} className="flex h-11 w-11 items-center justify-center"><Svg name="back" /></button>
        <div className="flex flex-col"><span className="text-[11px] text-tinta-suave">Candidatos para</span><span className="text-[15px] font-semibold">{job?.title || '…'}</span></div>
      </div>
      <div className="flex flex-1 flex-col px-4">
        <ErrorBox>{err}</ErrorBox>
        {list == null ? <Spinner /> : !c ? (
          <Empty title="No hay más perfiles por ahora" action={<button onClick={load} className="btn-sm mt-1 border border-rosa-accion bg-white text-rosa-texto">Buscar de nuevo</button>}>
            Vuelve más tarde: aparecerán nuevos candidatos a medida que se registren.
          </Empty>
        ) : (
          <article className="flex flex-col gap-3.5 rounded-[22px] border border-[#EEE3EA] bg-white p-[18px] shadow-[0_10px_30px_rgba(48,37,56,0.10)]">
            {c.already_interested && <div className="rounded-xl bg-rosa-palido px-2.5 py-2 text-xs font-bold text-rosa-oscuro">Ya mostró interés en esta vacante · si te interesa, es match</div>}
            <div className="flex items-center gap-3">
              <Avatar text={c.initials} color="#302538" size={56} round />
              <div className="flex flex-col gap-0.5"><span className="font-display text-[19px] font-semibold">{c.display_name}</span><span className="text-sm text-tinta-2">{c.headline}</span></div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[c.comuna, c.availability && `Disponible: ${c.availability.toLowerCase()}`, c.modalities?.join(' o ')].filter(Boolean).map((t) => <span key={t} className="rounded-lg bg-[#F6F1F4] px-2.5 py-1.5 text-[13px] text-tinta-2">{t}</span>)}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex flex-col gap-0.5"><span className="text-xs text-tinta-suave">Experiencia</span><span className="font-medium">{c.has_experience ? yrs(c.experiences) : 'Busca primer empleo'}</span></div>
              <div className="flex flex-col gap-0.5"><span className="text-xs text-tinta-suave">Estudios</span><span className="font-medium">{c.education?.[0] ? (c.education[0].title || c.education[0].level) : '—'}</span></div>
            </div>
            {c.experiences?.length > 0 && (
              <div className="flex flex-col gap-1 text-sm">{c.experiences.slice(0, 3).map((x, k) => <span key={k}><b>{x.role}</b> · {x.company}</span>)}</div>
            )}
            {c.skills?.length > 0 && <div className="flex flex-wrap gap-1.5">{c.skills.map((s) => <span key={s} className="rounded-full border border-linea px-2.5 py-1 text-xs">{s}</span>)}</div>}
            {(c.bio || c.has_video) && (
              <div className="flex flex-col gap-2 rounded-xl bg-rosa-fondo p-3">
                <span className="text-xs font-semibold text-tinta-3">Presentación</span>
                {c.bio && <p className="text-sm leading-relaxed">{c.bio}</p>}
                {c.has_video && (video ? <video src={video} controls autoPlay playsInline className="w-full rounded-xl bg-morado" /> : <button onClick={playVideo} className="btn-sm self-start bg-morado text-white"><Svg name="video" size={18} className="mr-1.5" />Ver video (15 s)</button>)}
              </div>
            )}
            {c.reasons?.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-[#F1E7ED] pt-3">
                <span className="text-xs font-semibold text-tinta-3">Coincide con tu vacante en</span>
                <div className="flex flex-wrap gap-1.5">{c.reasons.map((r) => <span key={r} className="rounded-full bg-[#EAF6EF] px-2.5 py-1 text-xs font-semibold text-[#1E6B3F]">✓ {r}</span>)}</div>
              </div>
            )}
            <span className="text-xs leading-snug text-tinta-suave">Teléfono y correo se muestran solo tras el match y si la persona los comparte.</span>
          </article>
        )}
      </div>
      {c && (
        <div className="safe-b fixed bottom-0 left-1/2 z-10 grid w-full max-w-md -translate-x-1/2 grid-cols-3 gap-2.5 bg-gradient-to-t from-[#FAF7F9] via-[#FAF7F9] px-4 pt-4">
          <button className="btn-sec" disabled={busy} onClick={() => { setVideo(''); act('pass') }}>Pasar</button>
          <button className="btn-sec" disabled={busy} onClick={() => { setVideo(''); act('save') }}>Guardar</button>
          <button className="btn" disabled={busy} onClick={() => { setVideo(''); act('interest') }}>Me interesa</button>
        </div>
      )}
      <Toast msg={toast.msg} tone={toast.tone} onDone={() => setToast({ msg: '', tone: 'dark' })} />
    </div>
  )
}

export function CompanyAccount() {
  const { company, refresh } = useAuth()
  const [f, setF] = useState(() => ({ description: company?.description || '', benefits: company?.benefits || '', website: company?.website || '', display_name: company?.display_name || '' }))
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const save = async () => {
    setErr('')
    const { error } = await supabase.from('companies').update(f).eq('id', company.id)
    if (error) return setErr(errMsg(error))
    setMsg('Vitrina actualizada.'); refresh()
  }
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-[#FAF7F9] pb-28">
      <div className="safe-t px-5 pb-3"><h1 className="text-[22px] font-bold">Vitrina de empresa</h1><p className="text-[13px] text-tinta-3">Lo que verán los candidatos de tu empresa.</p></div>
      <div className="flex flex-col gap-4 px-5">
        <div className="card flex items-center gap-3 p-4">
          <Avatar text={company?.display_name?.slice(0, 2).toUpperCase()} color="#3B5BA9" size={52} />
          <div className="flex flex-col"><span className="flex items-center gap-1.5 font-semibold">{company?.display_name}{company?.verification_status === 'verified' && <Verified />}</span>
            <span className="text-xs text-tinta-3">{company?.legal_name} · {company?.rut}</span></div>
        </div>
        <Field label="Nombre visible"><input className="input" value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></Field>
        <Field label="Quiénes somos" hint="Propósito, cultura y qué hace tu equipo."><textarea className="textarea h-32" maxLength={1500} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Beneficios"><textarea className="textarea h-24" maxLength={800} value={f.benefits} onChange={(e) => setF({ ...f, benefits: e.target.value })} placeholder="Ej.: seguro complementario, horario flexible" /></Field>
        <Field label="Sitio web"><input className="input" type="url" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} placeholder="https://" /></Field>
        <ErrorBox>{err}</ErrorBox>
        <button className="btn" onClick={save}>Guardar vitrina</button>
        <p className="hint">Fotos, logo y video de empresa llegarán en la próxima versión.</p>
        <div className="mt-2"><DangerZone /></div>
      </div>
      <Toast msg={msg} onDone={() => setMsg('')} />
    </div>
  )
}

export function CompanyMissing() {
  const { signOut } = useAuth()
  return (
    <Screen>
      <TopBar title="VINKA Company" />
      <div className="flex flex-1 flex-col gap-4 px-6 pb-8">
        <Empty title="No encontramos tu empresa">Tu cuenta no tiene una empresa asociada. Escríbenos o vuelve a registrarte.</Empty>
        <button className="btn-sec" onClick={signOut}>Cerrar sesión</button>
      </div>
    </Screen>
  )
}

export function salaryForCard(j) { return salaryText(j) }
