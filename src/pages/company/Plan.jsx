import { useCallback, useEffect, useState } from 'react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { ErrorBox, Screen, Spinner, Toast, TopBar } from '../../components/ui'
import { pl, plw } from '../../lib/text'

const STATUS = { trial: 'Prueba gratuita', active: 'Activo', past_due: 'Pago pendiente', canceled: 'Cancelado' }
const money = (n) => (n == null ? 'Cotización' : n === 0 ? 'Gratis' : `$${n.toLocaleString('es-CL')} + IVA / mes`)
const lim = (n, unit) => (n == null ? `${unit} sin límite` : `${n} ${unit}`)
const fmt = (d) => new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })

function Meter({ label, used, max }) {
  const pct = max == null ? 0 : Math.min(100, Math.round((used / Math.max(1, max)) * 100))
  const full = max != null && used >= max
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-sm"><span>{label}</span><span className={`font-semibold ${full ? 'text-[#912018]' : ''}`}>{used}{max == null ? '' : ` de ${max}`}</span></div>
      {max != null && <div className="h-2 overflow-hidden rounded-full bg-[#F1E7ED]" role="progressbar" aria-valuenow={used} aria-valuemax={max} aria-label={label}><div className={`h-full rounded-full ${full ? 'bg-[#C0362C]' : 'bg-rosa-accion'}`} style={{ width: `${pct}%` }} /></div>}
    </div>
  )
}

