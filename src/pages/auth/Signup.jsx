import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { REGIONES, TAMANOS, AREAS } from '../../lib/catalog'
import { formatRut, validRut } from '../../lib/rut'
import { ErrorBox, Field, Screen, TopBar } from '../../components/ui'
import { PasswordInput, passwordOk } from './AuthPages'

function Consent({ terms, setTerms, mkt, setMkt }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-rosa-borde bg-rosa-fondo p-3.5">
      <label className="flex items-start gap-2.5 text-[13px] leading-snug">
        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D02E72]" />
        <span>Acepto los <Link to="/legal/terminos" className="text-rosa-texto underline">Términos</Link> y la <Link to="/legal/privacidad" className="text-rosa-texto underline">Política de privacidad</Link> <b>(obligatorio)</b></span>
      </label>
      <label className="flex items-start gap-2.5 text-[13px] leading-snug">
        <input type="checkbox" checked={mkt} onChange={(e) => setMkt(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D02E72]" />
        <span>Quiero recibir avisos de novedades por correo (opcional)</span>
      </label>
    </div>
  )
}

export function SignupCandidate() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [f, setF] = useState({ first_name: '', last_name: '', email: params.get('email') || '', phone: '', password: '' })
  const [terms, setTerms] = useState(false)
  const [mkt, setMkt] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault(); setErr('')
    if (!f.first_name.trim() || !f.last_name.trim()) return setErr('Escribe tu nombre y apellido.')
    if (!/^\d{8}$/.test(f.phone.replace(/\D/g, ''))) return setErr('El teléfono debe tener 8 dígitos después de +56 9.')
    if (!passwordOk(f.password)) return setErr('La contraseña debe tener 8+ caracteres, una letra y un número.')
    if (!terms) return setErr('Debes aceptar los Términos y la Política de privacidad.')
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email: f.email.trim(), password: f.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { role: 'candidate', first_name: f.first_name.trim(), last_name: f.last_name.trim(), phone: '+569' + f.phone.replace(/\D/g, ''), terms_accepted: true, marketing_opt_in: mkt },
      },
    })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    // Correo ya registrado: Supabase responde «ok» sin enviar correo (para no revelar cuentas). Se detecta porque no trae identidades.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return setErr('Este correo ya tiene una cuenta en VINKA. Ingresa con tu contraseña o usa «¿Olvidaste tu contraseña?» para recuperarla.')
    if (data.session) nav('/'); else nav('/confirmar', { state: { email: f.email.trim() } })
  }

  return (
    <Screen>
      <TopBar back="/" title="" step={{ label: 'Paso 1 de 4', pct: 25 }} />
      <form onSubmit={submit} className="flex flex-1 flex-col gap-3.5 px-6 pb-8 pt-2">
        <h1 className="text-2xl font-bold">Crea tu cuenta</h1>
        <p className="-mt-2 text-sm leading-snug text-tinta-3">Tus datos de contacto son privados. Solo se comparten tras un match y con tu permiso.</p>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Nombre"><input className="input" autoComplete="given-name" value={f.first_name} onChange={set('first_name')} /></Field>
          <Field label="Apellido"><input className="input" autoComplete="family-name" value={f.last_name} onChange={set('last_name')} /></Field>
        </div>
        <Field label="Correo electrónico"><input className="input" type="email" autoComplete="email" required value={f.email} onChange={set('email')} /></Field>
        <Field label="Teléfono móvil">
          <div className="flex gap-2">
            <span className="flex h-12 items-center rounded-xl border border-linea bg-[#FAF6F8] px-3 text-[15px]">+56 9</span>
            <input className="input" inputMode="numeric" autoComplete="tel-local" placeholder="1234 5678" value={f.phone} onChange={set('phone')} />
          </div>
        </Field>
        <Field label="Contraseña"><PasswordInput value={f.password} onChange={(v) => setF({ ...f, password: v })} autoComplete="new-password" showRules /></Field>
        <Consent terms={terms} setTerms={setTerms} mkt={mkt} setMkt={setMkt} />
        <ErrorBox>{err}</ErrorBox>
        <button className="btn mt-2" disabled={busy}>{busy ? 'Creando cuenta…' : 'Crear cuenta y confirmar correo'}</button>
        <p className="text-center text-sm">¿Ya tienes cuenta? <Link to="/ingresar" className="font-semibold text-rosa-texto">Inicia sesión</Link></p>
      </form>
    </Screen>
  )
}

