import { useCallback, useEffect, useState } from 'react'
import { supabase, errMsg } from '../../lib/supabase'
import { Empty, ErrorBox, Screen, Spinner, TopBar } from '../../components/ui'

export default function Admin() {
  const [tab, setTab] = useState('pending')
  const [companies, setCompanies] = useState(null)
  const [reports, setReports] = useState([])
  const [notes, setNotes] = useState({})
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('companies').select('*').order('created_at', { ascending: false }),
      supabase.from('reports').select('*').order('created_at', { ascending: false }),
    ])
    if (a.error) setErr(errMsg(a.error))
    setCompanies(a.data || []); setReports(b.data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const decide = async (id, status) => {
    const { error } = await supabase.from('companies').update({ verification_status: status, verification_note: notes[id] || '' }).eq('id', id)
    if (error) return setErr(errMsg(error))
    load()
  }
  const closeReport = async (id) => { await supabase.from('reports').update({ status: 'reviewed' }).eq('id', id); load() }

  const list = (companies || []).filter((c) => (tab === 'pending' ? c.verification_status === 'pending' : tab === 'all' ? true : false))
  return (
    <Screen className="bg-[#FAF7F9]">
      <TopBar back="/" title="Administración" />
      <div className="flex flex-col gap-3 px-5 pb-10">
        <div className="flex gap-1.5">
          {[['pending', 'Por verificar'], ['all', 'Todas'], ['reports', 'Denuncias']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`h-10 rounded-full border px-3 text-[13px] font-semibold ${tab === k ? 'border-morado bg-morado text-white' : 'border-linea bg-white'}`}>{l}</button>
          ))}
        </div>
        <ErrorBox>{err}</ErrorBox>
        {companies == null ? <Spinner /> : tab === 'reports' ? (
          reports.length === 0 ? <Empty title="Sin denuncias">Todo tranquilo.</Empty> : reports.map((r) => (
            <div key={r.id} className="card flex flex-col gap-2 p-3.5 text-sm">
              <span className="text-xs text-tinta-suave">{new Date(r.created_at).toLocaleString('es-CL')} · {r.status === 'open' ? 'Abierta' : 'Revisada'}</span>
              <p>{r.reason}</p>
              <span className="text-xs text-tinta-suave">Match: {r.match_id || '—'}</span>
              {r.status === 'open' && <button className="btn-sm self-start border border-linea bg-white" onClick={() => closeReport(r.id)}>Marcar revisada</button>}
            </div>
          ))
        ) : list.length === 0 ? <Empty title="Nada pendiente">No hay empresas esperando verificación.</Empty> : list.map((c) => (
          <div key={c.id} className="card flex flex-col gap-2 p-3.5 text-sm">
            <div className="flex justify-between gap-2"><b>{c.display_name}</b><span className="text-xs text-tinta-suave">{c.verification_status}</span></div>
            <span>{c.legal_name} · RUT {c.rut}</span>
            <span className="text-tinta-3">{[c.sector, c.size, c.comuna, c.region].filter(Boolean).join(' · ')}</span>
            <a className="text-rosa-texto underline" href={`https://www.google.com/search?q=${encodeURIComponent(c.rut + ' ' + c.legal_name)}`} target="_blank" rel="noreferrer">Buscar RUT en la web</a>
            <input className="input h-11" placeholder="Nota para la empresa (opcional)" value={notes[c.id] || ''} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <button className="btn-sm bg-[#1E6B3F] text-white" onClick={() => decide(c.id, 'verified')}>Verificar</button>
              <button className="btn-sm border border-linea bg-white" onClick={() => decide(c.id, 'rejected')}>Rechazar</button>
              <button className="btn-sm border border-linea bg-white" onClick={() => decide(c.id, 'suspended')}>Suspender</button>
            </div>
          </div>
        ))}
      </div>
    </Screen>
  )
}
