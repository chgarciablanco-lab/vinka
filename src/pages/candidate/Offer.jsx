import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { clp } from '../../lib/catalog'
import { useAuth } from '../../lib/auth'
import { Empty, ErrorBox, Screen, Sheet, Spinner, Svg, TopBar } from '../../components/ui'

const fmt = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '')

/** Carta oferta: la ve y responde la persona candidata; la empresa la ve en modo lectura */
export default function Offer() {
  const { id } = useParams()
  const nav = useNavigate()
  const { profile } = useAuth()
  const isCand = profile?.role === 'candidate'
  const [o, setO] = useState(null)
  const [co, setCo] = useState('')
  const [err, setErr] = useState('')
  const [reject, setReject] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => supabase.from('offers').select('*').eq('id', id).maybeSingle().then(async ({ data }) => {
    setO(data || false)
    if (data) { const { data: c } = await supabase.from('companies').select('display_name').eq('id', data.company_id).maybeSingle(); setCo(c?.display_name || 'La empresa') }
  })
  useEffect(() => { load() }, [id]) // eslint-disable-line
  if (o === null) return <Spinner />
  if (o === false) return <Screen><TopBar back="/chats" title="" /><div className="p-6"><Empty title="Oferta no disponible">No encontramos esta oferta.</Empty></div></Screen>

  const respond = async (accept) => {
    setErr(''); setBusy(true)
    const { error } = await supabase.rpc('respond_offer', { p_id: id, p_accept: accept, p_note: note.trim() })
    setBusy(false); setReject(false)
    if (error) return setErr(errMsg(error))
    load()
  }
  const expired = o.expires_on && new Date(o.expires_on + 'T23:59:59') < new Date()
  const rows = [
    ['Cargo', o.position], ['Renta mensual', o.salary ? `${clp(o.salary)} ${o.salary_type === 'bruto' ? 'bruto' : 'líquido'}` : 'A conversar'],
    ['Contrato', o.contract], ['Jornada', o.schedule], ['Fecha de inicio', fmt(o.start_date)], ['Lugar de trabajo', o.location],
  ].filter(([, v]) => v)
  return (
    <Screen className="bg-[#FFFAF4]">
      <TopBar back={() => nav(`/chats/${o.match_id}`)} title="Carta oferta" right={<button aria-label="Imprimir o guardar PDF" onClick={() => window.print()} className="flex h-11 w-11 items-center justify-center"><Svg name="download" /></button>} />
      <div className="flex flex-col gap-4 px-5 pb-10 pt-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-widest text-naranja-texto">{co}</span>
          <h1 className="text-[26px] font-bold leading-tight">Te ofrecemos el cargo de {o.position}</h1>
          <span className="text-xs text-tinta-suave">Enviada el {new Date(o.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
        {o.message && <p className="whitespace-pre-wrap rounded-2xl bg-white p-4 text-[15px] leading-relaxed shadow-sm">{o.message}</p>}
        <div className="card overflow-hidden">
          {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-b border-[#F1E7ED] px-4 py-3 text-sm last:border-0"><span className="text-tinta-3">{k}</span><span className="text-right font-semibold">{v}</span></div>)}
        </div>
        {o.benefits && <div className="card p-4 text-sm leading-relaxed"><span className="mb-1 block text-xs font-semibold text-tinta-3">Beneficios</span><span className="whitespace-pre-wrap">{o.benefits}</span></div>}
        {o.expires_on && o.status === 'enviada' && <p className={`text-sm ${expired ? 'text-[#B42318]' : 'text-tinta-2'}`}>{expired ? 'Esta oferta venció el ' : 'Responde antes del '}<b>{fmt(o.expires_on)}</b>.</p>}
        <ErrorBox>{err}</ErrorBox>
        {isCand && o.status === 'enviada' && !expired && (
          <div className="flex flex-col gap-2 print:hidden">
            <button className="btn" disabled={busy} onClick={() => respond(true)}>Aceptar oferta</button>
            <button className="btn-sec" disabled={busy} onClick={() => setReject(true)}>No aceptar</button>
            <Link to={`/chats/${o.match_id}`} className="py-2 text-center text-sm font-semibold text-rosa-texto">Tengo dudas: escribir a {co}</Link>
          </div>
        )}
        {o.status === 'aceptada' && <div className="rounded-2xl border border-[#A9D9BC] bg-[#EAF6EF] p-4 text-sm text-[#134A2B]">{isCand ? <><b>¡Aceptaste esta oferta!</b> {co} te contactará para coordinar el contrato y tu primer día.</> : <><b>La persona aceptó la oferta.</b> Márcala como contratada cuando confirmen el ingreso.</>}</div>}
        {o.status === 'rechazada' && <div className="rounded-2xl bg-[#F4EEF2] p-4 text-sm text-tinta-2">{isCand ? 'No aceptaste esta oferta.' : 'La persona no aceptó la oferta.'}{o.response_note && <> Comentario: “{o.response_note}”</>}</div>}
        {o.status === 'retirada' && <div className="rounded-2xl bg-[#F4EEF2] p-4 text-sm text-tinta-2">La empresa retiró o reemplazó esta oferta. Revisa el chat.</div>}
        <p className="text-xs leading-relaxed text-tinta-suave">La carta oferta expresa la intención de contratarte y no reemplaza al contrato de trabajo. VINKA nunca te pedirá dinero; una oferta real tampoco.</p>
      </div>
      <Sheet open={reject} onClose={() => setReject(false)} title="No aceptar la oferta">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5"><span className="label">¿Quieres contarle a la empresa por qué? (opcional)</span>
            <textarea className="textarea h-28" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: acepté otra oferta" /></label>
          <button className="btn" disabled={busy} onClick={() => respond(false)}>Confirmar</button>
        </div>
      </Sheet>
    </Screen>
  )
}
