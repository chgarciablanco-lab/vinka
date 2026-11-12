import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { salaryText } from '../../lib/catalog'
import { pl } from '../../lib/text'
import { Empty, ErrorBox, Screen, Sheet, Spinner, Svg, TagInput, Toast, TopBar } from '../../components/ui'

// VINKA Comunidad (etapa 1, solo por invitación): asesores que colaboran en búsquedas de candidatos.

export const SEARCH_ST = { abierta: ['ABIERTA', 'bg-[#EAF6EF] text-[#134A2B]'], pausada: ['PAUSADA', 'bg-naranja-palido text-naranja-texto'], cerrada: ['CERRADA', 'bg-[#F4EEF2] text-tinta-3'] }
export const PRES_ST = {
  esperando_consentimiento: ['ESPERA SU RESPUESTA', 'bg-[#F4EEF2] text-tinta-3'],
  presentado: ['POR REVISAR', 'bg-[#E7F1FB] text-[#1F4E86]'],
  mas_antecedentes: ['MÁS ANTECEDENTES', 'bg-naranja-palido text-naranja-texto'],
  aceptado: ['ACEPTADO', 'bg-[#EAF6EF] text-[#134A2B]'],
  rechazado: ['NO AVANZA', 'bg-[#FEF3F2] text-[#912018]'],
  no_acepto: ['NO QUISO POSTULAR', 'bg-[#F4EEF2] text-tinta-3'],
}
const COLLAB = { candidatos: 'Presentar candidatos', referidos: 'Referidos de tu red', filtro: 'Apoyo en el filtro' }
const REL = { asesorado: 'Asesorado/a tuyo', proceso_propio: 'De tus procesos', vinka: 'Recomendado por VINKA' }
const ROLE = { responsable: 'Eres responsable', colaborador: 'Colaboras', invitado: 'Te invitaron', admin: 'Vista de VINKA' }
const STAGE = { postulante: 'Postuló', match: 'Match', contacto: 'Contacto', entrevista: 'Entrevista', oferta: 'Oferta', contratado: 'Contratado/a', descartado: 'Descartado/a' }
const fmt = (d) => (d ? new Date(typeof d === 'string' && d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : '')

export const RULES = [
  'Solo presentas a personas que asesoras en VINKA o que están en tus propios procesos.',
  'Nadie es presentado sin su consentimiento: la persona recibe la recomendación y decide si postula a esa vacante.',
  'Lo que ves en una búsqueda (vacante, empresa y candidatos) es confidencial. No lo compartas fuera de VINKA.',
  'No contactes por fuera a la empresa cliente de otro asesor ni a las personas que otros presentan.',
  'Quien publica la búsqueda es responsable de ella y decide sobre los candidatos. Responde con respeto y a tiempo.',
  'VINKA puede revisar la actividad de la comunidad y suspender a quien no cumpla estas reglas.',
]

function Pill({ st, map }) {
  const [l, c] = map[st] || [st, 'bg-[#F4EEF2] text-tinta-3']
  return <span className={`pill shrink-0 whitespace-nowrap ${c}`}>{l}</span>
}

/** Inicio de la Comunidad: reglas, invitaciones, búsquedas propias y en las que colaboro */
export default function CommunityHome() {
  const { actsAs } = useAuth()
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const load = useCallback(() => supabase.rpc('community_home').then(({ data, error }) => { if (error) setErr(errMsg(error)); setD(data || { searches: [] }) }), [])
  useEffect(() => { load() }, [load])
  const accept = async () => {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('community_accept_rules')
    setBusy(false)
    if (error) return setErr(errMsg(error))
    load()
  }
  const respond = async (id, yes) => {
    setErr('')
    const { error } = await supabase.rpc('community_respond_invite', { p_search: id, p_accept: yes })
    if (error) return setErr(errMsg(error))
    setToast(yes ? 'Ya colaboras en esta búsqueda' : 'Invitación rechazada'); load()
  }
  const m = d?.member
  const list = d?.searches || []
  const invites = list.filter((s) => s.my_status === 'invitado')
  const mine = list.filter((s) => s.my_role === 'responsable')
  const collab = list.filter((s) => s.my_role === 'colaborador' && s.my_status === 'aceptado')
  return (
    <Screen className="bg-[#FAF7F9]" wide>
      <div className="safe-t px-5 pb-3 pt-2 lg:px-8 lg:pt-6">
        <h1 className="text-[22px] font-bold">Comunidad</h1>
        <p className="text-[13px] text-tinta-3">Colabora con otros asesores de VINKA en búsquedas de candidatos.</p>
      </div>
      <div className="flex flex-col gap-3 px-5 pb-28 lg:px-8 lg:pb-10">
        <ErrorBox>{err}</ErrorBox>
        {d == null ? <Spinner /> : !m ? (
          <Empty title="La Comunidad es solo por invitación">Por ahora VINKA habilita a los asesores uno a uno. Si te interesa participar, escríbele al equipo desde «Equipo VINKA».</Empty>
        ) : m.status !== 'activo' ? (
          <Empty title="Tu participación está suspendida">Escribe al equipo de VINKA si crees que es un error.</Empty>
        ) : !m.rules_accepted ? (
          <div className="card flex flex-col gap-3 p-4">
            <span className="font-display text-lg font-semibold">Reglas de la Comunidad</span>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed">{RULES.map((r) => <li key={r}>{r}</li>)}</ol>
            <label className="flex items-start gap-2.5 rounded-xl border border-rosa-borde bg-white p-3 text-[13px] leading-snug">
              <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D02E72]" />
              Leí y acepto las reglas de la Comunidad de VINKA.
            </label>
            <button className="btn" disabled={!ok || busy} onClick={accept}>{busy ? 'Guardando…' : 'Aceptar y entrar'}</button>
          </div>
        ) : (
          <>
            {invites.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="text-[15px] font-semibold">Invitaciones · {invites.length}</h2>
                {invites.map((s) => (
                  <div key={s.id} className="card flex flex-col gap-2.5 border-[#F3D9A4] p-3.5">
                    <Link to={`/comunidad/${s.id}`} className="flex items-start gap-2">
                      <span className="flex min-w-0 flex-1 flex-col"><b className="text-[15px]">{s.title}</b><span className="text-[13px] text-tinta-3">{s.owner} te invita a colaborar · {[s.comuna, s.modality].filter(Boolean).join(' · ')}</span></span>
                      <Svg name="chevron" size={18} className="mt-1 text-tinta-suave" />
                    </Link>
                    <div className="grid grid-cols-2 gap-2">
                      <button className="btn-sm border border-linea bg-white" onClick={() => respond(s.id, false)}>No puedo</button>
                      <button className="btn-sm bg-rosa-accion text-white" onClick={() => respond(s.id, true)}>Colaborar</button>
                    </div>
                  </div>
                ))}
              </section>
            )}
            <section className="flex flex-col gap-2">
              <h2 className="text-[15px] font-semibold">Mis búsquedas · {mine.length}</h2>
              {mine.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-linea bg-white px-4 py-3.5 text-[13px] leading-snug text-tinta-3">
                  {d.has_workspace
                    ? <>Para pedir apoyo, abre el proceso de una vacante en Reclutamiento y toca <b>«Pedir apoyo a la comunidad»</b>.{actsAs !== 'company' && <> <Link to="/modo/reclutamiento" className="font-semibold text-rosa-texto">Ir a Reclutamiento →</Link></>}</>
                    : 'Para publicar búsquedas necesitas tu espacio de reclutamiento. Pídeselo al equipo de VINKA. Mientras tanto, puedes colaborar cuando te inviten.'}
                </p>
              ) : mine.map((s) => <SearchRow key={s.id} s={s} />)}
            </section>
            <section className="flex flex-col gap-2">
              <h2 className="text-[15px] font-semibold">Colaboro en · {collab.length}</h2>
              {collab.length === 0 ? <p className="text-[13px] text-tinta-3">Cuando aceptes una invitación, la búsqueda aparecerá aquí.</p> : collab.map((s) => <SearchRow key={s.id} s={s} />)}
            </section>
            <details className="card p-3.5 text-sm">
              <summary className="cursor-pointer font-semibold">Reglas de la Comunidad</summary>
              <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-tinta-2">{RULES.map((r) => <li key={r}>{r}</li>)}</ol>
            </details>
          </>
        )}
      </div>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </Screen>
  )
}

