import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { viewerId } from '../lib/promo'
import { Sheet, Svg } from './ui'

// Texto con **negrita**, [enlaces](/ruta), rutas sueltas (/intereses) y listas «- »
function Rich({ text }) {
  const inline = (s, k) => s.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|(?:^|\s)\/[a-z][a-z0-9/-]*[a-z0-9])/gi).map((p, i) => {
    if (!p) return null
    const b = p.match(/^\*\*(.+)\*\*$/); if (b) return <b key={`${k}-${i}`}>{b[1]}</b>
    const l = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (l) return l[2].startsWith('/') ? <Link key={`${k}-${i}`} to={l[2]} className="font-semibold text-rosa-texto underline">{l[1]}</Link> : <a key={`${k}-${i}`} href={l[2]} target="_blank" rel="noopener noreferrer" className="font-semibold text-rosa-texto underline">{l[1]}</a>
    const r = p.match(/^(\s?)(\/[a-z][a-z0-9/-]*)$/i)
    if (r) return <Fragment key={`${k}-${i}`}>{r[1]}<Link to={r[2]} className="font-semibold text-rosa-texto underline">{r[2]}</Link></Fragment>
    return <Fragment key={`${k}-${i}`}>{p}</Fragment>
  })
  return String(text).split('\n').map((line, i) => {
    const li = line.match(/^\s*[-•]\s+(.*)$/)
    if (li) return <span key={i} className="flex gap-1.5 pl-1"><span aria-hidden="true">•</span><span>{inline(li[1], i)}</span></span>
    return line.trim() ? <span key={i} className="block">{inline(line, i)}</span> : <span key={i} className="block h-2" />
  })
}

const SUGG = {
  web: ['¿Qué es VINKA?', '¿Cuánto cuesta para empresas?', '¿Es gratis para quienes buscan trabajo?', '¿Cómo cuidan mis datos?'],
  candidate: ['¿Cómo funciona el match?', '¿Por qué no puedo escribirle a la empresa?', 'Quiero reportar un error', 'Tengo una idea para mejorar VINKA'],
  company: ['¿Cómo publico una vacante?', '¿Cómo agendo entrevistas?', 'Quiero reportar un error', 'Tengo una idea para mejorar VINKA'],
  other: ['¿Cómo funciona VINKA?', 'Quiero reportar un error', 'Tengo una idea para mejorar VINKA'],
}
const KEY = 'vinka-help-chat'

/** Asistente de ayuda: en la web responde dudas; con sesión además deja reportes de errores o mejoras */
export function HelpChat({ className = '' }) {
  const { session, profile } = useAuth()
  const loc = useLocation()
  const [msgs, setMsgs] = useState(() => { try { return JSON.parse(sessionStorage.getItem(KEY) || '[]') } catch { return [] } })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef()
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-20))) } catch { /* sin almacenamiento */ } end.current?.scrollIntoView({ block: 'nearest' }) }, [msgs])

  const ask = async (q) => {
    const content = String(q || text).trim()
    if (!content || busy) return
    const next = [...msgs, { role: 'user', content }]
    setMsgs(next); setText(''); setBusy(true)
    const { data, error } = await supabase.functions.invoke('vinka-help', { body: { messages: next.filter((m) => !m.note), viewer: viewerId(), path: loc.pathname } })
    setBusy(false)
    const reply = data?.reply || data?.error || (error ? 'No pude conectarme. Revisa tu conexión e inténtalo de nuevo.' : 'No tengo respuesta para eso.')
    setMsgs([...next, { role: 'assistant', content: reply, ...(data?.report_id ? { report: data.report_id } : {}), ...(!data?.reply ? { note: true } : {}) }])
  }
  const who = !session ? 'web' : profile?.role === 'candidate' ? 'candidate' : profile?.role === 'company' ? 'company' : 'other'

  return (
    <div className={`flex min-h-0 flex-col gap-2 ${className}`}>
      <div className="flex min-h-[260px] flex-1 flex-col gap-2 overflow-y-auto rounded-2xl bg-[#FAF7F9] p-3" aria-live="polite">
        {msgs.length === 0 && (
          <div className="flex flex-col gap-2 py-1">
            <span className="text-sm leading-snug text-tinta-2">Hola{profile?.first_name ? ` ${profile.first_name}` : ''}, soy el asistente de VINKA. {session ? 'Te ayudo con dudas sobre la app y, si algo falla o se te ocurre una mejora, lo dejo registrado para el equipo.' : 'Pregúntame lo que quieras sobre VINKA.'}</span>
            <div className="flex flex-wrap gap-1.5">{SUGG[who].map((s) => <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-linea bg-white px-3 py-1.5 text-left text-[13px] font-medium text-tinta-2">{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex max-w-[88%] flex-col gap-0.5 ${m.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
            <div className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${m.role === 'user' ? 'bg-morado text-white' : m.note ? 'border border-[#F4C7C3] bg-[#FEF3F2] text-[#912018]' : 'border border-linea bg-white text-tinta'}`}>
              {m.role === 'user' ? m.content : <Rich text={m.content} />}
            </div>
            {m.report && <span className="flex items-center gap-1 text-[11px] font-semibold text-[#1E6B3F]"><Svg name="check" size={13} />Reporte registrado · lo ves en <Link to="/ayuda" className="underline">Ayuda</Link></span>}
          </div>
        ))}
        {busy && <span className="self-start rounded-2xl border border-linea bg-white px-3 py-2 text-sm text-tinta-3"><span className="inline-block animate-pulse">Escribiendo…</span></span>}
        <div ref={end} />
      </div>
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); ask() }}>
        <textarea className="textarea min-h-[44px] flex-1 py-2.5" rows={1} maxLength={1200} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }} placeholder={session ? 'Escribe tu duda o cuéntanos qué pasó' : 'Escribe tu pregunta'} aria-label="Tu mensaje" />
        <button type="submit" aria-label="Enviar" disabled={!text.trim() || busy} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rosa-accion text-white disabled:opacity-40"><Svg name="send" size={20} /></button>
      </form>
      <span className="text-[11px] leading-snug text-tinta-suave">Respuestas generadas con IA a partir de la información de VINKA; pueden tener errores. No compartas contraseñas ni datos bancarios.{msgs.length > 0 && <> · <button type="button" className="underline" onClick={() => setMsgs([])}>Nueva conversación</button></>}</span>
    </div>
  )
}

/** Burbuja flotante para la web pública (sin sesión) */
export function HelpBubble() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Abrir asistente de ayuda"
        className="fixed bottom-5 right-4 z-30 flex h-12 items-center gap-2 rounded-full bg-morado px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(48,37,56,0.28)] print:hidden">
        <Svg name="chat" size={20} />¿Dudas?
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Asistente de VINKA">
        <HelpChat className="h-[60vh]" />
      </Sheet>
    </>
  )
}
