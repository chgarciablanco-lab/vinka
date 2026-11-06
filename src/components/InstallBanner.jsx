import { useEffect, useState } from 'react'
import { canPromptInstall, onInstallChange, promptInstall } from '../lib/install'
import { isIOS, isStandalone } from '../lib/push'
import { Sheet, Svg } from './ui'

const KEY = 'vinka-install-dismissed'
const dismissed = () => { try { return Number(localStorage.getItem(KEY) || 0) > Date.now() } catch { return false } }

/** Invita a agregar VINKA a la pantalla de inicio. En Android instala con un toque; en iPhone muestra los pasos. */
export function InstallBanner({ always = false }) {
  const [, force] = useState(0)
  const [hidden, setHidden] = useState(() => !always && dismissed())
  const [help, setHelp] = useState(false)
  useEffect(() => onInstallChange(() => force((n) => n + 1)), [])
  if (isStandalone()) return always ? <p className="text-sm text-[#134A2B]">VINKA ya está instalada en este teléfono.</p> : null
  const ios = isIOS()
  if (hidden || (!ios && !canPromptInstall() && !always)) return null

  const close = () => { try { localStorage.setItem(KEY, String(Date.now() + 7 * 864e5)) } catch { /* sin almacenamiento */ } setHidden(true) }
  const install = async () => { if (ios || !canPromptInstall()) setHelp(true); else await promptInstall() }

  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl border border-rosa-borde bg-white p-3.5">
        <img src="/icon-192.png" alt="" className="h-11 w-11 rounded-xl" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold">Instala VINKA en tu celular</span>
          <span className="text-xs leading-snug text-tinta-3">Ábrela desde tu pantalla de inicio y recibe avisos de tus matches.</span>
        </div>
        <button onClick={install} className="btn-sm shrink-0 bg-rosa-accion px-3.5 text-white">Instalar</button>
        {!always && <button onClick={close} aria-label="Ahora no" className="-mr-1 flex h-9 w-7 items-center justify-center text-tinta-suave"><Svg name="x" size={16} /></button>}
      </div>
      <Sheet open={help} onClose={() => setHelp(false)} title="Agregar a pantalla de inicio">
        {ios ? (
          <ol className="flex flex-col gap-4 text-[15px] leading-relaxed">
            <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rosa-palido font-bold text-rosa-oscuro">1</span>
              <span>Abre <b>vinka-alpha.vercel.app</b> en <b>Safari</b>.</span></li>
            <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rosa-palido font-bold text-rosa-oscuro">2</span>
              <span>Toca el botón <b>Compartir</b>
                <svg aria-label="ícono compartir" className="mx-1 inline align-[-3px]" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F6FB2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 12v8h14v-8" /></svg>
                (abajo al centro, o arriba a la derecha en iPad).</span></li>
            <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rosa-palido font-bold text-rosa-oscuro">3</span>
              <span>Desliza hacia abajo y elige <b>Agregar a pantalla de inicio</b>. Luego toca <b>Agregar</b>.</span></li>
            <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rosa-palido font-bold text-rosa-oscuro">4</span>
              <span>Abre VINKA desde el nuevo ícono y activa las notificaciones en <b>Avisos</b>.</span></li>
          </ol>
        ) : (
          <ol className="flex list-decimal flex-col gap-3 pl-5 text-[15px] leading-relaxed">
            <li>Abre el menú del navegador (los tres puntos ⋮ arriba a la derecha).</li>
            <li>Elige <b>Instalar aplicación</b> o <b>Agregar a pantalla principal</b>.</li>
            <li>Abre VINKA desde el nuevo ícono.</li>
          </ol>
        )}
      </Sheet>
    </>
  )
}
