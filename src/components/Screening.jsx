import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ErrorBox, Sheet } from './ui'

/** Trae las preguntas de filtro de una vacante (vacía si no tiene) */
export async function jobQuestions(jobId) {
  const { data } = await supabase.from('jobs').select('questions').eq('id', jobId).maybeSingle()
  return data?.questions || []
}

/** Preguntas de filtro que responde la persona al decir "Me interesa" */
export function ScreeningSheet({ open, title, questions = [], onSubmit, onClose }) {
  const [a, setA] = useState({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setA({}); setErr('') } }, [open])
  const send = async () => {
    const missing = questions.filter((q) => !String(a[q.id] ?? '').trim())
    if (missing.length) return setErr('Responde todas las preguntas para enviar tu interés.')
    setBusy(true); await onSubmit(Object.fromEntries(questions.map((q) => [q.id, String(a[q.id]).trim().slice(0, 300)]))); setBusy(false)
  }
  return (
    <Sheet open={open} onClose={onClose} title="Antes de enviar tu interés">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-tinta-3">La empresa pide responder {questions.length === 1 ? 'una pregunta' : `${questions.length} preguntas`} para <b className="text-tinta">{title}</b>. Responde con la verdad: así llegas a los procesos que te calzan.</p>
        {questions.map((q, i) => (
          <fieldset key={q.id} className="flex flex-col gap-2">
            <legend className="label mb-2">{i + 1}. {q.text}</legend>
            {q.type === 'yesno' ? (
              <div className="grid grid-cols-2 gap-2">
                {[['si', 'Sí'], ['no', 'No']].map(([k, l]) => <button key={k} type="button" aria-pressed={a[q.id] === k} onClick={() => setA({ ...a, [q.id]: k })} className={`chip h-12 justify-center ${a[q.id] === k ? 'chip-on' : ''}`}>{l}</button>)}
              </div>
            ) : (
              <textarea className="textarea h-20" maxLength={300} value={a[q.id] || ''} onChange={(e) => setA({ ...a, [q.id]: e.target.value })} aria-label={q.text} />
            )}
          </fieldset>
        ))}
        <ErrorBox>{err}</ErrorBox>
        <button className="btn" disabled={busy} onClick={send}>{busy ? 'Enviando…' : 'Enviar mi interés'}</button>
      </div>
    </Sheet>
  )
}
