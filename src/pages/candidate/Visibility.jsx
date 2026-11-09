import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { ErrorBox, Screen, Spinner, Toast, TopBar } from '../../components/ui'
import { FeaturedBadge, PROMO_STATUS, SOURCE_TXT, clp, daysLeft } from '../../lib/promo'

const fmt = (d) => (d ? new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : '—')

/** Perfil destacado: aparecer entre los primeros cuando una empresa busca personas para una vacante que te calza. */
export default function Visibility() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState('')
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  const load = useCallback(() => { supabase.rpc('my_profile_promotion').then(({ data, error }) => { if (error) setErr(errMsg(error)); setD(data) }) }, [])
  useEffect(() => { load() }, [load])

  const ask = async () => {
    setErr(''); setBusy(true)
    const { error } = await supabase.rpc('request_promotion', { p_product: pick, p_job: null, p_use_credit: false, p_consent: ok })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setPick(''); setOk(false); setToast('Solicitud enviada. VINKA te contactará para el pago y lo activará apenas se confirme.'); load()
  }
  const stop = async (id, pending) => {
    setErr('')
    const { error } = await supabase.rpc('stop_promotion', { p_id: id })
    if (error) return setErr(errMsg(error))
    setToast(pending ? 'Solicitud cancelada.' : 'Listo, tu perfil ya no está destacado.'); load()
  }

  if (!d) return <Screen><TopBar back="/perfil" title="Perfil destacado" />{err ? <div className="px-6"><ErrorBox>{err}</ErrorBox></div> : <Spinner />}</Screen>
  const open = d.items.find((x) => ['solicitada', 'activa', 'pausada'].includes(x.status))
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
            {open.status === 'activa' && <span className="text-sm">Quedan <b>{daysLeft(open.ends_at)} día(s)</b> · termina el {fmt(open.ends_at)}</span>}
            {open.status === 'solicitada' && <span className="text-sm text-tinta-2">Total {clp(open.total)} (IVA incluido). VINKA te contactará para el pago; empieza a correr cuando se active.</span>}
            {open.status === 'pausada' && <span className="text-sm text-tinta-2">VINKA lo pausó. Escríbenos si tienes dudas.</span>}
            {open.status !== 'solicitada' && (
              <div className="grid grid-cols-3 gap-2 text-center">
                {[['Apariciones', open.results.impressions], ['Empresas que lo abrieron', open.results.clicks], ['Empresas interesadas', open.results.actions]].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-[#FAF7F9] px-2 py-2.5"><div className="font-display text-[20px] font-bold">{v}</div><div className="text-[11px] leading-tight text-tinta-3">{l}</div></div>
                ))}
              </div>
            )}
            <button className="btn-sm self-start border border-linea bg-white" onClick={() => stop(open.id, open.status === 'solicitada')}>{open.status === 'solicitada' ? 'Cancelar solicitud' : 'Desactivar ahora'}</button>
          </div>
        ) : !d.is_public ? (
          <div className="card flex flex-col gap-2 p-4 text-sm text-tinta-2">
            <span>Tu perfil está oculto para empresas, así que no se puede destacar. Si quieres, actívalo en <b>Privacidad</b>.</span>
            <Link to="/perfil" className="btn-sm self-start border border-linea bg-white">Ir a mi perfil</Link>
          </div>
        ) : (
          <div className="card flex flex-col gap-3 p-4">
            <span className="text-[15px] font-semibold">Elige cuántos días</span>
            <div className="grid grid-cols-3 gap-2">
              {(d.products || []).map((x) => (
                <button key={x.id} onClick={() => setPick(x.id)} className={`flex flex-col items-start gap-0.5 rounded-xl border-2 p-3 text-left ${pick === x.id ? 'border-rosa-accion bg-rosa-palido' : 'border-linea bg-white'}`}>
                  <span className="text-[15px] font-bold">{x.days} días</span>
                  <span className="text-sm font-semibold">{clp(x.price_clp)}</span>
                  <span className="text-[11px] text-tinta-3">IVA incluido</span>
                </button>
              ))}
            </div>
            <label className="flex items-start gap-2.5 text-sm leading-snug">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#D02E72]" checked={ok} onChange={(e) => setOk(e.target.checked)} />
              <span>Acepto que VINKA muestre mi perfil con más frecuencia a empresas verificadas durante este período. Puedo desactivarlo cuando quiera.</span>
            </label>
            {product && <p className="text-sm text-tinta-2">{product.name}: <b>{clp(product.price_clp)}</b>, pago único con IVA incluido. Por ahora el pago se coordina con VINKA.</p>}
            <button className="btn" disabled={!pick || !ok || busy} onClick={ask}>Solicitar perfil destacado</button>
          </div>
        )}
        <ErrorBox>{err}</ErrorBox>

        {d.items.filter((x) => x !== open).length > 0 && (
          <div className="card flex flex-col gap-2 p-4">
            <span className="text-[15px] font-semibold">Historial</span>
            {d.items.filter((x) => x !== open).map((x) => (
              <div key={x.id} className="flex items-center justify-between gap-2 border-b border-[#F1E7ED] pb-2 text-sm last:border-0">
                <span className="flex flex-col"><b>{x.days} días · {SOURCE_TXT[x.source]}</b><span className="text-xs text-tinta-3">{x.starts_at ? `${fmt(x.starts_at)} → ${fmt(x.ends_at)} · ${x.results.actions} empresas interesadas` : `Pedido el ${fmt(x.created_at)}`}</span></span>
                <span className={`pill ${PROMO_STATUS[x.status][1]}`}>{PROMO_STATUS[x.status][0]}</span>
              </div>
            ))}
          </div>
        )}
        <Link to="/asesoria" className="text-center text-sm font-semibold text-rosa-texto">¿Quieres ayuda con tu CV o tu búsqueda? Mira las asesorías ›</Link>
      </div>
      <Toast msg={toast} onDone={() => setToast('')} />
    </Screen>
  )
}
