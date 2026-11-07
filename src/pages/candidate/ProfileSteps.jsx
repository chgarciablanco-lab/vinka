import { useEffect, useRef, useState } from 'react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { AREAS, DISPONIBILIDAD, ESTADO_ESTUDIOS, JORNADAS, MODALIDADES, NIVEL_ESTUDIOS, PREGUNTAS, REGIONES, TRASLADO, clp, parseCLP } from '../../lib/catalog'
import { Chips, ErrorBox, Field, Screen, Sheet, Svg, TagInput, TopBar } from '../../components/ui'
import { AiAssist } from '../../components/AiAssist'

async function saveCandidate(uid, patch) {
  const { error } = await supabase.from('candidate_profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('user_id', uid)
  if (error) throw error
}

function Footer({ children }) {
  return <div className="safe-b sticky bottom-0 mt-auto border-t border-[#F1E7ED] bg-white px-6 pt-3">{children}</div>
}

/* ---------- Paso 2: perfil laboral ---------- */
export function StepWork({ onDone, edit }) {
  const { user, candidate, refresh } = useAuth()
  const [f, setF] = useState(() => ({
    headline: candidate?.headline || '', has_experience: candidate?.has_experience ?? true,
    experiences: candidate?.experiences || [], education: candidate?.education || [], skills: candidate?.skills || [],
    region: candidate?.region || '', comuna: candidate?.comuna || '',
    salary: candidate?.salary_expectation ? clp(candidate.salary_expectation) : '',
  }))
  const [sheet, setSheet] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr('')
    if (!f.headline.trim()) return setErr('Cuéntanos qué cargo buscas.')
    if (!f.region || !f.comuna.trim()) return setErr('Indica tu región y comuna.')
    setBusy(true)
    try {
      await saveCandidate(user.id, {
        headline: f.headline.trim(), has_experience: f.has_experience, experiences: f.has_experience ? f.experiences : [],
        education: f.education, skills: f.skills, region: f.region, comuna: f.comuna.trim(), salary_expectation: parseCLP(f.salary),
      })
      await refresh(); onDone()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <Screen>
      <TopBar back={edit ? '/perfil' : undefined} title={edit ? 'Perfil laboral' : ''} step={edit ? null : { label: 'Paso 2 de 4', pct: 50 }} />
      <div className="flex flex-col gap-[18px] px-6 pb-6 pt-2">
        {!edit && <><h1 className="text-2xl font-bold">Tu perfil laboral</h1><p className="-mt-3 text-sm text-tinta-3">No necesitas CV. Puedes editarlo cuando quieras.</p></>}
        <Field label="¿Qué cargo buscas?" hint="Ej.: Analista de marketing, Bodeguero/a, Vendedor/a">
          <input className="input" value={f.headline} maxLength={80} onChange={(e) => setF({ ...f, headline: e.target.value })} />
        </Field>
        <fieldset className="flex flex-col gap-2"><legend className="label mb-2">Experiencia laboral</legend>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" aria-pressed={f.has_experience} onClick={() => setF({ ...f, has_experience: true })} className={`chip h-11 justify-center ${f.has_experience ? 'chip-on' : ''}`}>Tengo experiencia</button>
            <button type="button" aria-pressed={!f.has_experience} onClick={() => setF({ ...f, has_experience: false })} className={`chip h-11 justify-center ${!f.has_experience ? 'chip-on' : ''}`}>Busco mi primer empleo</button>
          </div>
        </fieldset>
        {f.has_experience && (
          <div className="flex flex-col gap-2.5">
            {f.experiences.map((x, i) => (
              <div key={i} className="card flex items-start justify-between p-3.5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">{x.role}</span>
                  <span className="text-[13px] text-tinta-3">{x.company}</span>
                  <span className="text-xs text-tinta-suave">{x.from} – {x.current ? 'actual' : x.to}</span>
                </div>
                <button aria-label={`Editar ${x.role}`} onClick={() => setSheet({ kind: 'exp', i, data: x })} className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center text-tinta-suave"><Svg name="edit" size={18} /></button>
              </div>
            ))}
            <button type="button" onClick={() => setSheet({ kind: 'exp', i: -1, data: { role: '', company: '', from: '', to: '', current: false } })}
              className="h-11 rounded-xl border border-dashed border-rosa-accion bg-white text-sm font-semibold text-rosa-texto">+ Agregar experiencia</button>
          </div>
        )}
        <div className="flex flex-col gap-2.5">
          <span className="label">Estudios</span>
          {f.education.map((x, i) => (
            <div key={i} className="card flex items-start justify-between p-3.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold">{x.title || x.level}</span>
                <span className="text-[13px] text-tinta-3">{[x.institution, x.level, x.status].filter(Boolean).join(' · ')}</span>
              </div>
              <button aria-label="Editar estudio" onClick={() => setSheet({ kind: 'edu', i, data: x })} className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center text-tinta-suave"><Svg name="edit" size={18} /></button>
            </div>
          ))}
          <button type="button" onClick={() => setSheet({ kind: 'edu', i: -1, data: { level: '', title: '', institution: '', status: '' } })}
            className="h-11 rounded-xl border border-dashed border-rosa-accion bg-white text-sm font-semibold text-rosa-texto">+ Agregar estudio</button>
        </div>
        <div className="flex flex-col gap-1.5"><span className="label">Habilidades</span><TagInput value={f.skills} onChange={(v) => setF({ ...f, skills: v })} placeholder="Ej.: Excel, atención al cliente" />
          <AiAssist list task="candidate_skills" title="Habilidades sugeridas" label="Sugerir habilidades con IA"
            getContext={() => ({ headline: f.headline, experiences: f.experiences, education: f.education, skills: f.skills })}
            onAddItems={(items) => setF({ ...f, skills: [...new Set([...f.skills, ...items.map(String)])].slice(0, 20) })} /></div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Región"><select className="input" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}><option value="">Selecciona</option>{REGIONES.map((r) => <option key={r}>{r}</option>)}</select></Field>
          <Field label="Comuna"><input className="input" value={f.comuna} onChange={(e) => setF({ ...f, comuna: e.target.value })} /></Field>
        </div>
        <Field label="Renta líquida esperada (CLP)" hint="Se usa para sugerirte vacantes compatibles. Las empresas no ven el monto exacto.">
          <input className="input" inputMode="numeric" placeholder="$ 800.000" value={f.salary} onChange={(e) => setF({ ...f, salary: clp(parseCLP(e.target.value)) })} />
        </Field>
        <ErrorBox>{err}</ErrorBox>
      </div>
      <Footer><button className="btn" onClick={submit} disabled={busy}>{busy ? 'Guardando…' : edit ? 'Guardar' : 'Continuar'}</button></Footer>

      <Sheet open={sheet?.kind === 'exp'} onClose={() => setSheet(null)} title="Experiencia">
        {sheet?.kind === 'exp' && <ExpForm data={sheet.data} onDelete={sheet.i >= 0 ? () => { setF({ ...f, experiences: f.experiences.filter((_, j) => j !== sheet.i) }); setSheet(null) } : null}
          onSave={(d) => { const arr = [...f.experiences]; if (sheet.i >= 0) arr[sheet.i] = d; else arr.push(d); setF({ ...f, experiences: arr }); setSheet(null) }} />}
      </Sheet>
      <Sheet open={sheet?.kind === 'edu'} onClose={() => setSheet(null)} title="Estudios">
        {sheet?.kind === 'edu' && <EduForm data={sheet.data} onDelete={sheet.i >= 0 ? () => { setF({ ...f, education: f.education.filter((_, j) => j !== sheet.i) }); setSheet(null) } : null}
          onSave={(d) => { const arr = [...f.education]; if (sheet.i >= 0) arr[sheet.i] = d; else arr.push(d); setF({ ...f, education: arr }); setSheet(null) }} />}
      </Sheet>
    </Screen>
  )
}

function ExpForm({ data, onSave, onDelete }) {
  const [d, setD] = useState(data)
  const ok = d.role.trim() && d.company.trim() && d.from
  return (
    <div className="flex flex-col gap-3.5">
      <Field label="Cargo"><input className="input" value={d.role} onChange={(e) => setD({ ...d, role: e.target.value })} /></Field>
      <Field label="Empresa"><input className="input" value={d.company} onChange={(e) => setD({ ...d, company: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Desde"><input className="input" type="month" value={d.from} onChange={(e) => setD({ ...d, from: e.target.value })} /></Field>
        <Field label="Hasta"><input className="input" type="month" disabled={d.current} value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} /></Field>
      </div>
      <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" className="h-5 w-5 accent-[#D02E72]" checked={d.current} onChange={(e) => setD({ ...d, current: e.target.checked, to: '' })} />Trabajo aquí actualmente</label>
      <button className="btn" disabled={!ok} onClick={() => onSave({ ...d, role: d.role.trim(), company: d.company.trim() })}>Guardar experiencia</button>
      {onDelete && <button className="btn-sec text-[#B42318]" onClick={onDelete}>Eliminar</button>}
    </div>
  )
}

function EduForm({ data, onSave, onDelete }) {
  const [d, setD] = useState(data)
  return (
    <div className="flex flex-col gap-3.5">
      <Field label="Nivel"><select className="input" value={d.level} onChange={(e) => setD({ ...d, level: e.target.value })}><option value="">Selecciona</option>{NIVEL_ESTUDIOS.map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Carrera o programa (opcional)"><input className="input" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></Field>
      <Field label="Institución (opcional)"><input className="input" value={d.institution} onChange={(e) => setD({ ...d, institution: e.target.value })} /></Field>
      <Chips legend="Estado" multi={false} options={ESTADO_ESTUDIOS} value={d.status} onChange={(v) => setD({ ...d, status: v })} />
      <button className="btn" disabled={!d.level} onClick={() => onSave(d)}>Guardar estudio</button>
      {onDelete && <button className="btn-sec text-[#B42318]" onClick={onDelete}>Eliminar</button>}
    </div>
  )
}

/* ---------- Paso 3: preferencias ---------- */
export function StepPrefs({ onDone, edit }) {
  const { user, candidate, refresh } = useAuth()
  const [f, setF] = useState(() => ({
    schedules: candidate?.schedules || [], modalities: candidate?.modalities || [], availability: candidate?.availability || '',
    areas: candidate?.areas || [], locations: candidate?.locations || [], relocate: candidate?.relocate || '',
  }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setErr('')
    if (!f.schedules.length || !f.modalities.length || !f.areas.length) return setErr('Elige al menos una jornada, una modalidad y un área.')
    setBusy(true)
    try { await saveCandidate(user.id, f); await refresh(); onDone() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <Screen>
      <TopBar back={edit ? '/perfil' : undefined} title={edit ? 'Preferencias' : ''} step={edit ? null : { label: 'Paso 3 de 4', pct: 75 }} />
      <div className="flex flex-col gap-5 px-6 pb-6 pt-2">
        {!edit && <><h1 className="text-2xl font-bold">¿Qué trabajo buscas?</h1><p className="-mt-4 text-sm text-tinta-3">Marca todas las opciones que te sirvan.</p></>}
        <Chips legend="Jornada" options={JORNADAS} value={f.schedules} onChange={(v) => setF({ ...f, schedules: v })} />
        <Chips legend="Modalidad" options={MODALIDADES} value={f.modalities} onChange={(v) => setF({ ...f, modalities: v })} />
        <Chips legend="Disponibilidad" multi={false} options={DISPONIBILIDAD} value={f.availability} onChange={(v) => setF({ ...f, availability: v })} />
        <Chips legend="Áreas de interés" options={AREAS} value={f.areas} onChange={(v) => setF({ ...f, areas: v })} />
        <div className="flex flex-col gap-1.5"><span className="label">Otras comunas donde trabajarías</span><TagInput value={f.locations} onChange={(v) => setF({ ...f, locations: v })} placeholder="Ej.: Curicó" /></div>
        <Chips legend="¿Te cambiarías de ciudad?" multi={false} options={TRASLADO} value={f.relocate} onChange={(v) => setF({ ...f, relocate: v })} />
        <ErrorBox>{err}</ErrorBox>
      </div>
      <Footer><button className="btn" onClick={submit} disabled={busy}>{busy ? 'Guardando…' : edit ? 'Guardar' : 'Continuar'}</button></Footer>
    </Screen>
  )
}

/* ---------- Paso 4: presentación (video o texto) ---------- */
export function StepIntro({ onDone, edit }) {
  const { user, candidate, refresh } = useAuth()
  const [mode, setMode] = useState(candidate?.video_path ? 'video' : 'text')
  const [bio, setBio] = useState(candidate?.bio || '')
  const [vis, setVis] = useState(candidate?.intro_visibility || 'all')
  const [q, setQ] = useState(0)
  const [videoUrl, setVideoUrl] = useState('')
  const [videoPath, setVideoPath] = useState(candidate?.video_path || null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef()

  useEffect(() => {
    let alive = true
    if (videoPath) supabase.storage.from('videos').createSignedUrl(videoPath, 3600).then(({ data }) => alive && setVideoUrl(data?.signedUrl || ''))
    else setVideoUrl('')
    return () => { alive = false }
  }, [videoPath])

  const duration = (file) => new Promise((res) => {
    const v = document.createElement('video'); v.preload = 'metadata'
    v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); res(v.duration) }
    v.onerror = () => res(NaN)
    v.src = URL.createObjectURL(file)
  })

  const onFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setErr('')
    if (!/^video\/(mp4|quicktime|webm)$/.test(file.type)) return setErr('Formato no compatible. Usa MP4, MOV o WEBM.')
    if (file.size > 25 * 1024 * 1024) return setErr('El video pesa más de 25 MB. Graba uno más corto o en menor calidad.')
    const d = await duration(file)
    if (!(d > 0) || d > 15.9) return setErr(`El video dura ${Number.isFinite(d) ? Math.round(d) : '?'} s. El máximo es 15 segundos.`)
    setBusy(true)
    const ext = file.type === 'video/quicktime' ? 'mov' : file.type === 'video/webm' ? 'webm' : 'mp4'
    const path = `${user.id}/intro-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('videos').upload(path, file, { contentType: file.type })
    if (error) { setBusy(false); return setErr(errMsg(error)) }
    if (videoPath) await supabase.storage.from('videos').remove([videoPath])
    await saveCandidate(user.id, { video_path: path }).catch((e2) => setErr(errMsg(e2)))
    setVideoPath(path); setBusy(false); refresh()
  }

  const removeVideo = async () => {
    if (!videoPath) return
    setBusy(true)
    await supabase.storage.from('videos').remove([videoPath])
    await saveCandidate(user.id, { video_path: null }).catch(() => {})
    setVideoPath(null); setBusy(false); refresh()
  }

  const submit = async (skip) => {
    setErr(''); setBusy(true)
    try {
      await saveCandidate(user.id, { bio: skip ? bio : bio.trim().slice(0, 400), intro_visibility: vis, onboarding_done: true })
      await refresh(); onDone()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const tab = (m, label) => (
    <button role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
      className={`h-11 flex-1 rounded-[11px] text-sm font-semibold ${mode === m ? 'bg-white text-tinta shadow-[0_1px_4px_rgba(23,19,26,0.12)]' : 'text-tinta-3'}`}>{label}</button>
  )

  return (
    <Screen>
      <TopBar back={edit ? '/perfil' : undefined} title={edit ? 'Presentación' : ''} step={edit ? null : { label: 'Paso 4 de 4 · Opcional', pct: 100 }} />
      <div className="flex flex-col gap-3.5 px-6 pb-6 pt-2">
        <h1 className="text-2xl font-bold">Preséntate a tu manera</h1>
        <p className="-mt-2 text-sm leading-snug text-tinta-3">Video o texto valen lo mismo: ninguno te da más ni menos visibilidad.</p>
        <div role="tablist" className="flex gap-1 rounded-2xl bg-[#F4EEF2] p-1">{tab('video', 'VINKA VIDEO · 15 s')}{tab('text', 'Escribir')}</div>
        <div className="flex items-center justify-between gap-2 rounded-xl border border-rosa-borde bg-rosa-fondo px-3 py-2.5">
          <span className="text-sm font-medium">«{PREGUNTAS[q]}»</span>
          <button onClick={() => setQ((q + 1) % PREGUNTAS.length)} className="h-9 whitespace-nowrap text-[13px] font-semibold text-rosa-texto">Otra pregunta</button>
        </div>
        {mode === 'video' ? (
          <div className="flex flex-col gap-3">
            {videoUrl ? (
              <video src={videoUrl} controls playsInline className="aspect-[9/12] w-full rounded-2xl bg-morado object-cover" />
            ) : (
              <div className="flex aspect-[9/10] w-full flex-col items-center justify-center gap-3 rounded-2xl bg-[#2B2230] px-6 text-center text-white">
                <Svg name="video" size={36} stroke="#fff" />
                <span className="text-sm leading-relaxed">Graba hasta 15 segundos con la cámara de tu teléfono. Podrás revisarlo, repetirlo o borrarlo.</span>
              </div>
            )}
            <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/webm" capture="user" className="hidden" onChange={onFile} />
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-sm bg-morado text-white" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Subiendo…' : videoPath ? 'Repetir' : 'Grabar o subir'}</button>
              <button className="btn-sm border border-linea bg-white" disabled={!videoPath || busy} onClick={removeVideo}>Borrar video</button>
            </div>
          </div>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className="label">Tu presentación</span>
            <textarea className="textarea h-56 resize-none" maxLength={400} value={bio} onChange={(e) => setBio(e.target.value)}
              placeholder="Ej.: Tengo 3 años en atención de clientes. Mi fortaleza es…" />
            <span className="text-right text-xs text-tinta-suave">{bio.length} / 400</span>
          </label>
        )}
        {mode === 'text' && (
          <AiAssist task="candidate_bio" title="Tu presentación" current={bio}
            getContext={() => ({ question: PREGUNTAS[q], headline: candidate?.headline, experiences: candidate?.experiences, education: candidate?.education, skills: candidate?.skills })}
            onApply={(t) => setBio(t.slice(0, 400))} />
        )}
        <fieldset className="mt-1 flex flex-col gap-2.5">
          <legend className="label mb-2">¿Quién puede verla?</legend>
          <label className="flex items-center gap-2.5 text-sm"><input type="radio" name="vis" className="h-5 w-5 accent-[#D02E72]" checked={vis === 'all'} onChange={() => setVis('all')} />Empresas verificadas que vean mi perfil</label>
          <label className="flex items-center gap-2.5 text-sm"><input type="radio" name="vis" className="h-5 w-5 accent-[#D02E72]" checked={vis === 'matches'} onChange={() => setVis('matches')} />Solo empresas con las que tenga match</label>
        </fieldset>
        <ErrorBox>{err}</ErrorBox>
      </div>
      <Footer>
        <button className="btn" onClick={() => submit(false)} disabled={busy}>{edit ? 'Guardar' : 'Guardar y empezar a explorar'}</button>
        {!edit && <button className="h-11 w-full text-[15px] font-semibold text-rosa-texto" onClick={() => submit(true)} disabled={busy}>Omitir por ahora</button>}
      </Footer>
    </Screen>
  )
}

export function Onboarding() {
  const { candidate } = useAuth()
  const [step, setStep] = useState(() => (!candidate?.headline ? 2 : !candidate?.schedules?.length ? 3 : 4))
  if (step === 2) return <StepWork onDone={() => setStep(3)} />
  if (step === 3) return <StepPrefs onDone={() => setStep(4)} />
  return <StepIntro onDone={() => {}} />
}
