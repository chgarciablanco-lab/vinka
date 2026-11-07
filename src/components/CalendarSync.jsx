import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Sheet, Svg } from './ui'

const BASE = (import.meta.env.VITE_SUPABASE_URL || 'https://jifhlhbntcfnvmcpbexo.supabase.co') + '/functions/v1/calendar?t='

/** Suscribe las entrevistas de VINKA al calendario del teléfono, Google u Outlook */
export function CalendarSync({ compact = false }) {
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState(null)
  const [msg, setMsg] = useState('')
  useEffect(() => { if (open && !token) supabase.rpc('my_calendar_token').then(({ data }) => setToken(data)) }, [open, token])
  const url = token ? BASE + token : ''
  const webcal = url.replace(/^https:/, 'webcal:')
  const copy = async () => { try { await navigator.clipboard.writeText(url); setMsg('Enlace copiado') } catch { setMsg('Mantén presionado el enlace para copiarlo') } }
  const reset = async () => { const { data } = await supabase.rpc('reset_calendar_token'); setToken(data); setMsg('Enlace nuevo creado. El anterior dejó de funcionar.') }
  return (
    <>
      {compact ? (
        <button onClick={() => setOpen(true)} className="text-sm font-semibold text-rosa-texto">Sincronizar con mi calendario</button>
      ) : (
        <button onClick={() => setOpen(true)} className="card flex items-center gap-3 p-4 text-left">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F4F5] text-[#1F6F78]"><Svg name="calendar" /></span>
          <span className="flex flex-1 flex-col"><span className="text-[15px] font-semibold">Sincronizar con mi calendario</span><span className="text-[13px] text-tinta-3">Google, Outlook o iPhone, con aviso 30 min antes</span></span>
          <Svg name="chevron" size={18} className="text-tinta-suave" />
        </button>
      )}
      <Sheet open={open} onClose={() => { setOpen(false); setMsg('') }} title="Sincronizar calendario">
        <div className="flex flex-col gap-3 text-sm leading-relaxed">
          <p>Tus entrevistas de VINKA aparecerán solas en tu calendario y se actualizan si cambian o se cancelan.</p>
          {!token ? <span className="text-tinta-suave">Cargando…</span> : (
            <>
              <a href={webcal} className="btn"><Svg name="calendar" size={20} />iPhone o Mac (Calendario)</a>
              <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noreferrer" className="btn-sec">Google Calendar</a>
              <a href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=VINKA`} target="_blank" rel="noreferrer" className="btn-sec">Outlook</a>
              <div className="flex flex-col gap-1.5 rounded-xl bg-[#F6F1F4] p-3">
                <span className="text-xs font-semibold text-tinta-3">Enlace privado (para otras apps)</span>
                <span className="break-all text-xs text-tinta-2">{url}</span>
                <button className="self-start text-sm font-semibold text-rosa-texto" onClick={copy}>Copiar enlace</button>
              </div>
              <p className="hint">Google actualiza los calendarios suscritos cada algunas horas; el de iPhone, cada hora. Este enlace es personal: si lo compartiste por error, crea uno nuevo.</p>
              <button className="h-10 text-sm font-semibold text-tinta-3" onClick={reset}>Crear enlace nuevo</button>
              {msg && <p role="status" className="text-center text-sm font-semibold text-[#134A2B]">{msg}</p>}
            </>
          )}
        </div>
      </Sheet>
    </>
  )
}
