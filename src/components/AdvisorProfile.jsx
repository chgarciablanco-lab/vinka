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
// Etapa 2 traerá las valoraciones; mientras tanto, nunca se muestran notas inventadas
const Ratings = ({ a }) => <span className="text-[12px] text-tinta-3">{a.ratings > 0 ? `★ ${a.ratings}` : 'Sin valoraciones todavía'}</span>
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
        <div className="rounded-xl bg-[#FAF7F9] px-3 py-2.5 text-[12px] leading-snug text-tinta-3">Valoraciones: {a.ratings > 0 ? '' : 'aún no tiene. Solo podrán valorar personas que terminen una asesoría con este asesor/a.'}</div>
        <span className="text-[11px] text-tinta-suave">Perfil revisado y aprobado por VINKA.</span>
        {onPick && <button className="btn" disabled={!a.available} onClick={() => onPick(a)}>{a.available ? pickLabel || `Elegir a ${a.display_name.split(' ')[0]}` : 'Sin cupo ahora'}</button>}
      </div>
    </Sheet>
  )
}

/** Directorio cargado una vez: perfiles publicados y su disponibilidad */
export function useAdvisorDirectory() {
  const [list, setList] = useState(null)
  const load = useCallback(() => supabase.rpc('advisor_directory', { p_service: null }).then(({ data, error }) => setList(error ? [] : data || [])), [])
  useEffect(() => { load() }, [load])
  return [list, load]
}

/** Paso «¿Quién te atiende?» dentro de la solicitud */
export function AdvisorChooser({ service, list, value, onChange }) {
  const [view, setView] = useState(null)
  const [mode, setMode] = useState(value ? 'asesor' : 'vinka')
  const options = (list || []).filter((a) => (a.services || []).includes(service))
  const avail = options.filter((a) => a.available)
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
          {!value && <span className="text-[12px] text-tinta-3">Elige a una persona o vuelve a «VINKA elige por mí».</span>}
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

