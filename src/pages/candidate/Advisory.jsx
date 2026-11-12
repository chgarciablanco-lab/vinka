import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { ErrorBox, Screen, Sheet, Spinner, Svg, Toast, TopBar } from '../../components/ui'
import { Checkout, Receipts } from '../../components/Checkout'
import { CandidateDossier, ServiceProgress, ServiceTimeline } from '../../components/Dossier'
import { AdvisorCard, AdvisorChooser, AdvisorPhoto, AdvisorSheet, ReviewSheet, Stars, useAdvisorDirectory } from '../../components/AdvisorProfile'

// Texto del botón cuando ya hay una solicitud abierta de ese servicio
const PENDING_TXT = { solicitada: 'Ya la solicitaste', pago_pendiente: 'Pago pendiente', en_curso: 'Asesoría en curso', entregada: 'En revisión de VINKA' }
export const SERVICE_STATUS = {
  solicitada: ['Solicitada', 'bg-[#F4EEF2] text-tinta-2', 'VINKA te escribirá por el chat de la asesoría para coordinar el pago.'],
  pago_pendiente: ['Pago pendiente', 'bg-naranja-palido text-naranja-texto', 'Te enviamos los datos para pagar. Al confirmar el pago comenzamos.'],
  en_curso: ['En curso', 'bg-[#F7F0FB] text-[#6B2E8F]', 'Tu asesor/a está trabajando contigo. Abajo ves lo que incluye tu asesoría y cuánto va listo.'],
  entregada: ['En revisión de VINKA', 'bg-[#EAF6EF] text-[#134A2B]', 'Tu asesor/a terminó. VINKA está revisando que esté todo lo que incluye tu asesoría; te avisaremos.'],
  aprobada: ['Finalizada', 'bg-[#EAF6EF] text-[#134A2B]', 'Asesoría finalizada. Tus archivos y ofertas quedan guardados aquí.'],
  cancelada: ['Cancelada', 'bg-[#F1EDF0] text-tinta-3', ''],
}
// Recorrido de cada solicitud y qué viene ahora, en una sola línea
const STEPS = ['Solicitada', 'Pago', 'En curso', 'Revisión', 'Finalizada']
const STEP_OF = { solicitada: 0, pago_pendiente: 1, en_curso: 2, entregada: 3, aprobada: 4 }
const NEXT = {
  solicitada: 'VINKA te escribirá por el chat de la asesoría para confirmar el servicio y enviarte los datos de pago.',
  pago_pendiente: 'Paga con tarjeta aquí mismo y tu asesoría empieza al instante.',
  en_curso: 'Trabaja con tu asesor/a por el chat. Abajo ves lo que incluye y cuánto va listo.',
  entregada: 'VINKA revisa que esté todo lo que incluye tu asesoría y te avisa.',
}
function Stepper({ status }) {
  const at = STEP_OF[status]
  if (at == null) return null
  return (
    <ol className="flex items-center gap-1" aria-label={`Paso ${at + 1} de ${STEPS.length}: ${STEPS[at]}`}>
      {STEPS.map((l, i) => (
        <li key={l} className="flex flex-1 flex-col items-center gap-1">
          <span className={`h-1.5 w-full rounded-full ${i <= at ? 'bg-rosa-accion' : 'bg-[#EDE3EA]'}`} />
          <span className={`text-[10px] leading-none ${i === at ? 'font-bold text-tinta' : 'text-tinta-suave'}`}>{l}</span>
        </li>
      ))}
    </ol>
  )
}
const money = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`
const fmt = (d) => new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })

/** Asesoría con reclutador: servicios opcionales y pagados para mejorar el CV y la búsqueda de empleo. */
export default function Advisory() {
  const [services, setServices] = useState(null)
  const [mine, setMine] = useState([])
  const [err, setErr] = useState('')
  const [pick, setPick] = useState(null)
  const [form, setForm] = useState({ goal: '', consent: false })
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [chat, setChat] = useState(null)
  const [dir, reloadDir, dirFailed] = useAdvisorDirectory() // asesores con perfil publicado
  const [busyAlt, setBusyAlt] = useState(false) // el elegido se quedó sin cupo al enviar
  const [change, setChange] = useState(null) // solicitud a la que se le cambia el asesor elegido
  const [view, setView] = useState(null)
  const [reviews, setReviews] = useState({}) // valoraciones que ya hice, por solicitud
  const [rate, setRate] = useState(null) // solicitud que estoy valorando
  const [payFor, setPayFor] = useState(null) // solicitud que estoy pagando
  const [paid, setPaid] = useState(0)

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('career_services').select('*').eq('active', true).order('sort'),
      supabase.from('service_requests').select('*').order('created_at', { ascending: false }),
    ])
    if (a.error) setErr(errMsg(a.error))
    setServices(a.data || []); setMine(b.data || [])
    supabase.rpc('my_reviews').then(({ data }) => setReviews(data || {}))
  }, [])
  useEffect(() => { load() }, [load])

  const open = (s) => { setPick(s); setErr(''); setBusyAlt(false); setForm({ goal: '', consent: false, advisor: null, mode: 'vinka' }) }
  const request = async () => {
    setErr('')
    if (form.mode === 'asesor' && !form.advisor) return setErr('Elige a una persona o vuelve a «VINKA elige por mí».')
    if (!form.consent) return setErr('Para continuar, autoriza que un reclutador vea tu perfil y te contacte.')
    setBusy(true); setBusyAlt(false)
    const { error } = await supabase.rpc('request_career_service', { p_service: pick.id, p_goal: form.goal, p_contact: 'chat', p_consent: form.consent, p_advisor: form.advisor || null })
    setBusy(false)
    if (error) {
      reloadDir()
      if (form.advisor && /no está disponible/.test(error.message || '')) setBusyAlt(true)
      return setErr(errMsg(error))
    }
    setPick(null); setToast('¡Solicitud enviada! Te escribiremos por el chat de tu asesoría.'); load()
  }
  const cancel = async (r) => {
    const { error } = await supabase.rpc('cancel_service_request', { p_id: r.id })
    if (error) return setErr(errMsg(error))
    setToast('Solicitud cancelada'); load()
  }
  const changeTo = async (r, advisorId) => {
    setErr('')
    const { error } = await supabase.rpc('request_change_advisor', { p_request: r.id, p_advisor: advisorId })
    if (error) { reloadDir(); return setErr(errMsg(error)) }
    setChange(null); setView(null); setToast(advisorId ? 'Listo: cambiaste tu asesor/a' : 'Listo: VINKA elegirá a tu asesor/a'); load()
  }
  const answer = async (r, yes) => {
    setErr('')
    const { error } = await supabase.rpc('request_answer_proposal', { p_id: r.id, p_accept: yes })
    if (error) { reloadDir(); return setErr(errMsg(error)) }
    setToast(yes ? 'Listo: ya tienes asesor/a' : 'Propuesta rechazada'); load()
  }
  const byId = (id) => (dir || []).find((a) => a.id === id)
  const openReq = (id) => mine.find((r) => r.service_id === id && ['solicitada', 'pago_pendiente', 'en_curso'].includes(r.status))

  return (
    <Screen className="bg-rosa-fondo" wide>
      <TopBar back="/perfil" title="Asesoría con reclutador" />
      <div className="flex flex-col gap-4 px-5 pb-10 lg:px-8">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[22px] font-bold leading-tight">Un reclutador te ayuda con tu CV y tu búsqueda</h1>
          <p className="text-sm leading-relaxed text-tinta-2">Reclutadores con experiencia en selección te ayudan a mostrar mejor lo que sabes hacer y a encontrar ofertas que calcen contigo. Puedes elegir a tu asesor/a o dejar que VINKA elija por ti.</p>
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
                  <Stepper status={r.status} />
                  {NEXT[r.status] ? <p className="text-sm text-tinta-2"><b>Próximo paso:</b> {NEXT[r.status]}</p> : st[2] && r.status !== 'aprobada' && <p className="text-sm text-tinta-2">{st[2]}</p>}
                  {r.status === 'pago_pendiente' && (
                    <button className="btn h-11" onClick={() => setPayFor(r)}>Pagar {money(r.price_clp)} con tarjeta</button>
                  )}
                  {/* Asesoría finalizada: valorar al asesor/a (una vez) o ver la valoración hecha */}
                  {r.status === 'aprobada' && r.assigned_to && (reviews[r.id] ? (
                    <div className="flex flex-col gap-1 rounded-xl bg-[#FAF7F9] px-3 py-2 text-[13px]">
                      <span className="flex items-center gap-2">Tu valoración: <Stars n={reviews[r.id].overall} />{reviews[r.id].status === 'oculta' && <span className="text-tinta-3">(oculta por VINKA)</span>}</span>
                      {reviews[r.id].reply && <span className="text-[12px] text-[#4A2163]"><b>Respuesta:</b> {reviews[r.id].reply}</span>}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 rounded-xl border border-[#F3D9A4] bg-[#FFFAEE] p-3 text-sm">
                      <span><b>Próximo paso:</b> valora a tu asesor/a. Ayudas a otros postulantes a elegir.</span>
                      <button className="btn-sm h-10 self-start bg-rosa-accion px-4 text-white" onClick={() => setRate(r)}>Valorar asesoría</button>
                    </div>
                  ))}
                  {r.status === 'aprobada' && st[2] && <p className="text-[13px] text-tinta-3">{st[2]}</p>}
                  {r.assigned_to && r.status !== 'cancelada' && (byId(r.assigned_to) ? (
                    <button className="flex items-center gap-2.5 self-start text-left text-sm" onClick={() => setView(byId(r.assigned_to))}>
                      <AdvisorPhoto a={byId(r.assigned_to)} size={36} /><span>Tu asesor/a: <b>{byId(r.assigned_to).display_name}</b> <span className="font-semibold text-rosa-texto">Ver perfil</span></span>
                    </button>
                  ) : <span className="text-sm">Tu asesor/a: <b>{r.assigned_name}</b>, reclutador/a de VINKA</span>)}
                  {/* VINKA propone un reemplazo: nada cambia hasta que la persona acepte */}
                  {r.proposed_advisor && ['solicitada', 'pago_pendiente', 'en_curso'].includes(r.status) && (
                    <div className="flex flex-col gap-2 rounded-xl border border-[#F3D9A4] bg-[#FFFAEE] p-3 text-sm">
                      <span className="flex items-center gap-2.5">{byId(r.proposed_advisor) && <AdvisorPhoto a={byId(r.proposed_advisor)} size={36} />}
                        <span><b>VINKA te propone a {byId(r.proposed_advisor)?.display_name || 'otra persona'}</b>{r.proposal_note ? `: ${r.proposal_note}` : ''}</span></span>
                      {byId(r.proposed_advisor) && <button className="self-start text-[13px] font-semibold text-rosa-texto" onClick={() => setView(byId(r.proposed_advisor))}>Ver su perfil</button>}
                      <span className="text-[12px] text-tinta-3">Nada cambia hasta que respondas.</span>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button className="btn-sm h-10 bg-rosa-accion px-2 text-white" onClick={() => answer(r, true)}>Aceptar</button>
                        <button className="btn-sm h-10 border border-linea bg-white px-2 text-[13px]" onClick={() => setChange(r)}>Elegir otro/a</button>
                        <button className="btn-sm h-10 border border-linea bg-white px-2 text-[13px]" onClick={() => changeTo(r, null)}>VINKA elige</button>
                      </div>
                    </div>
                  )}
                  {/* Antes de empezar: a quién eligió y qué hacer si ya no está disponible */}
                  {!r.assigned_to && !r.proposed_advisor && ['solicitada', 'pago_pendiente'].includes(r.status) && (
                    r.choice === 'asesor' && byId(r.preferred_advisor) ? (
                      <div className={`flex flex-col gap-2 rounded-xl p-3 text-sm ${byId(r.preferred_advisor).available ? 'bg-[#F7F0FB] text-[#4A2163]' : 'bg-naranja-palido text-naranja-texto'}`}>
                        <span className="flex items-center gap-2.5"><AdvisorPhoto a={byId(r.preferred_advisor)} size={32} />
                          <span>{byId(r.preferred_advisor).available ? <>Elegiste a <b>{byId(r.preferred_advisor).display_name}</b>. VINKA la/lo asigna al confirmar el pago.</> : <><b>{byId(r.preferred_advisor).display_name}</b> no tiene cupo ahora. Elige a otra persona o deja que VINKA elija.</>}</span></span>
                        <div className="flex flex-wrap gap-2">
                          <button className="btn-sm h-9 border border-linea bg-white" onClick={() => setChange(r)}>Elegir otro/a</button>
                          <button className="btn-sm h-9 border border-linea bg-white" onClick={() => changeTo(r, null)}>Que VINKA elija</button>
                        </div>
                      </div>
                    ) : (dir || []).some((a) => (a.services || []).includes(r.service_id)) ? (
                      <span className="text-sm text-tinta-2">VINKA elegirá a tu asesor/a. <button className="font-semibold text-rosa-texto underline" onClick={() => setChange(r)}>Prefiero elegir</button></span>
                    ) : null
                  )}
                  {/* Avance a la vista, sin abrir nada: qué incluye, qué falta y cuándo corresponde */}
                  {['solicitada', 'pago_pendiente'].includes(r.status) && (services || []).find((s) => s.id === r.service_id)?.includes?.length > 0 && (
                    <div className="flex flex-col gap-1 rounded-xl border border-linea bg-white p-3">
                      <span className="text-[13px] font-semibold">Lo que incluye tu asesoría</span>
                      {(services || []).find((s) => s.id === r.service_id).includes.map((x) => <span key={x} className="flex gap-2 text-sm"><Svg name="check" size={16} className="mt-0.5 shrink-0 text-tinta-suave" />{x}</span>)}
                      <span className="text-[11px] text-tinta-suave">Los plazos empiezan a correr cuando VINKA confirme el pago.</span>
                    </div>
                  )}
                  {['en_curso', 'entregada', 'aprobada'].includes(r.status) && <ServiceProgress requestId={r.id} as="candidate" />}
                  {['en_curso', 'entregada'].includes(r.status) && <ServiceTimeline requestId={r.id} />}
                  {r.admin_note && <div className="rounded-xl bg-[#F7F0FB] px-3 py-2.5 text-sm leading-relaxed text-[#4A2163]"><b>Mensaje del reclutador:</b> {r.admin_note}</div>}
                  {r.status !== 'cancelada' && (
                    <button className="btn-sm self-start border border-rosa-accion bg-white text-rosa-texto" onClick={() => setChat(chat === r.id ? null : r.id)}>
                      <Svg name="chat" size={16} className="mr-1.5" />{chat === r.id ? 'Ocultar conversación y archivos' : 'Conversación, CV, sesiones y ofertas'}
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
                    {pending ? <span className="block rounded-xl bg-[#F4EEF2] px-3 py-3 text-center text-sm font-semibold text-tinta-2">{PENDING_TXT[pending.status] || SERVICE_STATUS[pending.status][0]}</span>
                      : <button className={featured ? 'btn w-full' : 'btn-sec w-full'} onClick={() => open(s)}>Solicitar</button>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <Receipts reloadKey={paid} />
        <div className="card flex flex-col gap-2 p-4 text-[13px] leading-relaxed text-tinta-3">
          <span className="text-sm font-semibold text-tinta">Importante</span>
          <p>Es un servicio opcional. <b>Postular en VINKA siempre es gratis</b> y contratar una asesoría no cambia cómo te ven las empresas ni tus matches.</p>
          <p>La asesoría te ayuda a presentarte mejor, pero no garantiza un empleo. Pagas recién cuando VINKA te escribe por el chat de la asesoría y confirma el servicio contigo. Toda la asesoría ocurre dentro de VINKA.</p>
          <p>Más detalles en los <Link to="/legal/terminos" className="underline">términos de uso</Link>.</p>
        </div>
      </div>

      <Sheet open={!!pick} onClose={() => setPick(null)} title={pick ? `Solicitar ${pick.name}` : ''}>
        {pick && (
          <div className="flex flex-col gap-4">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-tinta-suave">1 · Tu asesor/a y lo que buscas</span>
            <AdvisorChooser service={pick.id} list={dir} value={form.advisor} onChange={(id) => { setBusyAlt(false); setForm((f) => ({ ...f, advisor: id })) }}
              mode={form.mode} onMode={(m) => setForm((f) => ({ ...f, mode: m }))} failed={dirFailed} onRetry={reloadDir} />
            <label className="flex flex-col gap-1.5"><span className="label">¿Qué te gustaría lograr? (opcional)</span>
              <textarea className="textarea h-24" maxLength={1000} value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder="Ej.: quiero cambiarme de retail a un cargo administrativo en Talca" /></label>
            <span className="text-[12px] font-semibold uppercase tracking-wide text-tinta-suave">2 · Revisa y confirma</span>
            <div className="flex flex-col gap-2 rounded-xl bg-[#F7F0FB] p-3 text-[13px] leading-snug text-[#4A2163]">
              <span className="flex items-baseline justify-between gap-2"><b className="text-sm">{pick.name}</b><span className="font-display text-xl font-bold">{money(pick.price_clp)}</span></span>
              <span>Pago único, IVA incluido · {pick.delivery}{form.mode === 'asesor' && form.advisor && byId(form.advisor) ? <> · con <b>{byId(form.advisor).display_name}</b></> : ' · VINKA elige a tu asesor/a'}</span>
              {(pick.includes || []).length > 0 && <span className="flex flex-col gap-0.5">{pick.includes.map((x) => <span key={x} className="flex gap-1.5"><Svg name="check" size={15} className="mt-0.5 shrink-0" />{x}</span>)}</span>}
              <span className="text-[12px]">No pagas nada ahora: VINKA te escribe por el chat de la asesoría para confirmar y enviarte los datos de pago. Todo ocurre dentro de VINKA. Te ayuda a presentarte mejor, pero no garantiza un empleo.</span>
            </div>
            <label className="flex items-start gap-2.5 rounded-xl border border-rosa-borde bg-rosa-fondo p-3 text-[13px] leading-snug">
              <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D02E72]" />
              Autorizo que un reclutador de VINKA vea mi perfil laboral y me escriba por el chat de la asesoría, dentro de VINKA, para coordinarla y su pago.
            </label>
            <ErrorBox>{err}</ErrorBox>
            {busyAlt && (
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-sm h-10 border border-linea bg-white" onClick={() => { setBusyAlt(false); setErr(''); setForm((f) => ({ ...f, advisor: null, mode: 'asesor' })) }}>Elegir a otra persona</button>
                <button className="btn-sm h-10 border border-linea bg-white" onClick={() => { setBusyAlt(false); setErr(''); setForm((f) => ({ ...f, advisor: null, mode: 'vinka' })) }}>Que VINKA elija</button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2"><button className="btn-sec" onClick={() => setPick(null)}>Cancelar</button><button className="btn" disabled={busy} onClick={request}>{busy ? 'Enviando…' : 'Confirmar solicitud'}</button></div>
          </div>
        )}
      </Sheet>
      <Sheet open={!!change} onClose={() => setChange(null)} title="Elige a tu asesor/a">
        {change && (
          <div className="flex flex-col gap-2">
            <ErrorBox>{err}</ErrorBox>
            {(dir || []).filter((a) => (a.services || []).includes(change.service_id)).map((a) => (
              <AdvisorCard key={a.id} a={a} picked={change.preferred_advisor === a.id} onView={setView} onPick={(x) => changeTo(change, x.id)} />
            ))}
            <button className="btn-sec" onClick={() => changeTo(change, null)}>Que VINKA elija por mí</button>
          </div>
        )}
      </Sheet>
      <AdvisorSheet a={view} onClose={() => setView(null)} onPick={change ? (x) => changeTo(change, x.id) : undefined} />
      {payFor && <Checkout kind="asesoria" refId={payFor.id} onClose={() => { setPayFor(null); setPaid((n) => n + 1) }} onDone={() => { setPayFor(null); setPaid((n) => n + 1); setToast('Pago aprobado: tu asesoría comenzó'); load() }} />}
      {rate && <ReviewSheet r={rate} advisorName={byId(rate.assigned_to)?.display_name || rate.assigned_name} onClose={() => setRate(null)} onDone={() => { setRate(null); setToast('¡Gracias! Tu valoración quedó publicada'); load() }} />}
      <Toast msg={toast} onDone={() => setToast('')} />
    </Screen>
  )
}
