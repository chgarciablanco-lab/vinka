import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { salaryText } from '../lib/catalog'
import { ErrorBox, Field, Spinner, Svg } from '../components/ui'
import { FeaturedBadge, trackPromo } from '../lib/promo'
import { HelpBubble } from '../components/HelpChat'
import { PhotoGallery } from '../components/CompanyPhotos'

const fmt = (d) => new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })

function Shell({ children }) {
  const { session } = useAuth()
  return (
    <div className="min-h-full bg-rosa-fondo">
      <header className="border-b border-[#EEE3EA] bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
          <Link to="/" className="font-display text-[18px] font-bold tracking-wide text-tinta">VINKA</Link>
          <span className="text-xs text-tinta-3">Empleos en Chile</span>
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-5 py-6">{children}</main>
      <footer className="mx-auto max-w-3xl px-5 pb-10 text-xs text-tinta-suave">
        Publicado en VINKA · <Link to="/legal/privacidad" className="underline">Privacidad</Link> · <Link to="/legal/terminos" className="underline">Términos</Link> · <Link to="/tutoriales" className="underline">Tutoriales</Link>
      </footer>
      {!session && <HelpBubble />}
    </div>
  )
}

const meta = (j) => [j.comuna, j.modality, j.schedule, j.contract].filter(Boolean).join(' · ')

function NotFound({ what }) {
  return (
    <Shell>
      <div className="card flex flex-col items-center gap-2 p-8 text-center">
        <span className="font-display text-lg font-semibold">{what} no está disponible</span>
        <span className="text-sm text-tinta-3">Puede que se haya cerrado o que el enlace esté incompleto.</span>
        <Link to="/" className="btn-sm mt-2 bg-rosa-accion text-white">Ver VINKA</Link>
      </div>
    </Shell>
  )
}

/** /empleos/:slug — todas las vacantes abiertas de una empresa verificada */
export function PublicCompany() {
  const { slug } = useParams()
  const [d, setD] = useState()
  useEffect(() => { supabase.rpc('public_company', { p_slug: slug }).then(({ data }) => setD(data || null)) }, [slug])
  useEffect(() => { if (d?.company) document.title = `Empleos en ${d.company.display_name} · VINKA` }, [d])
  useEffect(() => { if (d?.jobs) trackPromo(d.jobs.map((j) => j.promotion_id)) }, [d])
  if (d === undefined) return <Spinner />
  if (!d) return <NotFound what="Esta página de empleos" />
  const c = d.company
  return (
    <Shell>
      <section className="card flex flex-col gap-2 p-5">
        <h1 className="text-[24px] font-bold">{c.display_name}</h1>
        {c.managed_by && <span className="text-[13px] font-semibold text-tinta-suave">Procesos gestionados por {c.managed_by}</span>}
        <span className="text-sm text-tinta-3">{[c.sector, c.comuna, c.size && `${c.size} personas`].filter(Boolean).join(' · ')}</span>
        {c.description && <p className="text-[15px] leading-relaxed text-tinta-2">{c.description}</p>}
        {c.benefits && <p className="text-sm text-tinta-2"><b>Beneficios:</b> {c.benefits}</p>}
      </section>
      <h2 className="text-[18px] font-semibold">{d.jobs.length ? `${d.jobs.length} ${d.jobs.length === 1 ? 'vacante abierta' : 'vacantes abiertas'}` : 'Sin vacantes abiertas por ahora'}</h2>
      {d.jobs.map((j) => (
        <Link key={j.id} to={`/empleo/${j.id}`} onClick={() => j.promotion_id && trackPromo([j.promotion_id], 'click')} className={`card flex items-center gap-3 p-4 hover:border-rosa ${j.featured ? 'border-[#E6C66A]' : ''}`}>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            {j.featured && <FeaturedBadge className="mb-1" />}
            <span className="text-[16px] font-semibold">{j.title}</span>
            <span className="text-[13px] text-tinta-3">{meta(j)}</span>
            {salaryText(j) && <span className="text-[13px] font-semibold text-tinta-2">{salaryText(j)}</span>}
          </span>
          <Svg name="chevron" size={18} className="text-tinta-suave" />
        </Link>
      ))}
    </Shell>
  )
}

