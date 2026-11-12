import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Accesibilidad de diálogos: al abrir, el foco pasa al diálogo; Tab no se escapa de él;
 * Escape lo cierra; al cerrar, el foco vuelve al botón que lo abrió.
 * Uso: const ref = useDialogFocus(abierto, onClose); <div ref={ref} role="dialog" tabIndex={-1}>
 */
export function useDialogFocus(open, onClose) {
  const ref = useRef(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement
    const node = ref.current
    const items = () => (node ? [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement) : [])
    // Primero el campo de texto si hay uno; si no, el diálogo mismo (sin abrir el teclado del teléfono en un botón)
    const first = node?.querySelector('input:not([type=checkbox]):not([type=radio]):not([disabled]), textarea:not([disabled])')
    ;(first && !('ontouchstart' in window) ? first : node)?.focus({ preventScroll: true })

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close.current?.(); return }
      if (e.key !== 'Tab' || !node) return
      const list = items()
      if (!list.length) { e.preventDefault(); node.focus(); return }
      const a = list[0], z = list[list.length - 1]
      if (e.shiftKey && (document.activeElement === a || document.activeElement === node)) { e.preventDefault(); z.focus() }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus({ preventScroll: true })
    }
  }, [open])

  return ref
}