/** Plan y uso de la empresa: límites vigentes, consumo del mes y solicitud de cambio de plan. */
export default function Plan() {
  const { company } = useAuth()
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const isAdmin = ['owner', 'admin'].includes(company?.member_role)

  const load = useCallback(() => {
    supabase.rpc('company_plan', { p_company: company.id }).then(({ data, error }) => { if (error) setErr(errMsg(error)); setD(data) })
  }, [company])
  useEffect(() => { load() }, [load])

  const request = async () => {
    setErr(''); setBusy(true)
    const { error } = await supabase.rpc('request_plan_change', { p_company: company.id, p_plan: pick, p_message: msg })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setPick(''); setMsg(''); setToast('Solicitud enviada. Te contactaremos para activar el plan.')
  }

  if (!d) return <Screen><TopBar back="/vitrina" title="Plan y uso" />{err ? <div className="px-6"><ErrorBox>{err}</ErrorBox></div> : <Spinner />}</Screen>
  const p = d.plan
  return (
    <Screen className="bg-[#FAF7F9]" wide>
      <TopBar back="/vitrina" title="Plan y uso" />
      <div className="flex flex-col gap-4 px-5 pb-10 lg:grid lg:grid-cols-2 lg:items-start lg:px-8">
        <div className="flex flex-col gap-4">
          <div className="card flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col"><span className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">Tu plan</span><span className="font-display text-[26px] font-bold leading-tight">{p.name}</span><span className="text-sm text-tinta-3">{money(p.price_clp)}</span></div>
              <span className={`pill ${d.status === 'past_due' ? 'bg-[#FEF3F2] text-[#912018]' : d.status === 'trial' ? 'bg-naranja-palido text-naranja-texto' : 'bg-[#EAF6EF] text-[#134A2B]'}`}>{STATUS[d.status] || d.status}</span>
            </div>
            {d.status === 'trial' && d.trial_ends_at && <p className="text-sm text-tinta-2">Tu prueba termina el <b>{fmt(d.trial_ends_at)}</b>. Después pasarás al plan Gratis sin perder datos, salvo que elijas un plan.</p>}
            {d.status === 'active' && d.current_period_end && <p className="text-sm text-tinta-2">Período pagado hasta el <b>{fmt(d.current_period_end)}</b>.</p>}
            {d.status === 'past_due' && <p className="text-sm text-[#912018]">Hay un pago pendiente. Escríbenos para regularizarlo y evitar que tu cuenta pase al plan Gratis.</p>}
          </div>
          <div className="card flex flex-col gap-4 p-4">
            <span className="text-[15px] font-semibold">Uso de este mes</span>
            {(d.managed_by || d.clients > 0) && <p className="rounded-xl bg-[#F7F0FB] px-3 py-2 text-sm leading-snug text-[#4A2163]">El uso suma {d.managed_by ? `${d.managed_by} (matriz) y todas sus empresas clientes` : `tu consultora y ${plw(d.clients, 'su', 'sus')} ${pl(d.clients, 'empresa cliente', 'empresas clientes')}`}: el plan es uno solo para todo el grupo.</p>}
            <Meter label="Vacantes publicadas a la vez" used={d.usage.jobs} max={p.max_active_jobs} />
            {p.max_active_jobs != null && d.usage.jobs > p.max_active_jobs && <p className="rounded-xl bg-naranja-palido px-3 py-2 text-sm text-[#4A2A00]">Tienes {pl(d.usage.jobs - p.max_active_jobs, 'vacante', 'vacantes')} más de las que permite tu plan. Pausa alguna o cambia de plan; mientras tanto no podrás publicar nuevas.</p>}
            <Meter label="Personas en el equipo" used={d.usage.members} max={p.max_members} />
            <Meter label="Consultas de IA del mes" used={d.usage.ai} max={p.ai_monthly} />
            {p.promo_credits > 0 && <Meter label={`Destacados incluidos (${p.promo_days} días c/u)`} used={d.usage.promos || 0} max={p.promo_credits} />}
            <p className="hint">Cada uso de la IA queda registrado en el historial del candidato. Al llegar a un límite, VINKA te avisa y no se pierde nada.</p>
            <p className="hint">Destacar una vacante la muestra entre los primeros resultados para las personas a quienes calza; no cambia cómo se evalúa a nadie. {p.promo_credits > 0 ? 'Úsalos desde cada vacante en el Panel.' : 'Con plan Gratis puedes comprar destacados sueltos desde cada vacante.'}</p>
          </div>
        </div>
        {d.managed_by ? (
          <div className="card flex flex-col gap-2 p-4">
            <span className="text-[15px] font-semibold">Plan administrado por {d.managed_by}</span>
            <p className="text-sm leading-relaxed text-tinta-2">Esta empresa es cliente de la consultora <b>{d.managed_by}</b>, que es la cuenta matriz. El plan, los pagos y los límites se manejan desde la matriz; aquí no hay nada que pagar ni cambiar.</p>
          </div>
        ) : (
        <div className="flex flex-col gap-3">
          <span className="text-[15px] font-semibold">Planes</span>
          {(d.plans || []).map((x) => (
            <div key={x.id} className={`card flex flex-col gap-2 p-4 ${x.id === p.id ? 'border-2 border-rosa-accion' : ''}`}>
              <div className="flex items-baseline justify-between gap-2"><span className="text-[17px] font-bold">{x.name}</span><span className="text-sm font-semibold text-tinta-2">{money(x.price_clp)}</span></div>
              <span className="text-sm text-tinta-3">{lim(x.max_active_jobs, x.max_active_jobs === 1 ? 'vacante publicada' : 'vacantes publicadas')} · {lim(x.max_members, x.max_members === 1 ? 'persona' : 'personas')} · {x.ai_monthly} consultas de IA al mes · {x.promo_credits ? `${x.promo_credits} ${x.promo_credits === 1 ? 'destacado' : 'destacados'} de ${x.promo_days} días al mes` : 'destacados sueltos desde $4.990 + IVA'}</span>
              {x.id === p.id ? <span className="text-xs font-semibold text-rosa-texto">Plan actual</span>
                : isAdmin && <button className="btn-sm self-start border border-rosa-accion bg-white text-rosa-texto" onClick={() => setPick(x.id)}>{x.price_clp == null ? 'Pedir cotización' : 'Cambiar a este plan'}</button>}
            </div>
          ))}
          {pick && (
            <div className="card flex flex-col gap-3 p-4">
              <span className="text-[15px] font-semibold">Solicitar plan {d.plans.find((x) => x.id === pick)?.name}</span>
              <textarea className="textarea h-24" maxLength={500} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Cuéntanos si necesitas factura, datos de facturación u otra cosa (opcional)" />
              <p className="hint">El equipo de VINKA te contactará para activar el plan y coordinar el pago.</p>
              <div className="grid grid-cols-2 gap-2"><button className="btn-sec" onClick={() => setPick('')}>Cancelar</button><button className="btn" disabled={busy} onClick={request}>Enviar solicitud</button></div>
            </div>
          )}
          {!isAdmin && <p className="hint">Solo quien administra la empresa puede cambiar el plan.</p>}
          <ErrorBox>{err}</ErrorBox>
        </div>
        )}
      </div>
      <Toast msg={toast} onDone={() => setToast('')} />
    </Screen>
  )
}
