import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { ErrorBox, Screen, Spinner, Toast, TopBar } from '../../components/ui'
import { FeaturedBadge, PROMO_STATUS, SOURCE_TXT, clp, daysLeft } from '../../lib/promo'
import { pl, plw } from '../../lib/text'
import { Checkout } from '../../components/Checkout'

const fmt = (d) => (d ? new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : '—')

/** Perfil destacado: aparecer entre los primeros cuando una empresa busca personas para una vacante que te calza. */
export default function Visibility() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState('')
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [payId, setPayId] = useState(null)

  const load = useCallback(() => { supabase.rpc('my_profile_promotion').then(({ data, error }) => { if (error) setErr(errMsg(error)); setD(data) }) }, [])
  useEffect(() => { load() }, [load])

  const ask = async () => {
    setErr(''); setBusy(true)
    const { data, error } = await supabase.rpc('request_promotion', { p_product: pick, p_job: null, p_use_credit: false, p_consent: ok })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setPick(''); setOk(false)
    if (data?.status === 'solicitada' && data?.id) { setPayId(data.id); load(); return }
    setToast(data?.renewal ? 'Renovación solicitada. Al confirmarse el pago, los días se suman al final de tu destacado actual.' : 'Solicitud enviada. VINKA te contactará para el pago y lo activará apenas se confirme.'); load()
  }
  const stop = async (id, pending) => {
    setErr('')
    const { error } = await supabase.rpc('stop_promotion', { p_id: id })
    if (error) return setErr(errMsg(error))
    setToast(pending ? 'Solicitud cancelada.' : 'Listo, tu perfil ya no está destacado.'); load()
  }

  if (!d) return <Screen><TopBar back="/perfil" title="Perfil destacado" />{err ? <div className="px-6"><ErrorBox>{err}</ErrorBox></div> : <Spinner />}</Screen>
  const open = d.items.find((x) => ['solicitada', 'activa', 'pausada'].includes(x.status) && !x.renews_id)
  const renewal = d.items.find((x) => x.status === 'solicitada' && x.renews_id)
  const msLeft = open?.status === 'activa' ? new Date(open.ends_at) - Date.now() : Infinity
  const canRenew = open?.status === 'activa' && msLeft <= 3 * 86400000 && !renewal && d.is_public
  const chooser = (title, label) => (
    <>
      <span className="text-[15px] font-semibold">{title}</span>
      <div className="grid grid-cols-3 gap-2">
        {(d.products || []).map((x) => (
          <button key={x.id} onClick={() => setPick(x.id)} className={`flex flex-col items-start gap-0.5 rounded-xl border-2 p-3 text-left ${pick === x.id ? 'border-rosa-accion bg-rosa-palido' : 'border-linea bg-white'}`}>
            <span className="text-[15px] font-bold">{canRenew ? '+' : ''}{x.days} días</span>
            <span className="text-sm font-semibold">{clp(x.price_clp)}</span>
            <span className="text-[11px] text-tinta-3">IVA incluido</span>
          </button>
        ))}
      </div>
      <label className="flex items-start gap-2.5 text-sm leading-snug">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#D02E72]" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>Acepto que VINKA muestre mi perfil con más frecuencia a empresas verificadas durante este período. Puedo desactivarlo cuando quiera.</span>
      </label>
      {product && <p className="text-sm text-tinta-2">{product.name}: <b>{clp(product.price_clp)}</b>, pago único con IVA incluido. Pagas con tarjeta en el paso siguiente.</p>}
      <button className="btn" disabled={!pick || !ok || busy} onClick={ask}>{label}</button>
    </>
  )
  const product = d.products?.find((x) => x.id === pick)
  return (
    <Screen className="bg-[#FAF7F9]" wide>
      <TopBar back="/perfil" title="Perfil destacado" />
      <div className="flex flex-col gap-4 px-5 pb-10 lg:mx-auto lg:max-w-2xl">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[22px] font-bold leading-tight">Aparece entre los primeros cuando una empresa busca personas</h1>
          <p className="text-sm leading-relaxed text-tinta-2">Con el perfil destacado, las empresas verificadas te ven antes, con la etiqueta <FeaturedBadge kind="profile" className="mx-0.5 align-middle" />, cuando buscan personas para una vacante que te calza.</p>
        </div>
        <div className="card flex flex-col gap-1.5 p-4 text-sm leading-relaxed text-tinta-2">
          <span className="text-[15px] font-semibold text-tinta">Lo que sí y lo que no</span>
          <span>✓ Postular, buscar vacantes y hacer match sigue siendo gratis, siempre.</span>
          <span>✓ Solo cambia tu posición en las listas; tus datos de contacto siguen protegidos.</span>
          <span>✗ No cambia cómo te evalúan las empresas ni ningún puntaje.</span>
          <span>✗ No te muestra en vacantes que no corresponden a tu perfil.</span>
        </div>

        {open ? (
          <div className="card flex flex-col gap-3 border-2 border-[#E6C66A] p-4">
            <div className="flex items-center justify-between gap-2"><span className="text-[15px] font-semibold">Tu perfil destacado</span><span className={`pill ${PROMO_STATUS[open.status][1]}`}>{PROMO_STATUS[open.status][0]}</span></div>
            {open.status === 'activa' && <span className="text-sm">{plw(daysLeft(open.ends_at), 'Queda', 'Quedan')} <b>{pl(daysLeft(open.ends_at), 'día', 'días')}</b> · termina el {fmt(open.ends_at)}</span>}
            {open.status === 'solicitada' && <span className="text-sm text-tinta-2">Total {clp(open.total)} (IVA incluido). Pendiente de pago: empieza a correr apenas se apruebe.</span>}
            {open.status === 'solicitada' && <button className="btn self-start" onClick={() => setPayId(open.id)}>Pagar {clp(open.total)} con tarjeta</button>}
            {open.status === 'pausada' && <span className="text-sm text-tinta-2">{open.paused_by === 'profile' ? 'Está en pausa porque ocultaste tu perfil. Al volver a mostrarlo sigue con los días que le quedaban.' : 'VINKA lo pausó. Escríbenos si tienes dudas.'}</span>}
            {open.status !== 'solicitada' && (
              <div className="grid grid-cols-3 gap-2 text-center">
                {[['Apariciones', open.results.impressions], ['Empresas que lo abrieron', open.results.clicks], ['Empresas interesadas', open.results.actions]].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-[#FAF7F9] px-2 py-2.5"><div className="font-display text-[20px] font-bold">{v}</div><div className="text-[11px] leading-tight text-tinta-3">{l}</div></div>
                ))}
              </div>
            )}
            <button className="btn-sm self-start border border-linea bg-white" onClick={() => stop(open.id, open.status === 'solicitada')}>{open.status === 'solicitada' ? 'Cancelar solicitud' : 'Desactivar ahora'}</button>
            {open.status === 'activa' && !canRenew && !renewal && <span className="text-xs text-tinta-3">Podrás renovarlo desde el {fmt(new Date(new Date(open.ends_at) - 3 * 86400000))}; los días se suman al final.</span>}
          </div>
        ) : !d.is_public ? (
          <div className="card flex flex-col gap-2 p-4 text-sm text-tinta-2">
            <span>Tu perfil está oculto para empresas, así que no se puede destacar. Si quieres, actívalo en <b>Privacidad</b>.</span>
            <Link to="/perfil" className="btn-sm self-start border border-linea bg-white">Ir a mi perfil</Link>
          </div>
        ) : (
          <div className="card flex flex-col gap-3 p-4">
            {chooser('Elige cuántos días', 'Continuar al pago')}
          </div>
        )}
        {renewal && (
          <div className="card flex flex-col gap-2 border-2 border-[#F5C892] p-4">
            <span className="text-[15px] font-semibold">Renovación solicitada</span>
            <span className="text-sm text-tinta-2">{renewal.days} días por {clp(renewal.total)} (IVA incluido). Al aprobarse el pago, se suman al final de tu destacado actual.</span>
            <button className="btn self-start" onClick={() => setPayId(renewal.id)}>Pagar {clp(renewal.total)} con tarjeta</button>
            <button className="btn-sm self-start border border-linea bg-white" onClick={() => stop(renewal.id, true)}>Cancelar renovación</button>
          </div>
        )}
        {canRenew && (
          <div className="card flex flex-col gap-3 border-2 border-rosa-accion p-4">
            <span className="text-sm text-tinta-2">Tu destacado termina el <b>{fmt(open.ends_at)}</b>. Si lo renuevas ahora, los días nuevos se suman al final: no pierdes ninguno.</span>
            {chooser('Renueva tu perfil destacado', 'Renovar y pagar')}
          </div>
        )}
        <ErrorBox>{err}</ErrorBox>

        {d.items.filter((x) => x !== open && x !== renewal).length > 0 && (
          <div className="card flex flex-col gap-2 p-4">
            <span className="text-[15px] font-semibold">Historial</span>
            {d.items.filter((x) => x !== open && x !== renewal).map((x) => (
              <div key={x.id} className="flex items-center justify-between gap-2 border-b border-[#F1E7ED] pb-2 text-sm last:border-0">
                <span className="flex flex-col"><b>{pl(x.days, 'día', 'días')} · {SOURCE_TXT[x.source]}</b><span className="text-xs text-tinta-3">{x.starts_at ? `${fmt(x.starts_at)} → ${fmt(x.ends_at)} · ${pl(x.results.actions, 'empresa', 'empresas')} interesadas` : `Pedido el ${fmt(x.created_at)}`}</span></span>
                <span className={`pill ${PROMO_STATUS[x.status][1]}`}>{PROMO_STATUS[x.status][0]}</span>
              </div>
            ))}
          </div>
        )}
        <Link to="/asesoria" className="text-center text-sm font-semibold text-rosa-texto">¿Quieres ayuda con tu CV o tu búsqueda? Mira las asesorías ›</Link>
      </div>
      {payId && <Checkout kind="promocion" refId={payId} onClose={() => { setPayId(null); load() }} onDone={() => { setPayId(null); setToast('Pago aprobado: tu perfil ya está destacado'); load() }} />}
      <Toast msg={toast} onDone={() => setToast('')} />
    </Screen>
  )
}
