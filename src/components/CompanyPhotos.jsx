import { useEffect, useRef, useState } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { ErrorBox, Svg } from './ui'

export const photoUrl = (path) => (path ? supabase.storage.from('company-photos').getPublicUrl(path).data.publicUrl : '')
const MAX = 8

// Achica la foto antes de subirla (máx. 1600 px, JPG) para que cargue rápido en el celular
async function shrink(file) {
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85))
    return blob || file
  } catch { return file }
}

/** Fotos de la empresa (administración de la empresa): subir, quitar y escribir una descripción corta */
export function CompanyPhotosEditor({ company, canEdit, onSaved }) {
  const [list, setList] = useState(company?.photos || [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const input = useRef()
  useEffect(() => { setList(company?.photos || []) }, [company?.id, company?.photos])
  const save = async (next) => {
    const { error } = await supabase.rpc('set_company_photos', { p_company: company.id, p_photos: next })
    if (error) { setErr(errMsg(error)); return false }
    setList(next); onSaved?.(); return true
  }
  const add = async (e) => {
    const files = [...(e.target.files || [])].slice(0, MAX - list.length); e.target.value = ''
    if (!files.length) return
    setErr(''); setBusy(true)
    const added = []
    for (const f of files) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { setErr('Usa fotos JPG, PNG o WEBP.'); continue }
      const blob = await shrink(f)
      if (blob.size > 5 * 1024 * 1024) { setErr('Una foto pesa más de 5 MB.'); continue }
      const path = `${company.id}/foto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`
      const { error } = await supabase.storage.from('company-photos').upload(path, blob, { contentType: 'image/jpeg' })
      if (error) { setErr('No pudimos subir una de las fotos. Inténtalo de nuevo.'); continue }
      added.push({ path, caption: '' })
    }
    if (added.length) await save([...list, ...added])
    setBusy(false)
  }
  const remove = async (p) => {
    if (await save(list.filter((x) => x.path !== p.path))) supabase.storage.from('company-photos').remove([p.path]).then(() => {})
  }
  const caption = (p, t) => setList(list.map((x) => (x.path === p.path ? { ...x, caption: t } : x)))
  const move = (i, d) => { const n = [...list]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); save(n) }

  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex flex-col"><span className="text-[15px] font-semibold">Fotos de la empresa</span><span className="text-xs text-tinta-3">Los postulantes las ven en «Ver más» de tus vacantes. {list.length} de {MAX}.</span></span>
        {canEdit && list.length < MAX && <>
          <button className="btn-sm h-10 shrink-0 border border-linea bg-white px-3" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Subiendo…' : 'Agregar fotos'}</button>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={add} />
        </>}
      </div>
      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-linea px-3 py-5 text-center text-[13px] text-tinta-3">Muestra tu lugar de trabajo, tu equipo o el ambiente. Las vacantes con fotos generan más confianza.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {list.map((p, i) => (
            <div key={p.path} className="flex flex-col gap-1.5">
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-[#F4EEF2]">
                <img src={photoUrl(p.path)} alt={p.caption || `Foto ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                {canEdit && (
                  <div className="absolute inset-x-1 top-1 flex justify-between">
                    <span className="flex gap-1">
                      {i > 0 && <button aria-label="Mover antes" onClick={() => move(i, -1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-sm font-bold shadow">‹</button>}
                      {i < list.length - 1 && <button aria-label="Mover después" onClick={() => move(i, 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-sm font-bold shadow">›</button>}
                    </span>
                    <button aria-label="Quitar foto" onClick={() => remove(p)} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-[#912018] shadow"><Svg name="x" size={14} /></button>
                  </div>
                )}
              </div>
              {canEdit ? <input className="input h-9 text-[13px]" maxLength={120} placeholder="Descripción (opcional)" value={p.caption || ''} onChange={(e) => caption(p, e.target.value)} onBlur={() => save(list)} />
                : p.caption && <span className="text-xs text-tinta-3">{p.caption}</span>}
            </div>
          ))}
        </div>
      )}
      {canEdit && <span className="text-[11px] text-tinta-suave">JPG, PNG o WEBP. Las achicamos para que carguen rápido. No subas fotos de personas sin su permiso ni documentos con datos privados. En vacantes confidenciales no se muestran.</span>}
      <ErrorBox>{err}</ErrorBox>
    </div>
  )
}

/** Galería para postulantes: fila deslizable y foto a pantalla completa al tocar */
export function PhotoGallery({ jobId, companyName = '' }) {
  const [list, setList] = useState([])
  const [open, setOpen] = useState(null)
  useEffect(() => { if (!jobId) return; supabase.rpc('job_photos', { p_job: jobId }).then(({ data }) => setList(Array.isArray(data) ? data : [])) }, [jobId])
  useEffect(() => { if (open == null) return; const k = (e) => { if (e.key === 'Escape') setOpen(null); if (e.key === 'ArrowRight') setOpen((i) => Math.min(list.length - 1, i + 1)); if (e.key === 'ArrowLeft') setOpen((i) => Math.max(0, i - 1)) }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [open, list.length])
  if (!list.length) return null
  const cur = open != null ? list[open] : null
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold">Fotos{companyName ? ` de ${companyName}` : ''}</span>
      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {list.map((p, i) => (
          <button key={p.path} onClick={() => setOpen(i)} className="aspect-[4/3] w-[72%] max-w-[260px] shrink-0 snap-start overflow-hidden rounded-xl bg-[#F4EEF2]" aria-label={`Ver foto ${i + 1}${p.caption ? `: ${p.caption}` : ''}`}>
            <img src={photoUrl(p.path)} alt={p.caption || `Foto ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>
      {cur && (
        <div role="dialog" aria-modal="true" aria-label="Foto" className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={() => setOpen(null)}>
          <div className="safe-t flex items-center justify-between px-4 py-3 text-white"><span className="text-sm">{open + 1} / {list.length}</span>
            <button aria-label="Cerrar" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15" onClick={() => setOpen(null)}><Svg name="x" size={20} /></button></div>
          <div className="relative flex flex-1 items-center justify-center px-2" onClick={(e) => e.stopPropagation()}>
            <img src={photoUrl(cur.path)} alt={cur.caption || ''} className="max-h-full max-w-full object-contain" />
            {open > 0 && <button aria-label="Anterior" onClick={() => setOpen(open - 1)} className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-2xl text-white">‹</button>}
            {open < list.length - 1 && <button aria-label="Siguiente" onClick={() => setOpen(open + 1)} className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-2xl text-white">›</button>}
          </div>
          {cur.caption && <p className="safe-b px-5 pb-5 pt-3 text-center text-sm text-white/90">{cur.caption}</p>}
        </div>
      )}
    </div>
  )
}
