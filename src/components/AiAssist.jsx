import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { ErrorBox, Sheet } from './ui'

export const Sparkle = ({ size = 16 }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z" /></svg>
)

export async function callAi(task, mode, context) {
  const { data, error } = await supabase.functions.invoke('ai-write', { body: { task, mode, context } })
  if (error) {
    let msg = 'El asistente no está disponible ahora.'
    try { const b = await error.context?.json?.(); if (b?.error) msg = b.error } catch { /* sin detalle */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

const MODES = [['improve', 'Mejorar'], ['shorter', 'Más breve'], ['formal', 'Más formal'], ['friendly', 'Más cercano'], ['write', 'Escribir de nuevo']]

/**
 * Botón "Redactar con IA" para un campo.
 * Texto: onApply(text). Lista: list=true y onAddItems(items[]).
 * getContext(): datos del formulario para dar contexto (no se guardan).
 */
export function AiAssist({ task, title, current = '', getContext, onApply, list = false, onAddItems, renderItem = (x) => x, label = 'Redactar con IA' }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('write')
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [items, setItems] = useState([])
  const [pick, setPick] = useState([])
  const [err, setErr] = useState('')
  const hasText = !!String(current || '').trim()

  const run = async (m) => {
    setErr(''); setBusy(true); setMode(m)
    try {
      const r = await callAi(task, m, { ...(getContext?.() || {}), current })
      if (list) { setItems(r.items || []); setPick((r.items || []).map((_, i) => i)) } else setText(r.text || '')
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const openSheet = () => {
    setOpen(true); setText(''); setItems([]); setErr('')
    if (list || !hasText) run('write')
  }

  return (
    <>
      <button type="button" onClick={openSheet}
        className="inline-flex h-9 items-center gap-1.5 self-start rounded-full border border-[#E9D3F0] bg-[#F7F0FB] px-3 text-[13px] font-semibold text-[#6B2E8F]">
        <Sparkle />{label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title || 'Asistente de redacción'}>
        <div className="flex flex-col gap-3">
          {!list && hasText && (
            <div className="flex flex-wrap gap-1.5">
              {MODES.map(([k, l]) => (
                <button key={k} type="button" disabled={busy} onClick={() => run(k)}
                  className={`chip h-9 text-[13px] ${mode === k && (text || busy) ? 'chip-on' : ''}`}>{l}</button>
              ))}
            </div>
          )}
          {busy && (
            <div className="flex items-center gap-2 rounded-xl bg-[#F7F0FB] px-3.5 py-4 text-sm text-[#6B2E8F]" role="status">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#6B2E8F] border-t-transparent" />Escribiendo…
            </div>
          )}
          <ErrorBox>{err}</ErrorBox>
          {!busy && !list && text && (
            <>
              <textarea className="textarea h-56" value={text} onChange={(e) => setText(e.target.value)} aria-label="Texto sugerido (puedes editarlo)" />
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn-sec" onClick={() => run(mode)}>Otra versión</button>
                <button type="button" className="btn" onClick={() => { onApply(text); setOpen(false) }}>Usar este texto</button>
              </div>
            </>
          )}
          {!busy && !list && !text && hasText && !err && <p className="text-sm text-tinta-3">Elige qué quieres hacer con tu texto.</p>}
          {!busy && list && items.length > 0 && (
            <>
              <span className="label">Elige las que quieras agregar</span>
              {items.map((it, i) => (
                <label key={i} className="flex items-center gap-2.5 rounded-xl border border-[#EEE3EA] px-3 py-2.5 text-sm">
                  <input type="checkbox" className="h-5 w-5 accent-[#D02E72]" checked={pick.includes(i)} onChange={() => setPick((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))} />
                  <span className="flex-1">{renderItem(it)}</span>
                </label>
              ))}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn-sec" onClick={() => run('write')}>Otras ideas</button>
                <button type="button" className="btn" disabled={!pick.length} onClick={() => { onAddItems(items.filter((_, i) => pick.includes(i))); setOpen(false) }}>Agregar ({pick.length})</button>
              </div>
            </>
          )}
          <p className="text-xs leading-snug text-tinta-suave">Sugerencia generada con IA. Revísala antes de usarla: puede equivocarse y no conoce datos que no hayas escrito.</p>
        </div>
      </Sheet>
    </>
  )
}
