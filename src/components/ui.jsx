import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useDialogFocus } from '../lib/useDialogFocus'

export const Icon = {
  back: <path d="M15 6l-6 6 6 6" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  bookmark: <path d="M6 3h12v18l-6-4-6 4z" />,
  card: <rect x="5" y="3" width="14" height="18" rx="3" />,
  swap: <path d="M7 7h10l-3-3M17 17H7l3 3" />,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5M16 4.5a3.5 3.5 0 010 7M18 14.8c2 .6 3.5 2.3 3.5 5.2" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M10 21v-4h4v4" /></>,
  send: <path d="M4 12l16-8-6 16-2-7z" />,
  dots: <><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></>,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4z" />,
  bell: <path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15zM10 20a2 2 0 004 0" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  video: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3z" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  tag: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.5" /></>,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  columns: <><rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="10" y="4" width="5" height="11" rx="1.5" /><rect x="17" y="4" width="4" height="7" rx="1.5" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  doc: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
  link: <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />,
}

export function Svg({ name, size = 22, className = '', stroke = 'currentColor', width = 2 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke}
      strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" className={className}>{Icon[name]}</svg>
  )
}

export function Verified({ size = 16 }) {
  return (
    <svg role="img" aria-label="Empresa verificada" width={size} height={size} viewBox="0 0 24 24" fill="#1F6FB2">
      <path d="M12 2l2.4 2.1 3.1-.4.9 3 2.7 1.6-1.1 2.9 1.1 2.9-2.7 1.6-.9 3-3.1-.4L12 22l-2.4-2.1-3.1.4-.9-3-2.7-1.6L4 12.8 2.9 9.9l2.7-1.6.9-3 3.1.4z" />
      <path d="M8.5 12.2l2.3 2.3 4.7-4.7" stroke="#fff" strokeWidth="2" fill="none" />
    </svg>
  )
}

/** Espacio reservado para el logo original. Reemplazar por <img src="/logo.png"> al recibir el archivo. */
export function Logo({ compact = false }) {
  if (compact) return <span className="font-display text-[17px] font-bold tracking-wide text-tinta">VINKA</span>
  return (
    <div role="img" aria-label="VINKA. Tu próximo match empieza aquí."
      className="mx-auto flex h-32 w-56 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-rosa bg-white">
      <span className="font-display text-3xl font-bold tracking-wide">VINKA</span>
      <span className="text-xs text-tinta-3">Tu próximo <span className="font-semibold text-rosa-texto">match</span> empieza aquí.</span>
    </div>
  )
}

export function Screen({ children, className = '', wide = false }) {
  return <div className={`mx-auto flex min-h-full w-full max-w-md flex-col bg-white print:max-w-none ${wide ? 'lg:max-w-5xl' : 'lg:max-w-2xl'} ${className}`}>{children}</div>
}

export function TopBar({ title, back, right, step }) {
  const nav = useNavigate()
  return (
    <div className="safe-t sticky top-0 z-10 bg-white/95 px-4 pb-2 backdrop-blur">
      <div className="flex h-11 items-center justify-between">
        {back ? (
          <button aria-label="Volver" onClick={() => (typeof back === 'function' ? back() : typeof back === 'string' ? nav(back) : nav(-1))} className="-ml-2 flex h-11 w-11 items-center justify-center">
            <Svg name="back" />
          </button>
        ) : <span className="w-11" />}
        <span className="truncate text-[15px] font-semibold">{title}</span>
        <span className="flex min-w-11 justify-end">{right}</span>
      </div>
      {step && (
        <div className="mt-1">
          <div className="mb-1.5 text-right text-xs font-semibold text-tinta-suave">{step.label}</div>
          <div className="h-1.5 rounded-full bg-[#F7E1EB]"><div className="h-1.5 rounded-full bg-rosa" style={{ width: `${step.pct}%` }} /></div>
        </div>
      )}
    </div>
  )
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      {children}
      {error ? <span className="text-xs font-medium text-[#B42318]">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  )
}

