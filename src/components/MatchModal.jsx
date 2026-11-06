import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'

/** Pantalla de celebración cuando hay interés mutuo en una vacante. */
export function MatchModal({ match, onClose }) {
  useEffect(() => {
    if (!match) return
    if (navigator.vibrate) navigator.vibrate([20, 60, 30])
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [match, onClose])

  const pieces = useMemo(() => Array.from({ length: 36 }, (_, i) => ({
    left: (i * 37) % 100, delay: (i % 12) * 0.12, dur: 2.4 + (i % 5) * 0.35, size: 6 + (i % 4) * 2,
    color: ['#E83E83', '#FF941E', '#FFFFFF', '#FFC2DD'][i % 4], rot: (i * 53) % 360, round: i % 3 === 0,
  })), [])

  if (!match) return null
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="match-title"
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-morado/95 px-6 backdrop-blur-sm">
      <style>{`
        @keyframes vk-fall { 0% { transform: translateY(-10vh) rotate(0deg); opacity: 1 } 100% { transform: translateY(110vh) rotate(540deg); opacity: .9 } }
        @keyframes vk-pop { 0% { transform: scale(.6); opacity: 0 } 60% { transform: scale(1.06); opacity: 1 } 100% { transform: scale(1) } }
        @keyframes vk-left { from { transform: translateX(-60px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes vk-right { from { transform: translateX(60px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { .vk-anim { animation: none !important } }
      `}</style>
      {pieces.map((p, i) => (
        <span key={i} aria-hidden="true" className="vk-anim pointer-events-none absolute top-0"
          style={{ left: `${p.left}%`, width: p.size, height: p.round ? p.size : p.size * 1.6, background: p.color, borderRadius: p.round ? 999 : 2,
            transform: `rotate(${p.rot}deg)`, animation: `vk-fall ${p.dur}s ${p.delay}s ease-in infinite` }} />
      ))}
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center text-center text-white">
        <span className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-[#FFC2DD]">Interés mutuo</span>
        <h2 id="match-title" className="vk-anim font-display text-[52px] font-bold leading-none" style={{ animation: 'vk-pop .6s ease-out both' }}>
          ¡Es <span className="text-rosa">match</span>!
        </h2>
        <div className="my-9 flex items-center">
          <div className="vk-anim flex h-[104px] w-[104px] items-center justify-center rounded-full border-4 border-white font-display text-3xl font-bold"
            style={{ background: match.leftColor || '#E83E83', animation: 'vk-left .5s .15s ease-out both' }}>{match.leftInitials}</div>
          <div className="vk-anim z-10 -mx-4 flex h-12 w-12 items-center justify-center rounded-full bg-naranja text-morado shadow-lg" style={{ animation: 'vk-pop .5s .45s ease-out both' }}>
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </div>
          <div className="vk-anim flex h-[104px] w-[104px] items-center justify-center rounded-full border-4 border-white font-display text-3xl font-bold"
            style={{ background: match.rightColor || '#3B5BA9', animation: 'vk-right .5s .15s ease-out both' }}>{match.rightInitials}</div>
        </div>
        <p className="text-[17px] leading-relaxed">
          Tú y <b>{match.otherName}</b> se interesaron en
        </p>
        <p className="mt-1 rounded-xl bg-white/10 px-4 py-2 font-display text-lg font-semibold">{match.jobTitle}</p>
        <p className="mt-4 text-sm leading-relaxed text-white/80">{match.note || 'Ya pueden conversar. Tus datos de contacto siguen privados hasta que decidas compartirlos.'}</p>
        <div className="mt-8 flex w-full flex-col gap-3">
          <Link to={`/chats/${match.matchId}`} className="btn bg-rosa-accion shadow-[0_8px_24px_rgba(208,46,114,0.45)]">Enviar mensaje</Link>
          <button onClick={onClose} className="h-12 w-full rounded-2xl border border-white/40 text-base font-semibold text-white">{match.continueLabel || 'Seguir explorando'}</button>
        </div>
      </div>
    </div>
  )
}
