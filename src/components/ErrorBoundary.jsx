import { Component } from 'react'
import { supabase } from '../lib/supabase'

let sent = 0
/** Guarda el error en Supabase (tabla client_errors, solo la ve el administrador). Nunca lanza. */
export function reportError(error, extra = '') {
  try {
    if (sent >= 10) return
    sent++
    const msg = String(error?.message || error || 'Error desconocido')
    // cargar una ruta después de publicar una versión nueva falla una vez; se recarga en vez de registrarlo
    if (/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(msg)) {
      if (!sessionStorage.getItem('vinka-reloaded')) { sessionStorage.setItem('vinka-reloaded', '1'); window.location.reload() }
      return
    }
    supabase.rpc('log_client_error', {
      p_message: msg, p_stack: `${error?.stack || ''}${extra ? `\n${extra}` : ''}`,
      p_path: window.location.pathname, p_ua: navigator.userAgent,
    }).then(() => {}, () => {})
  } catch { /* nada */ }
}

export function installGlobalErrorHandlers() {
  window.addEventListener('error', (e) => reportError(e.error || e.message))
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason))
}

/** Si una pantalla falla, muestra un aviso con "Reintentar" en vez de dejar la app en blanco */
export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { reportError(error, info?.componentStack) }
  componentDidUpdate(prev) { if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center gap-3 px-8 text-center">
        <span className="font-display text-xl font-semibold">Algo no funcionó en esta pantalla</span>
        <span className="text-sm leading-relaxed text-tinta-3">Ya quedó registrado para revisarlo. Puedes reintentar o volver al inicio.</span>
        <div className="mt-2 flex w-full gap-2">
          <button className="btn-sec" onClick={() => this.setState({ error: null })}>Reintentar</button>
          <button className="btn" onClick={() => { window.location.href = '/' }}>Ir al inicio</button>
        </div>
      </div>
    )
  }
}
