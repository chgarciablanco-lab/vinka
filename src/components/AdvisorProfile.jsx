import { useCallback, useEffect, useState } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { colorFor, initials } from '../lib/catalog'
import { Avatar, ErrorBox, Sheet, Svg, TagInput } from './ui'

// Perfil público del asesor (aprobado por VINKA) y la elección del postulante: «VINKA elige» o «Elegir asesor».

export const photoUrl = (path) => (path ? supabase.storage.from('advisor-photos').getPublicUrl(path).data.publicUrl : null)

export function AdvisorPhoto({ a, size = 56 }) {
  const url = photoUrl(a?.photo)
  if (url) return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  return <Avatar text={initials(a?.display_name || '')} color={colorFor(a?.display_name || '')} size={size} round />
}

const years = (n) => (n == null ? null : n === 1 ? '1 año de experiencia' : `${n} años de experiencia`)
// Valoraciones verificadas: solo de asesorías finalizadas y aprobadas por VINKA. Nunca notas inventadas.
const dec = (n) => Number(n).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export const CRITERIA = [['punctuality', 'Puntualidad'], ['quality', 'Calidad del servicio'], ['communication', 'Comunicación'], ['deliverables', 'Cumplimiento de entregables']]
export function Stars({ n, size = 14 }) {
  const v = Math.round(Number(n) || 0)
  return <span aria-label={`${n} de 5 estrellas`} className="whitespace-nowrap tracking-tight text-[#C98A00]" style={{ fontSize: size }}>{'★'.repeat(v)}<span className="text-[#E3D8DF]">{'★'.repeat(5 - v)}</span></span>
}
const Ratings = ({ a }) => (a.ratings > 0
  ? <span className="flex items-center gap-1.5 text-[12px] text-tinta-2"><Stars n={a.rating} /><b>{dec(a.rating)}</b><span className="text-tinta-3">· {a.ratings === 1 ? '1 valoración' : `${a.ratings} valoraciones`}</span></span>
  : <span className="text-[12px] text-tinta-3">Sin valoraciones todavía</span>)
const monthYear = (d) => new Date(d).toLocaleDateString('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** Opiniones verificadas de un asesor (sin el nombre de quien opina) */
function PublicReviews({ a }) {
  const [list, setList] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!a?.id || !(a.ratings > 0)) return
    supabase.rpc('advisor_reviews_public', { p_user: a.id }).then(({ data, error }) => { if (error) setFailed(true); else setList(data || []) })
  }, [a?.id, a?.ratings])
  if (!(a.ratings > 0)) return <div className="rounded-xl bg-[#FAF7F9] px-3 py-2.5 text-[12px] leading-snug text-tinta-3">Sin valoraciones todavía. Solo pueden valorar personas que terminen una asesoría con este asesor/a.</div>
  return (
    <div className="flex flex-col gap-2">
      <b>Valoraciones verificadas</b>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl bg-[#FAF7F9] p-3 text-[12px]">
        {CRITERIA.map(([k, l]) => a[k] != null && <span key={k} className="flex items-center justify-between gap-2"><span className="text-tinta-3">{l}</span><b>{dec(a[k])}</b></span>)}
      </div>
      {failed && <span className="text-[12px] text-tinta-3">No pudimos cargar las opiniones. Intenta más tarde.</span>}
      {(list || []).map((v) => (
        <div key={v.id} className="flex flex-col gap-1 rounded-xl border border-linea p-3 text-[13px]">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><Stars n={v.overall} /><span className="text-[11px] text-tinta-3">Postulante verificado · {v.service} · {monthYear(v.created_at)}</span></span>
          {v.comment && <p className="leading-relaxed text-tinta-2">«{v.comment}»</p>}
          {v.reply && <p className="rounded-lg bg-[#F7F0FB] px-2.5 py-1.5 text-[12px] text-[#4A2163]"><b>Respuesta:</b> {v.reply}</p>}
        </div>
      ))}
      <span className="text-[11px] text-tinta-suave">Las valoraciones miden el servicio (puntualidad, calidad, comunicación y entregables), no si la persona consiguió empleo.</span>
    </div>
  )
}
const Availability = ({ a }) => (
  <span className={`pill shrink-0 ${a.available ? 'bg-[#EAF6EF] text-[#134A2B]' : 'bg-[#F4EEF2] text-tinta-3'}`}>{a.available ? 'Disponible' : 'Sin cupo ahora'}</span>
)

