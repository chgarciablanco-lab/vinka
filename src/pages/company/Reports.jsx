import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { supabase, errMsg } from '../../lib/supabase'
import { ErrorBox, Screen, Spinner, Svg, TopBar } from '../../components/ui'

const PERIODOS = [[30, '30 días'], [90, '90 días'], [365, '12 meses'], [0, 'Todo']]
const STEPS = [['views', 'Vieron el aviso'], ['applied', 'Interesados («Me interesa»)'], ['matches', 'Match'], ['contacted', 'Contactados'], ['interviewed', 'Entrevistados'], ['offered', 'Con oferta'], ['hired', 'Contratados']]
const STAGE_ORDER = [['match', 'Nuevo match'], ['contacto', 'Contacto'], ['entrevista', 'Entrevista'], ['oferta', 'Oferta']]
// Cada indicador cuenta un universo distinto; aquí se explica cuál.
const GLOSARIO = [
  ['Interesados', 'Personas que tocaron «Me interesa» en tus vacantes de VINKA en el período. Si hay importados de otros portales, se suman y la tarjeta dice «Interesados + externos». Una persona interesada en dos vacantes cuenta dos veces.'],
  ['Vieron el aviso', 'Veces que se abrió el detalle de tus vacantes.'],
  ['Match', 'Interés mutuo: la persona y tu empresa se eligieron. Desde aquí empieza tu proceso de selección. Todo match parte de un «Me interesa», por eso los matches son una parte de los interesados.'],
  ['Contactados, Entrevistados, Con oferta', 'Personas que llegaron al menos a esa etapa, aunque después avanzaran o fueran descartadas. Suman los matches de VINKA y los importados de otros portales.'],
  ['Contratados', 'Personas marcadas como contratadas, de VINKA y de otros portales.'],
  ['Por fuente · En proceso', 'Personas que entraron a tu proceso según de dónde vinieron: en VINKA, los matches; en otros portales, los importados. No incluye a quienes solo dijeron «Me interesa».'],
  ['Tiempo promedio a contratar', 'Días entre el match y la contratación.'],
  ['Período', 'Cada cifra cuenta lo ocurrido en el período elegido según su propia fecha: el «Me interesa», el match o la importación.'],
]
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)

/** Embudo: una sola serie, un solo tono; el número va en texto, no en color. */
function Funnel({ data }) {
  const max = Math.max(1, ...STEPS.map(([k]) => data[k] || 0))
  return (
    <ol className="flex flex-col gap-2.5" aria-label="Embudo de selección">
      {STEPS.map(([k, l], i) => {
        const v = data[k] || 0
        const prev = i ? data[STEPS[i - 1][0]] || 0 : 0
        return (
          <li key={k} className="flex flex-col gap-1" title={`${l}: ${v}${i ? ` (${pct(v, prev)}% de la etapa anterior)` : ''}`}>
            <div className="flex items-baseline justify-between gap-2 text-[13px]"><span className="text-tinta-2">{l}</span>
              <span><b className="text-tinta">{v}</b>{i > 0 && prev > 0 && <span className="ml-1.5 text-tinta-suave">{pct(v, prev)}%</span>}</span></div>
            <div className="h-2.5 rounded-full bg-[#F4EEF2]"><div className="h-2.5 rounded-full bg-rosa-accion" style={{ width: `${Math.max(v ? 2 : 0, (v / max) * 100)}%` }} /></div>
          </li>
        )
      })}
    </ol>
  )
}

