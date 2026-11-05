import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { ErrorBox, Field, Screen, TopBar } from '../../components/ui'

export function PasswordInput({ value, onChange, autoComplete = 'current-password', showRules }) {
  const [show, setShow] = useState(false)
  const rules = [[value.length >= 8, '8+ caracteres'], [/[a-zA-Z]/.test(value), 'una letra'], [/\d/.test(value), 'un número']]
  return (
    <>
      <div className="relative">
        <input className="input pr-14" type={show ? 'text' : 'password'} value={value} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} />
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute right-0.5 top-0.5 flex h-11 w-12 items-center justify-center text-xs font-semibold text-tinta-suave">{show ? 'Ocultar' : 'Ver'}</button>
      </div>
      {showRules && (
        <span className="flex flex-wrap gap-x-3 text-xs">
          {rules.map(([ok, t]) => <span key={t} className={ok ? 'text-[#1E7A46]' : 'text-tinta-suave'}>{ok ? '✓' : '○'} {t}</span>)}
        </span>
      )}
    </>
  )
}
export const passwordOk = (p) => p.length >= 8 && /[a-zA-Z]/.test(p) && /\d/.test(p)

export function Login() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    nav('/')
  }
  return (
    <Screen>
      <TopBar back="/" title="" />
      <form onSubmit={submit} className="flex flex-1 flex-col gap-4 px-6 pb-8">
        <h1 className="text-2xl font-bold">Hola de nuevo</h1>
        <Field label="Correo electrónico"><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Contraseña"><PasswordInput value={pw} onChange={setPw} /></Field>
        <Link to="/recuperar" className="text-sm font-semibold text-rosa-texto">¿Olvidaste tu contraseña?</Link>
        <ErrorBox>{err}</ErrorBox>
        <div className="flex-1" />
        <button className="btn" disabled={busy}>{busy ? 'Ingresando…' : 'Iniciar sesión'}</button>
        <p className="text-center text-sm">¿No tienes cuenta? <Link to="/" className="font-semibold text-rosa-texto">Regístrate</Link></p>
      </form>
    </Screen>
  )
}

export function Forgot() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const submit = async (e) => {
    e.preventDefault(); setErr('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + '/nueva-clave' })
    if (error) return setErr(errMsg(error))
    setSent(true)
  }
  return (
    <Screen>
      <TopBar back="/ingresar" title="" />
      <form onSubmit={submit} className="flex flex-1 flex-col gap-4 px-6 pb-8">
        <h1 className="text-2xl font-bold">Recupera tu contraseña</h1>
        {sent ? (
          <p className="text-[15px] leading-relaxed text-tinta-3">Si existe una cuenta con <b>{email}</b>, te enviamos un enlace para crear una nueva contraseña.</p>
        ) : (
          <>
            <p className="text-sm text-tinta-3">Te enviaremos un enlace a tu correo.</p>
            <Field label="Correo electrónico"><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <ErrorBox>{err}</ErrorBox>
            <div className="flex-1" />
            <button className="btn">Enviar enlace</button>
          </>
        )}
      </form>
    </Screen>
  )
}

export function NewPassword() {
  const nav = useNavigate()
  const { setRecovery } = useAuth()
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    if (!passwordOk(pw)) return setErr('La contraseña debe tener 8+ caracteres, una letra y un número.')
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) return setErr(errMsg(error))
    setRecovery(false); nav('/')
  }
  return (
    <Screen>
      <TopBar title="Nueva contraseña" />
      <form onSubmit={submit} className="flex flex-1 flex-col gap-4 px-6 pb-8">
        <Field label="Nueva contraseña"><PasswordInput value={pw} onChange={setPw} autoComplete="new-password" showRules /></Field>
        <ErrorBox>{err}</ErrorBox>
        <div className="flex-1" />
        <button className="btn">Guardar contraseña</button>
      </form>
    </Screen>
  )
}

export function CheckEmail() {
  const { state } = useLocation()
  const [msg, setMsg] = useState('')
  const resend = async () => {
    if (!state?.email) return
    const { error } = await supabase.auth.resend({ type: 'signup', email: state.email, options: { emailRedirectTo: window.location.origin } })
    setMsg(error ? errMsg(error) : 'Te enviamos el correo otra vez.')
  }
  return (
    <Screen>
      <TopBar back="/" title="" />
      <div className="flex flex-1 flex-col gap-4 px-6 pb-8">
        <div className="mx-auto mt-6 flex h-20 w-20 items-center justify-center rounded-full bg-rosa-palido text-4xl" aria-hidden="true">✉︎</div>
        <h1 className="text-center text-2xl font-bold">Confirma tu correo</h1>
        <p className="text-center text-[15px] leading-relaxed text-tinta-3">
          Enviamos un enlace a <b>{state?.email || 'tu correo'}</b>. Ábrelo desde este mismo teléfono para activar tu cuenta.
        </p>
        <p className="text-center text-sm text-tinta-suave">¿No llegó? Revisa spam o promociones.</p>
        {msg && <p className="text-center text-sm font-medium text-rosa-texto">{msg}</p>}
        <div className="flex-1" />
        <button className="btn-sec" onClick={resend}>Reenviar correo</button>
        <Link to="/ingresar" className="btn">Ya confirmé, iniciar sesión</Link>
      </div>
    </Screen>
  )
}
