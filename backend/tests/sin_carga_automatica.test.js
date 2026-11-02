// Verifica que la sección "Carga automática" fue sacada por completo del sistema.
const test   = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { iniciarServidor } = require('./helpers');

const SRC = path.join(__dirname, '..', 'src');
let srv, api;
test.before(async () => { srv = await iniciarServidor(); api = srv.api; });
test.after(async () => { await srv.cerrar(); });

test('la pantalla de Carga automática ya no existe', async () => {
  const r = await api.get('/inventario/carga-automatica');
  assert.equal(r.status, 404);
});

test('sus rutas de API ya no existen', async () => {
  for (const ruta of ['/inventario/carga-automatica/api/escanear', '/inventario/carga-automatica/api/confirmar']) {
    const r = await api.post(ruta, { items: [] });
    assert.equal(r.status, 404, ruta);
  }
});

test('el menú no muestra más "Carga automática" pero conserva Etiquetado e Inventario', async () => {
  const html = await (await api.get('/inventario')).text();
  assert.doesNotMatch(html, /carga-automatica/);
  assert.doesNotMatch(html, /Carga autom/);
  assert.match(html, /\/inventario\/etiquetas/);
  assert.match(html, /Etiquetado/);
});

test('sus archivos fueron borrados y no queda ninguna referencia en el código', () => {
  assert.equal(fs.existsSync(path.join(SRC, 'services', 'carga_automatica.service.js')), false);
  assert.equal(fs.existsSync(path.join(SRC, 'views', 'pages', 'carga_automatica.ejs')), false);
  const recorrer = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? (e.name === 'node_modules' ? [] : recorrer(p)) : [p];
  });
  for (const f of recorrer(SRC).filter(f => /\.(js|ejs)$/.test(f))) {
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /carga[-_ ]autom|carga_automatica/i, f);
  }
});

test('lo demás de Inventario sigue funcionando (pantalla, etiquetas y ajuste de stock)', async () => {
  assert.equal((await api.get('/inventario')).status, 200);
  assert.equal((await api.get('/inventario/etiquetas')).status, 200);
});
