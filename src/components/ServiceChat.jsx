import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { ErrorBox, Svg } from './ui'
import { useSignedUrls } from '../lib/files'
import { useAuth } from '../lib/auth'

// Quién escribió, según quién mira (antes estaba al revés: el asesor veía a la persona como «Tu asesor/a»)
function who(m, as, uid, advisorName) {
  if (m.sender_kind === 'system') return 'VINKA · mensaje automático'
  if (m.sender_id && m.sender_id === uid) return 'Tú'
  const adv = `${as === 'candidate' ? 'Tu asesor/a' : 'Asesor/a'}${advisorName ? ` · ${advisorName}` : ''}`
  return { candidate: as === 'candidate' ? 'Tú' : 'Postulante', advisor: adv, admin: 'Equipo VINKA' }[m.sender_kind] || 'VINKA'
}
const ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg'
const fmt = (d) => new Date(d).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * Conversación de una asesoría dentro de VINKA (postulante, asesor/a asignado/a y administración).
 * `as`: quién mira ('candidate' | 'advisor' | 'admin'). Los archivos quedan en VINKA y se abren con enlaces temporales.
 */
export function ServiceChat({ requestId, as, disabled = false, advisorName = '' }) {
  const { user } = useAuth()
  const [msgs, setMsgs] = useState(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const file = useRef()
  const end = useRef()
  const urls = useSignedUrls('asesorias', (msgs || []).map((m) => m.file_path))

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('service_messages').select('id, sender_id, sender_kind, body, file_path, file_name, created_at').eq('request_id', requestId).order('created_at')
    if (error) setErr(errMsg(error)); else setMsgs(data || [])
  }, [requestId])
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t) }, [load])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [msgs?.length])

  const send = async (path = null, name = null) => {
    setErr('')
    const { error } = await supabase.rpc('send_service_message', { p_request: requestId, p_body: path ? '' : body, p_file_path: path, p_file_name: name })
    if (error) return setErr(errMsg(error))
    if (!path) setBody('')
    load()
  }
  const upload = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    if (f.size > 10 * 1024 * 1024) return setErr('El archivo pesa más de 10 MB.')
    setBusy(true); setErr('')
    const safe = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80)
    const path = `${requestId}/${Date.now()}-${safe}`
    const { error } = await supabase.storage.from('asesorias').upload(path, f, { contentType: f.type || undefined })
    if (error) { setBusy(false); return setErr('No pudimos subir el archivo. Usa PDF, Word o imagen de hasta 10 MB.') }
    await send(path, f.name)
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto rounded-xl bg-[#FAF7F9] p-3">
        {msgs == null ? <span className="text-center text-xs text-tinta-suave">Cargando…</span>
          : msgs.length === 0 ? <span className="py-3 text-center text-xs text-tinta-suave">Aún no hay mensajes. La asesoría se conversa aquí, dentro de VINKA{as === 'candidate' ? '; apenas VINKA confirme tu pago te escribiremos con los próximos pasos' : ''}.</span>
          : msgs.map((m) => {
            const mine = !!m.sender_id && m.sender_id === user?.id
            if (m.sender_kind === 'system') return (
              <div key={m.id} className="flex flex-col items-center gap-0.5 self-stretch">
                <span className="text-[11px] font-semibold text-tinta-suave">{who(m, as, user?.id, advisorName)} · {fmt(m.created_at)}</span>
                <span className="whitespace-pre-wrap rounded-2xl border border-[#E4D8EE] bg-[#F7F0FB] px-3 py-2 text-sm leading-relaxed text-[#3D2350]">{m.body}</span>
              </div>
            )
            return (
              <div key={m.id} className={`flex max-w-[85%] flex-col gap-0.5 ${mine ? 'self-end items-end' : 'self-start items-start'}`}>
                <span className="text-[11px] font-semibold text-tinta-suave">{who(m, as, user?.id, advisorName)} · {fmt(m.created_at)}</span>
                {m.file_path ? (
                  <a href={urls[m.file_path] || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!urls[m.file_path]} className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm font-semibold ${urls[m.file_path] ? '' : 'pointer-events-none opacity-60'} ${mine ? 'bg-rosa-accion text-white' : 'border border-linea bg-white text-tinta'}`}>
                    <Svg name="doc" size={18} />{m.file_name || 'Archivo'}<Svg name="download" size={16} />
                  </a>
                ) : (
                  <span className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${mine ? 'bg-rosa-accion text-white' : 'border border-linea bg-white text-tinta'}`}>{m.body}</span>
                )}
              </div>
            )
          })}
        <div ref={end} />
      </div>
      {!disabled && as === 'candidate' && msgs && !msgs.some((m) => m.sender_kind !== 'candidate') && (
        <span className="rounded-xl bg-[#F7F0FB] px-3 py-2.5 text-center text-sm leading-snug text-[#4A2163]">Apenas VINKA confirme tu pago te escribiremos aquí con el plazo y los próximos pasos. Podrás responder de inmediato.</span>
      )}
      {!disabled && !(as === 'candidate' && msgs && !msgs.some((m) => m.sender_kind !== 'candidate')) && (
        <>
          <div className="flex items-end gap-2">
            <button type="button" aria-label="Adjuntar archivo" disabled={busy} onClick={() => file.current?.click()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-linea bg-white text-tinta-3">
              {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-tinta-3 border-t-transparent" /> : <Svg name="plus" size={20} />}
            </button>
            <input ref={file} type="file" accept={ACCEPT} className="hidden" onChange={upload} />
            <textarea className="textarea min-h-[44px] flex-1 py-2.5" rows={1} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escribe un mensaje" />
            <button type="button" aria-label="Enviar" disabled={!body.trim()} onClick={() => send()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rosa-accion text-white disabled:opacity-40"><Svg name="send" size={20} /></button>
          </div>
          {as !== 'admin' && <span className="text-[11px] leading-snug text-tinta-suave">Por seguridad, no compartas teléfonos, correos ni redes sociales. Archivos: PDF, Word o imagen de hasta 10 MB.</span>}
        </>
      )}
      <ErrorBox>{err}</ErrorBox>
    </div>
  )
}
