import { useMemo, useRef, useState } from 'react'
import { autoMap, downloadTemplate, parseFile } from '../lib/importer'
import { ErrorBox, Svg } from './ui'

/**
 * Importador genérico en 3 pasos: subir planilla → revisar columnas → confirmar.
 * fields: definición de campos · build(row, map): objeto final o { error } · onConfirm(items) → { ok, skipped }
 */
export function Importer({ fields, build, onConfirm, template, templateName, preview, consent, confirmLabel }) {
  const [step, setStep] = useState(1)
  const [data, setData] = useState(null)
  const [map, setMap] = useState({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [agree, setAgree] = useState(!consent)
  const [result, setResult] = useState(null)
  const fileRef = useRef()

  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setErr('')
    try {
      const d = await parseFile(f)
      setData({ ...d, name: f.name }); setMap(autoMap(d.headers, fields)); setStep(2)
    } catch (ex) { setErr(ex.message || 'No pudimos leer el archivo. Usa formato .xlsx o .csv.') }
  }

  const built = useMemo(() => (data ? data.rows.map((r) => build(r, map)) : []), [data, map, build])
  const valid = built.filter((x) => !x.error)
  const invalid = built.length - valid.length
  const missing = fields.filter((f) => f.required && !map[f.key])

  const confirm = async () => {
    setErr(''); setBusy(true)
    try { const r = await onConfirm(valid); setResult(r); setStep(3) } catch (ex) { setErr(ex.message || 'No se pudo importar.') } finally { setBusy(false) }
  }

  if (step === 3 && result) return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF6EF] text-[#1E6B3F]">
        <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </span>
      <h2 className="text-xl font-bold">Importación lista</h2>
      <p className="text-[15px] text-tinta-2"><b>{result.ok}</b> {result.ok === 1 ? 'registro importado' : 'registros importados'}{result.skipped ? ` · ${result.skipped} omitidos (repetidos o incompletos)` : ''}.</p>
      {result.after}
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5 text-[11px] font-semibold">
        {['Subir planilla', 'Revisar columnas', 'Listo'].map((t, i) => (
          <span key={t} className={`flex-1 rounded-lg px-2 py-1.5 text-center ${i + 1 === step ? 'bg-rosa-accion text-white' : i + 1 < step ? 'bg-rosa-palido text-rosa-oscuro' : 'bg-[#F4EEF2] text-tinta-3'}`}>{i + 1}. {t}</span>
        ))}
      </div>

      {step === 1 && (
        <>
          <p className="text-sm leading-relaxed text-tinta-3">Descarga la planilla desde tu otro portal (Laborum, Trabajando, Computrabajo, Buk u otro) en formato <b>Excel (.xlsx)</b> o <b>CSV</b> y súbela aquí. VINKA reconoce las columnas automáticamente.</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" className="hidden" onChange={onFile} />
          <button className="btn" onClick={() => fileRef.current?.click()}><Svg name="plus" size={20} stroke="#fff" />Elegir archivo</button>
          <button className="btn-sm self-start border border-linea bg-white" onClick={() => downloadTemplate(templateName, template)}>Descargar planilla de ejemplo</button>
          <ErrorBox>{err}</ErrorBox>
        </>
      )}

      {step === 2 && data && (
        <>
          <div className="rounded-xl bg-rosa-fondo px-3.5 py-3 text-sm"><b>{data.name}</b> · {data.rows.length} filas · {data.headers.length} columnas</div>
          <div className="flex flex-col gap-2">
            <span className="label">¿Qué columna corresponde a cada dato?</span>
            {fields.map((f) => (
              <label key={f.key} className="grid grid-cols-[1fr_1.2fr] items-center gap-2 text-sm">
                <span className={f.required ? 'font-semibold' : ''}>{f.label}{f.required ? ' *' : ''}</span>
                <select className="input h-11 text-sm" value={map[f.key] || ''} onChange={(e) => setMap({ ...map, [f.key]: e.target.value })}>
                  <option value="">— No incluir —</option>
                  {data.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          {missing.length > 0 ? <ErrorBox>Falta elegir la columna de: {missing.map((f) => f.label).join(', ')}.</ErrorBox> : (
            <div className="flex flex-col gap-2">
              <span className="label">Vista previa ({valid.length} listas{invalid ? `, ${invalid} con problemas` : ''})</span>
              {built.slice(0, 4).map((x, i) => (
                <div key={i} className={`rounded-xl border p-3 text-sm ${x.error ? 'border-[#F4C7C3] bg-[#FEF3F2] text-[#912018]' : 'border-[#EEE3EA] bg-white'}`}>
                  {x.error ? `Fila ${i + 2}: ${x.error}` : preview(x)}
                </div>
              ))}
              {built.length > 4 && <span className="hint">…y {built.length - 4} más.</span>}
            </div>
          )}
          {consent && (
            <label className="flex items-start gap-2.5 rounded-xl border border-rosa-borde bg-rosa-fondo p-3 text-[13px] leading-snug">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D02E72]" />
              {consent}
            </label>
          )}
          <ErrorBox>{err}</ErrorBox>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-sec" onClick={() => setStep(1)}>Cambiar archivo</button>
            <button className="btn" disabled={busy || missing.length > 0 || !valid.length || !agree} onClick={confirm}>{busy ? 'Importando…' : `${confirmLabel} (${valid.length})`}</button>
          </div>
        </>
      )}
    </div>
  )
}