export function AdvisorCard({ a, onView, onPick, picked }) {
  return (
    <div className={`card flex flex-col gap-2.5 p-3.5 ${picked ? 'ring-2 ring-rosa-accion' : ''}`}>
      <div className="flex items-start gap-3">
        <AdvisorPhoto a={a} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-start justify-between gap-2"><b className="text-[15px]">{a.display_name}</b><Availability a={a} /></span>
          {a.headline && <span className="text-[13px] text-tinta-2">{a.headline}</span>}
          <span className="text-[12px] text-tinta-3">{[years(a.years), ...(a.specialties || [])].filter(Boolean).join(' · ')}</span>
          <Ratings a={a} />
        </span>
      </div>
      <span className="text-[12px] text-tinta-3">Hace: {(a.service_names || []).join(' · ') || '—'}</span>
      <div className="flex gap-2">
        {onView && <button className="btn-sm h-10 flex-1 border border-linea bg-white" onClick={() => onView(a)}>Ver perfil</button>}
        {onPick && <button className="btn-sm h-10 flex-1 bg-rosa-accion text-white disabled:opacity-50" disabled={!a.available} onClick={() => onPick(a)}>{picked ? '✓ Elegido/a' : 'Elegir'}</button>}
      </div>
    </div>
  )
}

export function AdvisorSheet({ a, onClose, onPick, pickLabel }) {
  if (!a) return null
  return (
    <Sheet open onClose={onClose} title={a.display_name}>
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex items-center gap-3">
          <AdvisorPhoto a={a} size={72} />
          <span className="flex flex-col gap-1">{a.headline && <b className="text-[15px]">{a.headline}</b>}<Ratings a={a} /><Availability a={a} /></span>
        </div>
        {(a.years != null || a.specialties?.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {a.years != null && <span className="rounded-md bg-[#F7F0FB] px-2 py-1 text-[12px] font-semibold text-[#4A2163]">{years(a.years)}</span>}
            {(a.specialties || []).map((s) => <span key={s} className="rounded-md bg-[#FAF7F9] px-2 py-1 text-[12px] font-semibold text-tinta-2">{s}</span>)}
          </div>
        )}
        <p className="whitespace-pre-line leading-relaxed text-tinta-2">{a.bio}</p>
        <div className="flex flex-col gap-1"><b>Servicios que realiza</b>{(a.service_names || []).map((s) => <span key={s} className="flex gap-2"><Svg name="check" size={16} className="mt-0.5 shrink-0 text-[#2F7A4F]" />{s}</span>)}</div>
        <PublicReviews a={a} />
        <span className="text-[11px] text-tinta-suave">Perfil revisado y aprobado por VINKA.</span>
        {onPick && <button className="btn" disabled={!a.available} onClick={() => onPick(a)}>{a.available ? pickLabel || `Elegir a ${a.display_name.split(' ')[0]}` : 'Sin cupo ahora'}</button>}
      </div>
    </Sheet>
  )
}

/** Directorio cargado una vez: perfiles publicados y su disponibilidad */
export function useAdvisorDirectory() {
  const [list, setList] = useState(null)
  const [failed, setFailed] = useState(false)
  // Si falla (sin red), se avisa y se ofrece reintentar; se mantiene lo último conocido
  const load = useCallback(() => supabase.rpc('advisor_directory', { p_service: null }).then(({ data, error }) => {
    setFailed(!!error); if (!error) setList(data || []); else setList((l) => l || [])
  }, () => { setFailed(true); setList((l) => l || []) }), [])
  useEffect(() => { load() }, [load])
  return [list, load, failed]
}