export function SignupCompany() {
  const nav = useNavigate()
  const [step, setStep] = useState(1)
  const [c, setC] = useState({ legal_name: '', display_name: '', rut: '', sector: '', size: '', region: '', comuna: '' })
  const [a, setA] = useState({ first_name: '', last_name: '', email: '', phone: '', password: '' })
  const [terms, setTerms] = useState(false)
  const [mkt, setMkt] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const setc = (k) => (e) => setC({ ...c, [k]: k === 'rut' ? formatRut(e.target.value) : e.target.value })
  const seta = (k) => (e) => setA({ ...a, [k]: e.target.value })

  const next = (e) => {
    e.preventDefault(); setErr('')
    if (!c.legal_name.trim() || !c.display_name.trim()) return setErr('Completa la razón social y el nombre visible.')
    if (!validRut(c.rut)) return setErr('El RUT no es válido. Revisa el dígito verificador.')
    if (!c.sector || !c.size || !c.region || !c.comuna.trim()) return setErr('Completa rubro, tamaño, región y comuna.')
    setStep(2)
  }
  const submit = async (e) => {
    e.preventDefault(); setErr('')
    if (!a.first_name.trim() || !a.last_name.trim()) return setErr('Escribe el nombre y apellido de quien administra la cuenta.')
    if (!passwordOk(a.password)) return setErr('La contraseña debe tener 8+ caracteres, una letra y un número.')
    if (!terms) return setErr('Debes aceptar los Términos y la Política de privacidad.')
    setBusy(true)
    const company = { ...c, legal_name: c.legal_name.trim(), display_name: c.display_name.trim(), comuna: c.comuna.trim() }
    const { data, error } = await supabase.auth.signUp({
      email: a.email.trim(), password: a.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { role: 'company', first_name: a.first_name.trim(), last_name: a.last_name.trim(), phone: a.phone.trim(), terms_accepted: true, marketing_opt_in: mkt, company },
      },
    })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    // Correo ya registrado: Supabase responde «ok» sin enviar correo (para no revelar cuentas). Se detecta porque no trae identidades.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return setErr('Este correo ya tiene una cuenta en VINKA. Ingresa con tu contraseña o usa «¿Olvidaste tu contraseña?» para recuperarla.')
    if (data.session) nav('/'); else nav('/confirmar', { state: { email: a.email.trim() } })
  }

  const Steps = () => (
    <div className="mb-4 mt-1 flex">
      {['Empresa', 'Administrador', 'Verificación'].map((t, i) => (
        <div key={t} className={`flex flex-1 flex-col items-center gap-1 text-[11px] font-semibold ${i + 1 === step ? 'text-rosa-oscuro' : 'text-tinta-suave'}`}>
          <span className={`flex h-[26px] w-[26px] items-center justify-center rounded-full text-xs font-bold ${i + 1 <= step ? 'bg-rosa-accion text-white' : 'bg-[#F4EEF2] text-tinta-3'}`}>{i + 1}</span>{t}
        </div>
      ))}
    </div>
  )

  return (
    <Screen>
      <TopBar back={step === 1 ? '/' : () => setStep(1)} title={<span>VINKA <span className="text-[#B85F00]">Company</span></span>} />
      <div className="px-6"><Steps /></div>
      {step === 1 ? (
        <form onSubmit={next} className="flex flex-1 flex-col gap-3.5 px-6 pb-8">
          <h1 className="text-2xl font-bold">Datos de tu empresa</h1>
          <p className="-mt-2 text-sm leading-snug text-tinta-3">Revisamos cada empresa antes de que publique vacantes. Así protegemos a los candidatos de ofertas falsas.</p>
          <Field label="Razón social"><input className="input" placeholder="Comercial Ejemplo SpA" value={c.legal_name} onChange={setc('legal_name')} /></Field>
          <Field label="Nombre visible en VINKA" hint="Así te verán los candidatos."><input className="input" value={c.display_name} onChange={setc('display_name')} /></Field>
          <Field label="RUT empresa" error={c.rut.length > 8 && !validRut(c.rut) ? 'Dígito verificador incorrecto' : ''}><input className="input" placeholder="76.123.456-7" value={c.rut} onChange={setc('rut')} /></Field>
          <Field label="Rubro"><select className="input" value={c.sector} onChange={setc('sector')}><option value="">Selecciona</option>{AREAS.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <fieldset className="flex flex-col gap-2"><legend className="label mb-2">Tamaño (personas)</legend>
            <div className="grid grid-cols-4 gap-1.5">{TAMANOS.map((t) => <button type="button" key={t} aria-pressed={c.size === t} onClick={() => setC({ ...c, size: t })} className={`chip justify-center ${c.size === t ? 'chip-on' : ''}`}>{t}</button>)}</div>
          </fieldset>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Región"><select className="input" value={c.region} onChange={setc('region')}><option value="">Selecciona</option>{REGIONES.map((r) => <option key={r}>{r}</option>)}</select></Field>
            <Field label="Comuna"><input className="input" value={c.comuna} onChange={setc('comuna')} /></Field>
          </div>
          <ErrorBox>{err}</ErrorBox>
          <button className="btn mt-2">Continuar</button>
        </form>
      ) : (
        <form onSubmit={submit} className="flex flex-1 flex-col gap-3.5 px-6 pb-8">
          <h1 className="text-2xl font-bold">Quién administra la cuenta</h1>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Nombre"><input className="input" value={a.first_name} onChange={seta('first_name')} /></Field>
            <Field label="Apellido"><input className="input" value={a.last_name} onChange={seta('last_name')} /></Field>
          </div>
          <Field label="Correo corporativo" hint="Idealmente con el dominio de tu empresa. Si no tienes, lo revisaremos manualmente."><input className="input" type="email" required value={a.email} onChange={seta('email')} /></Field>
          <Field label="Teléfono"><input className="input" type="tel" value={a.phone} onChange={seta('phone')} placeholder="+56 9 1234 5678" /></Field>
          <Field label="Contraseña"><PasswordInput value={a.password} onChange={(v) => setA({ ...a, password: v })} autoComplete="new-password" showRules /></Field>
          <Consent terms={terms} setTerms={setTerms} mkt={mkt} setMkt={setMkt} />
          <ErrorBox>{err}</ErrorBox>
          <button className="btn mt-2" disabled={busy}>{busy ? 'Creando…' : 'Crear cuenta y enviar a verificación'}</button>
        </form>
      )}
    </Screen>
  )
}
