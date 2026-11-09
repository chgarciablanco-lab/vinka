/** Enlace a un archivo privado ya firmado; mientras se prepara, muestra "Preparando…" */
export function FileLink({ url, className = '', children = 'Abrir' }) {
  if (!url) return <span className={`${className} pointer-events-none opacity-50`}>Preparando…</span>
  return <a href={url} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
}
