import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { colorFor, initials } from '../../lib/catalog'
import { Avatar, BottomNav, Screen, Spinner, Svg } from '../../components/ui'
import { Bell } from '../../components/Bell'
import { TodoBlock } from '../../components/TodoBlock'
import { useUnread } from '../../lib/unread'
import { useAdvisorUnread } from '../../lib/advisorUnread'

// Asesor/a de VINKA: un solo menú que junta asesorías, reclutamiento, comunidad y chats (sin cambiar de modo).

const fmtDue = (d) => {
  if (!d) return ''
  const days = Math.round((new Date(d).getTime() - Date.now()) / 86400000)
  return days < 0 ? 'atrasada' : days === 0 ? 'vence hoy' : days === 1 ? 'vence mañana' : `vence en ${days} días`
}

/** Campana y foto (lleva a la cuenta) */
export function TopIcons() {
  const { profile } = useAuth()
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()
  return (
    <div className="flex items-center gap-2">
      <Bell />
      <Link to="/cuenta" aria-label="Mi cuenta" className="rounded-full"><Avatar text={initials(name)} color={colorFor(name)} size={40} round /></Link>
    </div>
  )
}

/** Foto del asesor (lleva a la cuenta), para pantallas que ya tienen la campana */
export function MeAvatar() {
  const { profile } = useAuth()
  if (profile?.role !== 'advisor') return null
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()
  return <Link to="/cuenta" aria-label="Mi cuenta" className="shrink-0 rounded-full"><Avatar text={initials(name)} color={colorFor(name)} size={40} round /></Link>
}

/** Pestañas dentro de «Vacantes» */
export function VacTabs() {
  const { profile } = useAuth()
  if (profile?.role !== 'advisor') return null
  const cls = ({ isActive }) => `chip h-9 text-[13px] ${isActive ? 'chip-on' : ''}`
  return (
    <nav aria-label="Secciones de vacantes" className="flex gap-1.5 px-5 pb-3">
      <NavLink to="/vacantes" end className={cls}>Vacantes</NavLink>
      <NavLink to="/talento" className={cls}>Talento</NavLink>
      <NavLink to="/agenda" className={cls}>Agenda</NavLink>
    </nav>
  )
}

