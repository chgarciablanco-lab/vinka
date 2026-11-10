import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { REGIONES, TAMANOS, AREAS, colorFor, initials } from '../../lib/catalog'
import { Avatar, Empty, ErrorBox, Field, Screen, Sheet, Spinner, Toast, TopBar } from '../../components/ui'

const VER = {
  verified: ['Verificada', 'bg-[#EAF6EF] text-[#134A2B]'],
  pending: ['VINKA la está verificando', 'bg-naranja-palido text-naranja-texto'],
  rejected: ['Revisar datos', 'bg-[#FEF3F2] text-[#912018]'],
}
const EMPTY = { display_name: '', legal_name: '', rut: '', sector: '', size: '', region: '', comuna: '', description: '', website: '' }

/**
 * Consultora (cuenta matriz): sus empresas clientes. Desde aquí se agregan clientes y se cambia a trabajar en uno.
 * Cada cliente queda pendiente hasta que VINKA lo verifique; el plan es el de la matriz.
 */
export default function Clients() {
  const { company, refresh, switchCompany, companies } = useAuth()
  const nav = useNavigate()
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(false)
  const [f, setF] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const isMatrix = company?.kind === 'consultora' && !company?.parent_id
  const isOwner = company?.member_role === 'owner'
  const canAdd = ['owner', 'admin'].includes(company?.member_role)

  const load = useCallback(() => {
    if (!isMatrix) return setList([])
    supabase.rpc('consultancy_clients', { p_parent: company.id }).then(({ data, error }) => { if (error) setErr(errMsg(error)); setList(data || []) })
  }, [company?.id, isMatrix])
  useEffect(() => { load() }, [load])

  const becomeConsultancy = async () => {
    setErr(''); setBusy(true)
    const { error } = await supabase.rpc('set_company_kind', { p_company: company.id, p_kind: 'consultora' })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    await refresh()
    setToast('Listo: tu empresa ahora es una consultora (cuenta matriz).')
  }
  const add = async () => {
    setErr(''); setBusy(true)
    const { error } = await supabase.rpc('create_client_company', { p_parent: company.id, p: f })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setOpen(false); setF(EMPTY)
    await refresh(); load()
    setToast('Cliente agregado. VINKA lo verificará antes de que pueda publicar.')
  }
  const work = (id) => {
    if (!companies.some((c) => c.id === id)) return setErr('Vuelve a cargar la página para ver este cliente en tu lista.')
    switchCompany(id); nav('/')
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  if (company?.parent_id) return (
    <Screen><TopBar back="/vitrina" title="Clientes" />
      <div className="px-6"><Empty title="Esta empresa es cliente de una consultora">La lista de clientes se ve desde la cuenta de {company.managed_by || 'la consultora'}.</Empty></div>
    </Screen>
  )

  if (!isMatrix) return (
    <Screen><TopBar back="/vitrina" title="Somos consultora" />
      <div className="flex flex-col gap-4 px-6 pb-8">
        <p className="text-[15px] leading-relaxed text-tinta-2">Si tu empresa recluta para otras empresas, puedes convertirla en <b>cuenta matriz</b> y manejar a cada cliente por separado:</p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-tinta-2">
          <li>Cada cliente tiene sus propias vacantes, procesos y reportes.</li>
          <li>Los postulantes ven el nombre del cliente con «gestionado por {company?.display_name}», o «Empresa confidencial» si lo prefieres.</li>
          <li>Tu equipo trabaja en todos los clientes; puedes invitar a personas del cliente con acceso limitado (ver procesos, evaluar y aprobar ofertas).</li>
          <li>Un solo plan para todo el grupo. VINKA verifica a cada cliente antes de que publique.</li>
        </ul>
        {isOwner
          ? <button className="btn" disabled={busy} onClick={becomeConsultancy}>Activar «Somos consultora»</button>
          : <p className="hint">Solo quien creó la empresa puede activar esta opción.</p>}
        <ErrorBox>{err}</ErrorBox>
      </div>
      <Toast msg={toast} onDone={() => setToast('')} />
    </Screen>
  )

  return (
    <Screen className="bg-[#FAF7F9]" wide>
      <TopBar back="/vitrina" title="Clientes" right={canAdd && <button className="btn-sm bg-rosa-accion text-white" onClick={() => setOpen(true)}>Agregar</button>} />
      <div className="flex flex-col gap-3 px-5 pb-10 lg:px-8">
        <p className="text-sm leading-relaxed text-tinta-3"><b className="text-tinta">{company.display_name}</b> es la cuenta matriz. Elige un cliente para publicar y gestionar sus procesos a su nombre.</p>
        {company.verification_status !== 'verified' && <p className="rounded-xl bg-naranja-palido px-3 py-2 text-sm text-[#4A2A00]">Tu consultora debe estar verificada por VINKA para agregar clientes.</p>}
        {list == null ? <Spinner /> : list.length === 0 ? (
          <Empty title="Aún no tienes clientes">Agrega la primera empresa para la que reclutas. VINKA la verifica y luego puedes publicar a su nombre.</Empty>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {list.map((c) => {
              const [vl, vc] = VER[c.verification] || VER.pending
              return (
                <div key={c.id} className="card flex min-w-0 flex-col gap-3 p-4">
                  <div className="flex items-start gap-3">
                    <Avatar text={initials(c.display_name)} color={colorFor(c.display_name)} size={44} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[16px] font-bold">{c.display_name}</span>
                      <span className="truncate text-xs text-tinta-suave">{[c.legal_name, c.rut && `RUT ${c.rut}`].filter(Boolean).join(' · ')}</span>
                      <span className={`pill mt-1 self-start ${vc}`}>{vl}</span>
                    </div>
                  </div>
                  {c.verification === 'rejected' && c.note && <p className="text-[13px] text-[#912018]">{c.note}</p>}
                  <div className="grid grid-cols-2 gap-1.5 text-center min-[400px]:grid-cols-4">
                    {[[c.jobs, 'Vacantes'], [c.processes, 'En proceso'], [c.hired, 'Contratados'], [c.client_users, 'Usuarios del cliente']].map(([n, l]) => (
                      <div key={l} className="flex flex-col rounded-xl bg-[#F6F1F4] px-1 py-2"><span className="font-display text-lg font-bold">{n}</span><span className="text-[11px] leading-tight text-tinta-3">{l}</span></div>
                    ))}
                  </div>
                  {c.confidential > 0 && <span className="text-xs text-tinta-3">{c.confidential} vacante(s) confidencial(es)</span>}
                  <button className="btn-sm self-start bg-rosa-accion text-white" onClick={() => work(c.id)}>Trabajar en este cliente</button>
                </div>
              )
            })}
          </div>
        )}
        <ErrorBox>{!open && err}</ErrorBox>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Agregar empresa cliente">
        <div className="flex flex-col gap-3">
          <Field label="Nombre comercial"><input className="input" maxLength={120} value={f.display_name} onChange={set('display_name')} placeholder="Ej.: Ferretería Los Andes" /></Field>
          <Field label="Razón social"><input className="input" maxLength={160} value={f.legal_name} onChange={set('legal_name')} /></Field>
          <Field label="RUT de la empresa"><input className="input" maxLength={12} value={f.rut} onChange={set('rut')} placeholder="76.123.456-7" /></Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Rubro"><select className="input" value={f.sector} onChange={set('sector')}><option value="">Selecciona</option>{AREAS.map((a) => <option key={a}>{a}</option>)}</select></Field>
            <Field label="Personas"><select className="input" value={f.size} onChange={set('size')}><option value="">Selecciona</option>{TAMANOS.map((a) => <option key={a}>{a}</option>)}</select></Field>
            <Field label="Región"><select className="input" value={f.region} onChange={set('region')}><option value="">Selecciona</option>{REGIONES.map((r) => <option key={r}>{r}</option>)}</select></Field>
            <Field label="Comuna"><input className="input" maxLength={80} value={f.comuna} onChange={set('comuna')} /></Field>
          </div>
          <Field label="Descripción (opcional)"><textarea className="textarea h-20" maxLength={2000} value={f.description} onChange={set('description')} placeholder="Qué hace la empresa; se muestra a los postulantes salvo en vacantes confidenciales" /></Field>
          <p className="hint">VINKA verifica cada cliente antes de que sus vacantes se publiquen. El cliente usa el plan de tu consultora.</p>
          <ErrorBox>{open && err}</ErrorBox>
          <div className="grid grid-cols-2 gap-2"><button className="btn-sec" onClick={() => setOpen(false)}>Cancelar</button><button className="btn" disabled={busy} onClick={add}>Agregar cliente</button></div>
        </div>
      </Sheet>
      <Toast msg={toast} onDone={() => setToast('')} />
    </Screen>
  )
}
