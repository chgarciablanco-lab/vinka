// Evaluaciones e informes psicolaborales con IA: el asesor o la empresa sube perfil, CV, entrevista, referencias y tests;
// la IA redacta un borrador que la persona revisa, edita, cierra y descarga en Word o PDF. El postulante nunca lo ve.
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { ErrorBox, Screen, Sheet, Spinner, Svg, Toast, TopBar } from '../../components/ui'
import { Sparkle } from '../../components/AiAssist'
import { AJUSTES, VEREDICTOS, buildComparisonDocx, buildComparisonPdf, buildReportDocx, buildReportPdf, download, reportMeta } from '../../lib/reportExport'
import { loadLogo } from '../../lib/offerPdf'

const KINDS = [['cv', 'CV'], ['transcripcion', 'Transcripción de entrevista'], ['referencias', 'Referencias laborales'], ['test', 'Reporte de test (DISC, liderazgo…)'], ['otro', 'Otro documento']]
const KIND = Object.fromEntries([['perfil', 'Perfil del cargo'], ...KINDS])
const MAX = 20 * 1024 * 1024
const fdate = (d) => (d ? new Date(d).toLocaleDateString('es-CL') : '')
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(errMsg(error))
  return data
}
async function aiReport(body) {
  const { data, error } = await supabase.functions.invoke('evaluation-report', { body })
  if (error) {
    let msg = 'La IA no está disponible ahora. Inténtalo de nuevo en un momento.'
    try { const b = await error.context?.json?.(); if (b?.error) msg = b.error } catch { /* sin detalle */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

/** Sube un archivo (PDF, Word o texto) y lo registra; de Word y texto se guarda además el texto para la IA */
async function uploadFile(assessmentId, candId, kind, file) {
  const name = file.name || 'archivo'
  const low = name.toLowerCase()
  if (file.size > MAX) throw new Error('El archivo pesa más de 20 MB.')
  let mime = file.type, text = null
  if (low.endsWith('.pdf')) mime = 'application/pdf'
  else if (low.endsWith('.docx')) {
    mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    const mammoth = await import('mammoth/mammoth.browser')
    text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value
  } else if (low.endsWith('.txt')) { mime = 'text/plain'; text = await file.text() }
  else if (low.endsWith('.doc')) throw new Error('Los archivos .doc antiguos no se pueden leer. Guárdalo como PDF o .docx.')
  else throw new Error('Formato no admitido. Usa PDF, Word (.docx) o texto (.txt).')
  const path = `${assessmentId}/${crypto.randomUUID()}-${low.replace(/[^a-z0-9._-]+/g, '-').slice(-80)}`
  const up = await supabase.storage.from('evaluaciones').upload(path, file, { contentType: mime })
  if (up.error) throw new Error('No pudimos subir el archivo. Revisa tu conexión e inténtalo de nuevo.')
  try {
    await rpc('eval_add_file', { p_eval: assessmentId, p_cand: candId, p_kind: kind, p_name: name, p_path: path, p_mime: mime, p_size: file.size, p_text: text ? text.slice(0, 200000) : null })
  } catch (e) { await supabase.storage.from('evaluaciones').remove([path]); throw e }
}

/** Contenido de los reportes de test en PDF, para el anexo del informe (los que no se puedan leer se omiten) */
async function loadAnnex(files) {
  const out = []
  for (const f of files.slice(0, 6)) {
    const { data } = await supabase.storage.from('evaluaciones').download(f.path)
    if (data) out.push(new Uint8Array(await data.arrayBuffer()))
  }
  return out
}

function UsageChip({ usage }) {
  if (!usage) return null
  const left = Math.max(0, usage.limit - usage.used)
  return <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${left ? 'bg-[#F7F0FB] text-[#4A2163]' : 'bg-[#FEF3F2] text-[#912018]'}`}>{left} de {usage.limit} informes este mes</span>
}

/* ───────────── Lista ───────────── */
export default function Assessments() {
  const { company } = useAuth()
  const nav = useNavigate()
  const [list, setList] = useState(null)
  const [usage, setUsage] = useState(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ title: '', client: '', profile: '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    rpc('eval_list', { p_company: null }).then(setList).catch((e) => { setErr(e.message); setList([]) })
    if (company?.id) rpc('my_report_usage', { p_company: company.id }).then(setUsage).catch(() => {})
  }, [company?.id])
  const canCreate = ['owner', 'admin', 'recruiter'].includes(company?.member_role)
  const create = async () => {
    setBusy(true); setErr('')
    try { const id = await rpc('eval_create', { p_company: company.id, p_title: f.title, p_client: f.client, p_profile: f.profile, p_job: null }); nav(`/evaluaciones/${id}`) }
    catch (e) { setErr(e.message); setBusy(false) }
  }
  return (
    <Screen>
      <TopBar back="/" title="Evaluaciones" right={canCreate ? <button className="btn-sm h-9 bg-rosa-accion px-3 text-white" onClick={() => setOpen(true)}>Nueva</button> : null} />
      <div className="flex flex-col gap-3 px-5 pb-28">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] leading-snug text-tinta-3">Sube CV, entrevista, referencias y tests; la IA redacta el borrador del informe psicolaboral y tú lo revisas.</p>
          <UsageChip usage={usage} />
        </div>
        <ErrorBox>{err}</ErrorBox>
        {list == null ? <Spinner /> : list.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-linea bg-white px-4 py-3 text-[13px] text-tinta-3">Aún no hay evaluaciones. Las de tus vacantes se crean desde la ficha de cada postulante, en la pestaña «Informe».</p>
        ) : list.map((e) => (
          <Link key={e.id} to={`/evaluaciones/${e.id}`} className="card flex items-center gap-3 p-4">
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="truncate text-[15px]">{e.title}</b>
              <span className="truncate text-[13px] text-tinta-3">{[e.client_name || e.company, e.job_id ? 'Vacante de VINKA' : null, fdate(e.created_at)].filter(Boolean).join(' · ')}</span>
              <span className="text-xs text-tinta-3">{e.candidates} {e.candidates === 1 ? 'persona' : 'personas'} · {e.finals} {e.finals === 1 ? 'informe cerrado' : 'informes cerrados'}{e.status === 'cerrada' ? ' · evaluación cerrada' : ''}</span>
            </span>
            <Svg name="chevron" size={18} className="text-tinta-suave" />
          </Link>
        ))}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Nueva evaluación">
        <div className="flex flex-col gap-2.5">
          <input className="input" placeholder="Cargo (ej.: Subadministrador)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <input className="input" placeholder="Empresa cliente (opcional)" value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} />
          <textarea className="textarea h-36" maxLength={20000} value={f.profile} onChange={(e) => setF({ ...f, profile: e.target.value })} placeholder="Perfil del cargo: descripción y funciones (también puedes subirlo como archivo después)" />
          <ErrorBox>{err}</ErrorBox>
          <button className="btn" disabled={busy || f.title.trim().length < 2} onClick={create}>{busy ? 'Creando…' : 'Crear evaluación'}</button>
        </div>
      </Sheet>
    </Screen>
  )
}

/* ───────────── Detalle de una evaluación ───────────── */
export function AssessmentPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState(null)
  const [add, setAdd] = useState(false)
  const [p, setP] = useState({ name: '', email: '' })
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => rpc('eval_detail', { p_eval: id }).then((x) => { setD(x); setErr('') }).catch((e) => setErr(e.message)), [id])
  useEffect(() => { load() }, [load])
  if (!d) return <Screen><TopBar back="/evaluaciones" title="Evaluación" /><div className="px-5">{err ? <ErrorBox>{err}</ErrorBox> : <Spinner />}</div></Screen>
  const saveProfile = async () => {
    setBusy(true); setErr('')
    try { await rpc('eval_update', { p_eval: id, p_title: f.title, p_client: f.client, p_profile: f.profile }); setEdit(false); load() } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  const addPerson = async () => {
    setBusy(true); setErr('')
    try { await rpc('eval_add_candidate', { p_eval: id, p_name: p.name, p_email: p.email }); setAdd(false); setP({ name: '', email: '' }); load() } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  const close = async (closed) => {
    if (closed && !window.confirm('Al cerrar la evaluación se eliminan los archivos subidos (CV, entrevistas, referencias). Los informes y los reportes de test (para el anexo del PDF) quedan guardados. ¿Cerrar?')) return
    try { await rpc('eval_set_status', { p_eval: id, p_closed: closed }); load() } catch (e) { setErr(e.message) }
  }
  const remove = async () => {
    if (!window.confirm('Se eliminará la evaluación con sus archivos e informes. No se puede deshacer. ¿Eliminar?')) return
    try { await rpc('eval_delete', { p_eval: id }); nav('/evaluaciones') } catch (e) { setErr(e.message) }
  }
  const open = d.status === 'abierta'
  return (
    <Screen>
      <TopBar back="/evaluaciones" title={d.title} />
      <div className="flex flex-col gap-3 px-5 pb-28">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] text-tinta-3">{[d.client_name || d.company, d.job_id ? 'Vacante de VINKA' : null, open ? null : 'Evaluación cerrada'].filter(Boolean).join(' · ')}</span>
          <UsageChip usage={d.usage} />
        </div>
        <ErrorBox>{err}</ErrorBox>
        {d.can_manage && (
          <section className="card flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-2"><h2 className="text-[15px] font-semibold">Perfil del cargo</h2>
              {open && !edit && <button className="text-[13px] font-semibold text-rosa-texto" onClick={() => { setF({ title: d.title, client: d.client_name, profile: d.job_profile }); setEdit(true) }}>Editar</button>}</div>
            {edit ? <>
              <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Cargo" />
              <input className="input" value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} placeholder="Empresa cliente" />
              <textarea className="textarea h-40" maxLength={20000} value={f.profile} onChange={(e) => setF({ ...f, profile: e.target.value })} placeholder="Descripción y funciones del cargo" />
              <div className="flex gap-2"><button className="btn-sm h-10 bg-rosa-accion px-4 text-white" disabled={busy} onClick={saveProfile}>Guardar</button><button className="btn-sm h-10 border border-linea bg-white px-4" onClick={() => setEdit(false)}>Cancelar</button></div>
            </> : <p className="whitespace-pre-line text-[13px] leading-snug text-tinta-2">{d.job_profile ? (d.job_profile.length > 400 ? d.job_profile.slice(0, 400) + '…' : d.job_profile) : 'Sin perfil. Escríbelo o sube un documento: la IA lo usa para evaluar el ajuste al cargo.'}</p>}
            <FileList files={d.shared_files} canManage={d.can_manage && open} onChange={load} />
            {open && <FileAdder assessmentId={id} candId={null} kinds={[['perfil', 'Perfil del cargo'], ['otro', 'Otro documento']]} onDone={load} />}
          </section>
        )}
        <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold">Personas evaluadas · {d.candidates.length}</h2>
          {d.can_manage && open && !d.job_id && <button className="btn-sm h-9 border border-rosa-accion bg-white px-3 text-rosa-texto" onClick={() => setAdd(true)}>Agregar persona</button>}</div>
        {d.candidates.length === 0 && <p className="rounded-2xl border border-dashed border-linea bg-white px-4 py-3 text-[13px] text-tinta-3">{d.job_id ? 'Prepara informes desde la ficha de cada postulante de la vacante.' : 'Agrega a las personas que evaluaste.'}</p>}
        {d.candidates.map((c) => <CandidateCard key={c.id} a={d} c={c} onChange={load} onToast={setToast} />)}
        <Comparison a={d} onChange={load} onToast={setToast} />
        {d.can_manage && (
          <div className="flex flex-wrap gap-2 pt-2">
            <button className="btn-sm h-10 border border-linea bg-white px-4" onClick={() => close(open)}>{open ? 'Cerrar evaluación' : 'Reabrir evaluación'}</button>
            <button className="btn-sm h-10 border border-[#F4C7C3] bg-white px-4 text-[#912018]" onClick={remove}>Eliminar</button>
          </div>
        )}
      </div>
      <Sheet open={add} onClose={() => setAdd(false)} title="Agregar persona">
        <div className="flex flex-col gap-2.5">
          <input className="input" placeholder="Nombre y apellido" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
          <input className="input" type="email" placeholder="Correo (opcional)" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} />
          <ErrorBox>{err}</ErrorBox>
          <button className="btn" disabled={busy || p.name.trim().length < 2} onClick={addPerson}>Agregar</button>
        </div>
      </Sheet>
      <Toast msg={toast} onDone={() => setToast('')} />
    </Screen>
  )
}

function FileList({ files, canManage, onChange }) {
  const [err, setErr] = useState('')
  if (!files?.length) return null
  const del = async (f) => {
    if (!window.confirm(`¿Quitar «${f.name}»?`)) return
    setErr('')
    try { await rpc('eval_delete_file', { p_file: f.id }); onChange() } catch (e) { setErr(e.message) }
  }
  const open = async (f) => {
    const { data } = await supabase.storage.from('evaluaciones').createSignedUrl(f.path, 120)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
  }
  return (
    <ul className="flex flex-col gap-1">
      {files.map((f) => (
        <li key={f.id} className="flex items-center gap-2 rounded-xl bg-[#FAF6F8] px-3 py-2 text-[13px]">
          <Svg name="doc" size={16} className="shrink-0 text-tinta-3" />
          <span className="min-w-0 flex-1"><b className="block truncate">{f.name}</b><span className="text-xs text-tinta-3">{KIND[f.kind]}{f.size ? ` · ${kb(f.size)}` : ' · texto pegado'}</span></span>
          {f.path && <button className="text-xs font-semibold text-rosa-texto" onClick={() => open(f)}>Ver</button>}
          {canManage && <button className="text-xs font-semibold text-tinta-3" aria-label={`Quitar ${f.name}`} onClick={() => del(f)}>Quitar</button>}
        </li>
      ))}
      <ErrorBox>{err}</ErrorBox>
    </ul>
  )
}

function FileAdder({ assessmentId, candId, kinds = KINDS, onDone }) {
  const [kind, setKind] = useState(kinds[0][0])
  const [paste, setPaste] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const onFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setBusy(true); setErr('')
    try { await uploadFile(assessmentId, candId, kind, file); onDone() } catch (x) { setErr(x.message) }
    setBusy(false)
  }
  const savePaste = async () => {
    setBusy(true); setErr('')
    try { await rpc('eval_add_file', { p_eval: assessmentId, p_cand: candId, p_kind: kind, p_name: `${KIND[kind]} (texto)`, p_path: null, p_mime: 'text/plain', p_size: 0, p_text: text }); setText(''); setPaste(false); onDone() } catch (x) { setErr(x.message) }
    setBusy(false)
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-linea p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input h-10 flex-1" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo de documento">{kinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <label className={`btn-sm h-10 cursor-pointer border border-linea bg-white px-3 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
          {busy ? 'Subiendo…' : 'Subir archivo'}<input type="file" className="hidden" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={onFile} />
        </label>
        <button className="btn-sm h-10 border border-linea bg-white px-3" onClick={() => setPaste(!paste)}>Pegar texto</button>
      </div>
      {paste && <>
        <textarea className="textarea h-32" maxLength={200000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Pega aquí la transcripción, las notas de referencias u otro texto" />
        <button className="btn-sm h-10 self-start bg-rosa-accion px-4 text-white" disabled={busy || text.trim().length < 20} onClick={savePaste}>Guardar texto</button>
      </>}
      <span className="text-[11px] text-tinta-suave">PDF, Word (.docx) o texto, hasta 20 MB. El audio estará disponible más adelante: por ahora sube la transcripción de Zoom, Meet o Teams.</span>
      <ErrorBox>{err}</ErrorBox>
    </div>
  )
}

/* ───────────── Una persona: archivos, consentimiento, generación e informe ───────────── */
function CandidateCard({ a, c, onChange, onToast }) {
  const [openCard, setOpenCard] = useState(!c.report)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const editable = a.can_manage && a.status === 'abierta'
  const consent = async () => { setErr(''); try { await rpc('eval_set_consent', { p_cand: c.id }); onChange() } catch (e) { setErr(e.message) } }
  const generate = async () => {
    if (c.report && !window.confirm('Se generará un informe nuevo (se usa un informe del límite mensual). El actual queda como versión anterior. ¿Continuar?')) return
    setBusy(true); setErr('')
    try { await aiReport({ candidate: c.id, mode: 'informe' }); onToast('Borrador listo. Revísalo antes de cerrarlo.'); onChange() } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  const removePerson = async () => {
    if (!window.confirm(`¿Quitar a ${c.full_name} de la evaluación? Se eliminan sus archivos e informes.`)) return
    try { await rpc('eval_remove_candidate', { p_cand: c.id }); onChange() } catch (e) { setErr(e.message) }
  }
  return (
    <section className="card flex flex-col gap-2.5 p-4" aria-label={c.full_name}>
      <button className="flex items-center justify-between gap-2 text-left" onClick={() => setOpenCard(!openCard)} aria-expanded={openCard}>
        <span className="flex min-w-0 flex-col"><b className="truncate text-[15px]">{c.full_name}</b>
          <span className="text-xs text-tinta-3">{c.report ? `${c.report.status === 'final' ? '✓ Informe cerrado' : 'Borrador'} · ${VEREDICTOS[c.report.sections?.veredicto] || 'sin recomendación'}` : editable ? `${c.files.length} archivo(s) · sin informe` : 'Sin informe cerrado'}</span></span>
        <Svg name="chevron" size={18} className={`shrink-0 text-tinta-suave transition-transform ${openCard ? 'rotate-90' : ''}`} />
      </button>
      {openCard && <>
        {editable && <>
          <FileList files={c.files} canManage={editable} onChange={onChange} />
          <FileAdder assessmentId={a.id} candId={c.id} onDone={onChange} />
          {c.consent_at ? <span className="text-xs text-[#1E6B3F]">✓ Autorización de la persona registrada por {c.consent_by} el {fdate(c.consent_at)}</span> : (
            <label className="flex items-start gap-2.5 rounded-xl bg-[#FFF9E8] px-3 py-2.5 text-[13px] leading-snug text-[#5C3E00]">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#D02E72]" onChange={(e) => e.target.checked && consent()} />
              <span>Confirmo que {c.full_name} autorizó esta evaluación y que sus documentos se procesen con inteligencia artificial.</span>
            </label>
          )}
          <button className="btn flex items-center justify-center gap-2" disabled={busy || !c.consent_at || !c.files.length} onClick={generate}>
            <Sparkle />{busy ? 'Redactando el informe… (1 a 2 minutos)' : c.report ? 'Generar informe de nuevo' : 'Generar informe con IA'}
          </button>
          {!c.files.length && <span className="-mt-1 text-[11px] text-tinta-suave">Sube al menos el CV o la entrevista.</span>}
        </>}
        <ErrorBox>{err}</ErrorBox>
        {c.report && <ReportEditor key={c.report.id + c.report.version} report={c.report} canEdit={editable} meta={reportMeta({ person: c.full_name, title: a.title, client: a.client_name || a.company, company: a.company, logoPath: a.company_logo, date: c.report.finalized_at || c.report.created_at, signer: c.report.finalized_by_name })} candId={c.id} annexFiles={(c.files || []).filter((f) => f.kind === 'test' && f.path && /\.pdf$/i.test(f.path))} onChange={onChange} onToast={onToast} />}
        {editable && <button className="self-start text-[12px] font-semibold text-tinta-3" onClick={removePerson}>Quitar a esta persona</button>}
      </>}
    </section>
  )
}

const LABELS = { antecedentes: '1) Antecedentes y experiencia profesional', fortalezas: 'Fortalezas', oportunidades: 'Oportunidades de mejora', referencias: 'Referencias laborales',
  motivacion: '3) Motivación de cambio', recomendacion: '4) Recomendación', sintesis: 'Síntesis', renta: 'Expectativa de renta', disponibilidad: 'Disponibilidad' }

function ReportEditor({ report, canEdit, meta, candId, annexFiles = [], onChange, onToast }) {
  const [s, setS] = useState(report.sections || {})
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [regen, setRegen] = useState(null)
  const [hint, setHint] = useState('')
  const draft = report.status === 'borrador'
  const edit = canEdit && draft
  const set = (k, v) => { setS({ ...s, [k]: v }); setDirty(true) }
  const save = async () => {
    setBusy('save'); setErr('')
    try { await rpc('eval_report_save', { p_report: report.id, p_sections: s }); setDirty(false); onToast('Cambios guardados.') } catch (e) { setErr(e.message) }
    setBusy('')
  }
  const finalize = async (final) => {
    setBusy('final'); setErr('')
    try { if (dirty) await rpc('eval_report_save', { p_report: report.id, p_sections: s }); await rpc('eval_report_finalize', { p_report: report.id, p_final: final }); onChange() } catch (e) { setErr(e.message) }
    setBusy('')
  }
  const doRegen = async () => {
    setBusy('regen'); setErr('')
    try {
      if (dirty) { await rpc('eval_report_save', { p_report: report.id, p_sections: s }); setDirty(false) }
      const r = await aiReport({ candidate: candId, mode: 'seccion', section: regen, instruction: hint })
      setS((x) => ({ ...x, [r.section]: r.value })); setRegen(null); setHint(''); onToast('Sección reescrita.')
    } catch (e) { setErr(e.message) }
    setBusy('')
  }
  const exp = async (kind) => {
    setBusy(kind); setErr('')
    try {
      const logo = await loadLogo(meta.logoPath)
      if (kind === 'docx') await download(await buildReportDocx(s, { ...meta, logo }))
      else await download(await buildReportPdf(s, { ...meta, logo }, { annex: await loadAnnex(annexFiles) }))
    } catch { setErr('No pudimos generar el archivo. Inténtalo de nuevo.') }
    setBusy('')
  }
  const textField = (k, rows = 6) => (
    <div key={k} className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2"><span className="text-[13px] font-semibold">{LABELS[k]}</span>{edit && <button className="text-[12px] font-semibold text-rosa-texto" onClick={() => setRegen(k)}>Reescribir con IA</button>}</div>
      {edit ? <textarea className="textarea" style={{ minHeight: rows * 22 }} value={s[k] || ''} onChange={(e) => set(k, e.target.value)} aria-label={LABELS[k]} />
        : <p className="whitespace-pre-line text-[13px] leading-relaxed text-tinta-2">{String(s[k] || '—').replace(/\*\*/g, '')}</p>}
    </div>
  )
  const itemsField = (k) => (
    <div key={k} className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2"><span className="text-[13px] font-semibold">{LABELS[k]}</span>{edit && <button className="text-[12px] font-semibold text-rosa-texto" onClick={() => setRegen(k)}>Reescribir con IA</button>}</div>
      {(s[k] || []).map((x, i) => edit ? (
        <div key={i} className="flex flex-col gap-1 rounded-xl border border-linea p-2">
          <input className="input h-9 text-[13px] font-semibold" value={x.titulo || ''} onChange={(e) => set(k, s[k].map((y, j) => (j === i ? { ...y, titulo: e.target.value } : y)))} aria-label="Título" />
          <textarea className="textarea h-24 text-[13px]" value={x.texto || ''} onChange={(e) => set(k, s[k].map((y, j) => (j === i ? { ...y, texto: e.target.value } : y)))} aria-label="Texto" />
          <button className="self-end text-[11px] text-tinta-3" onClick={() => set(k, s[k].filter((_, j) => j !== i))}>Quitar</button>
        </div>
      ) : <p key={i} className="text-[13px] leading-relaxed text-tinta-2"><b>{x.titulo}:</b> {String(x.texto).replace(/\*\*/g, '')}</p>)}
      {edit && (s[k] || []).length < 6 && <button className="self-start text-[12px] font-semibold text-tinta-3" onClick={() => set(k, [...(s[k] || []), { titulo: '', texto: '' }])}>+ Agregar</button>}
    </div>
  )
  return (
    <div className="flex flex-col gap-3 border-t border-[#F4EEF2] pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-tinta-3">{draft ? `Borrador v${report.version}${report.edited_at ? ` · editado por ${report.edited_by_name}` : ''}` : `✓ Cerrado el ${fdate(report.finalized_at)} por ${report.finalized_by_name}`}</span>
        <span className="flex gap-2">
          <button className="btn-sm h-9 border border-linea bg-white px-3" disabled={!!busy} onClick={() => exp('docx')}>{busy === 'docx' ? 'Preparando…' : 'Word'}</button>
          <button className="btn-sm h-9 border border-linea bg-white px-3" disabled={!!busy} onClick={() => exp('pdf')}>{busy === 'pdf' ? 'Preparando…' : 'PDF'}</button>
        </span>
      </div>
      {edit && (s.faltantes || []).length > 0 && (
        <div className="rounded-xl border border-[#F3D9A4] bg-[#FFFAEE] px-3 py-2 text-[12px] leading-snug text-[#5C3E00]">
          <b>Para revisar antes de cerrar:</b>
          <ul className="list-disc pl-4">{s.faltantes.map((x, i) => <li key={i}>{x}</li>)}</ul>
          <span className="block pt-1 opacity-80">Esta nota no aparece en el informe descargado.</span>
        </div>
      )}
      {edit && <p className="rounded-xl bg-[#F7F0FB] px-3 py-2 text-[12px] leading-snug text-[#4A2163]">Borrador de la IA: revisa cada sección con los documentos. No incluye edad, nacionalidad, vida familiar ni salud; si alguno es necesario para el cargo, agrégalo tú.</p>}
      {textField('antecedentes', 10)}
      {itemsField('fortalezas')}
      {itemsField('oportunidades')}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2"><span className="text-[13px] font-semibold">{LABELS.referencias}</span>{edit && <button className="text-[12px] font-semibold text-rosa-texto" onClick={() => setRegen('referencias')}>Reescribir con IA</button>}</div>
        {(s.referencias || []).length === 0 && <p className="text-[13px] text-tinta-3">No se entregaron referencias.</p>}
        {(s.referencias || []).map((r, i) => edit ? (
          <div key={i} className="flex flex-col gap-1 rounded-xl border border-linea p-2">
            <div className="grid grid-cols-2 gap-1">
              <input className="input h-9 text-[13px]" value={r.nombre || ''} placeholder="Nombre" onChange={(e) => set('referencias', s.referencias.map((y, j) => (j === i ? { ...y, nombre: e.target.value } : y)))} />
              <input className="input h-9 text-[13px]" value={r.cargo || ''} placeholder="Cargo" onChange={(e) => set('referencias', s.referencias.map((y, j) => (j === i ? { ...y, cargo: e.target.value } : y)))} />
            </div>
            <input className="input h-9 text-[13px]" value={r.relacion || ''} placeholder="Relación (ej.: jefatura directa en …)" onChange={(e) => set('referencias', s.referencias.map((y, j) => (j === i ? { ...y, relacion: e.target.value } : y)))} />
            <textarea className="textarea h-24 text-[13px]" value={r.texto || ''} onChange={(e) => set('referencias', s.referencias.map((y, j) => (j === i ? { ...y, texto: e.target.value } : y)))} aria-label="Referencia" />
            <button className="self-end text-[11px] text-tinta-3" onClick={() => set('referencias', s.referencias.filter((_, j) => j !== i))}>Quitar</button>
          </div>
        ) : <p key={i} className="text-[13px] leading-relaxed text-tinta-2"><b>Referencia {i + 1} – {[r.nombre, r.cargo].filter(Boolean).join(', ')}{r.relacion ? ` (${r.relacion})` : ''}:</b> {r.texto}</p>)}
        {edit && <button className="self-start text-[12px] font-semibold text-tinta-3" onClick={() => set('referencias', [...(s.referencias || []), { nombre: '', cargo: '', relacion: '', texto: '' }])}>+ Agregar referencia</button>}
      </div>
      {textField('motivacion', 4)}
      {textField('recomendacion', 8)}
      {textField('sintesis', 2)}
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-semibold">Recomendación final</span>
        {edit ? <select className="input h-10" value={s.veredicto || ''} onChange={(e) => set('veredicto', e.target.value)}><option value="">Elige…</option>{Object.entries(VEREDICTOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          : <b className="text-[13px]">{VEREDICTOS[s.veredicto] || '—'}</b>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{textField('renta', 2)}{textField('disponibilidad', 2)}</div>
      {((s.tests || []).length > 0 || annexFiles.length > 0) && <div className="flex flex-col gap-1"><span className="text-[13px] font-semibold">Anexo de tests</span>{(s.tests || []).map((t, i) => <p key={i} className="text-[13px] text-tinta-2"><b>{t.nombre}:</b> {t.resumen}</p>)}
        {annexFiles.length > 0 && <span className="text-xs text-tinta-3">El PDF incluye al final {annexFiles.length === 1 ? 'el reporte de test subido' : `los ${annexFiles.length} reportes de test subidos`}. En Word se adjuntan por separado.</span>}</div>}
      <ErrorBox>{err}</ErrorBox>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {edit && <button className="btn-sm h-10 border border-linea bg-white px-4" disabled={!dirty || !!busy} onClick={save}>{busy === 'save' ? 'Guardando…' : 'Guardar cambios'}</button>}
          {edit ? <button className="btn-sm h-10 bg-[#1E6B3F] px-4 text-white" disabled={!!busy} onClick={() => finalize(true)}>Cerrar informe</button>
            : <button className="btn-sm h-10 border border-linea bg-white px-4" disabled={!!busy} onClick={() => finalize(false)}>Reabrir para editar</button>}
        </div>
      )}
      {regen && (
        <Sheet open onClose={() => setRegen(null)} title={`Reescribir: ${LABELS[regen]}`}>
          <div className="flex flex-col gap-2.5">
            <p className="text-sm text-tinta-2">La IA reescribe solo esta sección con los mismos documentos. No usa un informe del límite mensual.</p>
            <textarea className="textarea h-24" maxLength={500} value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Indicación (ej.: más breve; agrega lo que dijo sobre su jefatura anterior)" />
            <ErrorBox>{err}</ErrorBox>
            <button className="btn flex items-center justify-center gap-2" disabled={busy === 'regen'} onClick={doRegen}><Sparkle />{busy === 'regen' ? 'Reescribiendo…' : 'Reescribir'}</button>
          </div>
        </Sheet>
      )}
    </div>
  )
}

/* ───────────── Comparativo de las personas evaluadas ───────────── */
function Comparison({ a, onChange, onToast }) {
  const cmp = a.comparison
  const [c, setC] = useState(cmp?.content || null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => { setC(cmp?.content || null); setDirty(false) }, [cmp?.id, cmp?.version, cmp?.status]) // eslint-disable-line react-hooks/exhaustive-deps
  const withReport = a.candidates.filter((x) => x.report).length
  if (!cmp && !(a.can_manage && withReport >= 2)) return null
  const draft = cmp?.status === 'borrador'
  const edit = a.can_manage && draft
  const set = (k, v) => { setC({ ...c, [k]: v }); setDirty(true) }
  const setRow = (i, k, v) => set('candidatos', c.candidatos.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const generate = async () => {
    if (!window.confirm(`La IA comparará los informes de ${withReport} personas. Se usa un informe del límite mensual.${cmp ? ' El comparativo actual queda como versión anterior.' : ''} ¿Continuar?`)) return
    setBusy('gen'); setErr('')
    try { await aiReport({ evaluation: a.id, mode: 'comparativo' }); onToast('Comparativo listo. Revísalo antes de cerrarlo.'); onChange() } catch (e) { setErr(e.message) }
    setBusy('')
  }
  const save = async () => {
    setBusy('save'); setErr('')
    try { await rpc('eval_compare_save', { p_cmp: cmp.id, p_content: c }); setDirty(false); onToast('Cambios guardados.') } catch (e) { setErr(e.message) }
    setBusy('')
  }
  const finalize = async (final) => {
    setBusy('final'); setErr('')
    try { if (dirty) await rpc('eval_compare_save', { p_cmp: cmp.id, p_content: c }); await rpc('eval_compare_finalize', { p_cmp: cmp.id, p_final: final }); onChange() } catch (e) { setErr(e.message) }
    setBusy('')
  }
  const exp = async (kind) => {
    setBusy(kind); setErr('')
    try {
      const meta = { ...reportMeta({ person: '', title: a.title, client: a.client_name || a.company, company: a.company, date: cmp.finalized_at || cmp.created_at, signer: cmp.finalized_by_name }), logo: await loadLogo(a.company_logo) }
      await download(await (kind === 'docx' ? buildComparisonDocx : buildComparisonPdf)(c, meta))
    } catch { setErr('No pudimos generar el archivo. Inténtalo de nuevo.') }
    setBusy('')
  }
  return (
    <section className="card flex flex-col gap-2.5 p-4" aria-label="Comparativo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-col"><b className="text-[15px]">Comparativo</b>
          <span className="text-xs text-tinta-3">{!cmp ? `Compara los informes de las ${withReport} personas frente al perfil del cargo.` : draft ? `Borrador v${cmp.version}${cmp.edited_at ? ` · editado por ${cmp.edited_by_name}` : ''}` : `✓ Cerrado el ${fdate(cmp.finalized_at)} por ${cmp.finalized_by_name}`}</span></span>
        {cmp && <span className="flex gap-2">
          <button className="btn-sm h-9 border border-linea bg-white px-3" disabled={!!busy} onClick={() => exp('docx')}>{busy === 'docx' ? 'Preparando…' : 'Word'}</button>
          <button className="btn-sm h-9 border border-linea bg-white px-3" disabled={!!busy} onClick={() => exp('pdf')}>{busy === 'pdf' ? 'Preparando…' : 'PDF'}</button>
        </span>}
      </div>
      {a.can_manage && (!cmp || draft) && (
        <button className={cmp ? 'btn-sm h-10 self-start border border-rosa-accion bg-white px-4 text-rosa-texto' : 'btn flex items-center justify-center gap-2'} disabled={!!busy || withReport < 2} onClick={generate}>
          {!cmp && <Sparkle />}{busy === 'gen' ? 'Comparando… (1 minuto)' : cmp ? 'Generar comparativo de nuevo' : 'Generar comparativo con IA'}
        </button>
      )}
      {edit && (c?.faltantes || []).length > 0 && (
        <div className="rounded-xl border border-[#F3D9A4] bg-[#FFFAEE] px-3 py-2 text-[12px] leading-snug text-[#5C3E00]">
          <b>Para revisar antes de cerrar:</b><ul className="list-disc pl-4">{c.faltantes.map((x, i) => <li key={i}>{x}</li>)}</ul>
          <span className="block pt-1 opacity-80">Esta nota no aparece en el archivo descargado.</span>
        </div>
      )}
      {c && <>
        <div className="flex flex-col gap-1"><span className="text-[13px] font-semibold">Resumen</span>
          {edit ? <textarea className="textarea h-28" value={c.resumen || ''} onChange={(e) => set('resumen', e.target.value)} aria-label="Resumen" /> : <p className="whitespace-pre-line text-[13px] leading-relaxed text-tinta-2">{c.resumen}</p>}</div>
        <div className="flex flex-col gap-2"><span className="text-[13px] font-semibold">Orden sugerido</span>
          {(c.candidatos || []).map((r, i) => (
            <div key={i} className="flex flex-col gap-1 rounded-xl border border-linea p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-[13px]">{i + 1}. {r.nombre}</b>
                {edit ? <select className="input h-9 w-auto text-[13px]" value={r.ajuste} onChange={(e) => setRow(i, 'ajuste', e.target.value)} aria-label={`Ajuste de ${r.nombre}`}>{Object.entries(AJUSTES).map(([k, l]) => <option key={k} value={k}>Ajuste {l.toLowerCase()}</option>)}</select>
                  : <span className="rounded-full bg-[#F7F0FB] px-2 py-0.5 text-[12px] font-semibold text-[#4A2163]">Ajuste {String(AJUSTES[r.ajuste] || '—').toLowerCase()}</span>}</div>
              <span className="text-xs text-tinta-3">{VEREDICTOS[r.veredicto] || 'Sin recomendación en el informe'}</span>
              {edit ? <>
                <textarea className="textarea h-16 text-[13px]" value={r.fortalezas || ''} onChange={(e) => setRow(i, 'fortalezas', e.target.value)} aria-label={`Fortalezas de ${r.nombre}`} />
                <textarea className="textarea h-16 text-[13px]" value={r.riesgos || ''} onChange={(e) => setRow(i, 'riesgos', e.target.value)} aria-label={`Aspectos a considerar de ${r.nombre}`} />
                <span className="flex gap-3 text-[11px] text-tinta-3">
                  {i > 0 && <button onClick={() => { const x = [...c.candidatos]; [x[i - 1], x[i]] = [x[i], x[i - 1]]; set('candidatos', x) }}>↑ Subir</button>}
                  {i < c.candidatos.length - 1 && <button onClick={() => { const x = [...c.candidatos]; [x[i + 1], x[i]] = [x[i], x[i + 1]]; set('candidatos', x) }}>↓ Bajar</button>}
                </span>
              </> : <>
                <p className="text-[13px] leading-relaxed text-tinta-2"><b>Fortalezas:</b> {r.fortalezas}</p>
                <p className="text-[13px] leading-relaxed text-tinta-2"><b>Aspectos a considerar:</b> {r.riesgos}</p>
              </>}
            </div>
          ))}</div>
        <div className="flex flex-col gap-1"><span className="text-[13px] font-semibold">Conclusión</span>
          {edit ? <textarea className="textarea h-32" value={c.conclusion || ''} onChange={(e) => set('conclusion', e.target.value)} aria-label="Conclusión" /> : <p className="whitespace-pre-line text-[13px] leading-relaxed text-tinta-2">{c.conclusion}</p>}</div>
      </>}
      <ErrorBox>{err}</ErrorBox>
      {a.can_manage && cmp && (
        <div className="flex flex-wrap gap-2">
          {edit && <button className="btn-sm h-10 border border-linea bg-white px-4" disabled={!dirty || !!busy} onClick={save}>{busy === 'save' ? 'Guardando…' : 'Guardar cambios'}</button>}
          {edit ? <button className="btn-sm h-10 bg-[#1E6B3F] px-4 text-white" disabled={!!busy} onClick={() => finalize(true)}>Cerrar comparativo</button>
            : <button className="btn-sm h-10 border border-linea bg-white px-4" disabled={!!busy} onClick={() => finalize(false)}>Reabrir para editar</button>}
        </div>
      )}
    </section>
  )
}

/* ───────────── Pestaña «Informe» en la ficha del postulante de una vacante ───────────── */
export function ApplicantReport({ jobId, candidateId, canManage }) {
  const [ids, setIds] = useState(undefined)
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')
  const load = useCallback(async () => {
    try {
      const { data } = await supabase.rpc('eval_list', { p_company: null })
      const ev = (data || []).find((e) => e.job_id === jobId)
      if (!ev) { setIds(null); return }
      const det = await rpc('eval_detail', { p_eval: ev.id })
      const c = det.candidates.find((x) => x.candidate_id === candidateId)
      setD(det); setIds(c ? { a: ev.id, c: c.id } : null)
    } catch (e) { setErr(e.message); setIds(null) }
  }, [jobId, candidateId])
  useEffect(() => { load() }, [load])
  const start = async () => {
    setErr('')
    try { await rpc('eval_for_applicant', { p_job: jobId, p_candidate: candidateId }); load() } catch (e) { setErr(e.message) }
  }
  if (ids === undefined) return <Spinner />
  const c = ids && d?.candidates.find((x) => x.id === ids.c)
  return (
    <div className="flex flex-col gap-3">
      <ErrorBox>{err}</ErrorBox>
      {!c ? (canManage ? (
        <div className="card flex flex-col gap-2 p-4">
          <b className="text-[15px]">Informe psicolaboral con IA</b>
          <p className="text-[13px] leading-snug text-tinta-2">Sube el CV, la transcripción de la entrevista, las referencias y los tests; la IA redacta el borrador del informe con el perfil de esta vacante y tú lo revisas. El postulante no lo ve.</p>
          <button className="btn self-start" onClick={start}>Preparar informe</button>
        </div>
      ) : <p className="rounded-2xl border border-dashed border-linea bg-white px-4 py-3 text-[13px] text-tinta-3">Aún no hay un informe cerrado de esta persona.</p>)
        : <CandidateCard a={d} c={c} onChange={load} onToast={setToast} />}
      {d && <Link to={`/evaluaciones/${d.id}`} className="text-[13px] font-semibold text-rosa-texto">Ver todas las evaluaciones de esta vacante</Link>}
      <Toast msg={toast} onDone={() => setToast('')} />
    </div>
  )
}

/* ───────────── Administración: consumo de informes y límites por plan (sin contenido) ───────────── */
export function AdminReportUsage() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState({})
  const load = useCallback(() => rpc('admin_report_usage', { p_months: 3 }).then(setD).catch((e) => setErr(e.message)), [])
  useEffect(() => { load() }, [load])
  if (!d) return err ? <ErrorBox>{err}</ErrorBox> : null
  const save = async (id) => {
    setErr('')
    try { await rpc('admin_set_report_limit', { p_plan: id, p_reports: Number(edit[id]) }); setEdit({ ...edit, [id]: undefined }); load() } catch (e) { setErr(e.message) }
  }
  const usd = (n) => `US$${Number(n || 0).toFixed(2)}`
  return (
    <section className="card flex flex-col gap-2 p-4">
      <h2 className="text-[15px] font-semibold">Informes con IA · este mes: {d.totals?.reports || 0} informes, {usd(d.totals?.cost_usd)}</h2>
      <div className="flex flex-col gap-1">
        <span className="label">Informes al mes por plan</span>
        {(d.plans || []).map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 border-b border-[#F4EEF2] py-1.5 text-[13px] last:border-0">
            <span>{p.name}</span>
            <span className="flex items-center gap-1.5">
              <input className="input h-8 w-20 text-right text-[13px]" inputMode="numeric" aria-label={`Informes al mes, plan ${p.name}`} value={edit[p.id] ?? p.report_monthly} onChange={(e) => setEdit({ ...edit, [p.id]: e.target.value.replace(/\D/g, '') })} />
              {edit[p.id] !== undefined && String(edit[p.id]) !== String(p.report_monthly) && <button className="btn-sm h-8 bg-rosa-accion px-2.5 text-white" onClick={() => save(p.id)}>Guardar</button>}
            </span>
          </div>
        ))}
      </div>
      {(d.usage || []).length > 0 && (
        <div className="flex flex-col gap-1 pt-1">
          <span className="label">Consumo por empresa (últimos 3 meses)</span>
          {d.usage.slice(0, 30).map((u, i) => <span key={i} className="text-[13px] text-tinta-2">{u.month.slice(0, 7)} · {u.company} ({u.plan}) · {u.reports} informes, {u.sections} secciones · {usd(u.cost_usd)}</span>)}
        </div>
      )}
      <ErrorBox>{err}</ErrorBox>
    </section>
  )
}
