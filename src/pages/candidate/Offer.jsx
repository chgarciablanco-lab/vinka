import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Empty, ErrorBox, Screen, Sheet, Spinner, Svg, Toast, TopBar } from '../../components/ui'
import { OfferLetter, letterText } from '../../components/OfferLetter'
import { downloadOfferPdf } from '../../lib/offerPdf'

const fmt = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '')

/** Carta oferta formal: la persona la responde; la empresa la descarga, la envía por correo o la edita y reenvía */
export default function Offer() {
  const { id } = useParams()
  const nav = useNavigate()
  const { profile } = useAuth()
  const isCand = profile?.role === 'candidate'
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [reject, setReject] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [mail, setMail] = useState(false)
  const [copyMe, setCopyMe] = useState(true)
  const [toast, setToast] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)
  const load = () => supabase.rpc('offer_letter', { p_id: id }).then(({ data, error }) => setD(error || !data ? false : data))
  useEffect(() => { load() }, [id]) // eslint-disable-line
  if (d === null) return <Spinner />
  if (d === false) return <Screen><TopBar back="/chats" title="" /><div className="p-6"><Empty title="Oferta no disponible">No encontramos esta oferta.</Empty></div></Screen>
  const o = d.offer
  const co = d.company.display_name

  const respond = async (accept) => {
    setErr(''); setBusy(true)
    const { error } = await supabase.rpc('respond_offer', { p_id: id, p_accept: accept, p_note: note.trim() })
    setBusy(false); setReject(false)
    if (error) return setErr(errMsg(error))
    load()
  }
  const sendEmail = async () => {
    setErr(''); setBusy(true)
    const { error } = await supabase.rpc('email_offer', { p_id: id, p_copy_me: copyMe })
    setBusy(false); setMail(false)
    if (error) return setErr(errMsg(error))
    setToast(copyMe ? 'Carta enviada por correo. También te enviamos una copia.' : 'Carta enviada por correo.')
    load()
  }
  const pdf = async () => {
    setErr(''); setPdfBusy(true)
    try { const r = await downloadOfferPdf(d); if (r === 'downloaded') setToast('PDF descargado.') }
    catch { setErr('No pudimos generar el PDF. Inténtalo de nuevo.') }
    setPdfBusy(false)
  }
  const link = `${window.location.origin}/ofertas/${id}`
  const mailto = `mailto:${encodeURIComponent(d.candidate?.email || '')}?subject=${encodeURIComponent(`Carta oferta: ${o.position} · ${co}`)}&body=${encodeURIComponent(`${letterText(d)}\n\nPuedes ver la carta y responder aquí: ${link}`)}`
  const expired = o.expires_on && new Date(o.expires_on + 'T23:59:59') < new Date()
  const live = ['enviada', 'aceptada'].includes(o.status)

  return (
    <Screen className="bg-[#F6F1F4] print:bg-white" wide>
      <div className="print:hidden"><TopBar back={() => nav(isCand ? `/chats/${o.match_id}` : `/vacantes/${o.job_id}/candidato/${o.candidate_id}`)} title="Carta oferta"
        right={<button aria-label="Descargar PDF" disabled={pdfBusy} onClick={pdf} className="flex h-11 w-11 items-center justify-center disabled:opacity-40"><Svg name="download" /></button>} /></div>
      <div className="flex flex-col gap-4 px-4 pb-10 pt-2 lg:flex-row lg:items-start lg:px-8 print:block print:p-0">
        <div className="min-w-0 flex-1 print:w-full"><OfferLetter offer={o} company={d.company} candidate={d.candidate} sender={d.sender || ''} /></div>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:w-80 print:hidden">
          <ErrorBox>{err}</ErrorBox>
          {isCand && o.status === 'enviada' && !expired && (
            <div className="card flex flex-col gap-2 p-4">
              <span className="text-[15px] font-semibold">¿Aceptas la oferta?</span>
              {o.expires_on && <span className="text-sm text-tinta-2">Responde antes del <b>{fmt(o.expires_on)}</b>.</span>}
              <button className="btn" disabled={busy} onClick={() => respond(true)}>Aceptar oferta</button>
              <button className="btn-sec" disabled={busy} onClick={() => setReject(true)}>No aceptar</button>
              <Link to={`/chats/${o.match_id}`} className="py-1 text-center text-sm font-semibold text-rosa-texto">Tengo dudas: escribir a {co}</Link>
            </div>
          )}
          {isCand && o.status === 'enviada' && expired && <div className="rounded-2xl bg-[#FEF3F2] p-4 text-sm text-[#912018]">Esta oferta venció el {fmt(o.expires_on)}. Escríbele a la empresa por el chat.</div>}
          {o.status === 'aceptada' && <div className="rounded-2xl border border-[#A9D9BC] bg-[#EAF6EF] p-4 text-sm text-[#134A2B]">{isCand ? <><b>¡Aceptaste esta oferta!</b> {co} te contactará para coordinar el contrato y tu primer día.</> : <><b>La persona aceptó la oferta.</b> Quedó como contratada; si el ingreso no se concreta, cambia la etapa en su ficha.</>}</div>}
          {o.status === 'rechazada' && <div className="rounded-2xl bg-white p-4 text-sm text-tinta-2">{isCand ? 'No aceptaste esta oferta.' : 'La persona no aceptó la oferta.'}{o.response_note && <> Comentario: “{o.response_note}”</>}</div>}
          {o.status === 'por_aprobar' && <div className="rounded-2xl bg-[#F7F0FB] p-4 text-sm text-[#4B2466]">Esta oferta espera la aprobación de un administrador de la empresa. La persona aún no la ve.</div>}
          {o.status === 'vencida' && <div className="rounded-2xl bg-[#FEF3F2] p-4 text-sm text-[#912018]">{isCand ? 'Esta oferta venció sin respuesta. Escríbele a la empresa por el chat si sigues interesado/a.' : 'Venció sin respuesta. Puedes editarla y reenviarla con una nueva fecha.'}</div>}
          {o.status === 'retirada' && <div className="rounded-2xl bg-white p-4 text-sm text-tinta-2">La empresa retiró o reemplazó esta oferta.{isCand ? ' Revisa el chat.' : ''}</div>}

          {!isCand && d.can_manage && (
            <div className="card flex flex-col gap-2 p-4">
              <span className="text-[15px] font-semibold">Compartir la carta</span>
              <button className="btn-sm h-11 bg-morado text-white disabled:opacity-50" disabled={!live} onClick={() => setMail(true)}><Svg name="send" size={18} className="mr-1.5" />Enviar por correo desde VINKA</button>
              <a href={mailto} className="btn-sm h-11 border border-linea bg-white"><Svg name="chat" size={18} className="mr-1.5" />Abrir en mi correo</a>
              <button className="btn-sm h-11 border border-linea bg-white disabled:opacity-50" disabled={pdfBusy} onClick={pdf}><Svg name="download" size={18} className="mr-1.5" />{pdfBusy ? 'Generando PDF…' : 'Descargar PDF'}</button>
              {['enviada', 'por_aprobar', 'rechazada', 'retirada', 'vencida'].includes(o.status) && <Link to={`/vacantes/${o.job_id}/candidato/${o.candidate_id}?oferta=editar`} className="btn-sm h-11 border border-linea bg-white"><Svg name="edit" size={18} className="mr-1.5" />Editar y reenviar</Link>}
              <span className="text-xs leading-snug text-tinta-3">{o.emailed_at ? `Último envío por correo: ${new Date(o.emailed_at).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ` : ''}«Abrir en mi correo» prepara un correo con el texto de la carta{d.candidate?.email ? '' : ' (la persona aún no comparte su correo: agrégalo tú)'}; adjunta el PDF si quieres. En el celular, «Descargar PDF» te deja guardarlo o enviarlo directo por correo o WhatsApp.</span>
            </div>
          )}
          {isCand && <button className="btn-sm h-11 border border-linea bg-white disabled:opacity-50" disabled={pdfBusy} onClick={pdf}><Svg name="download" size={18} className="mr-1.5" />{pdfBusy ? 'Generando PDF…' : 'Descargar carta en PDF'}</button>}
          <p className="text-xs leading-relaxed text-tinta-suave">La carta oferta expresa la intención de contratar y no reemplaza al contrato de trabajo. VINKA nunca pide dinero; una oferta real tampoco.</p>
        </aside>
      </div>
      <Sheet open={reject} onClose={() => setReject(false)} title="No aceptar la oferta">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5"><span className="label">¿Quieres contarle a la empresa por qué? (opcional)</span>
            <textarea className="textarea h-28" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: acepté otra oferta" /></label>
          <button className="btn" disabled={busy} onClick={() => respond(false)}>Confirmar</button>
        </div>
      </Sheet>
      <Sheet open={mail} onClose={() => setMail(false)} title="Enviar la carta por correo">
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-tinta-2">VINKA envía la carta con el logo de {co} al correo de <b>{d.candidate?.name}</b>, con un botón para responder. La persona también la ve en la app.</p>
          <label className="flex items-center gap-2.5"><input type="checkbox" className="h-5 w-5 accent-[#D02E72]" checked={copyMe} onChange={(e) => setCopyMe(e.target.checked)} />Enviarme una copia a mi correo</label>
          <button className="btn" disabled={busy} onClick={sendEmail}>Enviar ahora</button>
        </div>
      </Sheet>
      <Toast msg={toast} onDone={() => setToast('')} />
    </Screen>
  )
}
