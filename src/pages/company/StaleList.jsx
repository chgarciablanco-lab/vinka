import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { supabase, errMsg } from '../../lib/supabase'
import { Empty, Screen, Spinner, TopBar } from '../../components/ui'
import { pl } from '../../lib/text'

const STAGE = { match: 'Nuevo match', contacto: 'Contacto', entrevista: 'Entrevista', oferta: 'Oferta' }
const day = (d) => new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })

// Carga con estados exclusivos: cargando, error con reintento, vacía o con resultados.
// Al cambiar de empresa se limpia la lista anterior mientras llega la nueva.
function useCompanyList(rpc) {
  const { company } = useAuth()
  const [state, setState] = useState({ rows: null, err: '' })
  const load = useCallback(() => {
    if (!company?.id) return undefined
    let alive = true
    setState({ rows: null, err: '' })
    supabase.rpc(rpc, { p_company: company.id }).then(
      ({ data, error }) => alive && setState(error ? { rows: null, err: errMsg(error) } : { rows: data || [], err: '' }),
      () => alive && setState({ rows: null, err: 'No pudimos cargar la lista. Revisa tu conexión.' }))
    return () => { alive = false }
  }, [company?.id, rpc])
  useEffect(() => load(), [load])
  return { ...state, retry: load }
}

function Body({ rows, err, retry, empty, children }) {
  if (err) return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-2xl border border-[#F4C7C3] bg-[#FEF3F2] p-4 text-sm text-[#912018]">
      {err}
      <button className="btn-sm border border-[#F4C7C3] bg-white" onClick={retry}>Reintentar</button>
    </div>
  )
  if (rows == null) return <Spinner />
  if (rows.length === 0) return empty
  return children
}

/** Procesos que llevan más días de los configurados sin cambiar de etapa: se abre desde el pendiente del Panel */
export default function StaleList() {
  const { rows, err, retry } = useCompanyList('company_stale_list')
  return (
    <Screen className="bg-[#FAF7F9]">
      <TopBar back="/" title="Procesos sin avanzar" />
      <div className="flex flex-col gap-3 px-5 pb-10">
        <p className="text-sm text-tinta-3">Procesos abiertos que no cambian de etapa hace más de los días que definiste en Automatizaciones. Revisa cada caso: escribe un recordatorio, agenda, decide o cierra el proceso si ya no sigue.</p>
        <Body rows={rows} err={err} retry={retry} empty={<Empty title="Nadie está esperando">Todos tus procesos abiertos avanzaron a tiempo.</Empty>}>
          <ul className="flex flex-col gap-2.5" aria-label="Procesos sin avanzar">
            {(rows || []).map((r) => (
              <li key={r.match_id} className="card flex flex-col gap-2 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col">
                    <b className="truncate text-[15px]">{r.candidate_name}</b>
                    <span className="truncate text-[13px] text-tinta-3">{r.job_title}{r.job_status === 'paused' ? ' · vacante en pausa' : ''}</span>
                  </div>
                  <span className="pill shrink-0 bg-naranja-palido text-naranja-texto">{pl(r.days, 'día', 'días')}</span>
                </div>
                <span className="text-[13px] text-tinta-2">Etapa: <b>{STAGE[r.stage] || r.stage}</b>{r.last_message_at ? ` · último mensaje el ${day(r.last_message_at)}` : ' · sin mensajes'}</span>
                <div className="flex gap-2">
                  <Link to={`/chats/${r.match_id}`} className="btn-sm flex-1 bg-rosa-accion text-center text-white">Escribir</Link>
                  <Link to={`/vacantes/${r.job_id}/candidato/${r.candidate_id}`} className="btn-sm flex-1 border border-linea bg-white text-center">Ver ficha</Link>
                </div>
              </li>
            ))}
          </ul>
        </Body>
      </div>
    </Screen>
  )
}

/** Postulaciones que la empresa guardó para decidir después: siguen pendientes hasta que alguien decida */
export function SavedList() {
  const { rows, err, retry } = useCompanyList('company_saved_list')
  return (
    <Screen className="bg-[#FAF7F9]">
      <TopBar back="/" title="Guardadas por decidir" />
      <div className="flex flex-col gap-3 px-5 pb-10">
        <p className="text-sm text-tinta-3">Personas que postularon y guardaste para decidir después. Abre su ficha y avánzala o descártala para que no queden esperando.</p>
        <Body rows={rows} err={err} retry={retry} empty={<Empty title="No tienes postulaciones guardadas">Cuando guardes a alguien para decidir después, aparecerá aquí.</Empty>}>
          <ul className="flex flex-col gap-2.5" aria-label="Postulaciones guardadas por decidir">
            {(rows || []).map((r) => (
              <li key={r.job_id + r.candidate_id} className="card flex flex-col gap-2 p-3.5">
                <div className="flex min-w-0 flex-col">
                  <b className="truncate text-[15px]">{r.candidate_name}</b>
                  <span className="truncate text-[13px] text-tinta-3">{r.job_title}{r.job_status === 'paused' ? ' · vacante en pausa' : ''}</span>
                  {r.headline && <span className="truncate text-[13px] text-tinta-2">{r.headline}</span>}
                </div>
                <span className="text-[13px] text-tinta-2">Postuló el {day(r.applied_at)} · guardada el {day(r.saved_at)}</span>
                <div className="flex gap-2">
                  <Link to={`/vacantes/${r.job_id}/candidato/${r.candidate_id}`} className="btn-sm flex-1 bg-rosa-accion text-center text-white">Ver ficha y decidir</Link>
                  <Link to={`/vacantes/${r.job_id}/proceso`} className="btn-sm flex-1 border border-linea bg-white text-center">Ver proceso</Link>
                </div>
              </li>
            ))}
          </ul>
        </Body>
      </div>
    </Screen>
  )
}
