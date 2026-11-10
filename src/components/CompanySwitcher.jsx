import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

// Nombre en el selector: la matriz y, debajo, sus clientes
export const companyOption = (c) => (c.parent_id ? `↳ ${c.display_name}` : c.kind === 'consultora' ? `${c.display_name} (matriz)` : c.display_name)

/** Selector de empresa + aviso de contexto: con qué empresa estás trabajando y quién la gestiona */
export function CompanyContext({ compact = false }) {
  const { company, companies, switchCompany } = useAuth()
  if (!company) return null
  const many = (companies?.length || 0) > 1
  const isClient = !!company.parent_id
  const isMatrix = company.kind === 'consultora'
  if (!many && !isClient && !isMatrix) return null
  return (
    <div className={`flex flex-col gap-1.5 rounded-2xl border px-3.5 py-2.5 ${isClient ? 'border-[#D9C6EA] bg-[#F7F0FB]' : 'border-[#F2D3E1] bg-rosa-palido'}`}>
      {many && (
        <label className="flex items-center gap-2 text-[13px]">
          <span className="shrink-0 font-semibold text-tinta-3">Trabajando en</span>
          <select className="h-9 min-w-0 flex-1 rounded-lg border border-linea bg-white px-2 text-[13px] font-semibold text-tinta" value={company.id}
            onChange={(e) => { switchCompany(e.target.value); window.location.assign('/') }}>
            {companies.map((c) => <option key={c.id} value={c.id}>{companyOption(c)}</option>)}
          </select>
        </label>
      )}
      {isClient ? (
        <span className="text-[12px] leading-snug text-[#4B2466]"><b>Cliente de {company.managed_by || 'tu consultora'}.</b> {company.member_role === 'client' ? 'Ves los procesos de tu empresa, evalúas y apruebas ofertas.' : 'Lo que publiques aquí sale a nombre de este cliente, gestionado por tu consultora.'}</span>
      ) : isMatrix && !compact ? (
        <span className="flex items-center justify-between gap-2 text-[12px] text-rosa-oscuro"><span><b>Matriz.</b> {company.clients || 0} cliente(s) a tu cargo.</span><Link to="/clientes" className="font-semibold underline">Ver clientes</Link></span>
      ) : null}
    </div>
  )
}
