import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { pl } from '../lib/text'

// Nombre en el selector: la matriz y, debajo, sus clientes
const rank = (c, home) => (c.id === home?.id ? 0 : c.parent_id && c.parent_id === home?.id ? 1 : 2)
export const companyOption = (c) => (c.parent_id ? `↳ ${c.display_name}` : c.kind === 'consultora' ? `${c.display_name} (matriz)` : c.display_name)

/**
 * Empresa «de casa» de la cuenta: la matriz si la empresa activa es un cliente; si no, la empresa propia
 * (donde es dueño/a, o la primera directa). Va como título; la empresa activa va en «Trabajando en».
 */
export function homeCompany(companies, company) {
  if (!company) return null
  if (company.parent_id) return companies?.find((c) => c.id === company.parent_id) || { id: company.parent_id, display_name: company.managed_by || company.display_name }
  const own = (companies || []).filter((c) => !c.inherited && !c.parent_id)
  return own.find((c) => c.member_role === 'owner') || own.find((c) => c.kind === 'consultora') || own[0] || company
}
const ROLE_TXT = { owner: 'dueño/a', admin: 'administrador/a', recruiter: 'reclutador/a', viewer: 'evaluador/a', client: 'cliente' }

/** Selector de empresa + aviso de contexto: con qué empresa estás trabajando y quién la gestiona */
export function CompanyContext({ compact = false }) {
  const { company, companies, switchCompany } = useAuth()
  if (!company) return null
  const many = (companies?.length || 0) > 1
  const isClient = !!company.parent_id
  const isMatrix = company.kind === 'consultora'
  const home = homeCompany(companies, company)
  const other = !isClient && home && home.id !== company.id
  // La empresa de casa primero, luego sus clientes, luego otras empresas
  const sorted = [...(companies || [])].sort((a, b) => rank(a, home) - rank(b, home) || a.display_name.localeCompare(b.display_name, 'es'))
  if (!many && !isClient && !isMatrix) return null
  return (
    <div className={`flex flex-col gap-1.5 rounded-2xl border px-3.5 py-2.5 ${isClient ? 'border-[#D9C6EA] bg-[#F7F0FB]' : 'border-[#F2D3E1] bg-rosa-palido'}`}>
      {many && (
        <label className="flex items-center gap-2 text-[13px]">
          <span className="shrink-0 font-semibold text-tinta-3">Trabajando en</span>
          <select className="h-9 min-w-0 flex-1 rounded-lg border border-linea bg-white px-2 text-[13px] font-semibold text-tinta" value={company.id}
            onChange={(e) => { switchCompany(e.target.value); window.location.assign('/') }}>
            {sorted.map((c) => <option key={c.id} value={c.id}>{companyOption(c)}</option>)}
          </select>
        </label>
      )}
      {isClient ? (
        <span className="text-[12px] leading-snug text-[#4B2466]"><b>Cliente de {company.managed_by || 'tu consultora'}.</b> {company.member_role === 'client' ? 'Ves los procesos de tu empresa, evalúas y apruebas ofertas.' : 'Lo que publiques aquí sale a nombre de este cliente, gestionado por tu consultora.'}</span>
      ) : other ? (
        <span className="text-[12px] leading-snug text-rosa-oscuro"><b>Otra empresa.</b> Estás en el equipo de {company.display_name} como {ROLE_TXT[company.member_role] || 'integrante'}; lo que hagas aquí queda a nombre de {company.display_name}, no de {home.display_name}.</span>
      ) : isMatrix && !compact ? (
        <span className="flex items-center justify-between gap-2 text-[12px] text-rosa-oscuro"><span><b>Matriz.</b> {company.clients ? `${pl(company.clients, 'cliente', 'clientes')} a tu cargo.` : 'Aún no agregas empresas clientes.'}</span><Link to="/clientes" className="font-semibold underline">{company.clients ? 'Ver clientes' : 'Agregar cliente'}</Link></span>
      ) : null}
    </div>
  )
}
