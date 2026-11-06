import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Empty, ErrorBox, Screen, Spinner, TopBar } from '../components/ui'
import { NotifyCard } from '../components/NotifyCard'
import { InstallBanner } from '../components/InstallBanner'

const ICON = {
  match: ['#D02E72', 'M5 12.5l4.5 4.5L19 7.5'],
  interview_booked: ['#1F6FB2', 'M3.5 10h17M8 3v4M16 3v4M5 5h14a1.5 1.5 0 011.5 1.5V19a1.5 1.5 0 01-1.5 1.5H5A1.5 1.5 0 013.5 19V6.5A1.5 1.5 0 015 5z'],
  interview_cancelled: ['#6B5F6E', 'M6 6l12 12M18 6L6 18'],
  interview_reminder: ['#B85F00', 'M12 7v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z'],
  stage_oferta: ['#B85F00', 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z'],
  stage_contratado: ['#1E6B3F', 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z'],
  company_verified: ['#1F6FB2', 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'],
}
const ago = (d) => {
  const s = (Date.now() - new Date(d)) / 1000
  if (s < 60) return 'ahora'; if (s < 3600) return `hace ${Math.floor(s / 60)} min`; if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  return new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

export function EmailToggle() {
  const { profile, refresh } = useAuth()
  const [err, setErr] = useState('')
  const toggle = async () => {
    const { error } = await supabase.rpc('set_email_notifications', { p_on: !profile.email_notifications })
    if (error) setErr(errMsg(error)); else refresh()
  }
  return (
    <div className="card flex flex-col gap-2 p-4">
      <label className="flex items-center justify-between gap-3">
        <span className="flex flex-col"><span className="label">Avisos por correo</span>
          <span className="text-xs leading-snug text-tinta-3">Matches, entrevistas y cambios de etapa de tus procesos.</span></span>
        <input type="checkbox" role="switch" className="h-6 w-6 shrink-0 accent-[#D02E72]" checked={!!profile?.email_notifications} onChange={toggle} />
      </label>
      {err && <span className="text-xs text-[#B42318]">{err}</span>}
    </div>
  )
}

export default function Notifications() {
  const nav = useNavigate()
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [settings, setSettings] = useState(false)
  const load = async () => {
    const { data, error } = await supabase.from('notifications').select('*').neq('kind', 'message').order('created_at', { ascending: false }).limit(60)
    if (error) setErr(errMsg(error)); setRows(data || [])
  }
  useEffect(() => { load() }, [])
  const open = async (n) => {
    if (!n.read_at) { await supabase.rpc('mark_notifications_read', { p_ids: [n.id] }); window.dispatchEvent(new Event('vinka-notifs-read')) }
    nav(n.url || '/')
  }
  const readAll = async () => { await supabase.rpc('mark_notifications_read', { p_ids: null }); window.dispatchEvent(new Event('vinka-notifs-read')); load() }
  const unread = (rows || []).filter((r) => !r.read_at).length

  return (
    <Screen className="bg-rosa-fondo">
      <TopBar back title="Avisos" right={<button onClick={() => setSettings(!settings)} className="h-11 px-1 text-sm font-semibold text-rosa-texto">{settings ? 'Listo' : 'Ajustes'}</button>} />
      <div className="flex flex-col gap-3 px-5 pb-10">
        {settings ? (
          <>
            <NotifyCard />
            <EmailToggle />
            <InstallBanner always />
          </>
        ) : (
          <>
            <NotifyCard compact />
            <InstallBanner />
            {unread > 0 && <button onClick={readAll} className="self-end text-sm font-semibold text-rosa-texto">Marcar todos como leídos</button>}
            <ErrorBox>{err}</ErrorBox>
            {rows == null ? <Spinner /> : rows.length === 0 ? (
              <Empty title="Sin avisos todavía">Aquí verás tus matches, entrevistas y cada avance de tus procesos.</Empty>
            ) : rows.map((n) => {
              const [color, path] = ICON[n.kind] || ['#302538', 'M12 8v5M12 16.5v.5M12 21a9 9 0 110-18 9 9 0 010 18z']
              return (
                <button key={n.id} onClick={() => open(n)} className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left ${n.read_at ? 'border-[#EEE3EA] bg-white' : 'border-rosa-borde bg-rosa-palido'}`}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white" style={{ color }}>
                    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex justify-between gap-2"><span className="text-[15px] font-semibold">{n.title}</span><span className="shrink-0 text-[11px] text-tinta-suave">{ago(n.created_at)}</span></span>
                    <span className="text-[13px] leading-snug text-tinta-2">{n.body}</span>
                  </span>
                  {!n.read_at && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-rosa-accion" aria-label="Sin leer" />}
                </button>
              )
            })}
          </>
        )}
      </div>
    </Screen>
  )
}
