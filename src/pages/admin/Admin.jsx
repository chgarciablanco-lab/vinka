import { useCallback, useEffect, useState } from 'react'
import { supabase, errMsg } from '../../lib/supabase'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { Empty, ErrorBox, Screen, Sheet, Spinner, Svg, Toast, TopBar } from '../../components/ui'
import { Dossier, ServiceProgress, TeamNotes } from '../../components/Dossier'
import { atLocal, ymd } from '../../lib/dates'
import { fmtDateTime } from '../../lib/files'

const PLAN_STATUS = [['trial', 'Prueba'], ['active', 'Activo'], ['past_due', 'Pago pendiente'], ['canceled', 'Cancelado']]
const n = (x) => Number(x || 0).toLocaleString('es-CL')

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const PLAN_NAME = { gratis: 'Gratis', pyme: 'Pyme', equipo: 'Equipo', empresa: 'Empresa' }
const money = (v) => `$${Number(v || 0).toLocaleString('es-CL')}`
const short = (v) => (v >= 1e6 ? `$${(v / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 })} M` : v >= 1e3 ? `$${Math.round(v / 1e3)} mil` : money(v))
const monthLabel = (ym) => { const [y, m] = ym.split('-'); return `${MES[Number(m) - 1]} ${y.slice(2)}` }

