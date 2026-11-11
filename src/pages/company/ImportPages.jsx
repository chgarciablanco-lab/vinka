import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { AREAS, REGIONES } from '../../lib/catalog'
import { APPLICANT_FIELDS, JOB_FIELDS, cleanEmail, cleanPhone, toContract, toModality, toSalary, toSchedule, toStage } from '../../lib/importer'
import { Importer } from '../../components/Importer'
import { Empty, ErrorBox, Screen, Sheet, Spinner, Svg, Toast, TopBar } from '../../components/ui'
import { salaryText } from '../../lib/catalog'
import { pl } from '../../lib/text'

const n = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const pickArea = (s) => { const v = n(s); return v ? AREAS.find((a) => v.includes(n(a)) || n(a).includes(v)) || 'Otro' : '' }
const pickRegion = (s) => { const v = n(s); return v ? REGIONES.find((r) => v.includes(n(r))) || '' : '' }

/* ---------- Importar vacantes ---------- */
export function ImportJobs() {
  const { company } = useAuth()
  const nav = useNavigate()
  const build = useCallback((r, m) => {
    const g = (k) => (m[k] ? String(r[m[k]] ?? '').trim() : '')
    const title = g('title')
    if (!title) return { error: 'sin título' }
    const sal = toSalary(g('salary_min'), g('salary_max'), g('salary_min'))
    const reqText = g('requirements')
    return {
      title: title.slice(0, 90),
      description: g('description').slice(0, 3000),
      requirements: reqText ? reqText.split(/\n|;|•/).map((t) => t.trim()).filter(Boolean).slice(0, 15).map((text) => ({ text: text.slice(0, 200), essential: true })) : [],
      area: pickArea(g('area')),
      comuna: g('comuna') || company?.comuna || '',
      region: pickRegion(g('region')) || company?.region || '',
      modality: toModality(g('modality')) || 'Presencial',
      schedule: toSchedule(g('schedule')) || 'Completa',
      contract: toContract(g('contract')),
      ...sal,
      external_ref: g('external_ref').slice(0, 80),
    }
  }, [company])

  const onConfirm = async (items) => {
    const rows = items.map((x) => ({ ...x, company_id: company.id, status: 'draft', source: 'importada' }))
    const { error } = await supabase.from('jobs').insert(rows)
    if (error) throw new Error(errMsg(error))
    return { ok: rows.length, skipped: 0, after: (
      <div className="flex w-full flex-col gap-2">
        <p className="text-sm text-tinta-3">Quedaron como <b>borradores</b>. Revisa cada una (área, renta, requisitos) y publícala cuando esté lista.</p>
        <button className="btn" onClick={() => nav('/')}>Ir a mis vacantes</button>
      </div>
    ) }
  }

  return (
    <Screen>
      <TopBar back="/" title="Importar vacantes" />
      <div className="px-6 pb-10">
        <Importer fields={JOB_FIELDS} build={build} onConfirm={onConfirm} confirmLabel="Importar"
          templateName="vinka-vacantes-ejemplo.xlsx"
          template={[{ Cargo: 'Vendedor/a de tienda', Descripción: 'Atención de clientes y caja.', Requisitos: 'Enseñanza media; Experiencia en retail', Área: 'Ventas', Comuna: 'Talca', Región: 'Maule', Modalidad: 'Presencial', Jornada: 'Completa', Contrato: 'Indefinido', Sueldo: '550.000 - 650.000 líquido', Código: 'AV-123' }]}
          preview={(x) => <div className="flex flex-col gap-0.5"><b>{x.title}</b><span className="text-tinta-3">{[x.comuna, x.modality, x.schedule, x.area].filter(Boolean).join(' · ')}</span><span className="text-tinta-3">{salaryText(x)}</span></div>} />
      </div>
    </Screen>
  )
}

