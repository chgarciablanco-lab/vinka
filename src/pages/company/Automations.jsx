import { useEffect, useState } from 'react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { PLANTILLAS_BASE } from '../../lib/catalog'
import { ErrorBox, Screen, Spinner, Toast, TopBar } from '../../components/ui'

const STAGES = [
  ['contacto', 'Al pasar a Contacto', 'contacto'],
  ['entrevista', 'Al pasar a Entrevista', 'entrevista'],
  ['oferta', 'Al pasar a Oferta', 'oferta'],
  ['contratado', 'Al marcar como Contratado/a', 'general'],
  ['descartado', 'Al descartar', 'rechazo'],
]

function Switch({ on, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${on ? 'bg-rosa-accion' : 'bg-[#D9CFD6]'}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

/** Mensajes automáticos por etapa, aviso de procesos detenidos y aprobaciones */
export default function Automations() {
  const { company, refresh } = useAuth()
  const isAdmin = ['owner', 'admin'].includes(company?.member_role)
  const [rules, setRules] = useState(null)
  const [tpls, setTpls] = useState([])
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')
  const [draft, setDraft] = useState({})

  const load = async () => {
    const { data, error } = await supabase.from('stage_rules').select('*').eq('company_id', company.id)
    if (error) return setErr(errMsg(error))
    const m = Object.fromEntries((data || []).map((r) => [r.stage, r]))
    setRules(m); setDraft(Object.fromEntries(STAGES.map(([k]) => [k, m[k]?.body || ''])))
  }
  useEffect(() => {
    load()
    supabase.from('message_templates').select('id, name, body, kind').eq('company_id', company.id).order('name').then(({ data }) => setTpls(data || []))
  }, [company.id]) // eslint-disable-line

  const saveRule = async (stage, patch) => {
    setErr('')
    const body = (patch.body ?? draft[stage] ?? '').trim()
    if (!body) return setErr('Escribe el mensaje antes de activarlo.')
    const row = { company_id: company.id, stage, body, enabled: patch.enabled ?? rules[stage]?.enabled ?? true, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('stage_rules').upsert(row, { onConflict: 'company_id,stage' })
    if (error) return setErr(errMsg(error))
    setToast('Guardado'); load()
  }
  const saveCompany = async (patch) => {
    const { error } = await supabase.from('companies').update(patch).eq('id', company.id)
    if (error) return setErr(errMsg(error))
    setToast('Guardado'); refresh?.()
  }

  if (!rules) return <Screen><TopBar back title="Automatizaciones" /><Spinner /></Screen>
  return (
    <Screen className="bg-[#FAF7F9]">
      <TopBar back title="Automatizaciones" />
      <div className="flex flex-col gap-5 px-5 pb-10">
        {!isAdmin && <div className="rounded-xl bg-[#F4EEF2] p-3 text-sm text-tinta-2">Solo un administrador de la empresa puede cambiar estas opciones.</div>}
        <ErrorBox>{err}</ErrorBox>

        <section className="flex flex-col gap-3">
          <h2 className="text-[17px] font-semibold">Mensajes automáticos por etapa</h2>
          <p className="text-sm leading-relaxed text-tinta-3">Cuando alguien del equipo mueve a una persona de etapa, VINKA le envía este mensaje en el chat a nombre de quien la movió. Puedes usar {'{nombre}'}, {'{cargo}'} y {'{empresa}'}. Solo aplica a personas con match (con chat abierto).</p>
          {STAGES.map(([k, label, kind]) => {
            const r = rules[k]
            const opts = [...tpls.filter((t) => t.kind === kind || t.kind === 'general'), ...PLANTILLAS_BASE.filter((t) => t.kind === kind)]
            return (
              <div key={k} className="card flex flex-col gap-2.5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[15px] font-semibold">{label}</span>
                  <Switch label={`Activar mensaje: ${label}`} on={!!r?.enabled} disabled={!isAdmin} onChange={(v) => saveRule(k, { enabled: v })} />
                </div>
                {opts.length > 0 && isAdmin && (
                  <select className="input h-10 text-sm" value="" onChange={(e) => { const t = opts.find((x) => x.id === e.target.value); if (t) setDraft({ ...draft, [k]: t.body }) }} aria-label="Usar una plantilla">
                    <option value="">Usar una plantilla…</option>{opts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
                <textarea className="textarea h-24 text-[15px]" maxLength={2000} disabled={!isAdmin} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} placeholder="Escribe el mensaje…" />
                {isAdmin && draft[k] !== (r?.body || '') && <button className="btn-sm self-end bg-rosa-accion text-white" onClick={() => saveRule(k, {})}>{r ? 'Guardar cambios' : 'Guardar y activar'}</button>}
              </div>
            )
          })}
        </section>

        <section className="card flex flex-col gap-2 p-4">
          <h2 className="text-[17px] font-semibold">Aviso de procesos detenidos</h2>
          <p className="text-sm leading-relaxed text-tinta-3">Cada día hábil a las 9:00 avisamos al equipo cuántas personas llevan demasiado tiempo sin respuesta o sin avanzar.</p>
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">Avisar después de
            <select className="input h-10 w-40 text-sm" disabled={!isAdmin} value={company.stale_days ?? 5} onChange={(e) => saveCompany({ stale_days: Number(e.target.value) })}>
              <option value={0}>No avisar</option>{[3, 5, 7, 10, 14].map((n) => <option key={n} value={n}>{n} días</option>)}
            </select>
          </label>
        </section>

        <section className="card flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold">Aprobación de administradores</h2>
            <Switch label="Pedir aprobación" on={!!company.require_approval} disabled={!isAdmin} onChange={(v) => saveCompany({ require_approval: v })} />
          </div>
          <p className="text-sm leading-relaxed text-tinta-3">Si lo activas, las vacantes y cartas oferta que preparen los reclutadores quedan "Por aprobar" hasta que un administrador las revise. Los administradores publican y envían directo.</p>
        </section>
      </div>
      <Toast msg={toast} onDone={() => setToast('')} />
    </Screen>
  )
}
