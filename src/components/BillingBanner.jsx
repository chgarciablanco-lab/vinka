import { Link } from 'react-router-dom'

const money = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`
const day = (d) => new Date(d).toLocaleDateString('es-CL', { timeZone: 'America/Santiago', weekday: 'long', day: 'numeric', month: 'long' })
const inDays = (n) => (n <= 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`)

/**
 * Aviso de cobro del plan para quien administra la empresa.
 * «upcoming»: faltan 5 días o menos para el vencimiento. «overdue»: venció y muestra cuándo se corta el servicio.
 */
export function BillingBanner({ billing, link = true }) {
  if (!billing || billing.state === 'ok') return null
  const b = billing
  const more = link && <Link to="/plan" className="self-start text-sm font-semibold underline">Ver plan y uso</Link>
  if (b.state === 'overdue') return (
    <div role="alert" className="flex flex-col gap-1.5 rounded-2xl border border-[#F4C7C3] bg-[#FEF3F2] p-3.5 text-[#912018]">
      <span className="text-[15px] font-bold">Pago vencido · el servicio se cortará {inDays(b.days_to_cut)}</span>
      <span className="text-[13px] leading-snug">Tu plan {b.plan} venció el <b>{day(b.due)}</b>. Si no registramos el pago de <b>{money(b.total)}</b> (IVA incluido), el <b>{day(b.cut_at)}</b> tu empresa pasará al plan Gratis: no pierdes datos, pero quedas con sus límites.</span>
      <span className="text-[13px] leading-snug">Si ya pagaste, avísanos a <a href="mailto:contacto@vinka.cl" className="font-semibold underline">contacto@vinka.cl</a>.</span>
      {more}
    </div>
  )
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-[#F5C892] bg-naranja-palido p-3.5 text-[#4A2A00]">
      <span className="text-[15px] font-bold text-[#6B3800]">Cobro de tu plan {b.plan} · vence {inDays(b.days_to_due)}</span>
      <span className="text-[13px] leading-snug">Vence el <b>{day(b.due)}</b>: <b>{money(b.total)}</b> IVA incluido ({money(b.net)} + IVA {money(b.iva)}). VINKA te enviará los datos de pago. Si ya pagaste, no necesitas hacer nada.</span>
      {more}
    </div>
  )
}
