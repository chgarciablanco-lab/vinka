import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { REGIONES, TAMANOS } from '../lib/catalog'
import { ErrorBox, Field, Screen, Svg, TopBar } from '../components/ui'

const REASONS = [['plan', 'Cotizar un plan'], ['consultora', 'Somos consultora'], ['volumen', 'Muchas vacantes o varias sedes'], ['otro', 'Otra consulta']]
const EMPTY = { company_name: '', rut: '', contact_name: '', contact_role: '', email: '', phone: '', company_size: '', open_jobs: '', hires_year: '', regions: '', message: '', consent: false }

/** Formulario para pedir cotización: conserva el plan o motivo con que se llegó y pide lo mínimo para cotizar. */
export default function Quote() {
  const [sp] = useSearchParams()
  const [plans, setPlans] = useState([])
  const [reason, setReason] = useState(REASONS.some(([k]) => k === sp.get('motivo')) ? sp.get('motivo') : 'plan')
  const [plan, setPlan] = useState(sp.get('plan') || '')
  const [f, setF] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => { supabase.from('plans').select('id, name, price_clp, sort').order('sort').then(({ data }) => setPlans((data || []).filter((p) => p.price_clp !== 0))) }, [])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const planName = plans.find((p) => p.id === plan)?.name

  const send = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    const { error } = await supabase.rpc('submit_quote', { p: { ...f, reason, plan_id: reason === 'plan' ? plan : '', path: window.location.pathname + window.location.search } })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setDone(true)
  }

  if (done) return (
    <Screen>
      <TopBar back="/" title="Cotización" />
      <div className="flex flex-col items-center gap-3 px-6 pt-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF6EF] text-[#2F7A4F]"><Svg name="check" size={28} /></span>
        <h1 className="font-display text-[22px] font-bold">Recibimos tu solicitud</h1>
        <p className="max-w-sm text-[15px] leading-relaxed text-tinta-3">Te escribiremos a <b>{f.email}</b> con la cotización{planName ? ` del plan ${planName}` : ''} dentro de 1 día hábil.</p>
        <Link to="/" className="btn-sec mt-2">Volver al inicio</Link>
      </div>
    </Screen>
  )

  return (
    <Screen>
      <TopBar back="/" title="Pedir cotización" />
      <form onSubmit={send} className="mx-auto flex w-full max-w-xl flex-col gap-3.5 px-6 pb-12">
        <p className="text-[15px] leading-relaxed text-tinta-3">Cuéntanos lo básico y te enviamos una cotización por correo. No necesitas crear una cuenta.</p>
        <fieldset className="flex flex-col gap-2"><legend className="label mb-1">Motivo</legend>
          <div className="grid grid-cols-2 gap-2">{REASONS.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={reason === k} onClick={() => setReason(k)} className={`chip h-11 justify-center px-2 text-[13px] ${reason === k ? 'chip-on' : ''}`}>{l}</button>
          ))}</div>
        </fieldset>
        {reason === 'plan' && (
          <Field label="Plan que te interesa"><select className="input" value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="">Aún no sé, quiero que me recomienden</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.price_clp ? ` · $${p.price_clp.toLocaleString('es-CL')} + IVA/mes` : ' · a medida'}</option>)}
          </select></Field>
        )}
        <span className="mt-1 text-[15px] font-semibold">Empresa</span>
        <Field label="Nombre de la empresa"><input className="input" required maxLength={160} value={f.company_name} onChange={set('company_name')} autoComplete="organization" /></Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="RUT (opcional)"><input className="input" maxLength={12} value={f.rut} onChange={set('rut')} placeholder="76.123.456-7" /></Field>
          <Field label="Personas en la empresa"><select className="input" value={f.company_size} onChange={set('company_size')}><option value="">Selecciona</option>{TAMANOS.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Vacantes abiertas a la vez"><input className="input" inputMode="numeric" maxLength={4} value={f.open_jobs} onChange={set('open_jobs')} placeholder="Ej.: 10" /></Field>
          <Field label="Contrataciones al año"><input className="input" inputMode="numeric" maxLength={5} value={f.hires_year} onChange={set('hires_year')} placeholder="Ej.: 40" /></Field>
        </div>
        <Field label="Regiones donde contratan"><select className="input" value={f.regions} onChange={set('regions')}><option value="">Selecciona</option><option>Varias regiones</option>{REGIONES.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <span className="mt-1 text-[15px] font-semibold">Contacto</span>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Tu nombre"><input className="input" required maxLength={120} value={f.contact_name} onChange={set('contact_name')} autoComplete="name" /></Field>
          <Field label="Tu cargo"><input className="input" maxLength={120} value={f.contact_role} onChange={set('contact_role')} placeholder="Ej.: Jefa de personas" /></Field>
        </div>
        <Field label="Correo"><input className="input" type="email" required maxLength={160} value={f.email} onChange={set('email')} autoComplete="email" /></Field>
        <Field label="Teléfono (opcional)"><input className="input" type="tel" maxLength={30} value={f.phone} onChange={set('phone')} autoComplete="tel" /></Field>
        <Field label="Comentarios (opcional)"><textarea className="textarea h-24" maxLength={2000} value={f.message} onChange={set('message')} placeholder="Cargos que buscan, fechas, integraciones, facturación…" /></Field>
        <label className="flex items-start gap-2.5 text-[13px] leading-snug text-tinta-2">
          <input type="checkbox" checked={f.consent} onChange={set('consent')} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D02E72]" />
          <span>Autorizo a VINKA a usar estos datos solo para responder esta cotización, según la <Link to="/legal/privacidad" className="underline">política de privacidad</Link>.</span>
        </label>
        <ErrorBox>{err}</ErrorBox>
        <button className="btn" disabled={busy || !f.consent}>{busy ? 'Enviando…' : 'Enviar solicitud'}</button>
        <p className="text-center text-xs text-tinta-suave">¿Prefieres partir ya? <Link to="/registro/empresa" className="underline">Crea tu cuenta</Link>: tienes 30 días del plan Pyme gratis.</p>
      </form>
    </Screen>
  )
}
