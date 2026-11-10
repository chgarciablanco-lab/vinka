import { NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Svg } from './ui'
import { StatusPill } from './Presence'
import { companyOption } from './CompanySwitcher'

/** Barra lateral fija para computadores (desde 1024 px). En móvil no se muestra y se usa la barra inferior. */
export function DesktopNav({ items }) {
  const { company, companies, switchCompany, profile, signOut, isAdmin } = useAuth()
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[#EEE3EA] bg-white lg:flex" aria-label="Navegación principal">
      <div className="flex flex-col gap-1 px-5 pb-4 pt-6">
        <span className="font-display text-[19px] font-bold tracking-wide text-tinta">VINKA</span>
        {!company && (isAdmin || profile?.role === 'advisor') && <span className="text-[13px] text-tinta-3">{isAdmin ? 'Administración' : 'Asesor/a VINKA'}</span>}
        {company && (companies?.length > 1 ? (
          <label className="mt-1"><span className="sr-only">Empresa</span>
            <select className="h-9 w-full rounded-lg border border-linea bg-white px-2 text-[13px] font-semibold text-tinta-2" value={company.id} onChange={(e) => { switchCompany(e.target.value); window.location.assign('/') }}>
              {companies.map((c) => <option key={c.id} value={c.id}>{companyOption(c)}</option>)}
            </select></label>
        ) : <span className="truncate text-[13px] text-tinta-3" title={company.display_name}>{company.display_name}</span>)}
        {company?.parent_id && <span className="text-[11px] font-semibold text-[#6B2E8F]">Cliente de {company.managed_by}</span>}
        {company?.kind === 'consultora' && !company.parent_id && <span className="text-[11px] font-semibold text-rosa-oscuro">Matriz · {company.clients || 0} cliente(s)</span>}
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
        {items.map((it) => it.section ? (
          <span key={it.section} className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-tinta-suave">{it.section}</span>
        ) : (
          <NavLink key={it.to} to={it.to} end={it.to === '/'}
            className={({ isActive }) => `relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${isActive ? 'bg-rosa-palido text-rosa-oscuro' : 'text-tinta-2 hover:bg-[#F7F1F5]'}`}>
            <Svg name={it.icon} size={19} />
            {it.label}
            {it.badge ? <span className="ml-auto h-2.5 w-2.5 rounded-full bg-naranja" aria-label="Novedades" /> : null}
          </NavLink>
        ))}
      </nav>
      <div className="flex flex-col gap-2 border-t border-[#EEE3EA] p-4">
        <StatusPill />
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-tinta-3">{`${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()}</span>
          <button onClick={signOut} className="text-xs font-semibold text-tinta-3 hover:text-tinta">Cerrar sesión</button>
        </div>
      </div>
    </aside>
  )
}
