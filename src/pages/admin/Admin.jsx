import { useCallback, useEffect, useState } from 'react'
import { supabase, errMsg } from '../../lib/supabase'
import { Empty, ErrorBox, Screen, Spinner, TopBar } from '../../components/ui'

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

const SRV_STATUS = [['solicitada', 'Solicitada'], ['pago_pendiente', 'Pago pendiente'], ['en_curso', 'En curso'], ['entregada', 'Entregada'], ['cancelada', 'Cancelada']]
const CONTACT_TXT = { whatsapp: 'WhatsApp', correo: 'Correo', videollamada: 'Videollamada' }

/** Asesorías con reclutador: solicitudes de postulantes y precios del catálogo */
function Advisory() {
  const [reqs, setReqs] = useState(null)
  const [services, setServices] = useState([])
  const [open, setOpen] = useState(null)
  const [edit, setEdit] = useState({})
  const [svc, setSvc] = useState(null)
  const [only, setOnly] = useState(true)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([supabase.rpc('admin_service_requests'), supabase.from('career_services').select('*').order('sort')])
    if (a.error) setErr(errMsg(a.error))
    setReqs(a.data || []); setServices(b.data || [])
  }, [])
  useEffect(() => { load() }, [load])
  const save = async (r) => {
    setErr('')
    const e = edit[r.id] || {}
    const { error } = await supabase.rpc('admin_update_service_request', { p_id: r.id, p_status: e.status ?? r.status, p_note: e.note ?? r.note })
    if (error) return setErr(errMsg(error))
    setEdit({ ...edit, [r.id]: undefined }); load()
  }
  const saveSvc = async () => {
    setErr('')
    const { error } = await supabase.rpc('admin_upsert_service', { p_id: svc.id, p_name: svc.name, p_summary: svc.summary, p_includes: svc.includesText.split('\n').map((x) => x.trim()).filter(Boolean), p_price: Number(String(svc.price_clp).replace(/\D/g, '')), p_delivery: svc.delivery, p_active: svc.active, p_sort: svc.sort })
    if (error) return setErr(errMsg(error))
    setSvc(null); load()
  }
  if (!reqs) return err ? <ErrorBox>{err}</ErrorBox> : <Spinner />
  const openN = reqs.filter((r) => ['solicitada', 'pago_pendiente', 'en_curso'].includes(r.status)).length
  const income = reqs.filter((r) => r.status === 'entregada' || r.status === 'en_curso').reduce((a, r) => a + r.price, 0)
  const list = only ? reqs.filter((r) => ['solicitada', 'pago_pendiente', 'en_curso'].includes(r.status)) : reqs
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        {[['Abiertas', n(openN)], ['Total', n(reqs.length)], ['Vendido (en curso y entregadas)', `$${n(income)}`]].map(([l, v]) => (
          <div key={l} className="card flex flex-col gap-0.5 p-3"><span className="text-xs text-tinta-3">{l}</span><span className="font-display text-[20px] font-bold">{v}</span></div>
        ))}
      </div>
      <ErrorBox>{err}</ErrorBox>
      <div className="flex items-center justify-between"><span className="text-[15px] font-semibold">Solicitudes</span>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} className="h-4 w-4 accent-[#D02E72]" />Solo abiertas</label></div>
      {list.length === 0 && <Empty title="Sin solicitudes">Cuando un postulante pida una asesoría, aparecerá aquí y te llegará un aviso.</Empty>}
      {list.map((r) => {
        const e = edit[r.id] || {}
        return (
          <div key={r.id} className="card flex flex-col gap-2 p-3.5 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="flex flex-col"><b>{r.name || 'Sin nombre'}</b><span className="text-xs text-tinta-3">{r.service} · ${n(r.price)} · {new Date(r.created_at).toLocaleDateString('es-CL')}</span></span>
              <span className="rounded-full bg-[#F4EEF2] px-2.5 py-0.5 text-xs font-semibold">{SRV_STATUS.find(([k]) => k === r.status)?.[1]}</span>
            </div>
            <span>Prefiere: <b>{CONTACT_TXT[r.contact_pref]}</b> · {r.phone ? <a className="text-rosa-texto underline" href={`https://wa.me/${String(r.phone).replace(/\D/g, '')}`} target="_blank" rel="noreferrer">{r.phone}</a> : 'sin teléfono'} · <a className="text-rosa-texto underline" href={`mailto:${r.email}`}>{r.email}</a></span>
            {r.goal && <span className="text-tinta-2">Objetivo: «{r.goal}»</span>}
            <button className="self-start text-xs font-semibold text-rosa-texto" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Ocultar perfil' : 'Ver perfil laboral'}</button>
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
              <select className="input h-11" value={e.status ?? r.status} onChange={(ev) => setEdit({ ...edit, [r.id]: { ...e, status: ev.target.value } })}>{SRV_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
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

export default function Admin() {
  const [tab, setTab] = useState('business')
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
      <TopBar back="/" title="Administración" />
      <div className="flex flex-col gap-3 px-5 pb-10">
        <div className="flex flex-wrap gap-1.5">
          {[['business', 'Negocio y planes'], ['advisory', 'Asesorías'], ['pending', 'Por verificar'], ['all', 'Todas'], ['reports', 'Denuncias']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`h-10 rounded-full border px-3 text-[13px] font-semibold ${tab === k ? 'border-morado bg-morado text-white' : 'border-linea bg-white'}`}>{l}</button>
          ))}
        </div>
        <ErrorBox>{err}</ErrorBox>
        {tab === 'business' ? <Business /> : tab === 'advisory' ? <Advisory /> : companies == null ? <Spinner /> : tab === 'reports' ? (
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
