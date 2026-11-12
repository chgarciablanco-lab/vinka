import { useEffect, useState } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { ErrorBox, Sheet } from './ui'

// Pago con tarjeta en MODO DEMOSTRACIÓN. Imita una pasarela chilena (crédito/débito, cuotas, comprobante),
// pero solo acepta tarjetas de prueba: el número completo nunca sale del teléfono, solo una clave de prueba.
export const TEST_CARDS = [
  { key: 'visa_ok', number: '4051885600446623', brand: 'Visa', type: 'credito', label: 'Visa crédito · aprobada' },
  { key: 'redcompra_ok', number: '4051884239937763', brand: 'Redcompra', type: 'debito', label: 'Redcompra débito · aprobada' },
  { key: 'mc_rechazo', number: '5186059559590568', brand: 'Mastercard', type: 'credito', label: 'Mastercard · rechazada por el banco' },
  { key: 'sin_fondos', number: '4000000000000002', brand: 'Visa', type: 'credito', label: 'Visa · sin fondos' },
]
const money = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`
const digits = (s) => String(s || '').replace(/\D/g, '')
const group = (s) => digits(s).slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
const brandOf = (n) => { const d = digits(n); return /^5[1-5]/.test(d) ? 'Mastercard' : /^3[47]/.test(d) ? 'American Express' : /^4/.test(d) ? 'Visa' : '' }
const INST = [1, 2, 3, 6, 12]

function CardFace({ number, name, exp, brand }) {
  return (
    <div className="relative flex h-[150px] shrink-0 flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-[#302538] to-[#6B2E8F] p-4 text-white shadow-md">
      <div className="flex items-start justify-between"><span className="h-7 w-10 rounded-md bg-[#E6C66A]/90" /><span className="text-[13px] font-bold italic tracking-wide">{brand || 'Tarjeta'}</span></div>
      <span className="font-mono text-[18px] tracking-[0.12em]">{group(number) || '•••• •••• •••• ••••'}</span>
      <div className="flex justify-between text-[11px] uppercase"><span className="truncate pr-3">{name || 'Nombre del titular'}</span><span>{exp || 'MM/AA'}</span></div>
      <span className="absolute right-3 top-10 rotate-[-8deg] rounded border border-white/60 px-1.5 text-[9px] font-bold tracking-wider text-white/80">DEMO</span>
    </div>
  )
}

/** Hoja de pago. kind: 'asesoria' | 'plan' | 'promocion'. onDone recibe el comprobante aprobado. */
export function Checkout({ kind, refId, plan = null, months = 1, onClose, onDone }) {
  const [q, setQ] = useState(null)
  const [err, setErr] = useState('')
  const [f, setF] = useState({ number: '', exp: '', cvv: '', name: '', type: 'credito', inst: 1 })
  const [step, setStep] = useState('form') // form | processing | result
  const [res, setRes] = useState(null)
  const [tests, setTests] = useState(true)

  useEffect(() => {
    supabase.rpc('checkout_quote', { p_kind: kind, p_ref: refId, p_plan: plan, p_months: months })
      .then(({ data, error }) => { if (error) setErr(errMsg(error)); else setQ(data) }, () => setErr('No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.'))
  }, [kind, refId, plan, months])

  const test = TEST_CARDS.find((c) => c.number === digits(f.number))
  const brand = test?.brand || brandOf(f.number)
  const useTest = (c) => { setErr(''); setF({ ...f, number: group(c.number), exp: '12/29', cvv: '123', name: f.name || 'Usuario de prueba', type: c.type, inst: c.type === 'debito' ? 1 : f.inst }) }
  const setExp = (v) => { const d = digits(v).slice(0, 4); setF({ ...f, exp: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d }) }

  const pay = async () => {
    setErr('')
    if (digits(f.number).length < 15) return setErr('Ingresa el número de la tarjeta.')
    if (!test) return setErr('Estás en modo demostración: usa una de las tarjetas de prueba de abajo. No ingreses una tarjeta real.')
    const [mm, yy] = f.exp.split('/').map(Number)
    if (!mm || mm > 12 || yy == null || new Date(2000 + yy, mm) <= new Date()) return setErr('Revisa la fecha de vencimiento (MM/AA).')
    if (!/^\d{3,4}$/.test(f.cvv)) return setErr('Revisa el código de seguridad (CVV).')
    if (f.name.trim().length < 3) return setErr('Escribe el nombre del titular como aparece en la tarjeta.')
    if (test.type !== f.type) return setErr(`Esa tarjeta es de ${test.type === 'debito' ? 'débito' : 'crédito'}.`)
    setStep('processing')
    const started = Date.now()
    const { data, error } = await supabase.rpc('checkout_pay', { p_kind: kind, p_ref: refId, p_card: test.key, p_type: f.type, p_installments: f.type === 'debito' ? 1 : f.inst, p_plan: plan, p_months: months })
    await new Promise((r) => setTimeout(r, Math.max(0, 1800 - (Date.now() - started)))) // el banco "piensa"
    if (error) { setStep('form'); return setErr(errMsg(error)) }
    setRes(data); setStep('result')
  }
  const close = () => { if (step === 'processing') return; if (res?.status === 'aprobado') onDone(res); else onClose() }

  return (
    <Sheet open onClose={close} title={step === 'result' ? (res?.status === 'aprobado' ? 'Pago aprobado' : 'Pago rechazado') : 'Pagar con tarjeta'}>
      <div className="flex max-h-[78vh] flex-col gap-3 overflow-y-auto pb-5 text-sm">
        <div className="flex items-center justify-between rounded-xl bg-[#FFF4D6] px-3 py-2 text-[12px] font-semibold text-[#7A5200]">
          <span>Modo demostración · no se realiza ningún cargo</span><span aria-hidden>🔒</span>
        </div>
        {!q && !err && <span className="py-6 text-center text-tinta-3">Preparando el pago…</span>}
        {q && step !== 'result' && (
          <div className="flex flex-col gap-1 rounded-xl border border-linea p-3">
            <span className="text-[11px] uppercase tracking-wide text-tinta-suave">{q.merchant}</span>
            <span className="flex items-baseline justify-between gap-2"><b>{q.title}</b><span className="font-display text-xl font-bold">{money(q.total)}</span></span>
            <span className="text-[12px] text-tinta-3">{q.detail} · Neto {money(q.net)} + IVA {money(q.iva)}</span>
          </div>
        )}
        {q?.reason && <ErrorBox>{q.reason}</ErrorBox>}

        {q && !q.reason && step === 'form' && (
          <>
            <div className="flex shrink-0 flex-col gap-1.5 rounded-xl border border-dashed border-[#E6C66A] bg-[#FFFAEE] p-3">
              <button type="button" className="flex items-center justify-between text-left text-[13px] font-semibold" onClick={() => setTests(!tests)}>Tarjetas de prueba (toca una para usarla)<span>{tests ? '▴' : '▾'}</span></button>
              {tests && TEST_CARDS.map((c) => (
                <button key={c.key} type="button" onClick={() => useTest(c)} className={`flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-left text-[12px] ${test?.key === c.key ? 'ring-2 ring-rosa-accion' : ''}`}>
                  <span className="whitespace-nowrap font-mono">{group(c.number)}</span><span className="text-right text-tinta-3">{c.label}</span>
                </button>
              ))}
              {tests && <span className="text-[11px] text-tinta-3">Vencimiento 12/29 y CVV 123. Cualquier otra tarjeta se rechaza aquí mismo y no se envía.</span>}
            </div>
            <CardFace number={f.number} name={f.name} exp={f.exp} brand={brand} />
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#F4EEF2] p-1">
              {[['credito', 'Crédito'], ['debito', 'Débito']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setF({ ...f, type: k, inst: 1 })} className={`h-9 rounded-lg text-[13px] font-semibold ${f.type === k ? 'bg-white shadow-sm' : 'text-tinta-3'}`}>{l}</button>
              ))}
            </div>
            <label className="flex flex-col gap-1"><span className="label">Número de tarjeta</span>
              <input className="input font-mono tracking-wider" inputMode="numeric" autoComplete="off" name="vinka-demo-card" placeholder="0000 0000 0000 0000" value={f.number} onChange={(e) => setF({ ...f, number: group(e.target.value) })} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1"><span className="label">Vencimiento</span>
                <input className="input" inputMode="numeric" autoComplete="off" name="vinka-demo-exp" placeholder="MM/AA" value={f.exp} onChange={(e) => setExp(e.target.value)} /></label>
              <label className="flex flex-col gap-1"><span className="label">CVV</span>
                <input className="input" inputMode="numeric" autoComplete="off" name="vinka-demo-cvv" placeholder="123" maxLength={4} value={f.cvv} onChange={(e) => setF({ ...f, cvv: digits(e.target.value).slice(0, 4) })} /></label>
            </div>
            <label className="flex flex-col gap-1"><span className="label">Nombre del titular</span>
              <input className="input" autoComplete="off" name="vinka-demo-name" maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            {f.type === 'credito' && (
              <label className="flex flex-col gap-1"><span className="label">Cuotas</span>
                <select className="input" value={f.inst} onChange={(e) => setF({ ...f, inst: Number(e.target.value) })}>
                  {INST.map((n) => <option key={n} value={n}>{n === 1 ? `Sin cuotas · ${money(q.total)}` : `${n} cuotas sin interés de ${money(Math.ceil(q.total / n))}`}</option>)}
                </select></label>
            )}
            <ErrorBox>{err}</ErrorBox>
            <button className="btn h-12" onClick={pay}>Pagar {money(q.total)}</button>
            <span className="text-center text-[11px] text-tinta-suave">Al pagar aceptas los términos de VINKA. Pago procesado en modo demostración.</span>
          </>
        )}
        {!q && err && <ErrorBox>{err}</ErrorBox>}

        {step === 'processing' && (
          <div className="flex flex-col items-center gap-3 py-10" role="status">
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-[#EDE3EA] border-t-rosa-accion" />
            <b>Procesando con tu banco…</b><span className="text-[12px] text-tinta-3">No cierres esta ventana.</span>
          </div>
        )}

        {step === 'result' && res && (res.status === 'aprobado' ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col items-center gap-1 py-2"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EAF6EF] text-2xl text-[#1E6B3F]">✓</span><b className="text-[17px]">¡Pago aprobado!</b><span className="text-tinta-3">{res.title}</span></div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-linea p-3 text-[13px]">
              {[['Comercio', res.merchant], ['N.º de orden', res.order], ['Código de autorización', res.auth_code], ['Fecha', new Date(res.paid_at).toLocaleString('es-CL')],
                ['Tarjeta', `${res.brand} •••• ${res.last4}`], ['Tipo de pago', res.type === 'debito' ? 'Débito' : res.installments > 1 ? `Crédito · ${res.installments} cuotas sin interés` : 'Crédito · sin cuotas'],
                ['Neto', money(res.net)], ['IVA', money(res.iva)], ['Total pagado', money(res.amount)]].map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-tinta-3">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>
              ))}
            </dl>
            <span className="text-center text-[11px] text-tinta-suave">Comprobante de demostración: no constituye boleta ni factura.</span>
            <button className="btn h-12" onClick={() => onDone(res)}>Listo</button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col items-center gap-1 py-2"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FEF3F2] text-2xl text-[#912018]">✕</span><b className="text-[17px]">Pago rechazado</b><span className="text-center text-tinta-2">{res.reason}</span></div>
            <span className="text-center text-[12px] text-tinta-3">No se hizo ningún cargo. Orden {res.order} · {res.brand} •••• {res.last4}</span>
            <button className="btn h-12" onClick={() => { setRes(null); setStep('form'); setF({ ...f, number: '', cvv: '' }) }}>Intentar con otra tarjeta</button>
            <button className="btn-sec" onClick={onClose}>Cancelar</button>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

/** Pagos con tarjeta (comprobantes). company: id de la empresa, o null para los del postulante. */
export function Receipts({ company = null, reloadKey }) {
  const [list, setList] = useState(null)
  useEffect(() => { supabase.rpc('my_payment_receipts', { p_company: company }).then(({ data }) => setList(Array.isArray(data) ? data : [])) }, [company, reloadKey])
  if (!list || list.length === 0) return null
  return (
    <div className="card flex flex-col gap-2 p-4 text-sm">
      <span className="text-[15px] font-semibold">Pagos con tarjeta</span>
      {list.map((x) => (
        <div key={x.order} className="flex items-start justify-between gap-2 border-b border-[#F1E7ED] pb-2 last:border-0">
          <span className="flex flex-col"><b>{x.title}</b><span className="text-[12px] text-tinta-3">{new Date(x.paid_at).toLocaleDateString('es-CL')} · {x.brand} •••• {x.last4} · orden {x.order}{x.status === 'rechazado' ? ` · ${x.reason}` : ''}</span></span>
          <span className="flex flex-col items-end"><b>{money(x.amount)}</b><span className={`text-[11px] font-semibold ${x.status === 'aprobado' ? 'text-[#1E6B3F]' : 'text-[#912018]'}`}>{x.status === 'aprobado' ? 'Aprobado' : 'Rechazado'}</span></span>
        </div>
      ))}
      <span className="text-[11px] text-tinta-suave">Pagos en modo demostración: no se cobró dinero real.</span>
    </div>
  )
}
