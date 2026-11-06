import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { colorFor, initials } from '../../lib/catalog'
import { Avatar, Empty, ErrorBox, Spinner } from '../../components/ui'
import { MatchModal } from '../../components/MatchModal'
import { Bell } from '../../components/Bell'
import { InstallBanner } from '../../components/InstallBanner'

const TABS = [
  ['match', 'Matches', 'Ambos se interesaron en la misma vacante. Ya pueden conversar.'],
  ['invited', 'Te invitaron', 'Una empresa verificada se interesó en ti para una vacante concreta. Si aceptas, es match.'],
  ['sent', 'Enviados', 'Mostraste interés. Será match solo si la empresa también se interesa.'],
  ['saved', 'Guardadas', 'Solo tú ves lo que guardas. La empresa no recibe aviso.'],
]
const PILL = { match: ['MATCH', 'bg-rosa-accion text-white'], invited: ['TE INVITARON', 'bg-[#FFE7CC] text-naranja-texto'], sent: ['ENVIADO', 'bg-[#ECE6F2] text-[#3D2F4A]'], saved: ['GUARDADA', 'bg-[#F1F1F1] text-[#3A3A3A]'] }

export default function Interests() {
  const { user, profile } = useAuth()
  const nav = useNavigate()
  const [match, setMatch] = useState(null)
  const [tab, setTab] = useState('invited')
  const [rows, setRows] = useState(null)
  const [matches, setMatches] = useState([])
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([supabase.rpc('my_interests'), supabase.rpc('my_matches')])
    if (a.error || b.error) setErr(errMsg(a.error || b.error))
    setRows(a.data || []); setMatches(b.data || [])
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (rows && tab === 'invited' && !rows.some((r) => r.kind === 'invited')) setTab(matches.length ? 'match' : 'sent') }, [rows]) // eslint-disable-line

  const respond = async (job_id, action) => {
    const { error } = await supabase.from('candidate_job_actions').upsert({ candidate_id: user.id, job_id, action })
    if (error) return setErr(errMsg(error))
    if (action === 'interest') {
      const { data } = await supabase.from('matches').select('id').eq('job_id', job_id).eq('candidate_id', user.id).maybeSingle()
      const r = (rows || []).find((x) => x.job_id === job_id)
      if (data) {
        setMatch({ matchId: data.id, jobTitle: r?.title, otherName: r?.company_name, continueLabel: 'Volver a Intereses',
          leftInitials: `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}`.toUpperCase(), leftColor: '#D02E72',
          rightInitials: initials(r?.company_name), rightColor: colorFor(r?.company_name || '') })
      }
    }
    load()
  }
  const unsave = async (job_id) => { await supabase.from('candidate_job_actions').delete().eq('candidate_id', user.id).eq('job_id', job_id); load() }

  const count = (k) => (k === 'match' ? matches.length : (rows || []).filter((r) => r.kind === k).length)
  const list = tab === 'match'
    ? matches.map((m) => ({ key: m.match_id, title: m.job_title, company: m.company_name, match_id: m.match_id }))
    : (rows || []).filter((r) => r.kind === tab).map((r) => ({ key: r.job_id, job_id: r.job_id, title: r.title, company: [r.company_name, r.comuna, r.modality].filter(Boolean).join(' · ') }))

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-rosa-fondo pb-24">
      <div className="safe-t px-5 pb-3">
        <div className="flex items-center justify-between"><h1 className="text-[22px] font-bold">Intereses</h1><Bell /></div>
        <div className="mt-3"><InstallBanner /></div>
        <div role="tablist" className="mt-3.5 flex flex-wrap gap-1.5">
          {TABS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`h-10 whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold ${tab === k ? 'border-morado bg-morado text-white' : 'border-linea bg-white text-tinta-2'}`}>
              {label} · {count(k)}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[13px] leading-snug text-tinta-3">{TABS.find((t) => t[0] === tab)[2]}</p>
      </div>
      <div className="flex flex-col gap-2.5 px-5">
        <ErrorBox>{err}</ErrorBox>
        {rows == null ? <Spinner /> : list.length === 0 ? (
          <Empty title="Nada por aquí todavía">{tab === 'invited' ? 'Cuando una empresa se interese en ti, aparecerá aquí.' : <>Sigue explorando en <Link to="/" className="font-semibold text-rosa-texto">Explorar</Link>.</>}</Empty>
        ) : list.map((r) => (
          <div key={r.key} className="card flex flex-col gap-2.5 p-3.5">
            <div className="flex items-center gap-3">
              <Avatar text={initials(r.company)} color={colorFor(r.company)} size={44} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-semibold">{r.title}</span>
                <span className="truncate text-[13px] text-tinta-3">{r.company}</span>
              </div>
              <span className={`pill whitespace-nowrap ${PILL[tab][1]}`}>{PILL[tab][0]}</span>
            </div>
            {tab === 'invited' && (
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-sm border border-linea bg-white" onClick={() => respond(r.job_id, 'pass')}>No, gracias</button>
                <button className="btn-sm bg-rosa-accion text-white" onClick={() => respond(r.job_id, 'interest')}>Me interesa</button>
              </div>
            )}
            {tab === 'match' && <Link to={`/chats/${r.match_id}`} className="btn-sm bg-rosa-palido text-rosa-oscuro">Abrir chat</Link>}
            {tab === 'saved' && (
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-sm border border-linea bg-white" onClick={() => unsave(r.job_id)}>Quitar</button>
                <button className="btn-sm bg-rosa-accion text-white" onClick={() => respond(r.job_id, 'interest')}>Me interesa</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <MatchModal match={match} onClose={() => setMatch(null)} />
    </div>
  )
}
