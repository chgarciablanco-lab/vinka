import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { ErrorBox, Screen, Sheet, Spinner, Svg, Toast, TopBar } from '../../components/ui'
import { CandidateDossier } from '../../components/Dossier'

export const SERVICE_STATUS = {
  solicitada: ['Solicitada', 'bg-[#F4EEF2] text-tinta-2', 'Te contactaremos pronto para coordinar.'],
  pago_pendiente: ['Pago pendiente', 'bg-naranja-palido text-naranja-texto', 'Te enviamos los datos para pagar. Al confirmar el pago comenzamos.'],
  en_curso: ['En curso', 'bg-[#F7F0FB] text-[#6B2E8F]', 'Un reclutador está trabajando contigo.'],
  entregada: ['Entregada', 'bg-[#EAF6EF] text-[#134A2B]', '¡Listo! Revisa la nota del reclutador.'],
  aprobada: ['Finalizada', 'bg-[#EAF6EF] text-[#134A2B]', 'Asesoría finalizada. Tus archivos y ofertas quedan guardados aquí.'],
  cancelada: ['Cancelada', 'bg-[#F1EDF0] text-tinta-3', ''],
}
export const CONTACTO = [['whatsapp', 'WhatsApp'], ['correo', 'Correo'], ['videollamada', 'Videollamada']]
const money = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`
const fmt = (d) => new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })

/** Asesoría con reclutador: servicios opcionales y pagados para mejorar el CV y la búsqueda de empleo. */
export default function Advisory() {
  const [services, setServices] = useState(null)
  const [mine, setMine] = useState([])
  const [err, setErr] = useState('')
  const [pick, setPick] = useState(null)
  const [form, setForm] = useState({ goal: '', contact: 'whatsapp', consent: false })
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [chat, setChat] = useState(null)

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('career_services').select('*').eq('active', true).order('sort'),
      supabase.from('service_requests').select('*').order('created_at', { ascending: false }),
    ])
    if (a.error) setErr(errMsg(a.error))
    setServices(a.data || []); setMine(b.data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const open = (s) => { setPick(s); setErr(''); setForm({ goal: '', contact: 'whatsapp', consent: false }) }
  const request = async () => {
    setErr('')
    if (!form.consent) return setErr('Para continuar, autoriza que un reclutador vea tu perfil y te contacte.')
    setBusy(true)
    const { error } = await supabase.rpc('request_career_service', { p_service: pick.id, p_goal: form.goal, p_contact: form.contact, p_consent: form.consent })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setPick(null); setToast('¡Solicitud enviada! Te contactaremos para coordinar.'); load()
  }
  const cancel = async (r) => {
    const { error } = await supabase.rpc('cancel_service_request', { p_id: r.id })
    if (error) return setErr(errMsg(error))
    setToast('Solicitud cancelada'); load()
  }
  const openReq = (id) => mine.find((r) => r.service_id === id && ['solicitada', 'pago_pendiente', 'en_curso'].includes(r.status))

  return (
    <Screen className="bg-rosa-fondo" wide>
      <TopBar back="/perfil" title="Asesoría con reclutador" />
      <div className="flex flex-col gap-4 px-5 pb-10 lg:px-8">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[22px] font-bold leading-tight">Un reclutador te ayuda con tu CV y tu búsqueda</h1>
          <p className="text-sm leading-relaxed text-tinta-2">Reclutadores con experiencia en selección te ayudan a mostrar mejor lo que sabes hacer y a encontrar ofertas que calcen contigo.</p>
        </div>

        {mine.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold">Tus solicitudes</span>
            {mine.map((r) => {
              const st = SERVICE_STATUS[r.status] || [r.status, 'bg-[#F4EEF2]', '']
              return (
                <div key={r.id} className="card flex flex-col gap-1.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex flex-col"><span className="text-[15px] font-semibold">{r.service_name}</span><span className="text-xs text-tinta-3">{money(r.price_clp)} · solicitada el {fmt(r.created_at)}</span></span>
                    <span className={`pill shrink-0 ${st[1]}`}>{st[0]}</span>
                  </div>
                  {st[2] && <p className="text-sm text-tinta-2">{st[2]}</p>}
                  {r.assigned_name && r.status !== 'cancelada' && <span className="text-sm">Tu asesor/a: <b>{r.assigned_name}</b>, reclutador/a de VINKA</span>}
                  {r.admin_note && <div className="rounded-xl bg-[#F7F0FB] px-3 py-2.5 text-sm leading-relaxed text-[#4A2163]"><b>Mensaje del reclutador:</b> {r.admin_note}</div>}
                  {r.status !== 'cancelada' && (
                    <button className="btn-sm self-start border border-rosa-accion bg-white text-rosa-texto" onClick={() => setChat(chat === r.id ? null : r.id)}>
                      <Svg name="chat" size={16} className="mr-1.5" />{chat === r.id ? 'Ocultar detalle' : 'Conversación, sesiones, CV y ofertas'}
                    </button>
                  )}
                  {chat === r.id && <CandidateDossier r={r} />}
                  {['solicitada', 'pago_pendiente'].includes(r.status) && <button className="self-start text-sm font-semibold text-tinta-3 underline" onClick={() => cancel(r)}>Cancelar solicitud</button>}
                </div>
              )
            })}
          </div>
        )}

        <ErrorBox>{!pick && err}</ErrorBox>
        {services == null ? <Spinner /> : (
          <div className="grid gap-3 lg:grid-cols-3">
            {services.map((s) => {
              const pending = openReq(s.id)
              const featured = s.id === 'completa'
              return (
                <div key={s.id} className={`card flex flex-col gap-3 p-4 ${featured ? 'border-2 border-rosa-accion' : ''}`}>
                  {featured && <span className="self-start rounded-full bg-rosa-accion px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">Más completa</span>}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[17px] font-bold">{s.name}</span>
                    <span className="font-display text-[26px] font-bold leading-tight">{money(s.price_clp)}</span>
                    <span className="text-xs text-tinta-3">Pago único, IVA incluido · {s.delivery}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-tinta-2">{s.summary}</p>
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {s.includes.map((x) => <li key={x} className="flex gap-2"><Svg name="check" size={18} className="shrink-0 text-[#2F7A4F]" />{x}</li>)}
                  </ul>
                  <div className="mt-auto pt-1">
                    {pending ? <span className="block rounded-xl bg-[#F4EEF2] px-3 py-3 text-center text-sm font-semibold text-tinta-2">Solicitud {SERVICE_STATUS[pending.status][0].toLowerCase()}</span>
                      : <button className={featured ? 'btn w-full' : 'btn-sec w-full'} onClick={() => open(s)}>Solicitar</button>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="card flex flex-col gap-2 p-4 text-[13px] leading-relaxed text-tinta-3">
          <span className="text-sm font-semibold text-tinta">Importante</span>
          <p>Es un servicio opcional. <b>Postular en VINKA siempre es gratis</b> y contratar una asesoría no cambia cómo te ven las empresas ni tus matches.</p>
          <p>La asesoría te ayuda a presentarte mejor, pero no garantiza un empleo. Pagas recién cuando un reclutador te contacta y confirma el servicio contigo.</p>
          <p>Más detalles en los <Link to="/legal/terminos" className="underline">términos de uso</Link>.</p>
        </div>
      </div>

      <Sheet open={!!pick} onClose={() => setPick(null)} title={pick ? `Solicitar ${pick.name}` : ''}>
        {pick && (
          <div className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between rounded-xl bg-[#F7F0FB] px-4 py-3"><span className="text-sm font-semibold text-[#4A2163]">{pick.name}</span><span className="font-display text-xl font-bold text-[#4A2163]">{money(pick.price_clp)}</span></div>
            <label className="flex flex-col gap-1.5"><span className="label">¿Qué te gustaría lograr? (opcional)</span>
              <textarea className="textarea h-24" maxLength={1000} value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder="Ej.: quiero cambiarme de retail a un cargo administrativo en Talca" /></label>
            <fieldset><legend className="label mb-2">¿Cómo prefieres que te contactemos?</legend>
              <div className="grid grid-cols-3 gap-2">{CONTACTO.map(([k, l]) => (
                <button key={k} type="button" aria-pressed={form.contact === k} onClick={() => setForm({ ...form, contact: k })} className={`chip h-11 justify-center px-2 text-[13px] ${form.contact === k ? 'chip-on' : ''}`}>{l}</button>
              ))}</div></fieldset>
            <label className="flex items-start gap-2.5 rounded-xl border border-rosa-borde bg-rosa-fondo p-3 text-[13px] leading-snug">
              <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D02E72]" />
              Autorizo que un reclutador de VINKA vea mi perfil laboral y me contacte por teléfono o correo para coordinar esta asesoría y su pago.
            </label>
            <p className="hint">No pagas nada ahora. Te contactaremos para confirmar el servicio y enviarte los datos de pago.</p>
            <ErrorBox>{err}</ErrorBox>
            <div className="grid grid-cols-2 gap-2"><button className="btn-sec" onClick={() => setPick(null)}>Cancelar</button><button className="btn" disabled={busy} onClick={request}>{busy ? 'Enviando…' : 'Enviar solicitud'}</button></div>
          </div>
        )}
      </Sheet>
      <Toast msg={toast} onDone={() => setToast('')} />
    </Screen>
  )
}
