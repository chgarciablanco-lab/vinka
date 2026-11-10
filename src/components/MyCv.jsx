import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { CV_ACCEPT, fmtDate, uploadCv, useSignedUrls } from '../lib/files'
import { FileLink } from './FileLink'
import { ErrorBox } from './ui'

/** Mi CV: archivos guardados en VINKA (los que subes y las versiones mejoradas por tu asesor/a) */
export function MyCv() {
  const { user } = useAuth()
  const [list, setList] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const input = useRef()
  const urls = useSignedUrls('cvs', (list || []).map((f) => f.file_path))
  const load = useCallback(() => { supabase.from('cv_files').select('*').order('version', { ascending: false }).then(({ data }) => setList(data || [])) }, [])
  useEffect(() => { load() }, [load])
  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy(true); setErr('')
    try { await uploadCv(user.id, f); load() } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  const remove = async (f) => {
    setErr('')
    const { data: path, error } = await supabase.rpc('delete_my_cv', { p_id: f.id })
    if (error) return setErr(errMsg(error))
    await supabase.storage.from('cvs').remove([path]); load()
  }
  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex flex-col"><span className="text-[15px] font-semibold">CV para mis asesorías</span><span className="text-[13px] text-tinta-3">Guarda el archivo para que tu asesor/a lo trabaje. No completa tu perfil.</span></span>
        <button className="btn-sm shrink-0 bg-morado text-white" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Subiendo…' : 'Guardar archivo'}</button>
        <input ref={input} type="file" accept={CV_ACCEPT} className="hidden" onChange={onFile} />
      </div>
      {list?.map((f) => (
        <div key={f.id} className="flex items-center gap-2 border-t border-[#F1E7ED] pt-2 text-sm">
          <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${f.kind === 'mejorado' ? 'bg-[#EAF6EF] text-[#134A2B]' : 'bg-[#F4EEF2] text-tinta-2'}`}>v{f.version}</span>
          <span className="flex min-w-0 flex-1 flex-col"><span className="truncate">{f.file_name || 'CV'}</span><span className="text-xs text-tinta-3">{f.kind === 'mejorado' ? 'Mejorado por tu asesor/a' : 'Subido por ti'} · {fmtDate(f.created_at)}</span></span>
          <FileLink url={urls[f.file_path]} className="text-xs font-semibold text-rosa-texto">Abrir</FileLink>
          {f.kind === 'original' && <button className="text-xs font-semibold text-tinta-3" onClick={() => remove(f)}>Borrar</button>}
        </div>
      ))}
      <span className="text-[11px] leading-snug text-tinta-suave">Las empresas no ven tu CV. Solo lo ven tú, el asesor/a que te asigne VINKA si pides una asesoría y la administración de VINKA.</span>
      <ErrorBox>{err}</ErrorBox>
    </div>
  )
}
