import { supabase } from './supabase'

export const CV_ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg'
const safeName = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80)

/** Guarda un CV en VINKA (carpeta de la persona) y lo registra como nueva versión */
export async function uploadCv(candidateId, file, { requestId = null, note = '' } = {}) {
  if (file.size > 10 * 1024 * 1024) throw new Error('El archivo pesa más de 10 MB.')
  const path = `${candidateId}/${Date.now()}-${safeName(file.name)}`
  const { error } = await supabase.storage.from('cvs').upload(path, file, { contentType: file.type || undefined })
  if (error) throw new Error('No pudimos subir el archivo. Usa PDF, Word o imagen de hasta 10 MB.')
  const { error: e2 } = await supabase.rpc('register_cv', { p_path: path, p_name: file.name, p_request: requestId, p_note: note })
  if (e2) { await supabase.storage.from('cvs').remove([path]); throw new Error(e2.message) }
  return path
}

/** Abre un archivo privado con un enlace temporal de 5 minutos */
export async function openPrivateFile(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300)
  if (error) throw new Error('No pudimos abrir el archivo.')
  window.open(data.signedUrl, '_blank', 'noopener')
}

export const fmtDate = (d) => new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
export const fmtDateTime = (d) => new Date(d).toLocaleString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
