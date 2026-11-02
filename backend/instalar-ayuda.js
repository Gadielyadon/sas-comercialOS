#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════
   Instalador del Asistente de ayuda — AxSoft
   ────────────────────────────────────────────────────────────────
   Uso (parado en la carpeta "backend" de tu sistema):
       node instalar-ayuda.js

   Qué hace (es seguro correrlo más de una vez):
     1) Verifica que estén los archivos del asistente.
     2) Agrega 2 líneas al final de src/views/partials/scripts.ejs
     3) Agrega el registro de la ruta de ayuda en src/app.js
   Antes de tocar cada archivo guarda una copia: archivo.bak-ayuda
   ════════════════════════════════════════════════════════════════ */
const fs   = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const f = (...p) => path.join(SRC, ...p);

const REQUERIDOS = [
  f('public', 'js', 'ayuda-base.js'),
  f('public', 'js', 'ayuda-bot.js'),
  f('routes', 'ayuda.routes.js'),
  f('views', 'partials', 'scripts.ejs'),
  f('app.js'),
];

let faltan = REQUERIDOS.filter(p => !fs.existsSync(p));
if (faltan.length) {
  console.error('\n❌ Faltan archivos. ¿Copiaste la carpeta "backend" del asistente sobre la tuya?\n');
  faltan.forEach(p => console.error('   - ' + path.relative(__dirname, p)));
  console.error('\nEjecutá este instalador desde la carpeta backend de tu sistema.\n');
  process.exit(1);
}

function leer(p) { return fs.readFileSync(p, 'utf8'); }
function backup(p) {
  const b = p + '.bak-ayuda';
  if (!fs.existsSync(b)) fs.copyFileSync(p, b);
}
function eolDe(txt) { return txt.indexOf('\r\n') > -1 ? '\r\n' : '\n'; }

/* ── 1) scripts.ejs ─────────────────────────────────────────── */
(function () {
  const p = f('views', 'partials', 'scripts.ejs');
  let txt = leer(p);
  if (txt.indexOf('ayuda-bot.js') > -1) {
    console.log('✔ scripts.ejs ya tenía el asistente (no se toca).');
    return;
  }
  backup(p);
  const eol = eolDe(txt);
  const ver = "<%= typeof ayudaVersion !== 'undefined' ? ayudaVersion : '1' %>";
  const bloque = [
    '',
    '<!-- Asistente de ayuda (chat flotante) · ver public/js/ayuda-base.js para editar las respuestas -->',
    '<script src="/js/ayuda-base.js?v=' + ver + '"></script>',
    '<script src="/js/ayuda-bot.js?v=' + ver + '"></script>',
    ''
  ].join(eol);
  fs.writeFileSync(p, txt.replace(/\s*$/, '') + eol + bloque);
  console.log('✔ scripts.ejs actualizado.');
})();

/* ── 2) app.js ──────────────────────────────────────────────── */
(function () {
  const p = f('app.js');
  let txt = leer(p);
  if (txt.indexOf('ayuda.routes') > -1) {
    console.log('✔ app.js ya tenía la ruta de ayuda (no se toca).');
    return;
  }
  const eol = eolDe(txt);
  const ancla = '// Main (dashboard, ventas, inventario, sucursales)';
  const i = txt.indexOf(ancla);
  if (i === -1) {
    console.log('⚠ No encontré el lugar en app.js. Agregá a mano, ANTES de "const mainRoutes = ...":');
    console.log("    app.use('/api/ayuda', require('./routes/ayuda.routes'));");
    return;
  }
  backup(p);
  const bloque = [
    '// Asistente de ayuda — registra preguntas que no supo responder',
    'try {',
    "  const _fs = require('fs');",
    "  // Versión para el caché del navegador: cambia sola cuando editás ayuda-base.js (al reiniciar el sistema)",
    '  app.locals.ayudaVersion = Math.floor(Math.max(',
    "    _fs.statSync(path.join(__dirname, 'public', 'js', 'ayuda-base.js')).mtimeMs,",
    "    _fs.statSync(path.join(__dirname, 'public', 'js', 'ayuda-bot.js')).mtimeMs",
    '  ));',
    "  app.use('/api/ayuda', require('./routes/ayuda.routes'));",
    "  console.log('✅  Asistente de ayuda OK');",
    "} catch(e) { console.log('⚠️   ayuda.routes error:', e.message); }",
    '',
    ''
  ].join(eol);
  fs.writeFileSync(p, txt.slice(0, i) + bloque + txt.slice(i));
  console.log('✔ app.js actualizado.');
})();

console.log('\n✅ Listo. Reiniciá el sistema (pm2 restart NOMBRE  o  npm start) y probalo:');
console.log('   vas a ver el botón "Ayuda" abajo a la derecha en todas las pantallas.\n');
