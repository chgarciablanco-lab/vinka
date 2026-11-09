import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { ErrorBox, Screen, Spinner, Toast, TopBar } from '../../components/ui'
import { FeaturedBadge, PROMO_STATUS, SOURCE_TXT, clp, daysLeft, iva } from '../../lib/promo'

const fmt = (d) => (d ? new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : '—')

function Results({ r, baseline, days }) {
  const perDay = days > 0 ? Math.round((r.actions / days) * 10) / 10 : 0
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      {[['Apariciones', r.impressions], ['Clics', r.clicks], ['Postulaciones', r.actions]].map(([l, v]) => (
        <div key={l} className="rounded-xl bg-[#FAF7F9] px-2 py-2.5"><div className="font-display text-[20px] font-bold">{Number(v).toLocaleString('es-CL')}</div><div className="text-[11px] text-tinta-3">{l}</div></div>
      ))}
      {baseline != null && <p className="col-span-3 text-left text-xs text-tinta-3">{perDay} postulaciones por día con destacado vs. {baseline} por día sin destacado.</p>}
    </div>
  )
}

/** Destacar una vacante: usar un destacado del plan o comprar uno (7, 15 o 30 días) y ver su rendimiento. */
export default function Promote() {
  const { id } = useParams()
  const { company } = useAuth()
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const canManage = company?.member_role !== 'viewer'

  const load = useCallback(() => {
    supabase.rpc('job_promotions', { p_job: id }).then(({ data, error }) => { if (error) setErr(errMsg(error)); setD(data) })
  }, [id])
  useEffect(() => { load() }, [load])

  const ask = async (useCredit) => {
    setErr(''); setBusy(true)
    const { data, error } = await supabase.rpc('request_promotion', { p_product: useCredit ? null : pick, p_job: id, p_use_credit: useCredit, p_consent: false })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setPick('')
    setToast(data?.status === 'activa' ? `¡Listo! Tu vacante está destacada por ${data.days} días.` : 'Solicitud enviada. VINKA te contactará para el pago y la activará apenas se confirme.')
    load()
  }
  const stop = async (pid, pending) => {
    setErr('')
    const { error } = await supabase.rpc('stop_promotion', { p_id: pid })
    if (error) return setErr(errMsg(error))
    setToast(pending ? 'Solicitud cancelada.' : 'Destacado detenido.'); load()
  }

  if (!d) return <Screen><TopBar back="/" title="Destacar vacante" />{err ? <div className="px-6"><ErrorBox>{err}</ErrorBox></div> : <Spinner />}</Screen>
  const open = d.items.find((x) => ['solicitada', 'activa', 'pausada'].includes(x.status))
  const left = Math.max(0, d.plan.credits - d.plan.used)
  const published = d.job.status === 'published'
  const product = d.products?.find((x) => x.id === pick)
  return (
    <Screen className="bg-[#FAF7F9]" wide>
      <TopBar back="/" title="Destacar vacante" />
      <div className="flex flex-col gap-4 px-5 pb-10 lg:grid lg:grid-cols-2 lg:items-start lg:px-8">
        <div className="flex flex-col gap-4">
          <div className="card flex flex-col gap-2 p-4">
            <span className="text-xs text-tinta-3">Vacante</span>
            <span className="text-[17px] font-semibold">{d.job.title}</span>
            <p className="text-sm leading-relaxed text-tinta-2">Una vacante destacada aparece entre los primeros resultados, con la etiqueta <FeaturedBadge className="mx-0.5 align-middle" />, solo para personas a quienes ya calza. También puede aparecer en la página principal de VINKA. No cambia cómo se evalúa a nadie y nunca oculta las demás vacantes.</p>
          </div>

          {open && (
            <div className="card flex flex-col gap-3 border-2 border-[#E6C66A] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-semibold">Destacado actual</span>
                <span className={`pill ${PROMO_STATUS[open.status][1]}`}>{PROMO_STATUS[open.status][0]}</span>
              </div>
              {open.status === 'activa' && <span className="text-sm">Quedan <b>{daysLeft(open.ends_at)} día(s)</b> · termina el {fmt(open.ends_at)} · {SOURCE_TXT[open.source]}</span>}
              {open.status === 'pausada' && <span className="text-sm text-tinta-2">{open.paused_by === 'job' ? 'Está en pausa porque la vacante no está publicada. Al volver a publicarla, sigue con los días que le quedaban.' : 'VINKA lo pausó. Escríbenos si tienes dudas.'}</span>}
              {open.status === 'solicitada' && <span className="text-sm text-tinta-2">Total {clp(open.total)} ({clp(open.net)} + IVA {clp(open.iva)}). VINKA te contactará para el pago; se activa apenas se confirme.</span>}
              {open.status !== 'solicitada' && <Results r={open.results} days={Math.max(1, open.days - (open.status === 'activa' ? daysLeft(open.ends_at) : 0))} baseline={d.baseline?.actions_per_day} />}
              {canManage && <button className="btn-sm self-start border border-linea bg-white" onClick={() => stop(open.id, open.status === 'solicitada')}>{open.status === 'solicitada' ? 'Cancelar solicitud' : 'Detener destacado'}</button>}
            </div>
          )}

          {!open && canManage && (
            !published ? <div className="card p-4 text-sm text-tinta-2">Publica la vacante para poder destacarla.</div> : (
              <>
                {d.plan.credits > 0 && (
                  <div className="card flex flex-col gap-2 p-4">
                    <span className="text-[15px] font-semibold">Incluido en tu plan {d.plan.name}</span>
                    <span className="text-sm text-tinta-2">Te {left === 1 ? 'queda' : 'quedan'} <b>{left} de {d.plan.credits}</b> destacado(s) de {d.plan.days} días este mes.</span>
                    <button className="btn self-start" disabled={busy || left === 0} onClick={() => ask(true)}>{left === 0 ? 'Ya usaste los de este mes' : `Destacar ${d.plan.days} días sin costo`}</button>
                  </div>
                )}
                <div className="card flex flex-col gap-3 p-4">
                  <span className="text-[15px] font-semibold">{d.plan.credits > 0 ? 'O compra un destacado' : 'Compra un destacado'}</span>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(d.products || []).map((x) => (
                      <button key={x.id} onClick={() => setPick(x.id)} className={`flex flex-col items-start gap-0.5 rounded-xl border-2 p-3 text-left ${pick === x.id ? 'border-rosa-accion bg-rosa-palido' : 'border-linea bg-white'}`}>
                        <span className="text-[15px] font-bold">{x.days} días</span>
                        <span className="text-sm font-semibold">{clp(x.price_clp)} + IVA</span>
                        <span className="text-[11px] text-tinta-3">Total {clp(x.price_clp + iva(x.price_clp))}</span>
                      </button>
                    ))}
                  </div>
                  {product && <p className="text-sm text-tinta-2">{product.name}: {clp(product.price_clp)} + IVA {clp(iva(product.price_clp))} = <b>{clp(product.price_clp + iva(product.price_clp))}</b>. Por ahora el pago se coordina con VINKA (transferencia); empieza a correr al activarse.</p>}
                  <button className="btn" disabled={!pick || busy} onClick={() => ask(false)}>Solicitar destacado</button>
                  {d.plan.credits === 0 && <Link to="/plan" className="text-xs font-semibold text-rosa-texto">Los planes Pyme, Equipo y Empresa incluyen destacados cada mes ›</Link>}
                </div>
              </>
            )
          )}
          <ErrorBox>{err}</ErrorBox>
        </div>

        <div className="card flex flex-col gap-2 p-4">
          <span className="text-[15px] font-semibold">Historial</span>
          {d.items.length === 0 ? <span className="text-sm text-tinta-3">Esta vacante aún no ha sido destacada.</span> : d.items.map((x) => (
            <div key={x.id} className="flex flex-col gap-1 border-b border-[#F1E7ED] pb-2 text-sm last:border-0">
              <div className="flex items-center justify-between gap-2"><b>{x.days} días · {SOURCE_TXT[x.source]}</b><span className={`pill ${PROMO_STATUS[x.status][1]}`}>{PROMO_STATUS[x.status][0]}</span></div>
              <span className="text-xs text-tinta-3">{x.starts_at ? `${fmt(x.starts_at)} → ${fmt(x.ends_at)}` : `Pedido el ${fmt(x.created_at)}`}{x.total ? ` · ${clp(x.total)} con IVA` : ''}</span>
              {x.starts_at && <span className="text-xs text-tinta-2">{x.results.impressions} apariciones · {x.results.clicks} clics · {x.results.actions} postulaciones</span>}
            </div>
          ))}
        </div>
      </div>
      <Toast msg={toast} onDone={() => setToast('')} />
    </Screen>
  )
}
