import { forwardRef, useImperativeHandle, useRef, useState } from 'react'

/**
 * Tarjeta deslizable estilo Tinder.
 * Derecha = me interesa · Izquierda = pasar · Arriba = guardar.
 * Los botones llaman a ref.current.swipe('right'|'left'|'up') y animan igual que el gesto.
 */
const THRESHOLD_X = 110
const THRESHOLD_Y = 120
const DUR = 280

export const SwipeCard = forwardRef(function SwipeCard({ children, onSwipe, behind, disabled, labels }, ref) {
  const start = useRef(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [leaving, setLeaving] = useState(null)
  const moved = useRef(false)

  const fly = (dir) => {
    if (leaving || disabled) return
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(12)
    setLeaving(dir)
    const w = typeof window !== 'undefined' ? window.innerWidth : 400
    setPos(dir === 'right' ? { x: w * 1.3, y: 40 } : dir === 'left' ? { x: -w * 1.3, y: 40 } : { x: 0, y: -900 })
    setTimeout(() => {
      onSwipe(dir)
      setLeaving(null); setPos({ x: 0, y: 0 })
    }, DUR)
  }
  useImperativeHandle(ref, () => ({ swipe: fly }))

  const down = (e) => {
    if (disabled || leaving) return
    start.current = { x: e.clientX, y: e.clientY, t: Date.now() }
    moved.current = false
  }
  const move = (e) => {
    if (!start.current) return
    const dx = e.clientX - start.current.x, dy = e.clientY - start.current.y
    if (!moved.current && Math.hypot(dx, dy) < 8) return
    if (!moved.current) { moved.current = true; setDragging(true); e.currentTarget.setPointerCapture?.(e.pointerId) }
    setPos({ x: dx, y: dy })
  }
  const up = () => {
    if (!start.current) return
    const { x, y } = pos
    const dt = Math.max(1, Date.now() - start.current.t)
    start.current = null
    setDragging(false)
    if (!moved.current) return
    const vx = x / dt, vy = y / dt
    if (x > THRESHOLD_X || (vx > 0.6 && x > 40)) fly('right')
    else if (x < -THRESHOLD_X || (vx < -0.6 && x < -40)) fly('left')
    else if (y < -THRESHOLD_Y || (vy < -0.6 && y < -50)) fly('up')
    else setPos({ x: 0, y: 0 })
  }
  // Evita que un arrastre dispare clics en botones internos de la tarjeta
  const clickCapture = (e) => { if (moved.current) { e.stopPropagation(); e.preventDefault(); moved.current = false } }

  const like = Math.min(1, Math.max(0, pos.x / THRESHOLD_X))
  const nope = Math.min(1, Math.max(0, -pos.x / THRESHOLD_X))
  const save = Math.min(1, Math.max(0, -pos.y / THRESHOLD_Y)) * (Math.abs(pos.x) < 60 ? 1 : 0)
  const progress = Math.min(1, Math.hypot(pos.x, pos.y) / 150)
  const L = { right: 'ME INTERESA', left: 'PASAR', up: 'GUARDAR', ...labels }

  return (
    <div className="relative">
      {behind && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0"
          style={{ transform: `scale(${0.94 + 0.06 * progress}) translateY(${14 - 14 * progress}px)`, opacity: 0.7 + 0.3 * progress, transition: dragging ? 'none' : `all ${DUR}ms ease` }}>
          {behind}
        </div>
      )}
      <div
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClickCapture={clickCapture}
        className="relative z-10 select-none"
        style={{
          touchAction: 'none',
          transform: `translate(${pos.x}px, ${pos.y}px) rotate(${pos.x / 18}deg)`,
          transition: dragging ? 'none' : `transform ${DUR}ms cubic-bezier(.2,.7,.3,1)`,
          cursor: dragging ? 'grabbing' : 'grab',
        }}>
        {children}
        <span aria-hidden="true" className="pointer-events-none absolute left-5 top-6 -rotate-12 rounded-xl border-[3px] border-rosa-accion bg-white/90 px-3 py-1 font-display text-xl font-bold tracking-wide text-rosa-accion" style={{ opacity: like }}>{L.right}</span>
        <span aria-hidden="true" className="pointer-events-none absolute right-5 top-6 rotate-12 rounded-xl border-[3px] border-morado bg-white/90 px-3 py-1 font-display text-xl font-bold tracking-wide text-morado" style={{ opacity: nope }}>{L.left}</span>
        <span aria-hidden="true" className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 rounded-xl border-[3px] border-[#B85F00] bg-white/90 px-3 py-1 font-display text-xl font-bold tracking-wide text-[#B85F00]" style={{ opacity: save }}>{L.up}</span>
      </div>
    </div>
  )
})

/** Botones redondos bajo la tarjeta (alternativa accesible al gesto). */
export function SwipeButtons({ onPass, onSave, onLike, disabled }) {
  return (
    <div className="flex items-center justify-center gap-5">
      <button onClick={onPass} disabled={disabled} aria-label="Pasar"
        className="flex h-[62px] w-[62px] flex-col items-center justify-center rounded-full border border-linea bg-white text-morado shadow-[0_6px_16px_rgba(48,37,56,0.12)] active:scale-95 disabled:opacity-50">
        <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <button onClick={onSave} disabled={disabled} aria-label="Guardar"
        className="flex h-[50px] w-[50px] items-center justify-center rounded-full border border-linea bg-white text-[#B85F00] shadow-[0_6px_16px_rgba(48,37,56,0.10)] active:scale-95 disabled:opacity-50">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><path d="M6 3h12v18l-6-4-6 4z" /></svg>
      </button>
      <button onClick={onLike} disabled={disabled} aria-label="Me interesa"
        className="flex h-[62px] items-center justify-center gap-2 rounded-full bg-rosa-accion px-6 font-semibold text-white shadow-[0_8px_20px_rgba(208,46,114,0.35)] active:scale-95 disabled:opacity-50">
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        Me interesa
      </button>
    </div>
  )
}

export function SwipeHint() {
  return <p className="text-center text-xs text-tinta-suave">Desliza → me interesa · ← pasar · ↑ guardar</p>
}