/** Paso «¿Quién te atiende?» dentro de la solicitud */
export function AdvisorChooser({ service, list, value, onChange, mode, onMode, failed, onRetry }) {
  const [view, setView] = useState(null)
  const options = (list || []).filter((a) => (a.services || []).includes(service))
  const avail = options.filter((a) => a.available)
  const setMode = (k) => { onMode(k); if (k === 'vinka') onChange(null) }
  if (failed && !options.length) return (
    <div role="alert" className="flex flex-col gap-2 rounded-xl border border-[#F4C7C3] bg-[#FEF3F2] p-3 text-[13px] text-[#912018]">
      <span>No pudimos cargar a los asesores. Puedes reintentar o seguir con «VINKA elige por mí».</span>
      <div className="flex gap-2"><button type="button" className="btn-sm h-9 border border-[#F4C7C3] bg-white" onClick={onRetry}>Reintentar</button>
        <button type="button" className="btn-sm h-9 border border-[#F4C7C3] bg-white" onClick={() => setMode('vinka')}>Seguir con VINKA elige</button></div>
    </div>
  )
  if (!options.length) return null // sin perfiles publicados para este servicio: VINKA elige, como siempre
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="label mb-1.5">¿Quién te atiende?</legend>
      {[['vinka', 'VINKA elige por mí', 'Te asignamos a quien mejor calce con tu objetivo y tenga cupo.'], ['asesor', 'Quiero elegir a mi asesor/a', `${avail.length} disponible${avail.length === 1 ? '' : 's'} para este servicio.`]].map(([k, l, h]) => (
        <label key={k} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${mode === k ? 'border-rosa-accion bg-rosa-fondo' : 'border-linea bg-white'}`}>
          <input type="radio" name="quien" checked={mode === k} onChange={() => { setMode(k); if (k === 'vinka') onChange(null) }} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D02E72]" />
          <span className="flex flex-col"><b className="text-sm">{l}</b><span className="text-[12px] text-tinta-3">{h}</span></span>
        </label>
      ))}
      {mode === 'asesor' && (
        <div className="flex flex-col gap-2">
          {options.map((a) => <AdvisorCard key={a.id} a={a} picked={value === a.id} onView={setView} onPick={(x) => onChange(x.id)} />)}
          {avail.length === 0 && <span className="rounded-xl bg-naranja-palido px-3 py-2 text-[12px] text-naranja-texto">Ahora nadie tiene cupo para este servicio. Elige «VINKA elige por mí» y te asignamos apenas se libere alguien.</span>}
          {!value && avail.length > 0 && <span className="text-[12px] text-tinta-3">Elige a una persona o vuelve a «VINKA elige por mí».</span>}
        </div>
      )}
      <AdvisorSheet a={view} onClose={() => setView(null)} onPick={(x) => { onChange(x.id); setView(null) }} />
    </fieldset>
  )
}

/** Cuenta del asesor: su perfil público, disponibilidad y estado de revisión */
export function MyPublicProfile() {
  const [d, setD] = useState(null)
  const [edit, setEdit] = useState(false)
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState(false)
  const load = useCallback(() => supabase.rpc('my_advisor_profile').then(({ data, error }) => { if (error) setErr(errMsg(error)); else setD(data) }), [])
  useEffect(() => { load() }, [load])
  const toggle = async () => {
    setErr('')
    const { error } = await supabase.rpc('advisor_set_accepting', { p_on: !d.accepting })
    if (error) setErr(errMsg(error)); else load()
  }
  if (!d) return err ? <ErrorBox>{err}</ErrorBox> : null
  const st = d.review_status === 'en_revision' ? ['En revisión por VINKA', 'bg-naranja-palido text-naranja-texto']
    : d.review_status === 'devuelto' ? ['VINKA pidió cambios', 'bg-[#FEF3F2] text-[#912018]']
      : d.pub ? ['Publicado', 'bg-[#EAF6EF] text-[#134A2B]'] : ['Sin publicar', 'bg-[#F4EEF2] text-tinta-3']
  return (
    <div className="card flex flex-col gap-2.5 p-4 text-sm">
      <div className="flex items-center justify-between gap-2"><b className="text-[15px]">Mi perfil público</b><span className={`pill ${st[1]}`}>{st[0]}</span></div>
      <span className="text-[13px] leading-snug text-tinta-3">Es lo que ven los postulantes al elegir asesor/a. Cada cambio lo revisa VINKA antes de publicarlo.</span>
      {d.review_status === 'devuelto' && d.review_note && <span className="rounded-xl bg-[#FEF3F2] px-3 py-2 text-[13px] text-[#912018]">VINKA: «{d.review_note}»</span>}
      {d.hidden && <span className="rounded-xl bg-[#F4EEF2] px-3 py-2 text-[13px]">VINKA ocultó tu perfil del directorio por ahora.</span>}
      <label className="flex items-center justify-between gap-3 rounded-xl border border-linea px-3 py-2.5">
        <span className="flex flex-col"><b>Recibir nuevas solicitudes</b><span className="text-[12px] text-tinta-3">{d.load} de {d.max_active} asesorías en curso{d.accepting && d.load >= d.max_active ? ' · cupo lleno' : ''}</span></span>
        <input type="checkbox" role="switch" checked={d.accepting} onChange={toggle} className="h-6 w-6 shrink-0 accent-[#1E6B3F]" aria-label="Recibir nuevas solicitudes" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn-sm h-10 bg-rosa-accion text-white" onClick={() => setEdit(true)}>{d.draft ? 'Editar perfil' : 'Crear mi perfil'}</button>
        {d.pub && <button className="btn-sm h-10 border border-linea bg-white" onClick={() => setPreview(true)}>Ver como lo ve el postulante</button>}
      </div>
      <ErrorBox>{err}</ErrorBox>
      {edit && <ProfileEditor d={d} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); load() }} />}
      {preview && <AdvisorSheet a={{ ...d.pub, available: d.available, ratings: 0, service_names: (d.services || []).filter((s) => (d.pub.services || []).includes(s.id)).map((s) => s.name) }} onClose={() => setPreview(false)} />}
    </div>
  )
}

function ProfileEditor({ d, onClose, onSaved }) {
  const { user } = useAuth()
  const base = d.draft || {}
  const [f, setF] = useState({ display_name: base.display_name || '', headline: base.headline || '', bio: base.bio || '', years: base.years ?? '', specialties: base.specialties || [], services: base.services || [], photo: base.photo || null })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))
  const upload = async (file) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setErr('La foto debe ser JPG, PNG o WebP')
    if (file.size > 2 * 1024 * 1024) return setErr('La foto debe pesar menos de 2 MB')
    setErr(''); setBusy(true)
    const path = `${user.id}/${Date.now()}.${file.type.split('/')[1]}`
    const { error } = await supabase.storage.from('advisor-photos').upload(path, file, { contentType: file.type })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    set('photo')(path)
  }
  const save = async () => {
    setErr(''); setBusy(true)
    const { error } = await supabase.rpc('advisor_profile_save', { p: { ...f, years: f.years === '' ? null : Number(f.years) } })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onSaved()
  }
  return (
    <Sheet open onClose={onClose} title="Mi perfil público">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <AdvisorPhoto a={{ photo: f.photo, display_name: f.display_name }} size={64} />
          <label className="btn-sm h-10 cursor-pointer border border-linea bg-white">{f.photo ? 'Cambiar foto' : 'Subir foto'}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} /></label>
        </div>
        <label className="flex flex-col gap-1.5"><span className="label">Nombre profesional</span><input className="input h-11" maxLength={80} value={f.display_name} onChange={(e) => set('display_name')(e.target.value)} /></label>
        <label className="flex flex-col gap-1.5"><span className="label">Una línea sobre ti</span><input className="input h-11" maxLength={120} value={f.headline} onChange={(e) => set('headline')(e.target.value)} placeholder="Ej.: Reclutadora con foco en retail y ventas" /></label>
        <label className="flex flex-col gap-1.5"><span className="label">Años de experiencia</span><input className="input h-11 w-32" type="number" min={0} max={60} value={f.years} onChange={(e) => set('years')(e.target.value)} /></label>
        <div className="flex flex-col gap-1.5"><span className="label">Especialidades (hasta 8)</span><TagInput value={f.specialties} onChange={(v) => set('specialties')(v.slice(0, 8))} placeholder="Escribe y presiona Enter" /></div>
        <label className="flex flex-col gap-1.5"><span className="label">Presentación</span>
          <textarea className="textarea h-32" maxLength={1500} value={f.bio} onChange={(e) => set('bio')(e.target.value)} placeholder="Tu experiencia, en qué ayudas y cómo trabajas. Sin datos de contacto." /></label>
        <fieldset className="flex flex-col gap-1.5"><legend className="label mb-1.5">Servicios que realizas</legend>
          {(d.services || []).map((s) => (
            <label key={s.id} className="flex items-center gap-2.5 text-sm"><input type="checkbox" className="h-5 w-5 accent-[#D02E72]" checked={f.services.includes(s.id)}
              onChange={(e) => set('services')(e.target.checked ? [...f.services, s.id] : f.services.filter((x) => x !== s.id))} />{s.name}</label>
          ))}
        </fieldset>
        <span className="text-[12px] text-tinta-suave">Al guardar, VINKA revisa los cambios. Mientras tanto, los postulantes ven tu última versión aprobada.</span>
        <ErrorBox>{err}</ErrorBox>
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Enviar a revisión'}</button>
      </div>
    </Sheet>
  )
}

/** Administración: revisar y ajustar el perfil público de un asesor */
export function AdminAdvisorProfile({ advisorId, p, services, onChange }) {
  const [view, setView] = useState(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const call = async (fn, args) => {
    setErr('')
    const { error } = await supabase.rpc(fn, args)
    if (error) return setErr(errMsg(error))
    setView(null); setNote(''); onChange()
  }
  if (!p) return null
  const names = (ids) => (services || []).filter((s) => (ids || []).includes(s.id)).map((s) => s.name)
  const st = p.review_status === 'en_revision' ? 'Cambios por revisar' : p.review_status === 'devuelto' ? 'Devuelto con observaciones' : p.pub ? 'Publicado' : 'Sin perfil'
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-[#FAF7F9] p-3 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b>Perfil público · {st}{p.hidden ? ' · oculto' : ''}</b>
        <span className="text-tinta-3">{p.load}/{p.max_active} en curso · {p.accepting ? 'recibe solicitudes' : 'no recibe'}{p.available ? ' · disponible' : ''}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {p.review_status === 'en_revision' && <button className="btn-sm h-9 bg-rosa-accion text-white" onClick={() => setView('draft')}>Revisar cambios</button>}
        {p.pub && <button className="btn-sm h-9 border border-linea bg-white" onClick={() => setView('pub')}>Ver publicado</button>}
        <button className="btn-sm h-9 border border-linea bg-white" onClick={() => call('admin_advisor_profile_set', { p_user: advisorId, p_hidden: !p.hidden, p_accepting: null, p_max: null })}>{p.hidden ? 'Mostrar en el directorio' : 'Ocultar del directorio'}</button>
        <button className="btn-sm h-9 border border-linea bg-white" onClick={() => call('admin_advisor_profile_set', { p_user: advisorId, p_hidden: null, p_accepting: !p.accepting, p_max: null })}>{p.accepting ? 'Pausar solicitudes' : 'Reanudar solicitudes'}</button>
        <label className="flex items-center gap-1.5">Cupo
          <select className="h-9 rounded-lg border border-linea bg-white px-2" value={p.max_active} onChange={(e) => call('admin_advisor_profile_set', { p_user: advisorId, p_hidden: null, p_accepting: null, p_max: Number(e.target.value) })}>
            {[2, 4, 6, 8, 10, 12, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {view === 'pub' && (
        <AdvisorSheet a={{ ...(view === 'draft' ? p.draft : p.pub), available: p.available, ratings: 0, service_names: names((view === 'draft' ? p.draft : p.pub)?.services) }} onClose={() => setView(null)} />
      )}
      {view === 'draft' && (
        <Sheet open onClose={() => setView(null)} title="Revisar cambios del perfil">
          <div className="flex flex-col gap-2.5 text-sm">
            <AdvisorCard a={{ ...p.draft, available: p.available, ratings: 0, service_names: names(p.draft?.services) }} />
            <p className="whitespace-pre-line rounded-xl bg-[#FAF7F9] p-3 text-[13px] text-tinta-2">{p.draft?.bio}</p>
            <textarea className="textarea h-20" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Si pides cambios, escribe qué corregir" />
            <ErrorBox>{err}</ErrorBox>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-sm h-11 border border-linea bg-white" onClick={() => call('admin_advisor_profile_review', { p_user: advisorId, p_approve: false, p_note: note })}>Pedir cambios</button>
              <button className="btn-sm h-11 bg-[#1E6B3F] text-white" onClick={() => call('admin_advisor_profile_review', { p_user: advisorId, p_approve: true, p_note: '' })}>✓ Aprobar y publicar</button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  )
}


function StarInput({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[13px]">{label}</span>
      <span className="flex" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} de 5`} onClick={() => onChange(n)}
            className={`h-9 w-8 text-[24px] leading-none ${n <= (value || 0) ? 'text-[#C98A00]' : 'text-[#E3D8DF]'}`}>★</button>
        ))}
      </span>
    </div>
  )
}