/** Ingresos mensuales netos de IVA: barras apiladas de planes (morado), asesorías (rosa) y destacados (dorado) */
function RevenueChart({ series }) {
  const [sel, setSel] = useState(series.length - 2)
  const W = 720, H = 220, L = 52, B = 26, T = 10
  const tot = (x) => x.plans + x.advisory + (x.promos || 0)
  const max = Math.max(1, ...series.map(tot))
  const step = max > 4e6 ? 1e6 : max > 2e6 ? 5e5 : max > 5e5 ? 2.5e5 : 1e5
  const top = Math.ceil(max / step) * step
  const y = (v) => T + (H - T - B) * (1 - v / top)
  const bw = (W - L - 8) / series.length
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const cur = series[sel]
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tinta-2">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#4A2163]" />Planes de empresas</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#D02E72]" />Asesorías</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#C99A1E]" />Destacados</span>
        {cur && <span className="ml-auto font-semibold text-tinta">{monthLabel(cur.month)}: {money(tot(cur))} <span className="font-normal text-tinta-3">({money(cur.plans)} planes · {money(cur.advisory)} asesorías · {money(cur.promos || 0)} destacados)</span></span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Ingresos por mes de los últimos 24 meses">
        {ticks.map((t) => <g key={t}><line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke="#EEE3EA" /><text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#8A8090">{short(t)}</text></g>)}
        {series.map((x, i) => {
          const cx = L + 4 + i * bw, w = Math.max(4, bw - 4)
          const yp = y(x.plans), ya = y(x.plans + x.advisory)
          return (
            <g key={x.month} onMouseEnter={() => setSel(i)} onClick={() => setSel(i)} className="cursor-pointer">
              <rect x={cx} y={T} width={bw} height={H - T - B} fill={i === sel ? '#FAF4F8' : 'transparent'} />
              {x.plans > 0 && <rect x={cx + 2} y={yp} width={w} height={y(0) - yp} fill="#4A2163" rx="2"><title>{`${monthLabel(x.month)} · planes ${money(x.plans)}`}</title></rect>}
              {x.advisory > 0 && <rect x={cx + 2} y={ya} width={w} height={Math.max(0, yp - ya - (x.plans > 0 ? 2 : 0))} fill="#D02E72" rx="2"><title>{`${monthLabel(x.month)} · asesorías ${money(x.advisory)}`}</title></rect>}
              {(x.promos || 0) > 0 && <rect x={cx + 2} y={y(tot(x))} width={w} height={Math.max(0, ya - y(tot(x)) - 2)} fill="#C99A1E" rx="2"><title>{`${monthLabel(x.month)} · destacados ${money(x.promos)}`}</title></rect>}
              {(i % 3 === series.length % 3 || i === series.length - 1) && <text x={cx + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#8A8090">{monthLabel(x.month)}</text>}
            </g>
          )
        })}
      </svg>
      <span className="text-[11px] text-tinta-suave">Toca una barra para ver el detalle. El mes en curso va hasta hoy.</span>
    </div>
  )
}

/** Ingresos de VINKA según los pagos registrados (planes y asesorías) */
function Revenue({ demo }) {
  const [r, setR] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { setR(null); supabase.rpc('admin_revenue', { p_include_demo: demo }).then(({ data, error }) => { if (error) setErr(errMsg(error)); setR(data) }) }, [demo])
  const delta = r && r.prev_month_to_date > 0 ? Math.round(((r.month - r.prev_month_to_date) / r.prev_month_to_date) * 100) : null
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-col"><span className="text-[17px] font-bold">Ingresos</span><span className="text-xs text-tinta-3">Montos netos, sin IVA</span></span>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {!r ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="card flex flex-col gap-0.5 p-3"><span className="text-xs text-tinta-3">Este mes (hasta hoy)</span><span className="font-display text-[22px] font-bold">{money(r.month)}</span>
              {delta != null && <span className={`text-xs font-semibold ${delta >= 0 ? 'text-[#2F7A4F]' : 'text-[#912018]'}`}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% vs. mismo día del mes anterior</span>}</div>
            <div className="card flex flex-col gap-0.5 p-3"><span className="text-xs text-tinta-3">Mes anterior</span><span className="font-display text-[22px] font-bold">{money(r.prev_month)}</span></div>
            <div className="card flex flex-col gap-0.5 p-3"><span className="text-xs text-tinta-3">Últimos 12 meses</span><span className="font-display text-[22px] font-bold">{money(r.last12)}</span></div>
            <div className="card flex flex-col gap-0.5 p-3"><span className="text-xs text-tinta-3">Ingreso recurrente mensual (planes)</span><span className="font-display text-[22px] font-bold">{money(r.mrr)}</span><span className="text-xs text-tinta-3">{r.paying} empresas pagando</span></div>
          </div>
          {r.total === 0 ? <div className="card p-4 text-sm text-tinta-3">Aún no hay pagos registrados. Se registran al confirmar el pago de una asesoría (pasa a «En curso»), al activar un destacado pagado o con «Registrar pago» en cada empresa.</div> : (
            <div className="card p-4"><RevenueChart series={r.series} /></div>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="card flex flex-col gap-2 p-4">
              <span className="text-[15px] font-semibold">Este mes</span>
              <span className="flex justify-between text-sm"><span>Planes de empresas</span><b>{money(r.month_plans)}</b></span>
              <span className="flex justify-between text-sm"><span>Asesorías ({r.advisory_month_count})</span><b>{money(r.month_advisory)}</b></span>
              <span className="flex justify-between text-sm"><span>Destacados ({r.promo_month_count || 0})</span><b>{money(r.month_promos)}</b></span>
              <span className="flex justify-between text-xs text-tinta-3"><span>IVA cobrado este mes (no es ingreso)</span><span>{money(r.month_iva)}</span></span>
              <span className="mt-1 text-[13px] font-semibold">Ingreso recurrente por plan</span>
              {r.by_plan.map((p) => <span key={p.plan} className="flex justify-between text-sm"><span>{PLAN_NAME[p.plan] || p.plan} · {p.n} empresas</span><b>{money(p.mrr)}</b></span>)}
            </div>
            <div className="card flex flex-col gap-1.5 p-4">
              <span className="text-[15px] font-semibold">Últimos pagos</span>
              {r.recent.map((p, i) => (
                <span key={i} className="flex items-center justify-between gap-2 border-b border-[#F1E7ED] pb-1.5 text-xs last:border-0">
                  <span className="min-w-0"><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${p.kind === 'plan' ? 'bg-[#4A2163]' : p.kind === 'promocion' ? 'bg-[#C99A1E]' : 'bg-[#D02E72]'}`} /><b className="text-tinta">{p.who}</b> · {p.what}{p.demo ? ' · demo' : ''}<br /><span className="text-tinta-suave">{new Date(p.paid_at).toLocaleDateString('es-CL')} · {p.method}</span></span>
                  <b className="shrink-0 text-sm">{money(p.amount)}</b>
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** Resumen del negocio y gestión de planes (los cambios quedan registrados en la auditoría). */
function Business() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState(null)
  const [q, setQ] = useState('')
  const [demo, setDemo] = useState(false)
  const [pay, setPay] = useState(null)
  const [msgErr, setMsgErr] = useState('')
  const load = useCallback(() => { supabase.rpc('admin_overview').then(({ data, error }) => { if (error) setErr(errMsg(error)); setD(data) }) }, [])
  useEffect(() => { load() }, [load])
  const save = async () => {
    setErr('')
    const { error } = await supabase.rpc('admin_set_plan', { p_company: edit.id, p_plan: edit.plan, p_status: edit.status, p_period_end: edit.period_end ? new Date(edit.period_end + 'T23:59:00').toISOString() : null, p_note: edit.note || '' })
    if (error) return setErr(errMsg(error))
    setEdit(null); load()
  }
  const recordPay = async () => {
    setErr('')
    const { error } = await supabase.rpc('admin_record_payment', { p_company: pay.id, p_plan: pay.plan, p_amount: Number(String(pay.amount).replace(/\D/g, '')), p_months: Number(pay.months), p_method: pay.method, p_note: pay.note })
    if (error) return setErr(errMsg(error))
    setPay(null); load()
  }
  const PRICES = { pyme: 29990, equipo: 69990, consultora: 129990, empresa: 149990, gratis: 0 }
  if (!d) return err ? <ErrorBox>{err}</ErrorBox> : <Spinner />
  const m = demo ? (d.metrics_all || d.metrics) : d.metrics
  const names = Object.fromEntries((d.companies || []).map((c) => [c.id, c.name]))
  const list = (d.companies || []).filter((c) => (demo || !c.demo) && (!q.trim() || `${c.name} ${c.legal_name} ${c.rut}`.toLowerCase().includes(q.trim().toLowerCase())))
  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} className="h-4 w-4 accent-[#D02E72]" />Incluir datos de demostración (ingresos, actividad y empresas)</label>
      <Revenue demo={demo} />
      <span className="mt-2 text-[17px] font-bold">Actividad</span>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[['Empresas verificadas', n(m.companies)], ['Por verificar', n(m.pending)], ['Candidatos activos', n(m.candidates)], ['Vacantes abiertas', n(m.jobs_open)], ['Contrataciones 30 días', n(m.hires_30d)], ['Usos de IA 30 días', n(m.ai_30d)]].map(([l, v]) => (
          <div key={l} className="card flex flex-col gap-0.5 p-3"><span className="text-xs text-tinta-3">{l}</span><span className="font-display text-[20px] font-bold">{v}</span></div>
        ))}
      </div>
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
                <select className="input h-11" value={edit.plan} onChange={(e) => setEdit({ ...edit, plan: e.target.value })}>{['gratis', 'pyme', 'equipo', 'consultora', 'empresa'].map((x) => <option key={x}>{x}</option>)}</select>
                <select className="input h-11" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{PLAN_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <label className="flex flex-col gap-1"><span className="text-xs text-tinta-3">Pagado hasta</span><input type="date" className="input h-11" value={edit.period_end || ''} onChange={(e) => setEdit({ ...edit, period_end: e.target.value })} /></label>
                <label className="flex flex-col gap-1"><span className="text-xs text-tinta-3">Nota (factura, medio de pago)</span><input className="input h-11" value={edit.note || ''} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></label>
                <button className="btn-sec h-11" onClick={() => setEdit(null)}>Cancelar</button><button className="btn h-11" onClick={save}>Guardar plan</button>
              </div>
            ) : pay?.id === c.id ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <select className="input h-11" value={pay.plan} onChange={(e) => setPay({ ...pay, plan: e.target.value, amount: PRICES[e.target.value] * Number(pay.months) })}>{['pyme', 'equipo', 'consultora', 'empresa'].map((x) => <option key={x} value={x}>{PLAN_NAME[x]}</option>)}</select>
                <select className="input h-11" value={pay.months} onChange={(e) => setPay({ ...pay, months: e.target.value, amount: PRICES[pay.plan] * Number(e.target.value) })}>{[1, 3, 6, 12].map((x) => <option key={x} value={x}>{x} {x === 1 ? 'mes' : 'meses'}</option>)}</select>
                <label className="flex flex-col gap-1"><span className="text-xs text-tinta-3">Monto recibido (CLP)</span><input className="input h-11" inputMode="numeric" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></label>
                <label className="flex flex-col gap-1"><span className="text-xs text-tinta-3">Medio de pago</span><select className="input h-11" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{['transferencia', 'tarjeta', 'efectivo', 'otro'].map((x) => <option key={x}>{x}</option>)}</select></label>
                <input className="input h-11 sm:col-span-2" placeholder="Nota (n° de factura, comprobante)" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />
                <button className="btn-sec h-11" onClick={() => setPay(null)}>Cancelar</button><button className="btn h-11" onClick={recordPay}>Registrar pago y activar</button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button className="btn-sm border border-linea bg-white" onClick={() => setEdit({ id: c.id, plan: c.plan || 'gratis', status: c.status || 'active', period_end: c.period_end ? c.period_end.slice(0, 10) : '', note: c.note || '' })}>Cambiar plan</button>
                <button className="btn-sm bg-morado text-white" onClick={() => { const pl = ['pyme', 'equipo', 'consultora', 'empresa'].includes(c.plan) ? c.plan : 'pyme'; setPay({ id: c.id, plan: pl, months: 1, amount: PRICES[pl], method: 'transferencia', note: '' }) }}>Registrar pago</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {d.errors?.length > 0 && (
        <div className="card flex flex-col gap-1.5 p-4">
          <div className="flex items-center justify-between gap-2"><span className="text-[15px] font-semibold">Errores pendientes en la app ({n(m.errors_7d)} en 7 días)</span>
            <button className="btn-sm shrink-0 border border-linea bg-white" onClick={async () => { const { data } = await supabase.rpc('admin_resolve_errors'); setMsgErr(`${data || 0} marcados como resueltos. Si vuelven a ocurrir, aparecerán de nuevo.`); load() }}>Marcar como resueltos</button></div>
          <span className="text-[11px] text-tinta-suave">Fecha y hora de Chile · pantalla · mensaje. Márcalos como resueltos después de publicar la corrección.</span>
          {msgErr && <span className="text-xs text-[#1E6B3F]">{msgErr}</span>}
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
      <ServiceProgress requestId={r.id} as="admin" />
      <span className="text-xs text-[#134A2B]">Revisa también la calidad en el expediente. La persona recibe el aviso de «terminada» recién cuando apruebas.</span>
      <textarea className="textarea h-20 bg-white" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observaciones: obligatorias si la devuelves o si apruebas con algo pendiente (queda registrado)" />
      <ErrorBox>{err}</ErrorBox>
      <div className="grid grid-cols-2 gap-2"><button className="btn-sec h-11" onClick={() => go(false)}>Devolver al asesor/a</button><button className="btn h-11 bg-[#2F7A4F]" onClick={() => go(true)}>Aprobar asesoría ✓</button></div>
    </div>
  )
}

/** Próximas sesiones de todos los asesores */
function UpcomingSessions({ showDemo }) {
  const [all, setList] = useState(null)
  const list = all && all.filter((s) => showDemo || !s.demo)
  useEffect(() => {
    const from = atLocal(ymd(new Date()), '00:00')
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
  const [fq, setFq] = useState('')
  const [fst, setFst] = useState('')
  const [fadv, setFadv] = useState('')
  const [limit, setLimit] = useState(30)
  const [showDemo, setShowDemo] = useState(false)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([supabase.rpc('admin_service_requests'), supabase.from('career_services').select('*').order('sort'), supabase.rpc('admin_advisors')])
    if (a.error) setErr(errMsg(a.error))
    setReqs(a.data || []); setServices(b.data || []); setAdvisors(c.data || [])
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
  const openN = reqs.filter((r) => (showDemo || !r.demo) && OPEN.includes(r.status)).length
  const toReview = reqs.filter((r) => (showDemo || !r.demo) && r.status === 'entregada').length
  const income = reqs.filter((r) => (showDemo || !r.demo) && ['en_curso', 'entregada', 'aprobada'].includes(r.status)).reduce((a, r) => a + r.price, 0)
  const qn = fq.trim().toLowerCase()
  const list = reqs.filter((r) => (showDemo || !r.demo) && (fst ? r.status === fst : !only || OPEN.includes(r.status))
    && (!fadv || (fadv === 'none' ? !r.advisor_id : r.advisor_id === fadv))
    && (!qn || `${r.name} ${r.email} ${r.service} ${r.advisor || ''} ${r.goal}`.toLowerCase().includes(qn)))
  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={showDemo} onChange={(e) => setShowDemo(e.target.checked)} className="h-4 w-4 accent-[#D02E72]" />Incluir demostración en cifras y lista</label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[['Por revisar', n(toReview)], ['Abiertas', n(openN)], ['Total', n(reqs.filter((r) => showDemo || !r.demo).length)], ['Vendido (pagadas)', `$${n(income)}`]].map(([l, v]) => (
          <div key={l} className="card flex flex-col gap-0.5 p-3"><span className="text-xs text-tinta-3">{l}</span><span className="font-display text-[20px] font-bold">{v}</span></div>
        ))}
      </div>
      <ErrorBox>{err}</ErrorBox>
      <UpcomingSessions showDemo={showDemo} />
      <div className="flex items-center justify-between"><span className="text-[15px] font-semibold">Solicitudes</span>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={only} disabled={!!fst} onChange={(e) => setOnly(e.target.checked)} className="h-4 w-4 accent-[#D02E72]" />Solo abiertas</label></div>
      <div className="grid gap-2 sm:grid-cols-[1fr_190px_190px]">
        <input className="input h-11" placeholder="Buscar persona, correo, servicio u objetivo" value={fq} onChange={(e) => { setFq(e.target.value); setLimit(30) }} />
        <select className="input h-11" value={fst} onChange={(e) => { setFst(e.target.value); setLimit(30) }}><option value="">Todos los estados</option>{Object.entries(SRV_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="input h-11" value={fadv} onChange={(e) => { setFadv(e.target.value); setLimit(30) }}><option value="">Todos los asesores</option><option value="none">Sin asignar</option>{advisors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </div>
      <span className="text-xs text-tinta-suave">{list.length} solicitudes</span>
      {list.length === 0 && <Empty title="Sin solicitudes">Cuando un postulante pida una asesoría, aparecerá aquí y te llegará un aviso.</Empty>}
      {list.slice(0, limit).map((r) => {
        const e = edit[r.id] || {}
        return (
          <div key={r.id} className="card flex flex-col gap-2 p-3.5 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="flex flex-col"><b>{r.name || 'Sin nombre'}</b><span className="text-xs text-tinta-3">{r.service} · ${n(r.price)} · {new Date(r.created_at).toLocaleDateString('es-CL')}</span></span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.status === 'entregada' ? 'bg-naranja-palido text-naranja-texto' : r.status === 'aprobada' ? 'bg-[#EAF6EF] text-[#134A2B]' : 'bg-[#F4EEF2]'}`}>{SRV_LABEL[r.status]}</span>
            </div>
            <span className="text-xs text-tinta-3">Coordinación y asesoría solo por el chat de VINKA (pestaña Conversación).</span>
            {r.goal && <span className="text-tinta-2">Objetivo: «{r.goal}»</span>}
            <label className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-tinta-3">Asesor/a asignado/a</span>
              <select className="h-9 rounded-lg border border-linea bg-white px-2 text-sm" value={r.advisor_id || ''} onChange={(ev) => assign(r, ev.target.value)}>
                <option value="">Sin asignar</option>
                {advisors.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name} ({showDemo ? a.open : a.open - (a.open_demo || 0)} abiertas)</option>)}
                {r.advisor_id && !advisors.some((a) => a.active && a.id === r.advisor_id) && <option value={r.advisor_id}>{r.advisor} (inactivo)</option>}
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
      {list.length > limit && <button className="btn-sec" onClick={() => setLimit(limit + 30)}>Ver más ({list.length - limit} restantes)</button>}
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
  const [filter, setFilter] = useState('reales')
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
          <span className="text-xs text-tinta-3">{a.open - (a.open_demo || 0)} abiertas · {a.delivered - (a.delivered_demo || 0)} entregadas{a.open_demo || a.delivered_demo ? ` (más ${a.open_demo + a.delivered_demo} de demostración)` : ''} · {a.terms_accepted_at ? `aceptó el acuerdo el ${dt(a.terms_accepted_at)}` : 'aún no acepta el acuerdo'}{a.pending_password ? ' · no ha creado su contraseña' : ''} · última conexión {dt(a.last_seen_at)}</span>
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

const P_STATUS = { solicitada: 'Pendiente de pago', activa: 'Activa', pausada: 'Pausada', finalizada: 'Terminada', cancelada: 'Cancelada' }
const P_PILL = { solicitada: 'bg-[#FFF4D6] text-[#7A5200]', activa: 'bg-[#EAF6EF] text-[#1E6B3F]', pausada: 'bg-[#F4EEF2] text-tinta-3', finalizada: 'bg-[#F4EEF2] text-tinta-3', cancelada: 'bg-[#F4EEF2] text-tinta-3' }
const P_SOURCE = { compra: 'Compra', plan: 'Incluido en plan', cortesia: 'Cortesía' }

/** Destacados: solicitudes, activos, precios, reglas de espacios e indicadores (empresas y personas por separado) */
function Promos() {
  const [target, setTarget] = useState('job')
  const [demo, setDemo] = useState(false)
  const [st, setSt] = useState('abiertas')
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')
  const [act, setAct] = useState(null)
  const [cfg, setCfg] = useState(null)
  const load = useCallback(() => { supabase.rpc('admin_promotions', { p_target: target, p_include_demo: demo }).then(({ data, error }) => { if (error) setErr(errMsg(error)); setD(data) }) }, [target, demo])
  useEffect(() => { setD(null); load() }, [load])
  const activate = async () => {
    setErr('')
    const { error } = await supabase.rpc('admin_activate_promotion', { p_id: act.id, p_paid: act.paid, p_method: act.method, p_note: act.note })
    if (error) return setErr(errMsg(error))
    setAct(null); setToast('Destacado activado'); load()
  }
  const set = async (id, action, days = null) => {
    setErr('')
    const { error } = await supabase.rpc('admin_set_promotion', { p_id: id, p_action: action, p_days: days })
    if (error) return setErr(errMsg(error))
    setToast('Listo'); load()
  }
  const saveCfg = async () => {
    setErr('')
    const { error } = await supabase.rpc('admin_promo_config', { p_products: cfg.products.map((x) => ({ id: x.id, days: Number(x.days), price_clp: Number(String(x.price_clp).replace(/\D/g, '')), active: x.active })), p_settings: cfg.settings })
    if (error) return setErr(errMsg(error))
    setCfg(null); setToast('Precios y reglas guardados'); load()
  }
  const items = (d?.items || []).filter((x) => st === 'todas' || (st === 'abiertas' ? ['solicitada', 'activa', 'pausada'].includes(x.status) : x.status === st))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {[['job', 'Ofertas de empresas'], ['profile', 'Perfiles de personas']].map(([k, l]) => (
          <button key={k} onClick={() => setTarget(k)} className={`h-10 rounded-full border px-3.5 text-[13px] font-semibold ${target === k ? 'border-morado bg-morado text-white' : 'border-linea bg-white'}`}>{l}</button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} className="h-4 w-4 accent-[#D02E72]" />Incluir demostración</label>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {!d ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            {[['Activos ahora', n(d.active)], ['Por activar (pago)', n(d.requested)], ['Ingreso neto del mes', money(d.month_net)], ['Vendidos / del plan este mes', `${n(d.month_sold)} / ${n(d.month_plan)}`], ['Apariciones · clics 30 días', `${n(d.impressions_30d)} · ${n(d.clicks_30d)}`]].map(([l, v]) => (
              <div key={l} className="card flex flex-col gap-0.5 p-3"><span className="text-xs text-tinta-3">{l}</span><span className="font-display text-[19px] font-bold">{v}</span></div>
            ))}
          </div>
          <div className="card flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-semibold">Precios y reglas</span>
              {!cfg && <button className="btn-sm border border-linea bg-white" onClick={() => setCfg({ products: d.products.map((x) => ({ ...x })), settings: { ...d.settings } })}>Editar</button>}
            </div>
            {!cfg ? (
              <>
                <span className="text-sm text-tinta-2">{d.products.map((x) => `${x.days} días ${money(x.price_clp)}${x.price_mode === 'neto' ? ' + IVA' : ' IVA incl.'}${x.active ? '' : ' (oculto)'}`).join(' · ')}</span>
                <span className="text-xs text-tinta-3">Máximo {d.settings.slots_per_ten} destacados por cada 10 resultados · {d.settings.home_slots} en la página principal · hasta {target === 'job' ? d.settings.max_jobs : d.settings.max_profiles} activos a la vez</span>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                {cfg.products.map((x, i) => (
                  <div key={x.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                    <label className="flex flex-col gap-1"><span className="text-xs text-tinta-3">Días</span><input className="input h-11" inputMode="numeric" value={x.days} onChange={(e) => { const p = [...cfg.products]; p[i] = { ...x, days: e.target.value }; setCfg({ ...cfg, products: p }) }} /></label>
                    <label className="flex flex-col gap-1"><span className="text-xs text-tinta-3">Precio ({x.price_mode === 'neto' ? '+ IVA' : 'IVA incluido'})</span><input className="input h-11" inputMode="numeric" value={x.price_clp} onChange={(e) => { const p = [...cfg.products]; p[i] = { ...x, price_clp: e.target.value }; setCfg({ ...cfg, products: p }) }} /></label>
                    <label className="flex h-11 items-center gap-1.5 text-sm"><input type="checkbox" checked={x.active} onChange={(e) => { const p = [...cfg.products]; p[i] = { ...x, active: e.target.checked }; setCfg({ ...cfg, products: p }) }} className="h-4 w-4 accent-[#D02E72]" />Visible</label>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[['slots_per_ten', 'Destacados por cada 10'], ['home_slots', 'En página principal'], ['max_jobs', 'Ofertas activas máx.'], ['max_profiles', 'Perfiles activos máx.']].map(([k, l]) => (
                    <label key={k} className="flex flex-col gap-1"><span className="text-xs text-tinta-3">{l}</span><input className="input h-11" inputMode="numeric" value={cfg.settings[k]} onChange={(e) => setCfg({ ...cfg, settings: { ...cfg.settings, [k]: e.target.value.replace(/\D/g, '') } })} /></label>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2"><button className="btn-sec h-11" onClick={() => setCfg(null)}>Cancelar</button><button className="btn h-11" onClick={saveCfg}>Guardar</button></div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[['abiertas', 'Vigentes y por activar'], ['solicitada', 'Por activar'], ['activa', 'Activas'], ['finalizada', 'Terminadas'], ['todas', 'Todas']].map(([k, l]) => (
              <button key={k} onClick={() => setSt(k)} className={`h-9 rounded-full border px-3 text-[13px] font-semibold ${st === k ? 'border-rosa-accion bg-rosa-palido text-rosa-texto' : 'border-linea bg-white'}`}>{l}</button>
            ))}
          </div>
          {items.length === 0 ? <Empty title="Nada por aquí">{target === 'job' ? 'Las empresas piden destacados desde cada vacante.' : 'Las personas los piden desde su perfil.'}</Empty> : (
            <div className="grid gap-2 lg:grid-cols-2">
              {items.map((x) => (
                <div key={x.id} className="card flex flex-col gap-1.5 p-3.5 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0"><b className="block truncate">{x.who || '—'}{x.demo && <span className="ml-1.5 rounded bg-[#F4EEF2] px-1.5 py-0.5 text-[11px] font-semibold text-tinta-3">Demo</span>}</b><span className="block truncate text-xs text-tinta-3">{x.what || '—'}</span></span>
                    <span className={`pill shrink-0 ${P_PILL[x.status]}`}>{P_STATUS[x.status]}</span>
                  </div>
                  <span className="text-xs text-tinta-2">{x.days} días · {P_SOURCE[x.source]}{x.total ? ` · ${money(x.net)} + IVA ${money(x.iva)} = ${money(x.total)}` : ''}</span>
                  <span className="text-xs text-tinta-3">{x.starts_at ? `${dt(x.starts_at)} → ${dt(x.ends_at)} · ${n(x.results.impressions)} apariciones · ${n(x.results.clicks)} clics · ${n(x.results.actions)} ${target === 'job' ? 'postulaciones' : 'empresas interesadas'}` : `Pedido el ${dt(x.created_at)}`}</span>
                  {act?.id === x.id ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select className="input h-11" value={act.paid ? 'pago' : 'cortesia'} onChange={(e) => setAct({ ...act, paid: e.target.value === 'pago' })}><option value="pago">Pago recibido ({money(x.total)})</option><option value="cortesia">Cortesía (sin cobro)</option></select>
                      {act.paid && <select className="input h-11" value={act.method} onChange={(e) => setAct({ ...act, method: e.target.value })}>{['transferencia', 'tarjeta', 'efectivo', 'otro'].map((m) => <option key={m}>{m}</option>)}</select>}
                      <input className="input h-11 sm:col-span-2" placeholder="Nota (comprobante, motivo de cortesía)" value={act.note} onChange={(e) => setAct({ ...act, note: e.target.value })} />
                      <button className="btn-sec h-11" onClick={() => setAct(null)}>Cancelar</button><button className="btn h-11" onClick={activate}>Activar ahora</button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {x.status === 'solicitada' && <><button className="btn-sm bg-morado text-white" onClick={() => setAct({ id: x.id, paid: true, method: 'transferencia', note: '' })}>Activar</button><button className="btn-sm border border-linea bg-white" onClick={() => set(x.id, 'cancelar')}>Rechazar</button></>}
                      {x.status === 'activa' && <><button className="btn-sm border border-linea bg-white" onClick={() => set(x.id, 'extender', 7)}>+7 días</button><button className="btn-sm border border-linea bg-white" onClick={() => set(x.id, 'pausar')}>Pausar</button><button className="btn-sm border border-linea bg-white" onClick={() => set(x.id, 'finalizar')}>Finalizar</button></>}
                      {x.status === 'pausada' && <>{x.paused_by === 'admin' ? <button className="btn-sm border border-linea bg-white" onClick={() => set(x.id, 'reanudar')}>Reanudar</button> : <span className="text-xs text-tinta-3">{x.paused_by === 'profile' ? 'En pausa: la persona ocultó su perfil' : 'En pausa porque la vacante no está publicada'}</span>}<button className="btn-sm border border-linea bg-white" onClick={() => set(x.id, 'finalizar')}>Finalizar</button></>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="hint">Destacar solo cambia la posición en las listas (máximo {d.settings.slots_per_ten} de cada 10) y agrega una etiqueta. No toca evaluaciones, puntajes ni la IA, y solo aparece donde ya calza.</p>
        </>
      )}
      <Toast msg={toast} onDone={() => setToast('')} />
    </div>
  )
}

const TITLES = { promos: 'Destacados', business: 'Negocio y planes', advisory: 'Asesorías', candidates: 'Postulantes', advisors: 'Asesores', pending: 'Empresas por verificar', all: 'Todas las empresas', reports: 'Denuncias', feedback: 'Errores y sugerencias' }

const FB_KIND = { error: ['Error', 'bg-[#FEF3F2] text-[#912018]'], mejora: ['Mejora', 'bg-[#EAF6EF] text-[#134A2B]'], consulta: ['Consulta', 'bg-[#E7F1FB] text-[#1F4E86]'] }
const FB_ST = [['nuevo', 'Nuevo'], ['revisando', 'En revisión'], ['resuelto', 'Resuelto'], ['descartado', 'Descartado']]
const ROLE_TXT = { candidate: 'Postulante', company: 'Empresa', advisor: 'Asesor/a', admin: 'Administración' }

/** Errores y sugerencias que envían los usuarios (formulario o asistente) */
function Feedback() {
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')
  const [fk, setFk] = useState('')
  const [fs, setFs] = useState('abiertos')
  const [demo, setDemo] = useState(false)
  const [open, setOpen] = useState(null)
  const [note, setNote] = useState('')
  const load = useCallback(() => { supabase.rpc('admin_feedback').then(({ data, error }) => { if (error) setErr(errMsg(error)); setList(data || []) }) }, [])
  useEffect(() => { load() }, [load])
  const set = async (r, status, notify) => {
    setErr('')
    const { error } = await supabase.rpc('admin_update_feedback', { p_id: r.id, p_status: status, p_note: note, p_notify: notify })
    if (error) return setErr(errMsg(error))
    setOpen(null); setNote(''); load()
  }
  if (!list) return err ? <ErrorBox>{err}</ErrorBox> : <Spinner />
  const base = list.filter((r) => demo || !r.demo)
  const shown = base.filter((r) => (!fk || r.kind === fk) && (fs === 'abiertos' ? ['nuevo', 'revisando'].includes(r.status) : !fs || r.status === fs))
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {[['Nuevos', base.filter((r) => r.status === 'nuevo').length], ['Errores abiertos', base.filter((r) => r.kind === 'error' && ['nuevo', 'revisando'].includes(r.status)).length], ['Mejoras propuestas', base.filter((r) => r.kind === 'mejora').length]].map(([l, v]) => (
          <div key={l} className="card flex flex-col gap-0.5 p-3"><span className="text-xs text-tinta-3">{l}</span><span className="font-display text-[20px] font-bold">{v}</span></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {[['', 'Todos'], ['error', 'Errores'], ['mejora', 'Mejoras'], ['consulta', 'Consultas']].map(([k, l]) => <button key={k} className={`chip h-9 text-[13px] ${fk === k ? 'chip-on' : ''}`} onClick={() => setFk(k)}>{l}</button>)}
        <select className="input h-9 w-auto py-0 text-[13px]" value={fs} onChange={(e) => setFs(e.target.value)}><option value="abiertos">Abiertos</option><option value="">Todos los estados</option>{FB_ST.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} className="h-4 w-4 accent-[#D02E72]" />Incluir cuentas de prueba</label>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {shown.length === 0 ? <Empty title="Nada por revisar">Cuando alguien reporte un error o proponga una mejora, aparecerá aquí y te llegará un aviso.</Empty> : shown.map((r) => (
        <div key={r.id} className="card flex flex-col gap-2 p-3.5 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="flex min-w-0 flex-col"><b>{r.summary}</b><span className="text-xs text-tinta-3">{r.name || 'Usuario'} · {ROLE_TXT[r.role] || '—'} · {new Date(r.created_at).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {r.source === 'asistente' ? 'vía asistente' : 'formulario'}{r.path ? ` · pantalla ${r.path}` : ''}</span></span>
            <span className="flex shrink-0 gap-1"><span className={`pill ${FB_KIND[r.kind][1]}`}>{FB_KIND[r.kind][0]}</span><span className="pill bg-[#F4EEF2] text-tinta-2">{FB_ST.find(([k]) => k === r.status)[1]}</span></span>
          </div>
          {r.details && <p className="whitespace-pre-wrap text-[13px] leading-snug text-tinta-2">{r.details}</p>}
          {r.note && <span className="text-xs text-tinta-3">Nota: {r.note}</span>}
          {open === r.id ? (
            <div className="flex flex-col gap-2 rounded-xl bg-[#FAF7F9] p-3">
              <textarea className="textarea h-20 bg-white" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Respuesta para la persona (opcional; se la enviamos si marcas «avisar»)" />
              <div className="flex flex-wrap gap-2">
                <button className="btn-sm border border-linea bg-white" onClick={() => set(r, 'revisando', false)}>En revisión</button>
                <button className="btn-sm bg-[#1E6B3F] text-white" onClick={() => set(r, 'resuelto', true)}>Resuelto y avisar</button>
                <button className="btn-sm border border-linea bg-white" onClick={() => set(r, 'descartado', true)}>Descartar y avisar</button>
                <button className="btn-sm text-tinta-3" onClick={() => setOpen(null)}>Cancelar</button>
              </div>
            </div>
          ) : <button className="self-start text-xs font-semibold text-rosa-texto" onClick={() => { setOpen(r.id); setNote(r.note || '') }}>Gestionar</button>}
        </div>
      ))}
    </div>
  )
}

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
            {[['/promociones', 'Destacados'], ['/asesores', 'Asesores'], ['/empresas', 'Todas las empresas'], ['/denuncias', 'Denuncias']].map(([to, l]) => (
              <Link key={to} to={to} className="flex items-center justify-between border-b border-[#F1E7ED] py-3.5 text-[15px] font-semibold last:border-0">{l}<Svg name="chevron" size={18} className="text-tinta-suave" /></Link>
            ))}
          </div>
        )}
        <div className="card px-4">
          {[['/avisos', 'Avisos'], ['/ayuda', 'Ayuda y reportes'], ['/tutoriales', 'Tutoriales'], ['/legal/terminos', 'Términos de uso'], ['/legal/privacidad', 'Política de privacidad']].map(([to, l]) => (
            <Link key={to} to={to} className="flex items-center justify-between border-b border-[#F1E7ED] py-3.5 text-[15px] font-semibold last:border-0">{l}<Svg name="chevron" size={18} className="text-tinta-suave" /></Link>
          ))}
        </div>
        {hint && <p className="hint">{hint}</p>}
        <button className="btn-sec" onClick={signOut}>Cerrar sesión</button>
      </div>
    </Screen>
  )
}

const VST = { pending: ['Por verificar', 'bg-naranja-palido text-naranja-texto'], verified: ['Verificada', 'bg-[#EAF6EF] text-[#134A2B]'], rejected: ['Rechazada', 'bg-[#FEF3F2] text-[#912018]'], suspended: ['Suspendida', 'bg-[#F4EEF2] text-tinta-3'] }
// Acciones según el estado actual (antes se ofrecía «Verificar» incluso a empresas ya verificadas)
const ACTIONS = {
  pending: [['verified', 'Verificar', true], ['rejected', 'Rechazar'], ['suspended', 'Suspender']],
  verified: [['suspended', 'Suspender']],
  rejected: [['verified', 'Verificar', true]],
  suspended: [['verified', 'Reactivar', true]],
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

  const [cq, setCq] = useState('')
  const [cf, setCf] = useState('')
  const [climit, setClimit] = useState(40)
  const cqn = cq.trim().toLowerCase()
  const list = (companies || []).filter((c) => (tab === 'pending' ? c.verification_status === 'pending' : tab === 'all' ? (!cf || c.verification_status === cf) : false)
    && (!cqn || `${c.display_name} ${c.legal_name} ${c.rut} ${c.comuna} ${c.region} ${c.sector}`.toLowerCase().includes(cqn)))
  return (
    <Screen className="bg-[#FAF7F9]" wide>
      {section ? <div className="safe-t px-5 pb-3 pt-2 lg:px-8 lg:pt-6"><h1 className="text-[22px] font-bold">{TITLES[tab]}</h1></div> : <TopBar back="/" title="Administración" />}
      <div className={`flex flex-col gap-3 px-5 lg:px-8 ${section ? 'pb-28 lg:pb-10' : 'pb-10'}`}>
        <div className={`flex flex-wrap gap-1.5 ${section ? 'hidden' : ''}`}>
          {[['business', 'Negocio y planes'], ['promos', 'Destacados'], ['advisory', 'Asesorías'], ['candidates', 'Postulantes'], ['advisors', 'Asesores'], ['pending', 'Por verificar'], ['all', 'Todas'], ['reports', 'Denuncias']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`h-10 rounded-full border px-3 text-[13px] font-semibold ${tab === k ? 'border-morado bg-morado text-white' : 'border-linea bg-white'}`}>{l}</button>
          ))}
        </div>
        <ErrorBox>{err}</ErrorBox>
        {tab === 'business' ? <Business /> : tab === 'feedback' ? <Feedback /> : tab === 'promos' ? <Promos /> : tab === 'advisory' ? <Advisory /> : tab === 'candidates' ? <Candidates /> : tab === 'advisors' ? <Advisors /> : companies == null ? <Spinner /> : tab === 'reports' ? (
          reports.length === 0 ? <Empty title="Sin denuncias">Todo tranquilo.</Empty> : reports.map((r) => (
            <div key={r.id} className="card flex flex-col gap-2 p-3.5 text-sm">
              <span className="text-xs text-tinta-suave">{new Date(r.created_at).toLocaleString('es-CL')} · {r.status === 'open' ? 'Abierta' : 'Revisada'}</span>
              <p>{r.reason}</p>
              <span className="text-xs text-tinta-suave">Match: {r.match_id || '—'}</span>
              {r.status === 'open' && <button className="btn-sm self-start border border-linea bg-white" onClick={() => closeReport(r.id)}>Marcar revisada</button>}
            </div>
          ))
        ) : (
          <>
            {tab === 'all' && (
              <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
                <input className="input h-11" placeholder="Buscar por nombre, razón social, RUT o comuna" value={cq} onChange={(e) => { setCq(e.target.value); setClimit(40) }} />
                <select className="input h-11" value={cf} onChange={(e) => { setCf(e.target.value); setClimit(40) }}>
                  <option value="">Todos los estados</option>{Object.entries(VST).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
            )}
            {tab === 'all' && <span className="text-xs text-tinta-suave">{list.length} empresas</span>}
            {list.length === 0 ? <Empty title={tab === 'pending' ? 'Nada pendiente' : 'Sin resultados'}>{tab === 'pending' ? 'No hay empresas esperando verificación.' : 'Prueba con otra búsqueda o estado.'}</Empty> : list.slice(0, climit).map((c) => {
              const st = VST[c.verification_status] || [c.verification_status, 'bg-[#F4EEF2]']
              const acts = ACTIONS[c.verification_status] || []
              return (
                <div key={c.id} className="card flex flex-col gap-2 p-3.5 text-sm">
                  <div className="flex items-start justify-between gap-2"><b>{c.display_name}</b><span className={`pill shrink-0 ${st[1]}`}>{st[0]}</span></div>
                  {(c.kind === 'consultora' || c.parent_id) && (
                    <span className="flex flex-wrap gap-1.5">
                      {c.kind === 'consultora' && <span className="pill bg-[#F7F0FB] text-[#4A2163]">Consultora · {(companies || []).filter((k) => k.parent_id === c.id).length} cliente(s)</span>}
                      {c.parent_id && <span className="pill bg-[#F7F0FB] text-[#4A2163]">Cliente de {(companies || []).find((k) => k.id === c.parent_id)?.display_name || 'una consultora'}</span>}
                    </span>
                  )}
                  <span>{c.legal_name} · RUT {c.rut}</span>
                  <span className="text-tinta-3">{[c.sector, c.size, c.comuna, c.region].filter(Boolean).join(' · ')}</span>
                  {c.verification_status === 'pending' && <a className="text-rosa-texto underline" href={`https://www.google.com/search?q=${encodeURIComponent(c.rut + ' ' + c.legal_name)}`} target="_blank" rel="noreferrer">Buscar RUT en la web</a>}
                  {acts.length > 0 && <input className="input h-11" placeholder="Nota para la empresa (opcional)" value={notes[c.id] || ''} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} />}
                  {acts.length > 0 && (
                    <div className={`grid gap-2 ${acts.length === 3 ? 'grid-cols-3' : acts.length === 2 ? 'grid-cols-2' : 'grid-cols-1 sm:max-w-[220px]'}`}>
                      {acts.map(([to, label, main]) => <button key={to} className={`btn-sm ${main ? 'bg-[#1E6B3F] text-white' : 'border border-linea bg-white'}`} onClick={() => decide(c.id, to)}>{label}</button>)}
                    </div>
                  )}
                </div>
              )
            })}
            {list.length > climit && <button className="btn-sec" onClick={() => setClimit(climit + 40)}>Ver más ({list.length - climit} restantes)</button>}
          </>
        )}
      </div>
    </Screen>
  )
}
