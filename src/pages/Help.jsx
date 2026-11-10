import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { ErrorBox, Screen, Svg, Toast, TopBar } from '../components/ui'
import { HelpChat } from '../components/HelpChat'

const KIND = { error: 'Error', mejora: 'Mejora', consulta: 'Consulta' }
const ST = { nuevo: ['Recibido', 'bg-[#F4EEF2] text-tinta-2'], revisando: ['En revisión', 'bg-[#E7F1FB] text-[#1F4E86]'], resuelto: ['Resuelto', 'bg-[#EAF6EF] text-[#134A2B]'], descartado: ['Revisado', 'bg-[#F4EEF2] text-tinta-3'] }

/** Ayuda: asistente, reporte directo de errores o mejoras y estado de mis reportes */
export default function Help() {
  const { session } = useAuth()
  const loc = useLocation()
  const [mine, setMine] = useState(null)
  const [f, setF] = useState({ kind: 'error', summary: '', details: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const load = useCallback(() => { if (session) supabase.from('feedback').select('id, kind, summary, status, admin_note, created_at').order('created_at', { ascending: false }).limit(20).then(({ data }) => setMine(data || [])) }, [session])
  useEffect(() => { load() }, [load])
  const send = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    const { error } = await supabase.rpc('submit_feedback', { p_kind: f.kind, p_summary: f.summary, p_details: f.details, p_path: loc.state?.from || '', p_agent: navigator.userAgent.slice(0, 300) })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setF({ kind: 'error', summary: '', details: '' }); setToast('Gracias. Lo recibimos y te avisaremos cuando lo revisemos.'); load()
  }
  return (
    <Screen className="bg-[#FAF7F9]" wide>
      <TopBar back title="Ayuda" />
      <div className="flex flex-col gap-4 px-5 pb-28 lg:grid lg:grid-cols-[1.3fr_1fr] lg:items-start lg:px-8 lg:pb-10">
        <section className="card flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F7F0FB] text-[#6B2E8F]"><Svg name="chat" size={20} /></span><h2 className="text-[16px] font-semibold">Asistente de VINKA</h2></div>
          <HelpChat className="h-[460px]" />
        </section>
        <div className="flex flex-col gap-4">
          <Link to="/tutoriales" className="card flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rosa-palido text-rosa-oscuro"><Svg name="video" /></span>
            <span className="flex flex-1 flex-col"><span className="text-[15px] font-semibold">Tutoriales y videos</span><span className="text-[13px] text-tinta-3">Guías paso a paso para personas y empresas</span></span>
            <Svg name="chevron" size={18} className="text-tinta-suave" />
          </Link>
          {session ? (
            <>
              <form onSubmit={send} className="card flex flex-col gap-2.5 p-4">
                <span className="text-[15px] font-semibold">Reportar sin el asistente</span>
                <div className="flex gap-1.5">{Object.entries(KIND).map(([k, l]) => <button type="button" key={k} onClick={() => setF({ ...f, kind: k })} className={`chip h-9 text-[13px] ${f.kind === k ? 'chip-on' : ''}`}>{l}</button>)}</div>
                <input className="input" maxLength={300} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} placeholder={f.kind === 'error' ? 'Qué falló, en pocas palabras' : f.kind === 'mejora' ? 'Qué te gustaría que hiciera VINKA' : 'Tu consulta'} />
                <textarea className="textarea h-24" maxLength={4000} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} placeholder={f.kind === 'error' ? 'Qué hiciste, qué esperabas y qué pasó (opcional)' : 'Detalle (opcional)'} />
                <ErrorBox>{err}</ErrorBox>
                <button className="btn" disabled={busy || f.summary.trim().length < 3}>{busy ? 'Enviando…' : 'Enviar'}</button>
                <span className="text-[11px] text-tinta-suave">Guardamos tu nombre, la pantalla y el tipo de dispositivo para poder revisarlo. No incluyas contraseñas ni datos bancarios.</span>
              </form>
              <section className="card flex flex-col gap-2 p-4">
                <span className="text-[15px] font-semibold">Mis reportes</span>
                {mine == null ? <span className="text-sm text-tinta-3">Cargando…</span> : mine.length === 0 ? <span className="text-sm text-tinta-3">Aún no envías reportes.</span> : mine.map((r) => (
                  <div key={r.id} className="flex flex-col gap-0.5 border-b border-[#F1E7ED] pb-2 text-sm last:border-0">
                    <div className="flex items-start justify-between gap-2"><span><b>{KIND[r.kind]}:</b> {r.summary}</span><span className={`pill shrink-0 ${ST[r.status][1]}`}>{ST[r.status][0]}</span></div>
                    <span className="text-xs text-tinta-suave">{new Date(r.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}{r.admin_note ? ` · VINKA: ${r.admin_note}` : ''}</span>
                  </div>
                ))}
              </section>
            </>
          ) : (
            <div className="card flex flex-col gap-2 p-4 text-sm text-tinta-2">
              <span className="text-[15px] font-semibold text-tinta">¿Ya tienes cuenta?</span>
              <span>Para reportar un problema de tu cuenta, ingresa y usa esta misma sección.</span>
              <Link to="/ingresar" className="btn-sm self-start bg-morado text-white">Ingresar</Link>
            </div>
          )}
        </div>
      </div>
      <Toast msg={toast} onDone={() => setToast('')} />
    </Screen>
  )
}