export default function Reports() {
  const { company } = useAuth()
  const [days, setDays] = useState(90)
  const [r, setR] = useState(null)
  const [err, setErr] = useState('')
  const [job, setJob] = useState('')
  const [times, setTimes] = useState([])
  useEffect(() => {
    setR(null)
    supabase.rpc('company_report', { p_company: company.id, p_days: days || null }).then(({ data, error }) => { if (error) setErr(errMsg(error)); setR(data) })
    supabase.rpc('stage_times', { p_company: company.id, p_days: days || 3650 }).then(({ data }) => setTimes(data || []))
  }, [company, days])

  const jobs = r?.jobs || []
  const sel = job ? jobs.filter((j) => j.id === job) : jobs
  const tot = Object.fromEntries(['views', 'applied', 'matches', 'contacted', 'interviewed', 'offered', 'hired', 'rejected', 'externals', 'offers_sent', 'offers_accepted'].map((k) => [k, sel.reduce((a, j) => a + (j[k] || 0), 0)]))
  const dth = job ? sel[0]?.days_to_hire : r?.days_to_hire

  const exportXlsx = async () => {
    const { downloadXlsx } = await import('../../lib/excel')
    const rows = jobs.map((j) => ({
      Vacante: j.title, Estado: j.status, 'Vieron el aviso': j.views, 'Me interesa': j.applied, Matches: j.matches, 'De otros portales': j.externals,
      Contactados: j.contacted, Entrevistados: j.interviewed, 'Con oferta': j.offered, 'Ofertas aceptadas': j.offers_accepted, Contratados: j.hired, Descartados: j.rejected,
      'Días promedio a contratar': j.days_to_hire ?? '',
    }))
    await downloadXlsx(`VINKA_reporte_${new Date().toISOString().slice(0, 10)}.xlsx`, [
      { name: 'Por vacante', rows },
      { name: 'Por fuente', rows: (r.sources || []).map((s) => ({ Fuente: s.source === 'VINKA' ? 'VINKA (matches)' : `${s.source} (importados)`, 'En proceso': s.total, Contratados: s.hired })) },
      { name: 'Tiempo por etapa', rows: STAGE_ORDER.map(([k, l]) => times.find((t) => t.stage === k)).filter(Boolean).map((t) => ({ Etapa: STAGE_ORDER.find(([k]) => k === t.stage)[1], 'Días promedio': Number(t.avg_days), Personas: Number(t.n) })) },
    ])
  }

  return (
    <Screen className="bg-[#FAF7F9]">
      <TopBar back="/" title="Reportes" right={r && jobs.length > 0 && <button aria-label="Descargar Excel" onClick={exportXlsx} className="flex h-11 w-11 items-center justify-center text-rosa-texto"><Svg name="download" /></button>} />
      <div className="flex flex-col gap-4 px-5 pb-10 pt-2">
        <div className="flex gap-1 rounded-xl bg-[#F4EEF2] p-[3px]">
          {PERIODOS.map(([d, l]) => <button key={d} aria-pressed={days === d} onClick={() => setDays(d)} className={`h-[38px] flex-1 rounded-[9px] text-[13px] font-semibold ${days === d ? 'bg-white text-tinta shadow-sm' : 'text-tinta-3'}`}>{l}</button>)}
        </div>
        <select className="input" aria-label="Vacante" value={job} onChange={(e) => setJob(e.target.value)}>
          <option value="">Todas las vacantes</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
        <p className="-mt-1 text-[12px] leading-snug text-tinta-3">{days ? `Solo lo ocurrido en los últimos ${days === 365 ? '12 meses' : `${days} días`}` : 'Todo el historial'}. Las etapas (contactados, entrevistas, ofertas, contratados) suman a quienes llegaron por VINKA y a los de otros portales o importados. «Me interesa» y «Matches» cuentan solo los de la app, por eso el panel inicial puede mostrar otros totales.</p>
        <ErrorBox>{err}</ErrorBox>
        {!r ? <Spinner /> : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[[tot.applied + tot.externals, tot.externals ? 'Interesados + externos' : 'Interesados'], [tot.interviewed, 'Entrevistados'], [tot.hired, 'Contratados']].map(([v, l]) => (
                <div key={l} className="card flex flex-col gap-0.5 p-3"><span className="font-display text-[24px] font-bold">{v}</span><span className="text-xs text-tinta-3">{l}</span></div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="card flex flex-col gap-0.5 p-3"><span className="font-display text-[22px] font-bold">{dth != null ? `${dth} días` : '—'}</span><span className="text-xs text-tinta-3">Tiempo promedio a contratar</span></div>
              <div className="card flex flex-col gap-0.5 p-3"><span className="font-display text-[22px] font-bold">{!job && r.days_to_first_step != null ? `${r.days_to_first_step} días` : tot.offers_sent ? `${pct(tot.offers_accepted, tot.offers_sent)}%` : '—'}</span><span className="text-xs text-tinta-3">{!job && r.days_to_first_step != null ? 'Del match al primer paso' : 'Ofertas aceptadas'}</span></div>
            </div>
            <div className="card flex flex-col gap-3 p-4">
              <span className="text-[15px] font-semibold">Embudo</span>
              <Funnel data={tot} />
              {tot.externals > 0 && <span className="hint">Incluye {tot.externals} postulante(s) importado(s) de otros portales desde "Contactados" en adelante.</span>}
              {tot.views === 0 && <span className="hint">Las vistas se cuentan desde hoy: es un dato nuevo.</span>}
            </div>
            <details className="card p-4 text-[13px] leading-relaxed text-tinta-2">
              <summary className="cursor-pointer text-[15px] font-semibold text-tinta">Qué incluye cada cifra</summary>
              <dl className="mt-2 flex flex-col gap-2">
                {GLOSARIO.map(([t, d]) => <div key={t}><dt className="font-semibold text-tinta">{t}</dt><dd>{d}</dd></div>)}
              </dl>
            </details>
            {!job && times.length > 0 && (() => {
              const max = Math.max(1, ...times.map((t) => Number(t.avg_days)))
              const slow = times.reduce((a, t) => (Number(t.avg_days) > Number(a.avg_days) ? t : a), times[0])
              return (
                <div className="card flex flex-col gap-3 p-4">
                  <span className="text-[15px] font-semibold">Tiempo promedio en cada etapa</span>
                  <ol className="flex flex-col gap-2.5" aria-label="Días promedio por etapa">
                    {STAGE_ORDER.map(([k, l]) => { const t = times.find((x) => x.stage === k); if (!t) return null; const v = Number(t.avg_days); return (
                      <li key={k} className="flex flex-col gap-1" title={`${l}: ${v} días en promedio (${t.n} personas)`}>
                        <div className="flex items-baseline justify-between gap-2 text-[13px]"><span className="text-tinta-2">{l}</span><span><b className="text-tinta">{v} días</b><span className="ml-1.5 text-tinta-suave">{t.n} personas</span></span></div>
                        <div className="h-2.5 rounded-full bg-[#F4EEF2]"><div className={`h-2.5 rounded-full ${t === slow ? 'bg-naranja' : 'bg-morado'}`} style={{ width: `${Math.max(2, (v / max) * 100)}%` }} /></div>
                      </li>) })}
                  </ol>
                  <span className="hint">Desde que la persona entra a la etapa hasta que pasa a la siguiente. En naranja, la etapa más lenta: ahí conviene revisar.</span>
                </div>
              )
            })()}
            {!job && (r.sources || []).length > 0 && (
              <div className="card flex flex-col gap-2 p-4">
                <span className="text-[15px] font-semibold">Por fuente</span>
                <table className="w-full text-sm"><thead><tr className="text-left text-xs text-tinta-suave"><th className="pb-1 font-medium">Fuente</th><th className="pb-1 text-right font-medium">En proceso</th><th className="pb-1 text-right font-medium">Contratados</th></tr></thead>
                  <tbody>{r.sources.map((s) => <tr key={s.source} className="border-t border-[#F1E7ED]"><td className="py-2">{s.source === 'VINKA' ? 'VINKA (matches)' : `${s.source} (importados)`}</td><td className="py-2 text-right font-semibold">{s.total}</td><td className="py-2 text-right font-semibold">{s.hired}</td></tr>)}</tbody></table>
                <span className="hint">«En proceso» cuenta a las personas que entraron a tu proceso de selección: en VINKA, los matches; de otros portales, los importados. No incluye a quienes solo dijeron «Me interesa» sin match.</span>
              </div>
            )}
            {!job && jobs.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-[15px] font-semibold">Por vacante</span>
                {jobs.map((j) => (
                  <button key={j.id} onClick={() => setJob(j.id)} className="card flex flex-col gap-1.5 p-3.5 text-left">
                    <span className="flex justify-between gap-2"><span className="truncate text-sm font-semibold">{j.title}</span><span className="text-xs text-tinta-suave">{j.hired} contratado(s)</span></span>
                    <span className="text-xs text-tinta-3">{j.applied} interesados · {j.matches} matches · {j.interviewed} entrevistas · {j.offered} ofertas{j.externals ? ` · ${j.externals} externos` : ''}</span>
                  </button>
                ))}
              </div>
            )}
            {jobs.length > 0 && <button className="btn-sec" onClick={exportXlsx}><Svg name="download" size={20} />Descargar en Excel</button>}
          </>
        )}
      </div>
    </Screen>
  )
}
