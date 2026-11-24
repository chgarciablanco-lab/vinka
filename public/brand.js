// Ícono y nombre propios de cada portada al agregarla a la pantalla de inicio (vinka-empleo y vinka-ats).
// La dirección principal mantiene el ícono de siempre. (Archivo aparte: la política de seguridad no permite código en línea.)
;(function () {
  try {
    var h = location.hostname
    var k = h === 'vinka-ats.vercel.app' ? 'ats' : h === 'vinka-empleo.vercel.app' ? 'empleo' : null
    if (!k) return
    var name = k === 'ats' ? 'VINKA ATS' : 'VINKA Empleo'
    var set = function (sel, attr, val) { var e = document.querySelector(sel); if (e) e.setAttribute(attr, val) }
    set('link[rel="apple-touch-icon"]', 'href', '/icons/' + k + '-180.png')
    set('link[rel="icon"]', 'href', '/icons/' + k + '.svg')
    set('link[rel="manifest"]', 'href', '/manifest-' + k + '.webmanifest')
    set('meta[name="apple-mobile-web-app-title"]', 'content', name)
    document.title = name
  } catch (e) {}
})()
