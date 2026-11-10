import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import App from './App'
import './index.css'
import { registerSW } from './lib/push'
import { installGlobalErrorHandlers } from './components/ErrorBoundary'
import './lib/install'
import { installChileTime } from './lib/dates'

installChileTime()

registerSW()

// Pantalla de carga: se va cuando termina la animación (public/splash.js avisa) o, por seguridad, a los 6 s
const splash = document.getElementById('splash')
if (splash) {
  const hide = () => { if (splash.classList.contains('out')) return; splash.classList.add('out'); setTimeout(() => splash.remove(), 450) }
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduce || window.__vinkaSplashDone) hide()
  else { window.addEventListener('vinka-splash-done', hide, { once: true }); setTimeout(hide, 6000) }
}

installGlobalErrorHandlers()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
