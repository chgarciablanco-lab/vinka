import { useCallback, useEffect, useState } from 'react'
import { supabase, errMsg } from '../../lib/supabase'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { Empty, ErrorBox, Screen, Sheet, Spinner, Svg, Toast, TopBar } from '../../components/ui'
import { Dossier, TeamNotes } from '../../components/Dossier'
import { fmtDateTime } from '../../lib/files'

const PLAN_STATUS = [['trial', 'Prueba'], ['active', 'Activo'], ['past_due', 'Pago pendiente'], ['canceled', 'Cancelado']]
const n = (x) => Number(x || 0).toLocaleString('es-CL')

/** Resumen del negocio y gestión de planes (los cambios quedan registrados en la auditoría). */
function Business() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState(null)
  const [q, setQ] = useState('')
  const [demo, setDemo] = useState(false)
  const load = useCallback(() => { supabase.rpc('admin_overview').then(({ data, error }) => { if (error) setErr(errMsg(error)); setD(data) }) }, [])
  useEffect(() => { load() }, [load])
  const save = async () => {
    setErr('')
    const { error } = await supabase.rpc('admin_set_plan', { p_company: edit.id, p_plan: edit.plan, p_status: edit.status, p_period_end: edit.period_end ? new Date(edit.period_end + 'T23:59:00').toISOString() : null, p_note: edit.note || '' })
    if (error) return setErr(errMsg(error))
    setEdit(null); load()
  }
  if (!d) return err ? <ErrorBox>{err}</ErrorBox> : <Spinner />
  const m = d.metrics
  const names = Object.fromEntries((d.companies || []).map((c) => [c.id, c.name]))
  const list = (d.companies || []).filter((c) => (demo || !c.demo) && (!q.trim() || `${c.name} ${c.legal_name} ${c.rut}`.toLowerCase().includes(q.trim().toLowerCase())))
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[['Ingreso mensual', `$${n(m.mrr)}`], ['Empresas pagando', n(m.paying)], ['Empresas verificadas', n(m.companies)], ['Por verificar', n(m.pending)], ['Candidatos activos', n(m.candidates)], ['Vacantes abiertas', n(m.jobs_open)], ['Contrataciones 30 días', n(m.hires_30d)], ['Usos de IA 30 días', n(m.ai_30d)]].map(([l, v]) => (
          <div key={l} className="card flex flex-col gap-0.5 p-3"><span className="text-xs text-tinta-3">{l}</span><span className="font-display text-[20px] font-bold">{v}</span></div>
        ))}
      </div>
      <p className="hint -mt-2">El ingreso y las empresas pagando excluyen las empresas de demostración.</p>
      <ErrorBox>{err}</ErrorBox>
      {d.requests?.length > 0 && (
        <div className="card flex flex-col gap-2 p-4">
          <span className="text-[15px] font-semibold">Solicitudes de plan (60 días)</span>
          {d.requests.map((r, i) => (
            <div key={i} className="flex flex-col border-b border-[#F1E7ED] pb-2 text-sm last:border-0">
              <span><b>{names[r.company_id] || 'Empresa'}</b> pidió el plan <b>{r.plan}</b> · <span className="text-tinta-suave">{new Date(r.at).toLocaleDateString('es-CL')}</span></span>
              {r.message && <span className="text-tinta-3">{r.message}</span>}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input h-11 flex-1" placeholder="Buscar empresa o RUT" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} className="h-4 w-4 accent-[#D02E72]" />Ver demostración</label>
        </div>
        {list.slice(0, 200).map((c) => (
          <div key={c.id} className="card flex flex-col gap-2 p-3.5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="truncate">{c.name}{c.demo && <span className="ml-2 rounded bg-[#F4EEF2] px-1.5 py-0.5 text-[11px] font-semibold text-tinta-3">Demo</span>}</b>
              <span className="text-xs text-tinta-3">{c.plan || '—'} · {PLAN_STATUS.find(([k]) => k === c.status)?.[1] || '—'}</span>
            </div>
            <span className="text-tinta-3">{c.jobs} vacantes publicadas · {c.members} en el equipo{c.trial_ends_at ? ` · prueba hasta ${new Date(c.trial_ends_at).toLocaleDateString('es-CL')}` : ''}{c.period_end ? ` · pagado hasta ${new Date(c.period_end).toLocaleDateString('es-CL')}` : ''}</span>
            {edit?.id === c.id ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <select className="input h-11" value={edit.plan} onChange={(e) => setEdit({ ...edit, plan: e.target.value })}>{['gratis', 'pyme', 'equipo', 'empresa'].map((x) => <option key={x}>{x}</option>)}</select>
                <select className="input h-11" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{PLAN_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <label className="flex flex-col gap-1"><span className="text-xs text-tinta-3">Pagado hasta</span><input type="date" className="input h-11" value={edit.period_end || ''} onChange={(e) => setEdit({ ...edit, period_end: e.target.value })} /></label>
                <label className="flex flex-col gap-1"><span className="text-xs text-tinta-3">Nota (factura, medio de pago)</span><input className="input h-11" value={edit.note || ''} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></label>
                <button className="btn-sec h-11" onClick={() => setEdit(null)}>Cancelar</button><button className="btn h-11" onClick={save}>Guardar plan</button>
              </div>
            ) : <button className="btn-sm self-start border border-linea bg-white" onClick={() => setEdit({ id: c.id, plan: c.plan || 'gratis', status: c.status || 'active', period_end: c.period_end ? c.period_end.slice(0, 10) : '', note: c.note || '' })}>Cambiar plan</button>}
          </div>
        ))}
      </div>
      {d.errors?.length > 0 && (
        <div className="card flex flex-col gap-1.5 p-4">
          <span className="text-[15px] font-semibold">Errores recientes en la app ({n(m.errors_7d)} en 7 días)</span>
          {d.errors.slice(0, 15).map((e, i) => <span key={i} className="truncate text-xs text-tinta-3" title={e.message}>{new Date(e.at).toLocaleString('es-CL')} · {e.path} · {e.message}</span>)}
        </div>
      )}
    </div>
  )
}

const SRV_STATUS = [['solicitada', 'Solicitada'], ['pago_pendiente', 'Pago pendiente'], ['en_curso', 'En curso'], ['entregada', 'Entregada (por revisar)'], ['cancelada', 'Cancelada']]
const SRV_LABEL = { ...Object.fromEntries(SRV_STATUS), aprobada: 'Aprobada ✓' }

/** Revisión final: VINKA da el visto bueno o devuelve al asesor/a con observaciones */
function Review({ r, onDone }) {
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const go = async (ok) => {
    setErr('')
    const { error } = await supabase.rpc('admin_review_request', { p_id: r.id, p_approve: ok, p_note: note })
    if (error) return setErr(errMsg(error))
    setNote(''); onDone()
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border-2 border-[#2F7A4F] bg-[#F3FAF6] p-3">
      <span className="text-[15px] font-semibold text-[#134A2B]">Revisión de VINKA</span>
      <span className="text-xs text-[#134A2B]">Revisa en el expediente el CV mejorado, las sesiones, las búsquedas, las ofertas y el historial ({r.logs} registros, {Math.floor((r.minutes || 0) / 60)} h {(r.minutes || 0) % 60} min). Luego aprueba o devuelve con observaciones.</span>
      <textarea className="textarea h-20 bg-white" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observaciones (obligatorio si la devuelves; al aprobar es opcional)" />
      <ErrorBox>{err}</ErrorBox>
      <div className="grid grid-cols-2 gap-2"><button className="btn-sec h-11" onClick={() => go(false)}>Devolver al asesor/a</button><button className="btn h-11 bg-[#2F7A4F]" onClick={() => go(true)}>Aprobar asesoría ✓</button></div>
    </div>
  )
}

/** Próximas sesiones de todos los asesores */
function UpcomingSessions() {
  const [list, setList] = useState(null)
  useEffect(() => {
    const from = new Date(); from.setHours(0, 0, 0, 0)
    supabase.rpc('admin_sessions', { p_from: from.toISOString(), p_to: new Date(Date.now() + 30 * 864e5).toISOString() }).then(({ data }) => setList(data || []))
  }, [])
  if (!list) return null
  return (
    <div className="card flex flex-col gap-2 p-4">
      <span className="text-[15px] font-semibold">Calendario: próximos 30 días ({list.length})</span>
      {list.length === 0 ? <span className="text-sm text-tinta-3">No hay sesiones agendadas.</span> : list.map((s) => (
        <div key={s.id} className="flex items-center gap-3 border-b border-[#F1E7ED] pb-2 text-sm last:border-0 last:pb-0">
          <span className="w-36 shrink-0 text-xs font-semibold text-[#1F6F78]">{fmtDateTime(s.starts_at)}</span>
          <span className="flex min-w-0 flex-1 flex-col"><span className="truncate">{s.candidate} · {s.service}</span><span className="text-xs text-tinta-3">{s.advisor || 'Sin asesor/a'} · {s.minutes} min · {s.mode}{s.status !== 'agendada' ? ` · ${s.status.replace('_', ' ')}` : ''}</span></span>
        </div>
      ))}
    </div>
  )
}
const CONTACT_TXT = { whatsapp: 'WhatsApp', correo: 'Correo', videollamada: 'Videollamada' }

/** Asesorías con reclutador: solicitudes de postulantes y precios del catálogo */
function Advisory() {
  const [reqs, setReqs] = useState(null)
  const [services, setServices] = useState([])
  const [open, setOpen] = useState(null)
  const [edit, setEdit] = useState({})
  const [svc, setSvc] = useState(null)
  const [only, setOnly] = useState(true)
  const [advisors, setAdvisors] = useState([])
  const [chat, setChat] = useState(null)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([supabase.rpc('admin_service_requests'), supabase.from('career_services').select('*').order('sort'), supabase.rpc('admin_advisors')])
    if (a.error) setErr(errMsg(a.error))
    setReqs(a.data || []); setServices(b.data || []); setAdvisors((c.data || []).filter((x) => x.active))
  }, [])
  useEffect(() => { load() }, [load])
  const save = async (r) => {
    setErr('')
    const e = edit[r.id] || {}
    const { error } = await supabase.rpc('admin_update_service_request', { p_id: r.id, p_status: e.status ?? r.status, p_note: e.note ?? r.note })
    if (error) return setErr(errMsg(error))
    setEdit({ ...edit, [r.id]: undefined }); load()
  }
  const assign = async (r, advisorId) => {
    setErr('')
    const { error } = await supabase.rpc('admin_assign_request', { p_id: r.id, p_advisor: advisorId || null })
    if (error) return setErr(errMsg(error))
    load()
  }
  const saveSvc = async () => {
    setErr('')
    const { error } = await supabase.rpc('admin_upsert_service', { p_id: svc.id, p_name: svc.name, p_summary: svc.summary, p_includes: svc.includesText.split('\n').map((x) => x.trim()).filter(Boolean), p_price: Number(String(svc.price_clp).replace(/\D/g, '')), p_delivery: svc.delivery, p_active: svc.active, p_sort: svc.sort })
    if (error) return setErr(errMsg(error))
    setSvc(null); load()
  }
  if (!reqs) return err ? <ErrorBox>{err}</ErrorBox> : <Spinner />
  const OPEN = ['solicitada', 'pago_pendiente', 'en_curso', 'entregada']
  const openN = reqs.filter((r) => OPEN.includes(r.status)).length
  const toReview = reqs.filter((r) => r.status === 'entregada').length
  const income = reqs.filter((r) => ['en_curso', 'entregada', 'aprobada'].includes(r.status)).reduce((a, r) => a + r.price, 0)
  const list = only ? reqs.filter((r) => OPEN.includes(r.status)) : reqs
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[['Por revisar', n(toReview)], ['Abiertas', n(openN)], ['Total', n(reqs.length)], ['Vendido (pagadas)', `$${n(income)}`]].map(([l, v]) => (
          <div key={l} className="card flex flex-col gap-0.5 p-3"><span className="text-xs text-tinta-3">{l}</span><span className="font-display text-[20px] font-bold">{v}</span></div>
        ))}
      </div>
      <ErrorBox>{err}</ErrorBox>
      <UpcomingSessions />
      <div className="flex items-center justify-between"><span className="text-[15px] font-semibold">Solicitudes</span>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} className="h-4 w-4 accent-[#D02E72]" />Solo abiertas</label></div>
      {list.length === 0 && <Empty title="Sin solicitudes">Cuando un postulante pida una asesoría, aparecerá aquí y te llegará un aviso.</Empty>}
      {list.map((r) => {
        const e = edit[r.id] || {}
        return (
          <div key={r.id} className="card flex flex-col gap-2 p-3.5 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="flex flex-col"><b>{r.name || 'Sin nombre'}</b><span className="text-xs text-tinta-3">{r.service} · ${n(r.price)} · {new Date(r.created_at).toLocaleDateString('es-CL')}</span></span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.status === 'entregada' ? 'bg-naranja-palido text-naranja-texto' : r.status === 'aprobada' ? 'bg-[#EAF6EF] text-[#134A2B]' : 'bg-[#F4EEF2]'}`}>{SRV_LABEL[r.status]}</span>
            </div>
            <span>Prefiere: <b>{CONTACT_TXT[r.contact_pref]}</b> · {r.phone ? <a className="text-rosa-texto underline" href={`https://wa.me/${String(r.phone).replace(/\D/g, '')}`} target="_blank" rel="noreferrer">{r.phone}</a> : 'sin teléfono'} · <a className="text-rosa-texto underline" href={`mailto:${r.email}`}>{r.email}</a></span>
            {r.goal && <span className="text-tinta-2">Objetivo: «{r.goal}»</span>}
            <label className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-tinta-3">Asesor/a asignado/a</span>
              <select className="h-9 rounded-lg border border-linea bg-white px-2 text-sm" value={r.advisor_id || ''} onChange={(ev) => assign(r, ev.target.value)}>
                <option value="">Sin asignar</option>
                {advisors.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.open} abiertas)</option>)}
                {r.advisor_id && !advisors.some((a) => a.id === r.advisor_id) && <option value={r.advisor_id}>{r.advisor} (inactivo)</option>}
              </select></label>
            <div className="flex flex-wrap gap-3">
              <button className="text-xs font-semibold text-rosa-texto" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Ocultar perfil' : 'Ver perfil laboral'}</button>
              <button className="text-xs font-semibold text-rosa-texto" onClick={() => setChat(chat === r.id ? null : r.id)}>{chat === r.id ? 'Cerrar expediente' : 'Abrir expediente'}</button>
            </div>
            <span className="text-[11px] text-tinta-suave">{r.messages} mensajes · {r.cvs} CV · {r.sessions} sesiones · {r.picks} ofertas · {r.logs} registros · {r.notes} notas internas</span>
            {r.status === 'entregada' && <Review r={r} onDone={load} />}
            {chat === r.id && <Dossier r={r} as="admin" counts={r} />}
            {open === r.id && (
              <div className="flex flex-col gap-1 rounded-xl bg-[#FAF7F9] p-3 text-xs text-tinta-2">
                <span><b>{r.headline || 'Sin cargo'}</b> · {[r.comuna, r.region].filter(Boolean).join(', ')}</span>
                {(r.experiences || []).map((x, i) => <span key={i}>• {x.role} en {x.company} ({x.from || '?'} a {x.current ? 'hoy' : x.to || '?'})</span>)}
                {(r.education || []).map((x, i) => <span key={'e' + i}>🎓 {x.title} {x.institution ? `— ${x.institution}` : ''} {x.status ? `(${x.status})` : ''}</span>)}
                {r.skills?.length > 0 && <span>Habilidades: {r.skills.join(', ')}</span>}
                {r.bio && <span className="italic">{r.bio}</span>}
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
              <select className="input h-11" value={e.status ?? r.status} disabled={r.status === 'aprobada'} onChange={(ev) => setEdit({ ...edit, [r.id]: { ...e, status: ev.target.value } })}>{r.status === 'aprobada' && <option value="aprobada">Aprobada ✓</option>}{SRV_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <input className="input h-11" maxLength={1000} placeholder="Mensaje para la persona (lo verá en su app)" value={e.note ?? r.note} onChange={(ev) => setEdit({ ...edit, [r.id]: { ...e, note: ev.target.value } })} />
              <button className="btn h-11 px-4" onClick={() => save(r)}>Guardar y avisar</button>
            </div>
          </div>
        )
      })}
      <div className="card flex flex-col gap-2 p-4">
        <span className="text-[15px] font-semibold">Servicios y precios</span>
        {services.map((s) => svc?.id === s.id ? (
          <div key={s.id} className="flex flex-col gap-2 rounded-xl border border-linea p-3">
            <input className="input h-11" value={svc.name} onChange={(e) => setSvc({ ...svc, name: e.target.value })} aria-label="Nombre" />
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1"><span className="text-xs text-tinta-3">Precio (CLP, IVA incluido)</span><input className="input h-11" inputMode="numeric" value={svc.price_clp} onChange={(e) => setSvc({ ...svc, price_clp: e.target.value })} /></label>
              <label className="flex flex-col gap-1"><span className="text-xs text-tinta-3">Plazo de entrega</span><input className="input h-11" value={svc.delivery} onChange={(e) => setSvc({ ...svc, delivery: e.target.value })} /></label>
            </div>
            <textarea className="textarea h-16" value={svc.summary} onChange={(e) => setSvc({ ...svc, summary: e.target.value })} aria-label="Descripción" />
            <label className="flex flex-col gap-1"><span className="text-xs text-tinta-3">Qué incluye (una línea por punto)</span><textarea className="textarea h-24" value={svc.includesText} onChange={(e) => setSvc({ ...svc, includesText: e.target.value })} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={svc.active} onChange={(e) => setSvc({ ...svc, active: e.target.checked })} className="h-4 w-4 accent-[#D02E72]" />Visible para postulantes</label>
            <div className="grid grid-cols-2 gap-2"><button className="btn-sec h-11" onClick={() => setSvc(null)}>Cancelar</button><button className="btn h-11" onClick={saveSvc}>Guardar</button></div>
          </div>
        ) : (
          <div key={s.id} className="flex items-center justify-between gap-2 border-b border-[#F1E7ED] py-2 text-sm last:border-0">
            <span className="flex flex-col"><b>{s.name}{!s.active && <span className="ml-2 text-xs font-normal text-tinta-suave">(oculto)</span>}</b><span className="text-xs text-tinta-3">${n(s.price_clp)} · {s.delivery}</span></span>
            <button className="btn-sm border border-linea bg-white" onClick={() => setSvc({ ...s, includesText: (s.includes || []).join('\n') })}>Editar</button>
          </div>
        ))}
        <p className="hint">Cambiar un precio no afecta a las solicitudes ya hechas: cada una guarda el precio del momento.</p>
      </div>
    </div>
  )
}

const CAND_FILTERS = [['', 'Todos'], ['reales', 'Sin demostración'], ['activos', 'Activos'], ['suspendidos', 'Suspendidos'], ['incompletos', 'Perfil incompleto'], ['asesoria', 'Con asesoría']]
const STAGE_TXT = { postulante: 'Postuló', match: 'Match', contacto: 'Contacto', entrevista: 'Entrevista', oferta: 'Oferta', contratado: 'Contratado/a', descartado: 'Descartado/a' }
const dt = (d) => (d ? new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

/** Usuarios postulantes: buscar, revisar actividad y suspender o reactivar cuentas */
function Candidates() {
  const [q, setQ] = useState('')
  const [qd, setQd] = useState('')
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(0)
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState(null)
  const [det, setDet] = useState(null)
  const [reason, setReason] = useState('')
  const [toast, setToast] = useState('')
  const PER = 40
  useEffect(() => { const t = setTimeout(() => { setQd(q); setPage(0) }, 300); return () => clearTimeout(t) }, [q])
  const load = useCallback(() => {
    supabase.rpc('admin_candidates', { p_q: qd, p_filter: filter, p_limit: PER, p_offset: page * PER }).then(({ data, error }) => { if (error) setErr(errMsg(error)); setD(data) })
  }, [qd, filter, page])
  useEffect(() => { load() }, [load])
  const openUser = async (u) => {
    setSel(u); setDet(null); setReason('')
    const { data, error } = await supabase.rpc('admin_candidate_detail', { p_user: u.id })
    if (error) setErr(errMsg(error)); else setDet(data)
  }
  const suspend = async (on) => {
    setErr('')
    if (on && !reason.trim()) return setErr('Escribe el motivo de la suspensión.')
    const { error } = await supabase.rpc('admin_set_suspended', { p_user: sel.id, p_suspend: on, p_reason: reason.trim() })
    if (error) return setErr(errMsg(error))
    setToast(on ? 'Cuenta suspendida: ya no puede ingresar' : 'Cuenta reactivada'); setSel(null); load()
  }
  const total = d?.total || 0
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1"><span className="sr-only">Buscar</span><Svg name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-suave" />
          <input className="input pl-9" placeholder="Nombre, correo, teléfono, cargo o comuna" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap gap-1.5">{CAND_FILTERS.map(([k, l]) => <button key={k} className={`chip h-9 text-[13px] ${filter === k ? 'chip-on' : ''}`} onClick={() => { setFilter(k); setPage(0) }}>{l}</button>)}</div>
      <ErrorBox>{!sel && err}</ErrorBox>
      {d == null ? <Spinner /> : (
        <>
          <span className="text-xs text-tinta-suave">{n(total)} postulantes{total > PER ? ` · página ${page + 1} de ${Math.ceil(total / PER)}` : ''}</span>
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#EEE3EA] text-xs uppercase tracking-wide text-tinta-suave">
                <tr><th className="px-4 py-3 font-semibold">Persona</th><th className="hidden px-3 py-3 font-semibold md:table-cell">Cargo y comuna</th><th className="hidden px-3 py-3 font-semibold sm:table-cell">Actividad</th><th className="px-3 py-3 font-semibold">Estado</th></tr>
              </thead>
              <tbody>
                {d.rows.map((u) => (
                  <tr key={u.id} className="cursor-pointer border-b border-[#F4EEF2] last:border-0 hover:bg-[#FBF7FA]" onClick={() => openUser(u)}>
                    <td className="px-4 py-2.5"><span className="flex flex-col"><b>{u.name || 'Sin nombre'}{u.demo && <span className="ml-1.5 rounded bg-[#F4EEF2] px-1 text-[10px] font-semibold text-tinta-3">demo</span>}</b><span className="text-xs text-tinta-3">{u.email}</span></span></td>
                    <td className="hidden px-3 py-2.5 text-xs text-tinta-2 md:table-cell">{u.headline || '—'}{u.comuna ? ` · ${u.comuna}` : ''}</td>
                    <td className="hidden px-3 py-2.5 text-xs text-tinta-3 sm:table-cell">{u.matches} matches · {u.interests} intereses{u.requests ? ` · ${u.requests} asesorías` : ''}<br />Registro {dt(u.created_at)}</td>
                    <td className="px-3 py-2.5">{u.suspended_at ? <span className="pill bg-[#FEF3F2] text-[#912018]">Suspendida</span> : !u.onboarding_done ? <span className="pill bg-naranja-palido text-naranja-texto">Incompleto</span> : <span className="pill bg-[#EAF6EF] text-[#134A2B]">Activa</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.rows.length === 0 && <p className="p-6 text-center text-sm text-tinta-3">Nadie coincide con la búsqueda.</p>}
          </div>
          {total > PER && (
            <div className="flex justify-between gap-2">
              <button className="btn-sm border border-linea bg-white" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
              <button className="btn-sm border border-linea bg-white" disabled={(page + 1) * PER >= total} onClick={() => setPage(page + 1)}>Siguiente</button>
            </div>
          )}
        </>
      )}
      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel?.name || 'Postulante'}>
        {sel && (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-col gap-0.5"><span>{sel.email}{sel.phone ? ` · ${sel.phone}` : ''}</span><span className="text-xs text-tinta-3">Registro {dt(sel.created_at)} · última conexión {dt(sel.last_seen_at)} · perfil {sel.is_public ? 'visible' : 'oculto'} para empresas</span></div>
            {sel.suspended_at && <div className="rounded-xl bg-[#FEF3F2] p-3 text-[#912018]">Suspendida el {dt(sel.suspended_at)}{sel.suspended_reason ? `: ${sel.suspended_reason}` : ''}</div>}
            {!det ? <Spinner /> : (
              <>
                {det.profile && <div className="rounded-xl bg-[#FAF7F9] p-3 text-xs text-tinta-2"><b>{det.profile.headline || 'Sin cargo'}</b>{det.profile.comuna ? ` · ${det.profile.comuna}` : ''}{(det.profile.skills || []).length ? <><br />Habilidades: {det.profile.skills.join(', ')}</> : null}</div>}
                <div className="flex flex-col gap-1"><span className="font-semibold">Procesos ({det.matches.length})</span>
                  {det.matches.slice(0, 8).map((m, i) => <span key={i} className="text-xs text-tinta-2">{m.job} · {m.company} · <b>{STAGE_TXT[m.stage] || m.stage}</b> · {dt(m.at)}</span>)}
                  {det.matches.length === 0 && <span className="text-xs text-tinta-3">Sin matches.</span>}</div>
                {det.requests.length > 0 && <div className="flex flex-col gap-1"><span className="font-semibold">Asesorías</span>{det.requests.map((r, i) => <span key={i} className="text-xs">{r.service} · ${n(r.price)} · {r.status} · {dt(r.at)}</span>)}</div>}
                {det.log.length > 0 && <div className="flex flex-col gap-1"><span className="font-semibold">Historial de administración</span>{det.log.map((l, i) => <span key={i} className="text-xs text-tinta-3">{dt(l.at)} · {l.action === 'user_suspended' ? 'Suspendida' : l.action === 'user_reactivated' ? 'Reactivada' : l.action}{l.detail?.reason ? `: ${l.detail.reason}` : ''}</span>)}</div>}
              </>
            )}
            <ErrorBox>{err}</ErrorBox>
            {sel.suspended_at ? <button className="btn" onClick={() => suspend(false)}>Reactivar cuenta</button> : (
              <div className="flex flex-col gap-2 border-t border-[#F1E7ED] pt-3">
                <input className="input h-11" maxLength={300} placeholder="Motivo de la suspensión (queda registrado)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <button className="btn-sec border-[#C0362C] text-[#912018]" onClick={() => suspend(true)}>Suspender cuenta</button>
                <span className="hint">La persona no podrá ingresar y su perfil deja de verse para las empresas. Puedes reactivarla cuando quieras.</span>
              </div>
            )}
          </div>
        )}
      </Sheet>
      <Toast msg={toast} onDone={() => setToast('')} />
    </div>
  )
}

/** Asesores: cuentas entregadas por VINKA, con clave temporal; se pueden suspender y reiniciar */
function Advisors() {
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')
  const [form, setForm] = useState(null)
  const [cred, setCred] = useState(null)
  const [toast, setToast] = useState('')
  const [talk, setTalk] = useState(null)
  const load = useCallback(() => { supabase.rpc('admin_advisors').then(({ data, error }) => { if (error) setErr(errMsg(error)); setList(data || []) }) }, [])
  useEffect(() => { load() }, [load])
  const create = async () => {
    setErr('')
    const { data, error } = await supabase.rpc('admin_create_advisor', { p_email: form.email, p_first: form.first, p_last: form.last, p_phone: form.phone, p_specialty: form.specialty })
    if (error) return setErr(errMsg(error))
    setForm(null); setCred({ name: `${form.first} ${form.last}`, email: data.email, password: data.password }); load()
  }
  const reset = async (a) => {
    setErr('')
    const { data, error } = await supabase.rpc('admin_reset_advisor_password', { p_user: a.id })
    if (error) return setErr(errMsg(error))
    setCred({ name: a.name, email: a.email, password: data }); load()
  }
  const toggle = async (a) => {
    setErr('')
    const { error } = await supabase.rpc('admin_set_suspended', { p_user: a.id, p_suspend: a.active, p_reason: a.active ? 'Suspendido desde administración' : '' })
    if (error) return setErr(errMsg(error))
    setToast(a.active ? `${a.name} suspendido/a` : `${a.name} reactivado/a`); load()
  }
  const copy = async () => { try { await navigator.clipboard.writeText(`VINKA — acceso de asesor/a\nIngresa en ${window.location.origin}/ingresar\nCorreo: ${cred.email}\nClave temporal: ${cred.password}\nAl entrar te pedirá crear tu propia contraseña.`); setToast('Datos de acceso copiados') } catch { setToast('No se pudo copiar; anótalos a mano') } }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2"><p className="text-sm text-tinta-3">Las cuentas de asesor las crea VINKA. Cada asesor/a solo ve las asesorías que le asignes, sin teléfono ni correo de las personas.</p>
        <button className="btn-sm shrink-0 bg-rosa-accion text-white" onClick={() => { setForm({ email: '', first: '', last: '', phone: '', specialty: '' }); setErr('') }}>Nuevo asesor/a</button></div>
      <ErrorBox>{!form && err}</ErrorBox>
      {cred && (
        <div className="card flex flex-col gap-2 border-2 border-[#2F7A4F] p-4 text-sm">
          <b>Acceso de {cred.name}</b>
          <span>Correo: <b>{cred.email}</b></span>
          <span>Clave temporal: <b className="font-mono">{cred.password}</b></span>
          <span className="hint">Entrégala por un medio seguro. Solo se muestra ahora; al ingresar, la persona deberá crear su propia contraseña.</span>
          <div className="flex gap-2"><button className="btn-sm bg-morado text-white" onClick={copy}>Copiar datos de acceso</button><button className="btn-sm border border-linea bg-white" onClick={() => setCred(null)}>Listo</button></div>
        </div>
      )}
      {list == null ? <Spinner /> : list.length === 0 ? <Empty title="Aún no hay asesores">Crea la primera cuenta para asignarle solicitudes de asesoría.</Empty> : list.map((a) => (
        <div key={a.id} className="card flex flex-col gap-2 p-3.5 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="flex flex-col"><b>{a.name}</b><span className="text-xs text-tinta-3">{a.email}{a.phone ? ` · ${a.phone}` : ''}{a.specialty ? ` · ${a.specialty}` : ''}</span></span>
            <span className={`pill ${a.active ? 'bg-[#EAF6EF] text-[#134A2B]' : 'bg-[#FEF3F2] text-[#912018]'}`}>{a.active ? 'Activo/a' : 'Suspendido/a'}</span>
          </div>
          <span className="text-xs text-tinta-3">{a.open} abiertas · {a.delivered} entregadas · {a.terms_accepted_at ? `aceptó el acuerdo el ${dt(a.terms_accepted_at)}` : 'aún no acepta el acuerdo'}{a.pending_password ? ' · no ha creado su contraseña' : ''} · última conexión {dt(a.last_seen_at)}</span>
          <div className="flex flex-wrap gap-2">
            <button className="btn-sm border border-linea bg-white" onClick={() => reset(a)}>Nueva clave temporal</button>
            <button className={`btn-sm border ${a.active ? 'border-[#C0362C] text-[#912018]' : 'border-linea'} bg-white`} onClick={() => toggle(a)}>{a.active ? 'Suspender' : 'Reactivar'}</button>
            <button className="btn-sm bg-morado text-white" onClick={() => setTalk(talk === a.id ? null : a.id)}>{talk === a.id ? 'Cerrar notas' : 'Notas y conversación'}</button>
          </div>
          {talk === a.id && <TeamNotes advisorId={a.id} as="admin" />}
        </div>
      ))}
      <Sheet open={!!form} onClose={() => setForm(null)} title="Nuevo asesor/a">
        {form && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="Nombre" value={form.first} onChange={(e) => setForm({ ...form, first: e.target.value })} />
              <input className="input" placeholder="Apellido" value={form.last} onChange={(e) => setForm({ ...form, last: e.target.value })} />
            </div>
            <input className="input" type="email" placeholder="Correo con el que ingresará" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="input" placeholder="Teléfono (solo lo ve administración)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className="input" placeholder="Especialidad (ej.: retail, salud, TI)" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} />
            <p className="hint">VINKA genera una clave temporal. La verás una sola vez para entregarla. Al primer ingreso, la persona acepta el acuerdo de confidencialidad y crea su contraseña.</p>
            <ErrorBox>{err}</ErrorBox>
            <div className="grid grid-cols-2 gap-2"><button className="btn-sec" onClick={() => setForm(null)}>Cancelar</button><button className="btn" onClick={create}>Crear cuenta</button></div>
          </div>
        )}
      </Sheet>
      <Toast msg={toast} onDone={() => setToast('')} />
    </div>
  )
}

const TITLES = { business: 'Negocio y planes', advisory: 'Asesorías', candidates: 'Postulantes', advisors: 'Asesores', pending: 'Empresas por verificar', all: 'Todas las empresas', reports: 'Denuncias' }

/** Cuenta de administración: datos, avisos y cierre de sesión */
export function AdminAccount({ subtitle = 'Administración de VINKA', hint = 'Para probar la app como postulante o empresa, usa las cuentas de prueba.' }) {
  const { profile, user, signOut, isAdmin } = useAuth()
  return (
    <Screen className="bg-[#FAF7F9]">
      <div className="safe-t px-5 pb-3 pt-2"><h1 className="text-[22px] font-bold">Cuenta</h1><p className="text-[13px] text-tinta-3">{subtitle}</p></div>
      <div className="flex flex-col gap-3 px-5 pb-28">
        <div className="card flex flex-col gap-0.5 p-4"><span className="font-semibold">{`${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Administración'}</span><span className="text-sm text-tinta-3">{user?.email}</span></div>
        {isAdmin && (
          <div className="card px-4 lg:hidden">
            {[['/asesores', 'Asesores'], ['/empresas', 'Todas las empresas'], ['/denuncias', 'Denuncias']].map(([to, l]) => (
              <Link key={to} to={to} className="flex items-center justify-between border-b border-[#F1E7ED] py-3.5 text-[15px] font-semibold last:border-0">{l}<Svg name="chevron" size={18} className="text-tinta-suave" /></Link>
            ))}
          </div>
        )}
        <div className="card px-4">
          {[['/avisos', 'Avisos'], ['/legal/terminos', 'Términos de uso'], ['/legal/privacidad', 'Política de privacidad']].map(([to, l]) => (
            <Link key={to} to={to} className="flex items-center justify-between border-b border-[#F1E7ED] py-3.5 text-[15px] font-semibold last:border-0">{l}<Svg name="chevron" size={18} className="text-tinta-suave" /></Link>
          ))}
        </div>
        {hint && <p className="hint">{hint}</p>}
        <button className="btn-sec" onClick={signOut}>Cerrar sesión</button>
      </div>
    </Screen>
  )
}

export default function Admin({ section }) {
  const [tab, setTab] = useState(section || 'business')
  useEffect(() => { if (section) setTab(section) }, [section])
  const [companies, setCompanies] = useState(null)
  const [reports, setReports] = useState([])
  const [notes, setNotes] = useState({})
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('companies').select('*').order('created_at', { ascending: false }),
      supabase.from('reports').select('*').order('created_at', { ascending: false }),
    ])
    if (a.error) setErr(errMsg(a.error))
    setCompanies(a.data || []); setReports(b.data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const decide = async (id, status) => {
    const { error } = await supabase.from('companies').update({ verification_status: status, verification_note: notes[id] || '' }).eq('id', id)
    if (error) return setErr(errMsg(error))
    load()
  }
  const closeReport = async (id) => { await supabase.from('reports').update({ status: 'reviewed' }).eq('id', id); load() }

  const list = (companies || []).filter((c) => (tab === 'pending' ? c.verification_status === 'pending' : tab === 'all' ? true : false))
  return (
    <Screen className="bg-[#FAF7F9]" wide>
      {section ? <div className="safe-t px-5 pb-3 pt-2 lg:px-8 lg:pt-6"><h1 className="text-[22px] font-bold">{TITLES[tab]}</h1></div> : <TopBar back="/" title="Administración" />}
      <div className={`flex flex-col gap-3 px-5 lg:px-8 ${section ? 'pb-28 lg:pb-10' : 'pb-10'}`}>
        <div className={`flex flex-wrap gap-1.5 ${section ? 'hidden' : ''}`}>
          {[['business', 'Negocio y planes'], ['advisory', 'Asesorías'], ['candidates', 'Postulantes'], ['advisors', 'Asesores'], ['pending', 'Por verificar'], ['all', 'Todas'], ['reports', 'Denuncias']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`h-10 rounded-full border px-3 text-[13px] font-semibold ${tab === k ? 'border-morado bg-morado text-white' : 'border-linea bg-white'}`}>{l}</button>
          ))}
        </div>
        <ErrorBox>{err}</ErrorBox>
        {tab === 'business' ? <Business /> : tab === 'advisory' ? <Advisory /> : tab === 'candidates' ? <Candidates /> : tab === 'advisors' ? <Advisors /> : companies == null ? <Spinner /> : tab === 'reports' ? (
          reports.length === 0 ? <Empty title="Sin denuncias">Todo tranquilo.</Empty> : reports.map((r) => (
            <div key={r.id} className="card flex flex-col gap-2 p-3.5 text-sm">
              <span className="text-xs text-tinta-suave">{new Date(r.created_at).toLocaleString('es-CL')} · {r.status === 'open' ? 'Abierta' : 'Revisada'}</span>
              <p>{r.reason}</p>
              <span className="text-xs text-tinta-suave">Match: {r.match_id || '—'}</span>
              {r.status === 'open' && <button className="btn-sm self-start border border-linea bg-white" onClick={() => closeReport(r.id)}>Marcar revisada</button>}
            </div>
          ))
        ) : list.length === 0 ? <Empty title="Nada pendiente">No hay empresas esperando verificación.</Empty> : list.map((c) => (
          <div key={c.id} className="card flex flex-col gap-2 p-3.5 text-sm">
            <div className="flex justify-between gap-2"><b>{c.display_name}</b><span className="text-xs text-tinta-suave">{c.verification_status}</span></div>
            <span>{c.legal_name} · RUT {c.rut}</span>
            <span className="text-tinta-3">{[c.sector, c.size, c.comuna, c.region].filter(Boolean).join(' · ')}</span>
            <a className="text-rosa-texto underline" href={`https://www.google.com/search?q=${encodeURIComponent(c.rut + ' ' + c.legal_name)}`} target="_blank" rel="noreferrer">Buscar RUT en la web</a>
            <input className="input h-11" placeholder="Nota para la empresa (opcional)" value={notes[c.id] || ''} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <button className="btn-sm bg-[#1E6B3F] text-white" onClick={() => decide(c.id, 'verified')}>Verificar</button>
              <button className="btn-sm border border-linea bg-white" onClick={() => decide(c.id, 'rejected')}>Rechazar</button>
              <button className="btn-sm border border-linea bg-white" onClick={() => decide(c.id, 'suspended')}>Suspender</button>
            </div>
          </div>
        ))}
      </div>
    </Screen>
  )
}
