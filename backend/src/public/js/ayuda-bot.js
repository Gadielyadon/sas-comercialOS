/* ════════════════════════════════════════════════════════════════
   AxSoft · Asistente de ayuda (chat flotante)
   ────────────────────────────────────────────────────────────────
   - Sin IA, sin costos, sin servicios externos: busca en la base
     de conocimiento (ayuda-base.js) por palabras clave.
   - Sabe en qué pantalla está el usuario y prioriza esas respuestas.
   - Guarda las preguntas que no supo responder (para que las agregues).
   - No se muestra en login, catálogo público ni pantallas de impresión.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var BASE = window.AX_AYUDA;
  if (!BASE || !document.body) return;
  // Solo con sesión iniciada (el <body> lleva data-user-role)
  if (!document.body.getAttribute('data-user-role')) return;
  if (window.__axAyudaListo) return;
  window.__axAyudaListo = true;

  /* ───────── Texto: normalizar y comparar ───────── */
  var STOP = ('a al algo ante con contra como cual cuales cuando de del desde donde e el ella ellos en entre es esta esto estoy ' +
    'fue ha hace hacer hago hay la las le les lo los me mi mis muy ni no nos o para pero por porque que quiero quisiera se si sin ' +
    'sobre su sus te tengo tiene todo tu tus un una uno unos y ya yo puedo puede podria necesito saber sirve ' +
    'donde esta estan quien quienes cuanto cuanta').split(' ');
  var STOPSET = {};
  STOP.forEach(function (w) { STOPSET[w] = 1; });

  function norm(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9ñ ]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function tokens(s) {
    return norm(s).split(' ').filter(function (t) { return t && !STOPSET[t] && (t.length > 1 || /\d/.test(t)); });
  }
  // Reductor liviano de sufijos del español: cargar / cargo / cargué → "carg",
  // facturar / factura / facturación → "factur", ventas / venta → "vent".
  var SUFIJOS = ['aciones', 'iciones', 'amiento', 'imiento', 'acion', 'icion', 'iones', 'iendo', 'ando',
    'ion', 'ado', 'ido', 'ada', 'ida', 'ar', 'er', 'ir', 'os', 'as', 'es', 'an', 'en', 'o', 'a', 'e', 'i', 's'];
  function stem(t) {
    if (t.length <= 3 || /\d/.test(t)) return t;
    for (var i = 0; i < SUFIJOS.length; i++) {
      var suf = SUFIJOS[i];
      if (t.length - suf.length >= 3 && t.slice(-suf.length) === suf) return t.slice(0, -suf.length);
    }
    return t;
  }
  function stems(s) { return tokens(s).map(stem); }
  function stripHtml(h) { return String(h || '').replace(/<[^>]*>/g, ' '); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ───────── Índice de búsqueda ───────── */
  var items = BASE.items || [];
  var indice = [];
  var df = {};

  items.forEach(function (it) {
    var kwStems = {}, kwFrases = [];
    (it.kw || []).forEach(function (k) {
      var n = norm(k);
      if (n.indexOf(' ') > -1) kwFrases.push(n);
      stems(k).forEach(function (s) { kwStems[s] = 1; });
    });
    var qStems = {};
    stems(it.q).forEach(function (s) { qStems[s] = 1; });
    var aStems = {};
    stems(stripHtml(it.a)).forEach(function (s) { aStems[s] = 1; });
    indice.push({ it: it, kwStems: kwStems, kwFrases: kwFrases, qStems: qStems, aStems: aStems });

    var vistos = {};
    [kwStems, qStems].forEach(function (m) {
      Object.keys(m).forEach(function (s) { vistos[s] = 1; });
    });
    Object.keys(vistos).forEach(function (s) { df[s] = (df[s] || 0) + 1; });
  });

  function idf(s) {
    var d = df[s] || 0;
    return Math.log((items.length + 1) / (d + 1)) + 0.5;
  }

  var UMBRAL = 7;

  function buscar(texto, modulo) {
    var qn = norm(texto);
    var qs = stems(texto);
    if (!qs.length) return [];
    var res = [];

    indice.forEach(function (e) {
      var score = 0;
      var visto = {};
      qs.forEach(function (s) {
        if (visto[s]) return;
        visto[s] = 1;
        var w = idf(s);
        // Se suman: coincidir en palabra clave, en la pregunta y (poco) en la respuesta
        if (e.kwStems[s]) score += 3 * w;
        if (e.qStems[s]) score += 2 * w;
        if (e.aStems[s]) score += 0.4 * w;
      });
      // Frases completas: pesan mucho (ej: "cerrar caja", "stock minimo")
      e.kwFrases.forEach(function (f) {
        if (qn.indexOf(f) > -1) score += 6;
      });
      if (score > 0) {
        if (modulo && e.it.modulo === modulo) score += 4;
        else if (e.it.modulo === 'general') score += 0.3;
      }
      if (score > 0) res.push({ it: e.it, score: score });
    });

    res.sort(function (a, b) { return b.score - a.score; });
    return res;
  }

  /* ───────── Contexto: en qué pantalla está ───────── */
  function moduloActual() {
    var p = location.pathname.toLowerCase();
    var rutas = BASE.rutas || [];
    for (var i = 0; i < rutas.length; i++) {
      if (p === rutas[i][0] || p.indexOf(rutas[i][0] + '/') === 0) return rutas[i][1];
    }
    return 'general';
  }
  var MODULO = moduloActual();

  function porId(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  /* ───────── Estilos (usa las variables del sistema: claro/oscuro) ───────── */
  var css = '' +
    '#axAyuda,#axAyuda *{box-sizing:border-box;font-family:var(--font-body,system-ui,sans-serif)}' +
    '#axaBtn{position:fixed;right:18px;bottom:calc(18px + env(safe-area-inset-bottom,0px));z-index:1040;height:52px;min-width:52px;padding:0 18px 0 16px;border:none;border-radius:26px;cursor:pointer;display:flex;align-items:center;gap:8px;color:#fff;font-size:15px;font-weight:700;background:linear-gradient(135deg,var(--color-primary,#1B4FD8),#6366f1);box-shadow:0 8px 24px rgba(27,79,216,.35);transition:transform .15s,box-shadow .15s}' +
    '#axaBtn:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(27,79,216,.42)}' +
    '#axaBtn i{font-size:20px;line-height:1}' +
    '#axaPanel{position:fixed;right:18px;bottom:calc(82px + env(safe-area-inset-bottom,0px));z-index:1045;width:380px;max-width:calc(100vw - 24px);height:min(560px,calc(100vh - 110px));display:none;flex-direction:column;background:var(--bg-surface,#fff);color:var(--text-primary,#111827);border:1px solid var(--border-strong,#d7dee8);border-radius:18px;box-shadow:0 24px 56px rgba(16,42,96,.22);overflow:hidden}' +
    '#axaPanel.on{display:flex;animation:axaIn .18s ease}' +
    '@keyframes axaIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}' +
    '.axa-head{display:flex;align-items:center;gap:10px;padding:13px 14px;color:#fff;background:linear-gradient(135deg,var(--color-primary,#1B4FD8),#6366f1)}' +
    '.axa-av{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}' +
    '.axa-tt{flex:1;min-width:0;line-height:1.2}.axa-tt b{display:block;font-size:15px}.axa-tt span{font-size:12px;opacity:.85}' +
    '.axa-hb{background:rgba(255,255,255,.14);border:none;color:#fff;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center}' +
    '.axa-hb:hover{background:rgba(255,255,255,.28)}' +
    '#axaMsgs{flex:1;overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:10px;background:var(--bg-surface-2,#F5F8FC);scroll-behavior:smooth}' +
    '.axa-m{max-width:88%;padding:10px 13px;border-radius:14px;font-size:14.5px;line-height:1.5;word-wrap:break-word}' +
    '.axa-m.b{align-self:flex-start;background:var(--bg-surface,#fff);border:1px solid var(--border-color,rgba(15,23,42,.07));border-bottom-left-radius:4px}' +
    '.axa-m.u{align-self:flex-end;background:var(--color-primary,#1B4FD8);color:#fff;border-bottom-right-radius:4px}' +
    '.axa-m b{font-weight:700}' +
    '.axa-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}' +
    '[data-theme="dark"] #axAyuda .axa-chip,[data-theme="dark"] #axAyuda .axa-link{color:#8fb4ff;border-color:#8fb4ff}' +
    '.axa-chip{background:var(--bg-surface,#fff);color:var(--color-primary,#1B4FD8);border:1.5px solid var(--color-primary,#1B4FD8);border-radius:16px;padding:6px 11px;font-size:13px;font-weight:600;cursor:pointer;text-align:left;line-height:1.3}' +
    '.axa-chip:hover{background:var(--bg-hover,#EEF2FF)}' +
    '.axa-link{display:inline-flex;align-items:center;gap:6px;margin-top:9px;padding:6px 12px;border-radius:9px;background:var(--bg-hover,#EEF2FF);color:var(--color-primary,#1B4FD8);font-weight:700;font-size:13.5px;text-decoration:none}' +
    '.axa-link:hover{text-decoration:underline}' +
    '.axa-fb{margin-top:9px;padding-top:8px;border-top:1px dashed var(--border-strong,#d7dee8);font-size:12.5px;color:var(--text-secondary,#4b5563);display:flex;align-items:center;gap:6px;flex-wrap:wrap}' +
    '.axa-fb button{border:1px solid var(--border-strong,#d7dee8);background:var(--bg-surface,#fff);color:var(--text-primary,#111827);border-radius:12px;padding:2px 10px;font-size:12.5px;cursor:pointer}' +
    '.axa-fb button:hover{background:var(--bg-hover,#EEF2FF)}' +
    '.axa-typing{align-self:flex-start;display:flex;gap:4px;padding:12px 14px;background:var(--bg-surface,#fff);border:1px solid var(--border-color,rgba(15,23,42,.07));border-radius:14px}' +
    '.axa-typing i{width:7px;height:7px;border-radius:50%;background:var(--text-muted,#9ca3af);animation:axaDot 1s infinite}' +
    '.axa-typing i:nth-child(2){animation-delay:.15s}.axa-typing i:nth-child(3){animation-delay:.3s}' +
    '@keyframes axaDot{0%,60%,100%{opacity:.3;transform:none}30%{opacity:1;transform:translateY(-3px)}}' +
    '.axa-foot{display:flex;gap:8px;padding:10px;border-top:1px solid var(--border-color,rgba(15,23,42,.07));background:var(--bg-surface,#fff)}' +
    '#axaInput{flex:1;min-width:0;border:1.5px solid var(--border-strong,#d7dee8);border-radius:12px;padding:10px 12px;font-size:16px;background:var(--bg-surface-2,#F5F8FC);color:var(--text-primary,#111827);outline:none}' +
    '#axaInput:focus{border-color:var(--color-primary,#1B4FD8)}' +
    '#axaSend{width:42px;border:none;border-radius:12px;background:var(--color-primary,#1B4FD8);color:#fff;cursor:pointer;font-size:17px;flex-shrink:0}' +
    '#axaSend:hover{opacity:.9}' +
    '@media (max-width:600px){#axaPanel{right:8px;left:8px;width:auto;max-width:none;bottom:calc(76px + env(safe-area-inset-bottom,0px));height:min(75vh,calc(100vh - 100px))}#axaBtn{right:12px;height:48px;padding:0 15px}#axaBtn span{display:none}}' +
    '@media print{#axAyuda{display:none!important}}';

  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  /* ───────── HTML ───────── */
  var root = document.createElement('div');
  root.id = 'axAyuda';
  root.setAttribute('aria-live', 'polite');
  root.innerHTML =
    '<button id="axaBtn" type="button" title="¿Necesitás ayuda?" aria-label="Abrir asistente de ayuda"><i class="bi bi-chat-dots-fill"></i><span>Ayuda</span></button>' +
    '<div id="axaPanel" role="dialog" aria-label="Asistente de ayuda">' +
      '<div class="axa-head">' +
        '<div class="axa-av"><i class="bi bi-robot"></i></div>' +
        '<div class="axa-tt"><b>Asistente AxSoft</b><span>Preguntame cómo se hace algo</span></div>' +
        '<button class="axa-hb" id="axaClear" type="button" title="Borrar conversación"><i class="bi bi-arrow-counterclockwise"></i></button>' +
        '<button class="axa-hb" id="axaClose" type="button" title="Cerrar"><i class="bi bi-x-lg"></i></button>' +
      '</div>' +
      '<div id="axaMsgs"></div>' +
      '<div class="axa-foot">' +
        '<input id="axaInput" type="text" maxlength="200" placeholder="Escribí tu duda…" autocomplete="off">' +
        '<button id="axaSend" type="button" title="Enviar"><i class="bi bi-send-fill"></i></button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(root);

  var $btn = root.querySelector('#axaBtn');
  var $panel = root.querySelector('#axaPanel');
  var $msgs = root.querySelector('#axaMsgs');
  var $input = root.querySelector('#axaInput');

  /* ───────── Persistencia por pestaña (sobrevive al cambiar de pantalla) ───────── */
  var KEY = 'ax_ayuda_chat';
  var hist = [];
  var abierto = false;
  function guardar() {
    try { sessionStorage.setItem(KEY, JSON.stringify({ h: hist.slice(-30), open: abierto })); } catch (e) {}
  }
  function cargar() {
    try {
      var d = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (d && Array.isArray(d.h)) { hist = d.h; abierto = !!d.open; }
    } catch (e) {}
  }

  /* ───────── Pintar mensajes ───────── */
  function scrollAbajo() { $msgs.scrollTop = $msgs.scrollHeight; }

  function pintar(m) {
    var d = document.createElement('div');
    d.className = 'axa-m ' + m.r;
    d.innerHTML = m.h;
    $msgs.appendChild(d);
    return d;
  }
  function agregar(r, html, persistir) {
    var m = { r: r, h: html };
    if (persistir !== false) { hist.push(m); guardar(); }
    var el = pintar(m);
    if (r === 'b') {
      // Respuesta del asistente: mostrar desde su primera línea (no cortarla si es larga)
      $msgs.scrollTop = el.getBoundingClientRect().top - $msgs.getBoundingClientRect().top + $msgs.scrollTop - 10;
    } else {
      scrollAbajo();
    }
    return el;
  }

  function chipsHtml(ids, extra) {
    var out = '<div class="axa-chips">';
    ids.forEach(function (id) {
      var it = porId(id);
      if (it) out += '<button type="button" class="axa-chip" data-id="' + esc(it.id) + '">' + esc(it.q) + '</button>';
    });
    out += (extra || '') + '</div>';
    return out;
  }

  /* ───────── Respuestas ───────── */
  function saludoInicial() {
    var nombreMod = BASE.nombresModulo && BASE.nombresModulo[MODULO];
    var sug = (BASE.sugeridas && BASE.sugeridas[MODULO]) || BASE.sugeridas.general || [];
    var txt = '¡Hola! 👋 Soy el asistente del sistema. Escribime tu duda con tus palabras y te explico cómo resolverla.';
    if (nombreMod && MODULO !== 'general') {
      txt += '<br><br>Veo que estás en <b>' + esc(nombreMod) + '</b>. Algunas consultas frecuentes de acá:';
    } else {
      txt += '<br><br>Algunas consultas frecuentes:';
    }
    return txt + chipsHtml(sug);
  }

  function respuestaHtml(it, relacionadas) {
    var h = it.a;
    if (it.link) h += '<br><a class="axa-link" href="' + esc(it.link[1]) + '"><i class="bi bi-box-arrow-up-right"></i> ' + esc(it.link[0]) + '</a>';
    h += '<div class="axa-fb" data-id="' + esc(it.id) + '">¿Te sirvió? <button type="button" data-fb="si">👍 Sí</button><button type="button" data-fb="no">👎 No</button></div>';
    if (relacionadas && relacionadas.length) {
      h += '<div style="margin-top:9px;font-size:12.5px;color:var(--text-secondary,#4b5563)">También podría interesarte:</div>' +
           chipsHtml(relacionadas);
    }
    return h;
  }

  function responder(texto) {
    var t = norm(texto);
    if (!t) return;

    var resultados = buscar(texto, MODULO);
    var mejor = resultados[0];

    // Saludos / agradecimientos (solo si la frase es corta y no hay una pregunta real)
    var corto = t.split(' ').length <= 3;
    if (corto && (!mejor || mejor.score < UMBRAL)) {
      if ((BASE.saludos || []).some(function (s) { return t === s || t.indexOf(s + ' ') === 0; })) {
        return agregar('b', '¡Hola! ¿En qué te puedo ayudar? Escribime tu duda o elegí una:' +
          chipsHtml((BASE.sugeridas && BASE.sugeridas[MODULO]) || BASE.sugeridas.general));
      }
      if ((BASE.gracias || []).some(function (s) { return t === s || t.indexOf(s) === 0; })) {
        return agregar('b', '¡De nada! 😊 Si surge otra duda, acá estoy.');
      }
    }

    if (mejor && mejor.score >= UMBRAL) {
      var rel = resultados.slice(1, 4)
        .filter(function (r) { return r.score >= UMBRAL * 0.6; })
        .map(function (r) { return r.it.id; });
      agregar('b', respuestaHtml(mejor.it, rel));
      return;
    }

    // No supo responder: sugiere lo de la pantalla actual y registra la pregunta
    registrar({ pregunta: texto, resultado: 'sin_respuesta' });
    var sug = (BASE.sugeridas && BASE.sugeridas[MODULO]) || BASE.sugeridas.general;
    agregar('b', 'Mmm, no encontré una respuesta clara para eso 🤔. Probá con otras palabras (por ejemplo: <i>"anular una venta"</i>, <i>"cerrar la caja"</i>).<br><br>' +
      'Ya anoté tu pregunta para que se agregue a la ayuda. Mientras tanto, consultá al administrador. Algunas opciones:' +
      chipsHtml(sug));
  }

  function conPausa(fn) {
    var t = document.createElement('div');
    t.className = 'axa-typing';
    t.innerHTML = '<i></i><i></i><i></i>';
    $msgs.appendChild(t);
    scrollAbajo();
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); fn(); }, 380);
  }

  function preguntar(texto) {
    texto = String(texto || '').trim();
    if (!texto) return;
    agregar('u', esc(texto));
    conPausa(function () { responder(texto); });
  }

  /* ───────── Registro de preguntas sin respuesta (opcional, falla en silencio) ───────── */
  function registrar(d) {
    try {
      d.modulo = MODULO;
      d.pantalla = location.pathname;
      if (!navigator.onLine) return;
      fetch('/api/ayuda/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d),
        keepalive: true
      }).catch(function () {});
    } catch (e) {}
  }

  /* ───────── Abrir / cerrar ───────── */
  function abrir() {
    abierto = true;
    $panel.classList.add('on');
    guardar();
    setTimeout(function () { $input.focus(); scrollAbajo(); }, 60);
  }
  function cerrar() {
    abierto = false;
    $panel.classList.remove('on');
    guardar();
  }
  function reiniciar() {
    hist = [];
    $msgs.innerHTML = '';
    guardar();
    agregar('b', saludoInicial());
  }

  /* ───────── Eventos ───────── */
  $btn.addEventListener('click', function () { abierto ? cerrar() : abrir(); });
  root.querySelector('#axaClose').addEventListener('click', cerrar);
  root.querySelector('#axaClear').addEventListener('click', reiniciar);
  root.querySelector('#axaSend').addEventListener('click', function () {
    var v = $input.value; $input.value = ''; preguntar(v);
  });
  $input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { var v = $input.value; $input.value = ''; preguntar(v); }
    e.stopPropagation(); // no dispara atajos del punto de venta mientras se escribe
  });
  $input.addEventListener('keyup', function (e) { e.stopPropagation(); });
  $input.addEventListener('keypress', function (e) { e.stopPropagation(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && abierto && $panel.contains(document.activeElement)) cerrar();
  });

  $msgs.addEventListener('click', function (e) {
    var chip = e.target.closest && e.target.closest('.axa-chip');
    if (chip) {
      var it = porId(chip.getAttribute('data-id'));
      if (it) {
        agregar('u', esc(it.q));
        conPausa(function () {
          var rel = (BASE.sugeridas && BASE.sugeridas[it.modulo] || []).filter(function (id) { return id !== it.id; }).slice(0, 3);
          agregar('b', respuestaHtml(it, rel));
        });
      }
      return;
    }
    var fb = e.target.closest && e.target.closest('[data-fb]');
    if (fb) {
      var box = fb.parentNode;
      var id = box.getAttribute('data-id');
      var si = fb.getAttribute('data-fb') === 'si';
      box.innerHTML = si ? '¡Genial! 🙌' : 'Gracias, lo vamos a mejorar. Probá reformular la pregunta o consultá al administrador.';
      if (!si) registrar({ pregunta: '(respuesta no sirvió)', resultado: 'no_sirvio', entrada_id: id });
      // se persiste el estado visual
      for (var i = hist.length - 1; i >= 0; i--) {
        if (hist[i].h.indexOf('data-id="' + id + '"') > -1 && hist[i].h.indexOf('data-fb') > -1) {
          hist[i].h = hist[i].h.replace(/<div class="axa-fb"[^>]*>[\s\S]*?<\/div>/, '<div class="axa-fb">' + box.innerHTML + '</div>');
          break;
        }
      }
      guardar();
    }
  });

  /* ───────── Inicio ───────── */
  cargar();
  if (hist.length) {
    hist.forEach(pintar);
    scrollAbajo();
  } else {
    agregar('b', saludoInicial());
  }
  if (abierto) { $panel.classList.add('on'); }

  // Para probar desde la consola del navegador: AxAyuda.buscar('anular venta')
  window.AxAyuda = { buscar: function (t, m) { return buscar(t, m || MODULO).slice(0, 5).map(function (r) { return [r.it.id, +r.score.toFixed(2)]; }); }, abrir: abrir };
})();
