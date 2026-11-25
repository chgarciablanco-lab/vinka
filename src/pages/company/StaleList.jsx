import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { supabase, errMsg } from '../../lib/supabase'
import { Empty, ErrorBox, Screen, Spinner, TopBar } from '../../components/ui'
import { pl } from '../../lib/text'

const STAGE = { match: 'Nuevo match', contacto: 'Contacto', entrevista: 'Entrevista', oferta: 'Oferta' }

/** Personas que llevan más días de los configurados sin avanzar de etapa: se abre desde el pendiente del Panel */
export default function StaleList() {
  const { company } = useAuth()
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!company?.id) return
    supabase.rpc('company_stale_list', { p_company: company.id }).then(({ data, error }) => { if (error) setErr(errMsg(error)); setRows(data || []) })
  }, [company?.id])
  return (
    <Screen className="bg-[#FAF7F9]">
      <TopBar back="/" title="Personas sin avanzar" />
      <div className="flex flex-col gap-3 px-5 pb-10">
        <p className="text-sm text-tinta-3">Procesos abiertos que no cambian de etapa hace más de los días que definiste en Automatizaciones. Escríbeles o avanza su etapa para que no queden esperando.</p>
        <ErrorBox>{err}</ErrorBox>
        {rows == null ? <Spinner /> : rows.length === 0 ? <Empty title="Nadie está esperando">Todos tus procesos abiertos avanzaron a tiempo.</Empty> : (
          <ul className="flex flex-col gap-2.5" aria-label="Personas sin avanzar">
            {rows.map((r) => (
              <li key={r.match_id} className="card flex flex-col gap-2 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col">
                    <b className="truncate text-[15px]">{r.candidate_name}</b>
                    <span className="truncate text-[13px] text-tinta-3">{r.job_title}{r.job_status === 'paused' ? ' · vacante en pausa' : ''}</span>
                  </div>
                  <span className="pill shrink-0 bg-naranja-palido text-naranja-texto">{pl(r.days, 'día', 'días')}</span>
                </div>
                <span className="text-[13px] text-tinta-2">Etapa: <b>{STAGE[r.stage] || r.stage}</b>{r.last_message_at ? ` · último mensaje el ${new Date(r.last_message_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}` : ' · sin mensajes'}</span>
                <div className="flex gap-2">
                  <Link to={`/chats/${r.match_id}`} className="btn-sm flex-1 bg-rosa-accion text-center text-white">Escribir</Link>
                  <Link to={`/vacantes/${r.job_id}/proceso`} className="btn-sm flex-1 border border-linea bg-white text-center">Ver proceso</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Screen>
  )
}
