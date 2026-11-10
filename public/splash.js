// Pantalla de carga de VINKA: una persona con maletín cruza la pantalla y va dejando las letras.
(function () {
  var G = {"letters": [{"d": "M72.10000000000001 -70.2 47.2 0.0H25.8L0.9 -70.2H19.1L36.5 -17.2L54.0 -70.2Z", "cx": 36.5}, {"d": "M104.3 -70.2V0.0H87.2V-70.2Z", "cx": 95.75}, {"d": "M187.5 0.0H170.4L141.8 -43.300000000000004V0.0H124.7V-70.2H141.8L170.4 -26.700000000000003V-70.2H187.5Z", "cx": 156.1}, {"d": "M248.6 0.0 225.0 -31.0V0.0H207.89999999999998V-70.2H225.0V-39.400000000000006L248.39999999999998 -70.2H268.5L241.29999999999998 -35.800000000000004L269.5 0.0Z", "cx": 236.55}, {"d": "M329.29999999999995 -12.4H303.09999999999997L298.9 0.0H281.0L306.4 -70.2H326.2L351.59999999999997 0.0H333.5ZM324.9 -25.6 316.2 -51.300000000000004 307.59999999999997 -25.6Z", "cx": 316.25}], "width": 353.1, "cap": 70.5};
  var NS = 'http://www.w3.org/2000/svg';
  var host = document.getElementById('splash');
  if (!host) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e }
  var svg = el('svg', { 'aria-hidden': 'true', style: 'position:absolute;inset:0;width:100%;height:100%;overflow:visible' }, host);

  // Medidas: el escenario es todo el ancho en teléfono; en pantallas anchas se limita y sus bordes se desvanecen
  var W = host.clientWidth || window.innerWidth, H = host.clientHeight || window.innerHeight;
  var S = Math.min(W, 820), left = (W - S) / 2;
  if (W > S) { var m = 'linear-gradient(90deg,transparent ' + left + 'px,#000 ' + (left + 90) + 'px,#000 ' + (W - left - 90) + 'px,transparent ' + (W - left) + 'px)'; svg.style.webkitMaskImage = m; svg.style.maskImage = m }
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  var h = Math.max(130, Math.min(165, S * 0.34));         // alto de la persona en px
  var k = h / 100;                                         // la persona está dibujada en 100 unidades
  var wordW = Math.min(S * 0.68, 380), fs = wordW / G.width; // escala de las letras
  var ground = H / 2 + G.cap * fs * 0.5;                   // línea del suelo = base de las letras
  var wordX = W / 2 - wordW / 2;

  // Letras
  var letters = G.letters.map(function (l) {
    var g = el('g', { opacity: 0 }, svg);
    el('path', { d: l.d, fill: '#D02E72' }, g);
    return { g: g, x: wordX + l.cx * fs, cx: l.cx, t0: null };
  });

  // Persona (dibujada mirando a la derecha, pies en y=0, cadera en y=-48)
  var far = '#6E5F72', near = '#2E2532';
  var man = el('g', {}, svg);
  var shadow = el('ellipse', { cx: 0, cy: 1.5, rx: 17, ry: 3.2, fill: '#2E2532', opacity: 0.13 }, man);
  var body = el('g', {}, man);
  function limb(color, w) {
    var top = el('g', {}, body), a = el('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: color, 'stroke-width': w, 'stroke-linecap': 'round' }, top);
    var b = el('line', { stroke: color, 'stroke-width': w, 'stroke-linecap': 'round' }, top);
    return { a: a, b: b, g: top };
  }
  var armFar = limb(far, 6.5), legFar = limb(far, 8.5);
  var footFar = el('line', { stroke: far, 'stroke-width': 7, 'stroke-linecap': 'round' }, body);
  var torso = el('path', { d: 'M0 0', fill: near }, body);
  var head = el('circle', { r: 9.5, fill: near }, body);
  var legNear = limb(near, 8.5);
  var footNear = el('line', { stroke: near, 'stroke-width': 7, 'stroke-linecap': 'round' }, body);
  var armNear = limb(near, 6.5);
  var bag = el('g', {}, body);
  el('path', { d: 'M-4 -1 v-4 a2.5 2.5 0 0 1 2.5 -2.5 h3 a2.5 2.5 0 0 1 2.5 2.5 v4', stroke: '#B85F00', 'stroke-width': 2.2, fill: 'none' }, bag);
  el('rect', { x: -12, y: -1, width: 24, height: 16, rx: 3.5, fill: '#FF941E' }, bag);
  el('line', { x1: -12, y1: 5, x2: 12, y2: 5, stroke: '#B85F00', 'stroke-width': 1.6 }, bag);

  // Ciclo de marcha: ángulo del muslo (adelante +) y flexión de rodilla, en fracción del ciclo
  var LEG = [[0, 22, 3], [.12, 17, 14], [.3, 3, 5], [.5, -15, 6], [.62, -13, 32], [.73, 3, 52], [.86, 19, 24], [1, 22, 3]];
  function cyc(tab, p, i) {
    p = ((p % 1) + 1) % 1;
    for (var j = 0; j < tab.length - 1; j++) if (p <= tab[j + 1][0]) break;
    var A = tab[j], B = tab[j + 1], u = (p - A[0]) / (B[0] - A[0]);
    var P = tab[(j - 1 + tab.length - 1) % (tab.length - 1)], N = tab[(j + 2) % (tab.length - 1)];
    var p0 = P[i], p1 = A[i], p2 = B[i], p3 = N[i]; // Catmull-Rom para movimiento suave
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
  }
  var R = Math.PI / 180, L1 = 24, L2 = 24, HIP = 48;
  function leg(p) { var a = cyc(LEG, p, 1) * R, kn = cyc(LEG, p, 2) * R;
    var kx = L1 * Math.sin(a), ky = L1 * Math.cos(a), ax = kx + L2 * Math.sin(a - kn), ay = ky + L2 * Math.cos(a - kn);
    return { kx: kx, ky: ky, ax: ax, ay: ay, foot: (a - kn) * 0.35 } }
  function setLimb(L, x0, y0, x1, y1, x2, y2) {
    L.a.setAttribute('x1', x0); L.a.setAttribute('y1', y0); L.a.setAttribute('x2', x1); L.a.setAttribute('y2', y1);
    L.b.setAttribute('x1', x1); L.b.setAttribute('y1', y1); L.b.setAttribute('x2', x2); L.b.setAttribute('y2', y2) }
  function arm(L, sx, sy, sw, el1) { var s = sw * R, e = el1 * R;
    var ex = sx + 17 * Math.sin(s), ey = sy + 17 * Math.cos(s), hx = ex + 16 * Math.sin(s + e), hy = ey + 16 * Math.cos(s + e);
    setLimb(L, sx, sy, ex, ey, hx, hy); return [hx, hy] }

  // Velocidad: sin que los pies patinen (zancada ≈ 0,75 del alto por ciclo)
  var D = 3.1 + 0.45 * Math.min(1, Math.max(0, (S - 390) / 430));  // segundos cruzando
  var x0 = left - 0.45 * h, x1 = left + S + 0.45 * h;
  var v = (x1 - x0) / D, T = 0.75 * h / v;                         // período del ciclo de marcha
  var START = 0.15, HOLD = 0.5;
  var TOTAL = START + D + HOLD;

  function easeOut(u) { return 1 - Math.pow(1 - u, 3) }

  function render(t) {
    var tw = Math.max(0, t - START), x = x0 + v * Math.min(tw, D), p = tw / T;
    var A = leg(p), B = leg(p + 0.5);
    var lift = HIP - Math.max(A.ay, B.ay);              // el pie de apoyo siempre toca el suelo
    man.setAttribute('transform', 'translate(' + x + ' ' + ground + ') scale(' + k + ')');
    shadow.setAttribute('rx', 17 - lift * 0.6);
    body.setAttribute('transform', 'translate(0 ' + (lift - HIP + 48) + ')');
    var hy = -HIP;
    setLimb(legNear, 0, hy, A.kx, hy + A.ky, A.ax, hy + A.ay);
    setLimb(legFar, 0, hy, B.kx, hy + B.ky, B.ax, hy + B.ay);
    footNear.setAttribute('x1', A.ax - 2); footNear.setAttribute('y1', hy + A.ay);
    footNear.setAttribute('x2', A.ax + 8 * Math.cos(A.foot)); footNear.setAttribute('y2', hy + A.ay - 8 * Math.sin(A.foot) * 0.6);
    footFar.setAttribute('x1', B.ax - 2); footFar.setAttribute('y1', hy + B.ay);
    footFar.setAttribute('x2', B.ax + 8 * Math.cos(B.foot)); footFar.setAttribute('y2', hy + B.ay - 8 * Math.sin(B.foot) * 0.6);
    var lean = 4, sx = Math.sin(lean * R) * 30, c = Math.cos(2 * Math.PI * p);
    torso.setAttribute('d', 'M-6.5 ' + (hy + 2) + ' Q-7 ' + (hy - 16) + ' ' + (sx - 7) + ' ' + (hy - 30) + ' Q' + sx + ' ' + (hy - 36) + ' ' + (sx + 7) + ' ' + (hy - 30) + ' Q7 ' + (hy - 14) + ' 6.5 ' + (hy + 2) + ' Z');
    head.setAttribute('cx', sx + 2.5); head.setAttribute('cy', hy - 44 + Math.sin(4 * Math.PI * p) * 0.4);
    arm(armFar, sx, hy - 28, 22 * c, -(10 + 14 * Math.max(0, c)));          // brazo libre, opuesto a la pierna
    var hand = arm(armNear, sx, hy - 28, -9 * c, -4);                       // brazo con maletín: oscila menos
    var bagSwing = -6 * Math.cos(2 * Math.PI * (p - 0.12));                 // el maletín se atrasa un poco
    bag.setAttribute('transform', 'translate(' + hand[0] + ' ' + (hand[1] + 1) + ') rotate(' + bagSwing + ')');
    // Letras: aparecen justo después de que la persona pasa frente a cada una
    letters.forEach(function (L) {
      if (L.t0 == null && x - 0.12 * h > L.x) L.t0 = t;
      if (L.t0 == null) return;
      var u = t - L.t0, o = easeOut(Math.min(1, u / 0.3));
      var rise = (1 - easeOut(Math.min(1, u / 0.5))) * 0.28 * G.cap;          // sube desde el suelo
      var bounce = 0.05 * G.cap * Math.exp(-u * 6) * Math.sin(u * 15);        // y se asienta con un leve rebote
      var sc = 0.9 + 0.1 * easeOut(Math.min(1, u / 0.4));
      L.g.setAttribute('opacity', o.toFixed(3));
      L.g.setAttribute('transform', 'translate(' + L.x + ' ' + ground + ') scale(' + (fs * sc) + ') translate(' + (-L.cx) + ' ' + (rise + bounce) + ')');
    });
  }

  window.vinkaSplash = { render: render, total: TOTAL };
  if (reduce) { letters.forEach(function (L) { L.t0 = -1 }); render(9); man.setAttribute('opacity', 0) }
  else if (!window.VINKA_SPLASH_MANUAL) {
    var t0 = null;
    (function loop(now) { if (t0 == null) t0 = now; var t = (now - t0) / 1000; render(t); if (t < TOTAL) requestAnimationFrame(loop); else { window.__vinkaSplashDone = true; window.dispatchEvent(new Event('vinka-splash-done')) } })(performance.now());
  }
})();