/* ---------- Postulantes externos de una vacante ---------- */
const STAGES = [['nuevo', 'Nuevo'], ['contactado', 'Contactado'], ['entrevista', 'Entrevista'], ['oferta', 'Oferta'], ['contratado', 'Contratado/a'], ['descartado', 'Descartado/a']]
const INVITE = { enviado: 'Invitación enviada', enviando: 'Enviando…', aceptada: 'Aceptó · ya está en VINKA', cuenta_de_prueba: 'Invitación registrada (correo de prueba)', sin_configurar: 'Correo no configurado', sin_correo: 'Sin correo' }

export function ExternalApplicants() {
  const { id } = useParams()
  const { company, user } = useAuth()
  const [job, setJob] = useState(null)
  const [rows, setRows] = useState(null)
  const [sel, setSel] = useState([])
  const [importing, setImporting] = useState(false)
  const [toast, setToast] = useState('')
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState('todos')

  const load = useCallback(async () => {
    const [{ data: j }, { data, error }] = await Promise.all([
      supabase.from('jobs').select('id,title,status').eq('id', id).single(),
      supabase.from('external_applicants').select('*').eq('job_id', id).order('created_at', { ascending: false }),
    ])
    if (error) setErr(errMsg(error))
    setJob(j); setRows(data || [])
  }, [id])
  useEffect(() => { load() }, [load])

  const build = useCallback((r, m) => {
    const g = (k) => (m[k] ? String(r[m[k]] ?? '').trim() : '')
    const name = [g('full_name'), g('last_name')].filter(Boolean).join(' ').replace(/\s+/g, ' ')
    if (!name) return { error: 'sin nombre' }
    const rawEmail = g('email')
    const email = cleanEmail(rawEmail)
    if (rawEmail && !email) return { error: `correo no válido (${rawEmail})` }
    return { full_name: name.slice(0, 160), email, phone: cleanPhone(g('phone')), headline: g('headline').slice(0, 120), notes: g('notes').slice(0, 500), stage: toStage(g('stage')) }
  }, [])

  const onConfirm = async (items) => {
    const seen = new Set((rows || []).map((r) => r.email).filter(Boolean))
    const fresh = []
    let skipped = 0
    for (const x of items) {
      if (x.email && seen.has(x.email)) { skipped++; continue }
      if (x.email) seen.add(x.email)
      fresh.push({ ...x, company_id: company.id, job_id: id, source: 'importado', created_by: user.id })
    }
    if (fresh.length) {
      const { error } = await supabase.from('external_applicants').insert(fresh)
      if (error) throw new Error(errMsg(error))
    }
    load()
    return { ok: fresh.length, skipped, after: <button className="btn w-full" onClick={() => setImporting(false)}>Ver postulantes</button> }
  }

  const setStage = async (r, stage) => {
    const { error } = await supabase.from('external_applicants').update({ stage }).eq('id', r.id)
    if (error) return setErr(errMsg(error)); load()
  }
  const remove = async (ids) => {
    const { error } = await supabase.from('external_applicants').delete().in('id', ids)
    if (error) return setErr(errMsg(error)); setSel([]); load()
  }
  const invite = async (ids) => {
    const { data, error } = await supabase.rpc('invite_external', { p_ids: ids })
    if (error) return setErr(errMsg(error))
    setSel([]); setToast(data ? `Enviamos ${pl(data, 'invitación', 'invitaciones')} a VINKA.` : 'No había postulantes con correo válido para invitar.')
    setTimeout(load, 2500)
  }

  if (!rows) return <Spinner />
  const shown = rows.filter((r) => filter === 'todos' || r.stage === filter)
  const toggle = (rid) => setSel((s) => (s.includes(rid) ? s.filter((x) => x !== rid) : [...s, rid]))
  const verified = company?.verification_status === 'verified'

  return (
    <Screen className="bg-[#FAF7F9]">
      <TopBar back="/" title="Postulantes externos" />
      <div className="flex flex-col gap-3 px-5 pb-28">
        <div className="flex flex-col"><span className="text-xs text-tinta-suave">Vacante</span><span className="font-display text-lg font-semibold">{job?.title}</span></div>
        <p className="text-[13px] leading-snug text-tinta-3">Postulantes que recibiste en otros portales. Son privados: solo tu equipo los ve. Invítalos a VINKA para conversar y agendar entrevistas aquí.</p>
        <button className="btn" onClick={() => setImporting(true)}><Svg name="plus" size={20} stroke="#fff" />Importar postulantes</button>
        <ErrorBox>{err}</ErrorBox>
        {rows.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {[['todos', `Todos · ${rows.length}`], ...STAGES.map(([k, l]) => [k, `${l} · ${rows.filter((r) => r.stage === k).length}`])].map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`h-9 shrink-0 rounded-full border px-3 text-xs font-semibold ${filter === k ? 'border-morado bg-morado text-white' : 'border-linea bg-white'}`}>{l}</button>
            ))}
          </div>
        )}
        {rows.length === 0 ? (
          <Empty title="Aún no importas postulantes">Descarga la lista de postulantes de esta vacante desde tu otro portal y súbela aquí.</Empty>
        ) : shown.map((r) => (
          <div key={r.id} className={`card flex flex-col gap-2 p-3.5 ${sel.includes(r.id) ? 'border-rosa-accion' : ''}`}>
            <div className="flex items-start gap-3">
              <input type="checkbox" aria-label={`Seleccionar a ${r.full_name}`} checked={sel.includes(r.id)} onChange={() => toggle(r.id)} className="mt-1 h-5 w-5 shrink-0 accent-[#D02E72]" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-semibold">{r.full_name}</span>
                {r.headline && <span className="text-[13px] text-tinta-2">{r.headline}</span>}
                <span className="truncate text-xs text-tinta-suave">{[r.email, r.phone].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</span>
                {r.invite_status && <span className={`text-xs font-semibold ${r.invite_status === 'aceptada' ? 'text-[#1E6B3F]' : 'text-rosa-texto'}`}>{INVITE[r.invite_status] || r.invite_status}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select aria-label="Etapa" className="input h-10 flex-1 text-sm" value={r.stage} onChange={(e) => setStage(r, e.target.value)}>
                {STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              {r.linked_user_id ? <Link to="/chats" className="btn-sm h-10 bg-rosa-palido text-rosa-oscuro">Ver chat</Link>
                : r.email && <button className="btn-sm h-10 border border-rosa-accion bg-white text-rosa-texto" disabled={!verified} onClick={() => invite([r.id])}>{r.invited_at ? 'Reenviar' : 'Invitar'}</button>}
            </div>
          </div>
        ))}
        {!verified && rows.length > 0 && <p className="hint">Podrás invitar a VINKA cuando tu empresa esté verificada.</p>}
      </div>
      {sel.length > 0 && (
        <div className="safe-b fixed bottom-0 left-1/2 z-20 flex w-full max-w-md -translate-x-1/2 lg:left-[calc(50%+8rem)] lg:max-w-2xl gap-2 border-t border-[#EEE3EA] bg-white px-5 pt-3">
          <button className="btn-sec flex-1 text-[#B42318]" onClick={() => remove(sel)}>Eliminar ({sel.length})</button>
          <button className="btn flex-1" disabled={!verified} onClick={() => invite(sel)}>Invitar ({sel.length})</button>
        </div>
      )}
      <Sheet open={importing} onClose={() => setImporting(false)} title="Importar postulantes">
        {importing && <Importer fields={APPLICANT_FIELDS} build={build} onConfirm={onConfirm} confirmLabel="Importar"
          templateName="vinka-postulantes-ejemplo.xlsx"
          template={[{ Nombre: 'María', Apellido: 'González', Correo: 'maria@correo.cl', Teléfono: '+56 9 1234 5678', Profesión: 'Vendedora', Estado: 'Entrevista', Notas: 'Disponible en marzo' }]}
          consent="Confirmo que estos datos me los entregaron los postulantes para esta vacante y que los usaré solo para este proceso de selección."
          preview={(x) => <div className="flex flex-col gap-0.5"><b>{x.full_name}</b><span className="text-tinta-3">{[x.email || 'sin correo', x.phone, STAGES.find((s) => s[0] === x.stage)?.[1]].filter(Boolean).join(' · ')}</span></div>} />}
      </Sheet>
      <Toast msg={toast} onDone={() => setToast('')} />
    </Screen>
  )
}
