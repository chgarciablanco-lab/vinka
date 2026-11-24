// Direcciones propias de cada portada: al entrar sin sesión a la raíz de cada una se muestra su portada.
// La dirección principal (vinka-alpha.vercel.app) sigue mostrando la portada de siempre.
export const HOST_LANDING = { 'vinka-empleo.vercel.app': 'empleo', 'vinka-ats.vercel.app': 'ats' }
export const hostLanding = (host = typeof window !== 'undefined' ? window.location.hostname : '') => HOST_LANDING[host] || null
