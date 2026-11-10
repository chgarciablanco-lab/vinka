import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import App from './App'
import './index.css'
import { registerSW } from './lib/push'
import { installGlobalErrorHandlers } from './components/ErrorBoundary'
import './lib/install'

registerSW()

// Pantalla de carga: se mantiene hasta que termina la animación (unos 2,4 s desde que se abrió la app)
const splash = document.getElementById('splash')
if (splash) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const wait = Math.max(0, (reduce ? 0 : 2400) - performance.now())
  setTimeout(() => { splash.classList.add('out'); setTimeout(() => splash.remove(), 450) }, wait)
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