/** El postulante valora su asesoría (una vez, al finalizar y aprobarse) */
export function ReviewSheet({ r, advisorName, onClose, onDone }) {
  const [v, setV] = useState({ overall: 0, punctuality: 0, quality: 0, communication: 0, deliverables: 0, comment: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!r) return null
  const missing = ['overall', ...CRITERIA.map(([k]) => k)].some((k) => !v[k])
  const send = async () => {
    setErr('')
    if (missing) return setErr('Marca de 1 a 5 estrellas en cada punto.')
    setBusy(true)
    const { error } = await supabase.rpc('review_submit', { p_request: r.id, p_overall: v.overall, p_punctuality: v.punctuality, p_quality: v.quality, p_communication: v.communication, p_deliverables: v.deliverables, p_comment: v.comment })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone()
  }
  return (
    <Sheet open onClose={onClose} title={`Valora a ${advisorName || 'tu asesor/a'}`}>
      <div className="flex flex-col gap-3 pb-5 text-sm">
        <span className="text-[13px] text-tinta-3">Evalúa el servicio que recibiste en tu {r.service_name}, no si conseguiste empleo. Tu nombre no se muestra: aparece como «Postulante verificado».</span>
        <div className="rounded-xl bg-[#FAF7F9] p-3"><StarInput label={<b>Calificación general</b>} value={v.overall} onChange={(n) => setV({ ...v, overall: n })} /></div>
        <div className="flex flex-col gap-1">{CRITERIA.map(([k, l]) => <StarInput key={k} label={l} value={v[k]} onChange={(n) => setV({ ...v, [k]: n })} />)}</div>
        <label className="flex flex-col gap-1.5"><span className="label">Comentario (opcional)</span>
          <textarea className="textarea h-24" maxLength={600} value={v.comment} onChange={(e) => setV({ ...v, comment: e.target.value })} placeholder="¿Qué te sirvió? ¿Qué se podría mejorar?" /></label>
        <span className="text-[11px] text-tinta-suave">Solo puedes valorar una vez. El asesor/a puede responder, y VINKA revisa las opiniones denunciadas.</span>
        <ErrorBox>{err}</ErrorBox>
        <button className="btn" disabled={busy} onClick={send}>{busy ? 'Enviando…' : 'Enviar valoración'}</button>
      </div>
    </Sheet>
  )
}

const REVIEW_ST = { visible: ['Publicada', 'bg-[#EAF6EF] text-[#134A2B]'], reportada: ['En revisión por VINKA', 'bg-naranja-palido text-naranja-texto'], oculta: ['Oculta por VINKA', 'bg-[#F4EEF2] text-tinta-3'] }
function ReviewItem({ v, children }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-linea p-3 text-[13px]">
      <span className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2"><Stars n={v.overall} /><span className="text-[11px] text-tinta-3">{v.service} · {new Date(v.created_at).toLocaleDateString('es-CL')}</span></span>
        <span className={`pill ${REVIEW_ST[v.status]?.[1]}`}>{REVIEW_ST[v.status]?.[0]}</span></span>
      <span className="text-[11px] text-tinta-3">{CRITERIA.map(([k, l]) => `${l}: ${v[k]}`).join(' · ')}</span>
      {v.comment && <p className="leading-relaxed text-tinta-2">«{v.comment}»</p>}
      {v.reply && <p className="rounded-lg bg-[#F7F0FB] px-2.5 py-1.5 text-[12px] text-[#4A2163]"><b>Respuesta:</b> {v.reply}</p>}
      {v.report_reason && <p className="text-[12px] text-naranja-texto"><b>Denuncia:</b> {v.report_reason}</p>}
      {v.moderation_note && <p className="text-[12px] text-tinta-2"><b>Decisión de VINKA:</b> {v.moderation_note}</p>}
      {children}
    </div>
  )
}