/** Inicio del asesor: todo lo pendiente en una lista */
export function AdvisorInicio() {
  const { profile, company } = useAuth()
  const { search } = useLocation()
  const [cases, setCases] = useState(null)
  const [collabs, setCollabs] = useState([])
  const [inbox, setInbox] = useState({ tasks: [], suggestions: [] })
  const caso = new URLSearchParams(search).get('caso')
  useEffect(() => {
    if (caso) return
    supabase.rpc('advisor_requests').then(({ data }) => setCases(data || []))
    supabase.rpc('my_collaborations').then(({ data }) => setCollabs((data || []).filter((c) => !c.closed)))
    supabase.rpc('collab_inbox').then(({ data, error }) => { if (!error && data) setInbox(data) })
  }, [caso])
  // Avisos antiguos de asesorías apuntan a «/?caso=…»
  if (caso) return <Navigate to={`/asesorias?caso=${caso}`} replace />
  const active = (cases || []).filter((r) => ['pago_pendiente', 'asignada', 'en_curso'].includes(r.status))
  const urgent = active.filter((r) => r.next?.due).sort((a, b) => new Date(a.next.due) - new Date(b.next.due)).slice(0, 4)
  return (
    <Screen className="bg-[#FAF7F9]" wide>
      <div className="safe-t flex items-center justify-between gap-3 px-5 pb-3 lg:px-8 lg:pt-6">
        <div className="flex min-w-0 flex-col"><span className="text-[13px] text-tinta-suave">Asesor/a de VINKA</span><h1 className="truncate text-[22px] font-bold">Hola, {profile?.first_name}</h1></div>
        <TopIcons />
      </div>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3.5 px-5 pb-28 lg:px-8 lg:pb-10">
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold">Asesorías</h2><Link to="/asesorias" className="text-[13px] font-semibold text-rosa-texto">Ver todas ({active.length})</Link></div>
          {cases == null ? <Spinner /> : urgent.length === 0 ? (
            <div className="flex items-center gap-2 rounded-2xl bg-[#EFF9F2] px-3.5 py-2.5 text-[13px] font-semibold text-[#134A2B]"><Svg name="check" size={18} />{active.length ? 'Tus asesorías están al día.' : 'No tienes asesorías activas.'}</div>
          ) : (
            <div className="card flex flex-col gap-1 p-2">
              {urgent.map((r) => (
                <Link key={r.id} to={`/asesorias?caso=${r.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[#FAF7F9]">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${r.next.late ? 'bg-[#FEF3F2] text-[#912018]' : 'bg-rosa-palido text-rosa-oscuro'}`}><Svg name="doc" size={18} /></span>
                  <span className="flex min-w-0 flex-1 flex-col"><b className="truncate text-sm">{r.next.label}</b><span className="truncate text-xs text-tinta-3">{r.name} · {r.service} · <span className={r.next.late ? 'font-semibold text-[#912018]' : ''}>{r.next.late ? 'atrasada' : fmtDue(r.next.due)}</span></span></span>
                  <Svg name="chevron" size={18} className="text-tinta-suave" />
                </Link>
              ))}
            </div>
          )}
        </section>
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold">Reclutamiento</h2>{company && <Link to="/vacantes" className="text-[13px] font-semibold text-rosa-texto">Mis vacantes</Link>}</div>
          {company ? <TodoBlock companyId={company.id} /> : (
            <p className="rounded-2xl border border-dashed border-linea bg-white px-4 py-3 text-[13px] leading-snug text-tinta-3">Para publicar vacantes y llevar procesos, pide a VINKA tu espacio de reclutamiento.</p>
          )}
        </section>
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold">Comunidad</h2><Link to="/comunidad" className="text-[13px] font-semibold text-rosa-texto">Ir al muro</Link></div>
          {(inbox.suggestions.length > 0 || inbox.tasks.length > 0) && (
            <div className="card flex flex-col gap-1 p-2">
              {inbox.suggestions.map((x) => (
                <Link key={x.id} to={`/vacantes/${x.job_id}/proceso`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[#FAF7F9]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF4D6] text-[#7A5200]"><Svg name="check" size={18} /></span>
                  <span className="flex min-w-0 flex-1 flex-col"><b className="truncate text-sm">{x.by} sugiere {x.action === 'avanzar' ? 'avanzar' : 'descartar'} a {x.candidate}</b><span className="truncate text-xs text-tinta-3">{x.job} · necesita tu ✓</span></span>
                  <Svg name="chevron" size={18} className="text-tinta-suave" />
                </Link>
              ))}
              {inbox.tasks.map((t) => (
                <Link key={t.id} to={t.url} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[#FAF7F9]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rosa-palido text-rosa-oscuro"><Svg name="doc" size={18} /></span>
                  <span className="flex min-w-0 flex-1 flex-col"><b className="truncate text-sm">{t.title}</b><span className="truncate text-xs text-tinta-3">Tarea · {t.job}{t.due_on ? ` · ${fmtDue(t.due_on + 'T23:59:00')}` : ''}</span></span>
                  <Svg name="chevron" size={18} className="text-tinta-suave" />
                </Link>
              ))}
            </div>
          )}
          {collabs.length > 0 ? (
            <div className="card flex flex-col gap-1 p-2">
              {collabs.map((c) => (
                <Link key={c.job_id} to={`/vacantes/${c.job_id}/proceso`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[#FAF7F9]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rosa-palido text-rosa-oscuro"><Svg name="people" size={18} /></span>
                  <span className="flex min-w-0 flex-1 flex-col"><b className="truncate text-sm">{c.title}</b><span className="text-xs text-tinta-3">Proceso compartido por {c.owner}</span></span>
                  <Svg name="chevron" size={18} className="text-tinta-suave" />
                </Link>
              ))}
            </div>
          ) : <p className="text-[13px] text-tinta-3">Pide recomendaciones o ayuda a otros asesores a cerrar sus procesos.</p>}
        </section>
      </div>
    </Screen>
  )
}

/** Vacantes sin espacio de reclutamiento */
export function NoWorkspace() {
  return (
    <Screen className="bg-[#FAF7F9]">
      <div className="safe-t flex items-center justify-between gap-3 px-5 pb-3"><h1 className="text-[22px] font-bold">Vacantes</h1><TopIcons /></div>
      <div className="px-5">
        <div className="card flex flex-col gap-2 p-4 text-sm leading-relaxed">
          <b className="font-display text-lg">Aún no tienes tu espacio de reclutamiento</b>
          <span className="text-tinta-2">Con él puedes tener clientes, publicar vacantes y llevar procesos completos. Pídeselo al equipo de VINKA.</span>
          <Link to="/equipo" className="btn mt-1">Escribir al equipo de VINKA</Link>
        </div>
      </div>
    </Screen>
  )
}

const FILTERS = [['candidatos', 'Candidatos'], ['asesorias', 'Asesorías'], ['asesores', 'Asesores'], ['equipo', 'Equipo VINKA']]

/** Filtros de Chats */
export function ChatFilter() {
  const { company } = useAuth()
  const { search, pathname } = useLocation()
  const nav = useNavigate()
  const cur = pathname === '/equipo' ? 'equipo' : new URLSearchParams(search).get('ver') || (company ? 'candidatos' : 'asesorias')
  const { total: cand } = useUnread()
  const adv = useAdvisorUnread()
  const count = { candidatos: cand, asesorias: adv.asesorias, asesores: adv.asesores, equipo: adv.equipo }
  return (
    <div className="flex gap-1.5 overflow-x-auto px-5 pb-3" role="tablist" aria-label="Tipo de conversación">
      {FILTERS.filter(([k]) => company || k !== 'candidatos').map(([k, l]) => (
        <button key={k} role="tab" aria-selected={cur === k} className={`chip h-9 shrink-0 gap-1.5 text-[13px] ${cur === k ? 'chip-on' : ''}`} onClick={() => nav(k === 'equipo' ? '/equipo' : `/chats?ver=${k}`)}>
          {l}{count[k] > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rosa-accion px-1.5 text-[11px] font-bold leading-none text-white" aria-label={`${count[k]} sin leer`}>{count[k]}</span>}
        </button>
      ))}
    </div>
  )
}

/** Chats del asesor: candidatos (si tiene vacantes), asesorías, asesores de la comunidad y equipo VINKA */
export function ChatsHub({ items, candidates }) {
  const { company, companies } = useAuth()
  const { search } = useLocation()
  const ver = new URLSearchParams(search).get('ver') || (company ? 'candidatos' : 'asesorias')
  const [cases, setCases] = useState(null)
  const [threads, setThreads] = useState(null)
  const adv = useAdvisorUnread()
  const Badge = ({ n }) => (n > 0 ? <span className="flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-rosa-accion px-1.5 text-[12px] font-bold text-white" aria-label={`${n} sin leer`}>{n}</span> : null)
  useEffect(() => {
    if (ver === 'asesorias') supabase.rpc('advisor_requests').then(({ data }) => setCases(data || []))
    if (ver === 'asesores') {
      (async () => {
        const list = []
        const { data: mine } = await supabase.rpc('my_collaborations')
        const { data: { user } } = await supabase.auth.getUser()
        for (const c of mine || []) list.push({ key: 'i' + c.job_id, ck: `${c.job_id}:${user?.id}`, title: c.title, who: c.owner, to: `/vacantes/${c.job_id}/proceso?chat=me`, sub: 'Te invitó a su proceso' })
        const ids = (companies || []).map((c) => c.id)
        if (ids.length) {
          const { data: jobs } = await supabase.from('jobs').select('id, title').in('company_id', ids).neq('status', 'closed')
          const infos = await Promise.all((jobs || []).map((j) => supabase.rpc('job_collab_info', { p_job: j.id }).then(({ data }) => ({ j, data }))))
          for (const { j, data } of infos) for (const c of data?.collaborators || []) list.push({ key: j.id + c.user_id, ck: `${j.id}:${c.user_id}`, title: j.title, who: c.name, to: `/vacantes/${j.id}/proceso?chat=${c.user_id}`, sub: 'Invitado/a a tu proceso', at: c.last_at })
        }
        setThreads(list)
      })()
    }
  }, [ver, companies])
  if (ver === 'candidatos' && candidates) return candidates
  return (
    <Screen className="bg-[#FAF7F9]" wide>
      <div className="safe-t flex items-center justify-between gap-3 px-5 pb-3 lg:px-8 lg:pt-6"><h1 className="text-[22px] font-bold">Chats</h1><TopIcons /></div>
      <ChatFilter />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-5 pb-28 lg:px-8">
        {ver === 'asesorias' && (cases == null ? <Spinner /> : cases.length === 0 ? <p className="text-sm text-tinta-3">No tienes asesorías asignadas.</p> : cases.map((r) => (
          <Link key={r.id} to={`/asesorias?caso=${r.id}`} className="card flex items-center gap-3 p-3">
            <Avatar text={initials(r.name)} color={colorFor(r.name || '')} size={42} round />
            <span className="flex min-w-0 flex-1 flex-col"><b className="truncate text-[15px]">{r.name}</b><span className="truncate text-[13px] text-tinta-3">{r.service} · {pl(r.messages)}</span></span>
            <Badge n={adv.by_request[r.id]} />
            <Svg name="chevron" size={18} className="text-tinta-suave" />
          </Link>
        )))}
        {ver === 'asesores' && (threads == null ? <Spinner /> : threads.length === 0 ? (
          <p className="text-sm leading-snug text-tinta-3">Aquí verás tus conversaciones con asesores invitados a un proceso (tuyo o de otro asesor). Para invitar a alguien, liga tu publicación de la Comunidad a una vacante y toca «Invitar al proceso» en su comentario.</p>
        ) : threads.map((t) => (
          <Link key={t.key} to={t.to} className="card flex items-center gap-3 p-3">
            <Avatar text={initials(t.who)} color={colorFor(t.who || '')} size={42} round />
            <span className="flex min-w-0 flex-1 flex-col"><b className="truncate text-[15px]">{t.who}</b><span className="truncate text-[13px] text-tinta-3">{t.title} · {t.sub}</span></span>
            <Badge n={adv.by_collab[t.ck]} />
            <Svg name="chevron" size={18} className="text-tinta-suave" />
          </Link>
        )))}
      </div>
      <BottomNav items={items} />
    </Screen>
  )
}
const pl = (n) => (n === 1 ? '1 mensaje' : `${n || 0} mensajes`)
