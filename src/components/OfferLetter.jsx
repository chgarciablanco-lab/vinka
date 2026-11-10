import { supabase } from '../lib/supabase'
import { clp } from '../lib/catalog'

export const logoUrl = (path) => (path ? supabase.storage.from('logos').getPublicUrl(path).data.publicUrl : '')
const longDate = (d) => (d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

export const defaultIntro = (position, company) => `Nos complace ofrecerte el cargo de ${position || '…'} en ${company || 'nuestra empresa'}. Después de conocerte durante el proceso de selección, creemos que tu experiencia y tu forma de trabajar aportarán mucho a nuestro equipo. Estas son las condiciones de la oferta:`
export const DEFAULT_CLOSING = 'Esta carta expresa nuestra intención de contratarte y no reemplaza al contrato de trabajo, que firmaremos una vez que aceptes. Si tienes cualquier duda sobre estas condiciones, conversémoslo.\n\nEsperamos contar contigo.'

export function offerRows(o) {
  return [
    ['Cargo', o.position], ['Renta mensual', o.salary ? `${clp(o.salary)} ${o.salary_type === 'bruto' ? 'bruto' : 'líquido'}` : 'A conversar'],
    ['Contrato', o.contract], ['Jornada', o.schedule], ['Fecha de inicio', longDate(o.start_date)], ['Lugar de trabajo', o.location],
  ].filter(([, v]) => v)
}

/** Texto plano de la carta (para el correo de la empresa) */
export function letterText({ offer: o, company: c, candidate }) {
  const L = o.letter || {}
  const lines = [
    `${c.legal_name || c.display_name}${c.rut ? ` · RUT ${c.rut}` : ''}`, `${L.city || c.comuna || ''}${L.city || c.comuna ? ', ' : ''}${longDate(o.created_at || new Date().toISOString())}`, '',
    'CARTA OFERTA', o.position, '', `Estimado/a ${candidate?.name || ''}:`, '', L.intro || defaultIntro(o.position, c.display_name), '',
    ...offerRows(o).map(([k, v]) => `• ${k}: ${v}`), '',
    ...(o.benefits ? [`Beneficios: ${o.benefits}`, ''] : []), ...(o.message ? [o.message, ''] : []),
    L.closing || DEFAULT_CLOSING, '', ...(o.expires_on ? [`Te pedimos responder antes del ${longDate(o.expires_on)}.`, ''] : []),
    'Atentamente,', ...[L.signer_name, L.signer_title].filter(Boolean), c.legal_name || c.display_name,
  ]
  return lines.join('\n').replace(/\n{3,}/g, '\n\n')
}

const Paras = ({ text }) => String(text || '').split(/\n{2,}/).map((t, i) => <p key={i} className="mb-3 whitespace-pre-line">{t}</p>)

/** Carta oferta con formato de documento: logo, membrete, condiciones y firma. Se imprime o guarda como PDF tal cual. */
export function OfferLetter({ offer: o, company: c, candidate }) {
  const L = o.letter || {}
  const logo = logoUrl(c?.logo_path)
  const place = L.city || c?.comuna || ''
  return (
    <article className="offer-letter mx-auto w-full max-w-[720px] rounded-2xl border border-[#E8DEE4] bg-white px-6 py-7 text-[14.5px] leading-relaxed text-[#1F1A22] shadow-sm sm:px-10 sm:py-10 print:max-w-none print:rounded-none print:border-0 print:p-0 print:text-[12.5px] print:leading-snug print:shadow-none">
      <header className="flex items-start justify-between gap-4">
        {logo ? <img src={logo} alt={c.display_name} className="h-14 max-w-[200px] object-contain object-left" /> : <span className="font-display text-[22px] font-bold text-[#302538]">{c?.display_name}</span>}
        <span className="text-right text-[12.5px] leading-snug text-[#6B5F6E]">{c?.legal_name || c?.display_name}{c?.rut && <><br />RUT {c.rut}</>}<br />{place}{place && ', '}{longDate(o.created_at || new Date().toISOString())}</span>
      </header>
      <div className="my-5 border-t-2 border-[#302538] print:my-3" />
      <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#B85F00]">Carta oferta</span>
      <h2 className="mb-4 mt-1 font-display text-[24px] font-bold leading-tight text-[#302538]">{o.position || 'Cargo'}</h2>
      <p className="mb-3">Estimado/a <b>{candidate?.name || 'Nombre del postulante'}</b>:</p>
      <Paras text={L.intro || defaultIntro(o.position, c?.display_name)} />
      <table className="my-4 w-full border-collapse overflow-hidden rounded-xl text-[14px]">
        <tbody>{offerRows(o).map(([k, v]) => (
          <tr key={k} className="border-b border-[#EFE6EC] last:border-0"><td className="w-[42%] bg-[#FBF7F9] px-3.5 py-2.5 text-[#6B5F6E] print:py-1.5">{k}</td><td className="px-3.5 py-2.5 font-semibold print:py-1.5">{v}</td></tr>
        ))}</tbody>
      </table>
      {o.benefits && <div className="mb-4 rounded-xl bg-[#FBF7F9] px-4 py-3"><b className="mb-0.5 block text-[13px]">Beneficios</b><span className="whitespace-pre-line">{o.benefits}</span></div>}
      {o.message && <Paras text={o.message} />}
      <Paras text={L.closing || DEFAULT_CLOSING} />
      {o.expires_on && <p className="mb-3">Te pedimos responder antes del <b>{longDate(o.expires_on)}</b>.</p>}
      <div className="mt-6 break-inside-avoid print:mt-4">
        <p className="mb-8 print:mb-6">Atentamente,</p>
        <div className="w-60 border-t border-[#302538] pt-2">
          {L.signer_name && <b className="block">{L.signer_name}</b>}
          {L.signer_title && <span className="block text-[13px] text-[#4A3F4E]">{L.signer_title}</span>}
          <span className="block text-[13px] text-[#4A3F4E]">{c?.legal_name || c?.display_name}</span>
        </div>
      </div>
      <p className="mt-8 border-t border-[#EFE6EC] pt-3 text-[11px] text-[#8A8090] print:mt-5">Carta emitida a través de VINKA. No reemplaza al contrato de trabajo. Una oferta real nunca te pide dinero.</p>
    </article>
  )
}