/** Asesor: sus valoraciones, responder y pedir revisión */
export function MyAdvisorReviews() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [act, setAct] = useState(null) // { id, kind: 'reply' | 'report', text }
  const load = useCallback(() => supabase.rpc('my_advisor_reviews').then(({ data, error }) => { if (error) setErr(errMsg(error)); else setD(data) }), [])
  useEffect(() => { load() }, [load])
  const send = async () => {
    setErr('')
    const { error } = act.kind === 'reply' ? await supabase.rpc('review_reply', { p_id: act.id, p_reply: act.text }) : await supabase.rpc('review_report', { p_id: act.id, p_reason: act.text })
    if (error) return setErr(errMsg(error))
    setAct(null); load()
  }
  if (!d || !Array.isArray(d.items)) return err ? <ErrorBox>{err}</ErrorBox> : null
  const sum = d.summary || {}
  return (
    <div className="card flex flex-col gap-2.5 p-4 text-sm">
      <div className="flex items-center justify-between gap-2"><b className="text-[15px]">Mis valoraciones</b>{sum.ratings > 0 && <Ratings a={sum} />}</div>
      {d.items.length === 0 && <span className="text-[13px] text-tinta-3">Sin valoraciones todavía. Te llegarán cuando un postulante termine una asesoría contigo y VINKA la apruebe.</span>}
      {d.items.map((v) => (
        <ReviewItem key={v.id} v={v}>
          {act?.id === v.id ? (
            <div className="flex flex-col gap-2">
              <textarea className="textarea h-20" maxLength={act.kind === 'reply' ? 600 : 400} value={act.text} onChange={(e) => setAct({ ...act, text: e.target.value })}
                placeholder={act.kind === 'reply' ? 'Tu respuesta pública' : 'Por qué es inapropiada (mín. 15 caracteres). Solo la ve VINKA.'} />
              <ErrorBox>{err}</ErrorBox>
              <div className="flex gap-2"><button className="btn-sm h-9 border border-linea bg-white" onClick={() => { setAct(null); setErr('') }}>Cancelar</button>
                <button className="btn-sm h-9 bg-rosa-accion text-white" onClick={send}>{act.kind === 'reply' ? 'Publicar respuesta' : 'Pedir revisión'}</button></div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button className="text-[13px] font-semibold text-rosa-texto" onClick={() => setAct({ id: v.id, kind: 'reply', text: v.reply || '' })}>{v.reply ? 'Editar respuesta' : 'Responder'}</button>
              {v.status === 'visible' && !v.moderation_note && <button className="text-[13px] font-semibold text-tinta-3" onClick={() => setAct({ id: v.id, kind: 'report', text: '' })}>Pedir revisión a VINKA</button>}
            </div>
          )}
        </ReviewItem>
      ))}
      <span className="text-[11px] text-tinta-suave">Son solo de asesorías pagadas y aprobadas. Tus aportes en Comunidad no se mezclan con estas valoraciones.</span>
    </div>
  )
}