function SearchRow({ s }) {
  return (
    <Link to={`/comunidad/${s.id}`} className="card flex items-center gap-3 p-3.5 hover:bg-[#FFFCFD]">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-start justify-between gap-2"><b className="text-[15px]">{s.title}</b><Pill st={s.status} map={SEARCH_ST} /></span>
        <span className="text-[13px] text-tinta-3">
          {s.my_role === 'responsable' ? pl(s.collaborators, 'colaborador', 'colaboradores') : `Responsable: ${s.owner}`} · {pl(s.presented, 'presentado', 'presentados')}
          {s.close_estimate ? ` · cierre estimado ${fmt(s.close_estimate)}` : ''}
        </span>
        {s.to_review > 0 && <span className="self-start rounded-md bg-[#E7F1FB] px-1.5 py-0.5 text-[11px] font-semibold text-[#1F4E86]">{pl(s.to_review, 'candidato por revisar', 'candidatos por revisar')}</span>}
      </span>
      <Svg name="chevron" size={18} className="text-tinta-suave" />
    </Link>
  )
}

/** Detalle de una búsqueda: datos, participantes, presentar y decidir */
export function CommunitySearch() {
  const { id } = useParams()
  const nav = useNavigate()
  const { actsAs, setMode } = useAuth()
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')
  const [invOpen, setInvOpen] = useState(false)
  const [presOpen, setPresOpen] = useState(false)
  const [decide, setDecide] = useState(null)
  const load = useCallback(() => supabase.rpc('community_search', { p_search: id }).then(({ data, error }) => {
    if (error) { setErr(errMsg(error)); setD(false) } else setD(data)
  }), [id])
  useEffect(() => { load() }, [load])
  const call = async (fn, args, msg) => {
    setErr('')
    const { error } = await supabase.rpc(fn, args)
    if (error) { setErr(errMsg(error)); return false }
    if (msg) setToast(msg)
    load(); return true
  }
  const goProcess = () => { if (actsAs !== 'company') setMode('reclutamiento'); nav(`/vacantes/${d.job_id}/proceso`) }
  if (d == null) return <Screen><TopBar back="/comunidad" title="Búsqueda" /><Spinner /></Screen>
  if (d === false) return <Screen><TopBar back="/comunidad" title="Búsqueda" /><div className="p-5"><ErrorBox>{err}</ErrorBox></div></Screen>
  const role = d.my_role
  const open = d.status === 'abierta'
  const reqs = (d.requirements || []).map((r) => (typeof r === 'string' ? r : r?.text)).filter(Boolean)
  const others = (d.participants || []).filter((p) => p.role === 'colaborador')
  const pres = d.presentations || []
  return (
    <Screen className="bg-[#FAF7F9]" wide>
      <TopBar back="/comunidad" title="Búsqueda de la comunidad" />
      <div className="flex flex-col gap-3 px-5 pb-28 lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:px-8 lg:pb-10">
        <div className="flex flex-col gap-3">
          <ErrorBox>{err}</ErrorBox>
          <section className="card flex flex-col gap-2.5 p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="flex flex-col gap-0.5"><h1 className="text-[20px] font-bold leading-tight">{d.title}</h1><span className="text-sm font-semibold text-rosa-texto">{d.company}</span></span>
              <Pill st={d.status} map={SEARCH_ST} />
            </div>
            <span className="text-[13px] text-tinta-3">{[d.area, d.level, d.modality, d.schedule, d.contract, [d.comuna, d.region].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</span>
            <span className="text-sm font-semibold">{salaryText(d)}</span>
            <span className="text-[13px] text-tinta-2">{ROLE[role]} · Responsable: <b>{d.owner}</b> · publicada {fmt(d.created_at)}{d.close_estimate ? ` · cierre estimado ${fmt(d.close_estimate)}` : ''}</span>
            <div className="flex flex-col gap-1.5 rounded-xl bg-[#FAF7F9] p-3 text-[13px] leading-snug">
              <span><b>Qué se pide:</b> {COLLAB[d.collab_type] || d.collab_type}</span>
              {d.experience && <span><b>Experiencia:</b> {d.experience}</span>}
              {d.skills?.length > 0 && <span className="flex flex-wrap gap-1">{d.skills.map((s) => <span key={s} className="rounded-md bg-white px-1.5 py-0.5 text-[12px] font-semibold text-tinta-2">{s}</span>)}</span>}
              {d.note && <span className="whitespace-pre-line text-tinta-2">«{d.note}»</span>}
            </div>
            {reqs.length > 0 && <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-tinta-2">{reqs.map((r, i) => <li key={i}>{r}</li>)}</ul>}
            {d.description && <details className="text-[13px]"><summary className="cursor-pointer font-semibold">Descripción de la vacante</summary><p className="mt-1.5 whitespace-pre-line leading-relaxed text-tinta-2">{d.description}</p></details>}
            {role === 'invitado' && (
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-sm border border-linea bg-white" onClick={() => call('community_respond_invite', { p_search: id, p_accept: false }, 'Invitación rechazada').then((x) => x && nav('/comunidad'))}>No puedo</button>
                <button className="btn-sm bg-rosa-accion text-white" onClick={() => call('community_respond_invite', { p_search: id, p_accept: true }, 'Ya colaboras en esta búsqueda')}>Colaborar</button>
              </div>
            )}
            {role === 'responsable' && (
              <div className="flex flex-wrap gap-2">
                <button className="btn-sm bg-morado text-white" onClick={goProcess}>Ver proceso de la vacante</button>
                {d.status === 'abierta' && <button className="btn-sm border border-linea bg-white" onClick={() => call('community_set_status', { p_search: id, p_status: 'pausada' }, 'Búsqueda pausada')}>Pausar</button>}
                {d.status === 'pausada' && <button className="btn-sm border border-linea bg-white" onClick={() => call('community_set_status', { p_search: id, p_status: 'abierta' }, 'Búsqueda reabierta')}>Reabrir</button>}
                {d.status !== 'cerrada' && <button className="btn-sm border border-linea bg-white" onClick={() => call('community_set_status', { p_search: id, p_status: 'cerrada' }, 'Búsqueda cerrada')}>Cerrar búsqueda</button>}
              </div>
            )}
          </section>

          {role !== 'invitado' && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-semibold">{role === 'colaborador' ? 'Tus presentados' : 'Candidatos presentados'} · {pres.filter((x) => x.status !== 'no_acepto').length}</h2>
                {open && (role === 'responsable' || role === 'colaborador') && <button className="btn-sm h-10 bg-rosa-accion text-white" onClick={() => setPresOpen(true)}><Svg name="plus" size={16} />&nbsp;Presentar</button>}
              </div>
              {role === 'responsable' && pres.some((x) => x.status === 'esperando_consentimiento' && !x.mine) && (
                <p className="text-[12px] leading-snug text-tinta-3">Mientras la persona no acepte postular, no ves quién es: solo quien la presentó.</p>
              )}
              {pres.length === 0 ? <p className="rounded-2xl border border-dashed border-linea bg-white px-4 py-3.5 text-[13px] text-tinta-3">Aún no hay candidatos presentados.</p> : pres.map((x) => (
                <div key={x.id} className="card flex flex-col gap-2 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <b className="text-[15px]">{x.candidate || 'Persona por confirmar'}</b>
                      {x.headline && <span className="text-[13px] text-tinta-3">{x.headline}</span>}
                      <span className="text-[12px] text-tinta-suave">Presentado por {x.mine ? 'ti' : x.presented_by} · {REL[x.relation]} · {fmt(x.created_at)}</span>
                    </span>
                    <Pill st={x.status} map={PRES_ST} />
                  </div>
                  {x.note && <span className="whitespace-pre-line rounded-xl bg-[#FAF7F9] px-3 py-2 text-[13px] text-tinta-2">«{x.note}»</span>}
                  {x.response_note && <span className="whitespace-pre-line rounded-xl bg-[#FFFAEE] px-3 py-2 text-[13px] text-tinta-2"><b>Respuesta del responsable:</b> {x.response_note}</span>}
                  {x.stage && ['aceptado', 'rechazado', 'presentado', 'mas_antecedentes'].includes(x.status) && <span className="text-[12px] text-tinta-3">Etapa en el proceso: <b>{STAGE[x.stage] || x.stage}</b></span>}
                  {role === 'responsable' && ['presentado', 'mas_antecedentes'].includes(x.status) && (
                    <div className="grid grid-cols-3 gap-2">
                      <button className="btn-sm border border-linea bg-white px-2" onClick={() => setDecide({ x, decision: 'rechazado' })}>No avanza</button>
                      <button className="btn-sm border border-linea bg-white px-2" onClick={() => setDecide({ x, decision: 'mas_antecedentes' })}>Más datos</button>
                      <button className="btn-sm bg-[#1E6B3F] px-2 text-white" onClick={() => setDecide({ x, decision: 'aceptado' })}>Aceptar</button>
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-3">
          <section className="card flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold">Participantes</h2>
              {role === 'responsable' && open && <button className="text-[13px] font-semibold text-rosa-texto" onClick={() => setInvOpen(true)}>+ Invitar</button>}
            </div>
            <span className="text-sm"><b>{d.owner}</b> <span className="text-tinta-3">· responsable</span></span>
            {others.length === 0 ? <span className="text-[13px] text-tinta-3">{role === 'responsable' ? 'Invita a asesores de la comunidad para que te presenten candidatos.' : 'Sin otros colaboradores.'}</span> : others.map((p) => (
              <div key={p.user_id} className="flex items-center justify-between gap-2 text-sm">
                <span>{p.name} <span className="text-tinta-3">· {p.status === 'aceptado' ? 'colabora' : p.status === 'invitado' ? 'invitado/a' : p.status === 'rechazado' ? 'no aceptó' : 'retirado/a'}</span></span>
                {role === 'responsable' && ['invitado', 'aceptado'].includes(p.status) && <button className="text-[12px] font-semibold text-[#912018]" onClick={() => call('community_remove', { p_search: id, p_user: p.user_id }, 'Participante retirado')}>Retirar</button>}
              </div>
            ))}
            {role === 'colaborador' && <button className="btn-sm mt-1 self-start border border-linea bg-white" onClick={async () => { const me = (await supabase.auth.getUser()).data.user?.id; if (await call('community_remove', { p_search: id, p_user: me }, 'Te retiraste de la búsqueda')) nav('/comunidad') }}>Retirarme de la búsqueda</button>}
          </section>
          <p className="px-1 text-[12px] leading-snug text-tinta-3">Toda presentación requiere el consentimiento de la persona. La información de esta búsqueda es confidencial.</p>
        </aside>
      </div>
      {invOpen && <InviteSheet id={id} onClose={() => setInvOpen(false)} onDone={() => { setToast('Invitación enviada'); load() }} />}
      {presOpen && <PresentSheet id={id} onClose={() => setPresOpen(false)} onDone={() => { setPresOpen(false); setToast('Listo: la persona recibió la recomendación'); load() }} />}
      <DecideSheet item={decide} onClose={() => setDecide(null)} onDone={(msg) => { setDecide(null); setToast(msg); load() }} />
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </Screen>
  )
}

function InviteSheet({ id, onClose, onDone }) {
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')
  const load = useCallback(() => supabase.rpc('community_invitable', { p_search: id }).then(({ data, error }) => { if (error) setErr(errMsg(error)); setList(data || []) }), [id])
  useEffect(() => { load() }, [load])
  const invite = async (u) => {
    setErr('')
    const { error } = await supabase.rpc('community_invite', { p_search: id, p_user: u })
    if (error) return setErr(errMsg(error))
    onDone(); load()
  }
  return (
    <Sheet open onClose={onClose} title="Invitar a colaborar">
      <div className="flex flex-col gap-2">
        <ErrorBox>{err}</ErrorBox>
        {list == null ? <Spinner /> : list.length === 0 ? <p className="text-sm text-tinta-3">No hay más asesores habilitados para invitar.</p> : list.map((u) => (
          <div key={u.user_id} className="flex items-center justify-between gap-2 rounded-xl border border-linea p-3">
            <span className="flex min-w-0 flex-col"><b className="text-sm">{u.name}</b>{u.specialties?.length > 0 && <span className="text-[12px] text-tinta-3">{u.specialties.join(' · ')}</span>}</span>
            <button className="btn-sm h-10 shrink-0 bg-rosa-accion text-white" onClick={() => invite(u.user_id)}>Invitar</button>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

function PresentSheet({ id, onClose, onDone }) {
  const [list, setList] = useState(null)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { supabase.rpc('community_presentable', { p_search: id }).then(({ data, error }) => { if (error) setErr(errMsg(error)); setList(data || []) }) }, [id])
  const qn = q.trim().toLowerCase()
  const shown = (list || []).filter((c) => !qn || `${c.name} ${c.headline} ${c.comuna}`.toLowerCase().includes(qn))
  const send = async () => {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('community_present', { p_search: id, p_candidate: sel.candidate_id, p_note: note.trim() })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone()
  }
  return (
    <Sheet open onClose={onClose} title={sel ? `Presentar a ${sel.name}` : 'Presentar candidato'}>
      <div className="flex flex-col gap-2.5">
        <ErrorBox>{err}</ErrorBox>
        {sel ? (
          <>
            <p className="rounded-xl bg-[#FAF7F9] px-3 py-2.5 text-[13px] leading-snug text-tinta-2">{sel.name} recibirá la recomendación en VINKA y decidirá si postula. Solo si acepta, quien gestiona la vacante verá su perfil.</p>
            <label className="flex flex-col gap-1.5"><span className="label">¿Por qué lo/la recomiendas? (opcional)</span>
              <textarea className="textarea h-24" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Experiencia relevante, disponibilidad, lo que conoces de su trabajo" /></label>
            <span className="text-[12px] text-tinta-suave">La persona y el responsable verán este mensaje.</span>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-sm border border-linea bg-white" onClick={() => setSel(null)}>Volver</button>
              <button className="btn-sm bg-rosa-accion text-white" disabled={busy} onClick={send}>{busy ? 'Enviando…' : 'Enviar recomendación'}</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[13px] leading-snug text-tinta-3">Puedes presentar a personas que asesoras o que están en tus propios procesos.</p>
            <input className="input h-11" placeholder="Buscar por nombre, cargo o comuna" value={q} onChange={(e) => setQ(e.target.value)} />
            {list == null ? <Spinner /> : shown.length === 0 ? <p className="text-sm text-tinta-3">{list.length ? 'Nadie coincide con la búsqueda.' : 'Aún no tienes asesorados ni personas en tus procesos.'}</p> : shown.map((c) => (
              <button key={c.candidate_id} disabled={c.already} onClick={() => setSel(c)} className="flex items-center gap-2 rounded-xl border border-linea p-3 text-left disabled:opacity-55">
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="text-sm">{c.name}</b>
                  <span className="text-[12px] text-tinta-3">{[c.headline, c.comuna].filter(Boolean).join(' · ') || 'Sin cargo definido'}</span>
                  <span className="text-[11px] font-semibold text-tinta-suave">{REL[c.relation]}{c.already ? ' · ya está en esta vacante' : ''}</span>
                </span>
                {!c.already && <Svg name="chevron" size={18} className="text-tinta-suave" />}
              </button>
            ))}
          </>
        )}
      </div>
    </Sheet>
  )
}

const DECIDE_TXT = {
  aceptado: ['Aceptar candidato/a', 'Pasa a «Match» en el proceso de la vacante y podrás escribirle por el chat.', 'Aceptar', 'Candidato/a aceptado: ya está en tu proceso'],
  rechazado: ['No avanzar', 'Queda descartado/a en el proceso. Quien lo/la presentó recibirá tu respuesta.', 'Confirmar', 'Respuesta enviada'],
  mas_antecedentes: ['Pedir más antecedentes', 'Cuéntale a quien lo/la presentó qué información necesitas.', 'Enviar', 'Pedido enviado'],
}
function DecideSheet({ item, onClose, onDone }) {
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setNote(''); setErr('') }, [item])
  if (!item) return null
  const [title, hint, btn, msg] = DECIDE_TXT[item.decision]
  const send = async () => {
    if (item.decision === 'mas_antecedentes' && !note.trim()) return setErr('Escribe qué antecedentes necesitas.')
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('community_decide', { p_presentation: item.x.id, p_decision: item.decision, p_note: note.trim() })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone(msg)
  }
  return (
    <Sheet open onClose={onClose} title={`${title}: ${item.x.candidate || ''}`}>
      <div className="flex flex-col gap-2.5">
        <p className="text-[13px] leading-snug text-tinta-2">{hint}</p>
        <textarea className="textarea h-24" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={item.decision === 'mas_antecedentes' ? 'Ej.: ¿tiene licencia clase B? ¿cuál es su pretensión de renta?' : 'Mensaje para quien lo/la presentó (opcional)'} />
        <ErrorBox>{err}</ErrorBox>
        <button className="btn" disabled={busy} onClick={send}>{busy ? 'Guardando…' : btn}</button>
      </div>
    </Sheet>
  )
}

/** Proceso de una vacante: pedir apoyo a la comunidad o ir a la búsqueda abierta */
export function CommunityButton({ jobId, jobTitle }) {
  const nav = useNavigate()
  const [state, setState] = useState(null) // { member, search }
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let alive = true
    Promise.all([supabase.rpc('community_home'), supabase.rpc('community_search_for_job', { p_job: jobId })]).then(([h, s]) => {
      if (!alive || h.error) return
      setState({ member: h.data?.member?.status === 'activo' && h.data.member.rules_accepted, pending: h.data?.member?.status === 'activo' && !h.data.member.rules_accepted, search: s.error ? null : s.data })
    })
    return () => { alive = false }
  }, [jobId])
  if (!state || (!state.member && !state.pending && !state.search)) return null
  if (state.search) return <button className="btn-sm h-10 border border-linea bg-white" onClick={() => nav(`/comunidad/${state.search}`)}><Svg name="people" size={16} />&nbsp;Búsqueda en la comunidad</button>
  if (state.pending) return <button className="btn-sm h-10 border border-linea bg-white" onClick={() => nav('/comunidad')}><Svg name="people" size={16} />&nbsp;Pedir apoyo a la comunidad</button>
  return (
    <>
      <button className="btn-sm h-10 border border-linea bg-white" onClick={() => setOpen(true)}><Svg name="people" size={16} />&nbsp;Pedir apoyo a la comunidad</button>
      {open && <PublishSheet jobId={jobId} jobTitle={jobTitle} onClose={() => setOpen(false)} onDone={(sid) => nav(`/comunidad/${sid}`)} />}
    </>
  )
}

export function PublishSheet({ jobId, jobTitle, onClose, onDone }) {
  const [f, setF] = useState({ collab_type: 'candidatos', experience: '', skills: [], close_estimate: '', show_company: false, note: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))
  const send = async () => {
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('community_publish', { p_job: jobId, p: f })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone(data)
  }
  return (
    <Sheet open onClose={onClose} title="Pedir apoyo a la comunidad">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] leading-snug text-tinta-2">Publica <b>{jobTitle}</b> para que asesores que invites te presenten candidatos. Solo verán la búsqueda quienes tú invites.</p>
        <fieldset className="flex flex-col gap-1.5"><legend className="label mb-1.5">¿Qué apoyo necesitas?</legend>
          <div className="flex flex-wrap gap-1.5">{Object.entries(COLLAB).map(([k, l]) => <button type="button" key={k} className={`chip h-9 text-[13px] ${f.collab_type === k ? 'chip-on' : ''}`} onClick={() => set('collab_type')(k)}>{l}</button>)}</div>
        </fieldset>
        <label className="flex flex-col gap-1.5"><span className="label">Experiencia esperada</span>
          <input className="input h-11" maxLength={500} value={f.experience} onChange={(e) => set('experience')(e.target.value)} placeholder="Ej.: 2 años en bodega o centro de distribución" /></label>
        <div className="flex flex-col gap-1.5"><span className="label">Competencias clave</span><TagInput value={f.skills} onChange={set('skills')} placeholder="Escribe y presiona Enter" /></div>
        <label className="flex flex-col gap-1.5"><span className="label">Cierre estimado (opcional)</span>
          <input className="input h-11" type="date" value={f.close_estimate} onChange={(e) => set('close_estimate')(e.target.value)} /></label>
        <label className="flex flex-col gap-1.5"><span className="label">Mensaje para los asesores (opcional)</span>
          <textarea className="textarea h-20" maxLength={1000} value={f.note} onChange={(e) => set('note')(e.target.value)} placeholder="Lo que más importa del perfil, urgencia, contexto del cliente" /></label>
        <label className="flex items-start gap-2.5 text-[13px] leading-snug">
          <input type="checkbox" checked={f.show_company} onChange={(e) => set('show_company')(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D02E72]" />
          Mostrar el nombre de la empresa a los colaboradores (si la vacante es confidencial, nunca se muestra).
        </label>
        <ErrorBox>{err}</ErrorBox>
        <button className="btn" disabled={busy} onClick={send}>{busy ? 'Publicando…' : 'Publicar en la comunidad'}</button>
      </div>
    </Sheet>
  )
}