/** /empleo/:id — detalle de una vacante y postulación sin cuenta */
export function PublicJob() {
  const { id } = useParams()
  const { session, profile } = useAuth()
  const [d, setD] = useState()
  const [f, setF] = useState({ name: '', email: '', phone: '', headline: '', note: '', consent: false, hp: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  useEffect(() => { supabase.rpc('public_job', { p_id: id }).then(({ data }) => setD(data || null)) }, [id])
  useEffect(() => { if (d?.job) document.title = `${d.job.title} · ${d.company.display_name} · VINKA` }, [d])
  if (d === undefined) return <Spinner />
  if (!d) return <NotFound what="Esta vacante" />
  const j = d.job, c = d.company
  const reqs = Array.isArray(j.requirements) ? j.requirements.filter(Boolean) : []
  const submit = async (e) => {
    e.preventDefault(); setErr('')
    if (!f.consent) return setErr('Debes aceptar la política de privacidad para postular.')
    setBusy(true)
    const { data, error } = await supabase.rpc('public_apply', { p_job: id, p_name: f.name, p_email: f.email, p_phone: f.phone, p_headline: f.headline, p_note: f.note, p_consent: f.consent, p_hp: f.hp })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setDone(data)
  }
  return (
    <Shell>
      <section className="card flex flex-col gap-3 p-5">
        <span className="flex flex-col text-sm">
          {c.slug ? <Link to={`/empleos/${c.slug}`} className="font-semibold text-rosa-texto">{c.display_name}</Link> : <span className="font-semibold text-tinta-2">{c.display_name}</span>}
          {c.managed_by && <span className="text-[13px] text-tinta-suave">Proceso gestionado por la consultora {c.managed_by}</span>}
        </span>
        <h1 className="text-[24px] font-bold leading-tight">{j.title}</h1>
        <span className="text-sm text-tinta-3">{meta(j)}</span>
        {salaryText(j) && <span className="text-[15px] font-semibold">{salaryText(j)}</span>}
        {j.description && <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-tinta-2">{j.description}</p>}
        {reqs.length > 0 && (
          <div className="flex flex-col gap-1"><span className="text-sm font-semibold">Requisitos</span>
            <ul className="list-disc pl-5 text-[15px] text-tinta-2">{reqs.map((r, i) => <li key={i}>{typeof r === 'string' ? r : r.text || r.label || ''}</li>)}</ul></div>
        )}
        {c.benefits && <p className="text-sm text-tinta-2"><b>Beneficios:</b> {c.benefits}</p>}
        <PhotoGallery jobId={j.id} companyName={c.display_name} />
        <span className="text-xs text-tinta-suave">Publicada el {fmt(j.created_at)}</span>
      </section>

      {session && profile?.role === 'candidate' ? (
        <div className="card flex flex-col gap-2 p-5">
          <span className="text-[16px] font-semibold">Ya tienes cuenta en VINKA</span>
          <span className="text-sm text-tinta-3">Postula con tu perfil desde Explorar: la empresa verá tu experiencia y podrán conversar por chat.</span>
          <Link to="/" className="btn mt-1">Ir a VINKA</Link>
        </div>
      ) : done ? (
        <div className="card flex flex-col items-center gap-2 p-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF6EF] text-[#1E6B3F]"><Svg name="check" size={28} /></span>
          <span className="font-display text-lg font-semibold">{done === 'ya_postulaste' ? 'Ya habías postulado a esta vacante' : '¡Postulación enviada!'}</span>
          <span className="text-sm leading-relaxed text-tinta-3">{c.display_name} revisará tus datos y te contactará por correo o teléfono. Si creas una cuenta en VINKA podrás seguir el proceso y recibir vacantes parecidas.</span>
          <Link to="/registro/candidato" className="btn-sec mt-2">Crear mi cuenta gratis</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="card flex flex-col gap-3 p-5">
          <h2 className="text-[18px] font-semibold">Postular sin crear cuenta</h2>
          <Field label="Nombre y apellido"><input className="input" required maxLength={120} autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Correo"><input className="input" type="email" required maxLength={160} autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Teléfono (opcional)"><input className="input" type="tel" maxLength={20} autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+56 9 …" /></Field>
          <Field label="Cargo o profesión (opcional)"><input className="input" maxLength={120} value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} placeholder="Ej.: Vendedora con 3 años en retail" /></Field>
          <Field label="Cuéntales por qué te interesa (opcional)"><textarea className="textarea h-28" maxLength={1500} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Tu experiencia, disponibilidad, comuna…" /></Field>
          <label className="sr-only" aria-hidden="true">No completar<input tabIndex={-1} autoComplete="off" value={f.hp} onChange={(e) => setF({ ...f, hp: e.target.value })} /></label>
          <label className="flex items-start gap-2.5 text-sm leading-snug text-tinta-2">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-rosa-accion" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
            <span>Acepto que {c.display_name} y VINKA usen estos datos solo para este proceso de selección, según la <Link to="/legal/privacidad" className="underline">política de privacidad</Link>. Se eliminan a los 12 meses si no sigo en el proceso.</span>
          </label>
          <ErrorBox>{err}</ErrorBox>
          <button className="btn" disabled={busy}>{busy ? 'Enviando…' : 'Enviar postulación'}</button>
          <span className="text-center text-xs text-tinta-suave">¿Tienes cuenta? <Link to="/ingresar" className="font-semibold text-rosa-texto">Ingresa</Link> y postula con tu perfil.</span>
        </form>
      )}
    </Shell>
  )
}