/** Administración: indicadores de calidad y moderación de valoraciones */
export function AdminReviews({ names = {} }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [all, setAll] = useState(false)
  const [mod, setMod] = useState(null) // { id, hide, text }
  const load = useCallback(() => supabase.rpc('admin_reviews').then(({ data, error }) => { if (error) setErr(errMsg(error)); else setD(data) }), [])
  useEffect(() => { load() }, [load])
  const send = async () => {
    setErr('')
    const { error } = await supabase.rpc('admin_review_moderate', { p_id: mod.id, p_hide: mod.hide, p_note: mod.text })
    if (error) return setErr(errMsg(error))
    setMod(null); load()
  }
  if (!d || !Array.isArray(d.items)) return err ? <ErrorBox>{err}</ErrorBox> : null
  const reported = d.items.filter((v) => v.status === 'reportada')
  const rated = Object.entries(d.advisors || {}).filter(([, s]) => s.ratings > 0)
  const shown = all ? d.items : reported
  return (
    <div className="card flex flex-col gap-2.5 p-4 text-sm">
      <div className="flex items-center justify-between gap-2"><b className="text-[15px]">Valoraciones</b>
        <span className={`pill ${reported.length ? 'bg-naranja-palido text-naranja-texto' : 'bg-[#F4EEF2] text-tinta-3'}`}>{reported.length ? `${reported.length} por revisar` : 'Nada por revisar'}</span></div>
      {rated.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-xl bg-[#FAF7F9] p-3 text-[12px]">
          <span className="font-semibold text-tinta-2">Calidad del servicio (sin ranking público)</span>
          {rated.map(([id, s]) => (
            <span key={id} className="flex flex-wrap items-center justify-between gap-x-3"><b>{names[id] || 'Asesor/a'}</b>
              <span className="text-tinta-3">{dec(s.rating)} general · {s.ratings} · puntualidad {dec(s.punctuality)} · calidad {dec(s.quality)} · comunicación {dec(s.communication)} · entregables {dec(s.deliverables)}</span></span>
          ))}
        </div>
      ) : <span className="text-[13px] text-tinta-3">Aún no hay valoraciones. Los postulantes pueden valorar cuando apruebas la entrega de su asesoría.</span>}
      {shown.map((v) => (
        <ReviewItem key={v.id} v={v}>
          <span className="text-[11px] text-tinta-3">{v.advisor} · valoró {v.candidate}</span>
          {mod?.id === v.id ? (
            <div className="flex flex-col gap-2">
              <textarea className="textarea h-20" maxLength={400} value={mod.text} onChange={(e) => setMod({ ...mod, text: e.target.value })} placeholder="Motivo de la decisión (mín. 10 caracteres). Lo verá el asesor/a y queda registrado." />
              <ErrorBox>{err}</ErrorBox>
              <div className="flex gap-2"><button className="btn-sm h-9 border border-linea bg-white" onClick={() => { setMod(null); setErr('') }}>Cancelar</button>
                <button className="btn-sm h-9 bg-morado text-white" disabled={mod.text.trim().length < 10} onClick={send}>{mod.hide ? 'Ocultar valoración' : 'Mantener publicada'}</button></div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {v.status !== 'visible' && <button className="btn-sm h-9 border border-linea bg-white" onClick={() => setMod({ id: v.id, hide: false, text: '' })}>Mantener / volver a publicar</button>}
              {v.status !== 'oculta' && <button className="btn-sm h-9 border border-[#C0362C] bg-white text-[#912018]" onClick={() => setMod({ id: v.id, hide: true, text: '' })}>Ocultar</button>}
            </div>
          )}
        </ReviewItem>
      ))}
      {d.items.length > reported.length && <button className="self-start text-[13px] font-semibold text-rosa-texto" onClick={() => setAll(!all)}>{all ? 'Ver solo las por revisar' : `Ver todas (${d.items.length})`}</button>}
    </div>
  )
}