export function Chips({ options, value, onChange, multi = true, legend }) {
  const sel = multi ? value || [] : [value]
  const toggle = (o) => {
    if (!multi) return onChange(o === value ? '' : o)
    onChange(sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o])
  }
  return (
    <fieldset className="flex flex-col gap-2">
      {legend && <legend className="label mb-2">{legend}</legend>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button type="button" key={o} aria-pressed={sel.includes(o)} onClick={() => toggle(o)} className={`chip ${sel.includes(o) ? 'chip-on' : ''}`}>
            {o}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export function TagInput({ value = [], onChange, placeholder }) {
  const [t, setT] = useState('')
  const add = () => {
    const v = t.trim()
    if (v && !value.includes(v) && value.length < 20) onChange([...value, v])
    setT('')
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {value.map((s) => (
          <button type="button" key={s} onClick={() => onChange(value.filter((x) => x !== s))} className="chip chip-on" aria-label={`Quitar ${s}`}>
            {s} <span aria-hidden="true" className="ml-1.5">✕</span>
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="input" value={t} placeholder={placeholder} onChange={(e) => setT(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }} />
        <button type="button" onClick={add} className="btn-sm shrink-0 border border-rosa-accion bg-white text-rosa-texto">Agregar</button>
      </div>
    </div>
  )
}

export function Toast({ msg, onDone, tone = 'dark' }) {
  useEffect(() => { if (msg) { const t = setTimeout(onDone, 3800); return () => clearTimeout(t) } }, [msg, onDone])
  if (!msg) return null
  return (
    <div role="status" className={`fixed bottom-28 left-1/2 z-50 w-[calc(100%-32px)] max-w-[400px] -translate-x-1/2 rounded-2xl px-4 py-3 text-sm font-medium leading-snug text-white shadow-lg ${tone === 'pink' ? 'bg-rosa-accion' : 'bg-morado'}`}>
      {msg}
    </div>
  )
}

export function ErrorBox({ children }) {
  if (!children) return null
  return <div role="alert" className="rounded-xl border border-[#F4C7C3] bg-[#FEF3F2] px-3.5 py-3 text-sm text-[#912018]">{children}</div>
}

export function Spinner({ label = 'Cargando…' }) {
  return (
    <div className="flex flex-1 items-center justify-center p-10 text-sm text-tinta-suave" role="status">
      <span className="mr-2 inline-block h-5 w-5 animate-spin rounded-full border-2 border-rosa border-t-transparent" />{label}
    </div>
  )
}

export function Avatar({ text, color, size = 48, round = false }) {
  return (
    <div aria-hidden="true" className={`flex shrink-0 items-center justify-center font-display font-bold text-white ${round ? 'rounded-full' : 'rounded-xl'}`}
      style={{ width: size, height: size, background: color, fontSize: size * 0.36 }}>{text}</div>
  )
}

export function BottomNav({ items }) {
  return (
    <nav className="safe-b fixed bottom-0 left-1/2 z-20 flex w-full max-w-md -translate-x-1/2 border-t border-[#EEE3EA] bg-white px-2 pt-2 lg:hidden">
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} className={({ isActive }) => `relative flex flex-1 flex-col items-center gap-1 py-1 text-[11px] font-semibold ${isActive ? 'text-rosa-texto' : 'text-tinta-suave'}`}>
          <Svg name={it.icon} />
          {it.label}
          {it.badge ? <span className="absolute right-[calc(50%-20px)] top-0 h-2.5 w-2.5 rounded-full bg-naranja" aria-label="Novedades" /> : null}
        </NavLink>
      ))}
    </nav>
  )
}

export function Empty({ title, children, action }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-linea bg-white px-6 py-8 text-center">
      <span className="font-display text-lg font-semibold">{title}</span>
      <span className="text-sm leading-relaxed text-tinta-3">{children}</span>
      {action}
    </div>
  )
}

export function Sheet({ open, onClose, title, children, wide = false }) {
  const ref = useDialogFocus(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center" onClick={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`safe-b outline-none w-full rounded-t-3xl bg-white px-5 pt-5 lg:rounded-3xl ${wide ? 'max-w-3xl lg:max-w-5xl' : 'max-w-md lg:max-w-lg'}`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button aria-label="Cerrar" onClick={onClose} className="flex h-11 w-11 items-center justify-center"><Svg name="x" /></button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto overflow-x-hidden pb-4">{children}</div>
      </div>
    </div>
  )
}

export { Link }
