#!/usr/bin/env node
// Descifra una copia de seguridad (.axbk) bajada de Google Drive y deja lista la base de datos.
//
//   node tools/restaurar-backup.js <copia.axbk> <salida.sqlite> --clave <64 caracteres>
//   node tools/restaurar-backup.js <copia.axbk> <salida.sqlite> --maestra <CLAVE_MAESTRA> --cliente <nombre>
//
// NO pisa nada por sí solo: genera un archivo .sqlite que después reemplazás a mano (pasos al final).
const fs = require('fs');
const { derivarClave, descifrarArchivo } = require('../src/services/backup_crypto');

function arg(nombre) { const i = process.argv.indexOf(nombre); return i > 0 ? process.argv[i + 1] : null; }
const [, , origen, destino] = process.argv;
let clave = arg('--clave');
if (!clave && arg('--maestra') && arg('--cliente')) clave = derivarClave(arg('--maestra'), arg('--cliente'));

if (!origen || !destino || !clave) {
  console.error('Uso:\n  node tools/restaurar-backup.js <copia.axbk> <salida.sqlite> --clave <clave>\n  node tools/restaurar-backup.js <copia.axbk> <salida.sqlite> --maestra <maestra> --cliente <nombre>');
  process.exit(1);
}
if (fs.existsSync(destino)) { console.error(`✗ ${destino} ya existe. Elegí otro nombre para no pisar nada.`); process.exit(1); }

(async () => {
  try {
    await descifrarArchivo(origen, destino, clave);
  } catch (e) { console.error('✗ ' + e.message); process.exit(1); }

  const cab = Buffer.alloc(15); const fd = fs.openSync(destino, 'r'); fs.readSync(fd, cab, 0, 15, 0); fs.closeSync(fd);
  if (cab.toString('latin1') !== 'SQLite format 3') { console.error('✗ El archivo descifrado no es una base SQLite.'); process.exit(1); }
  console.log(`✓ Copia descifrada: ${destino} (${(fs.statSync(destino).size / 1048576).toFixed(1)} MB)`);

  try {
    const Database = require('better-sqlite3');
    const d = new Database(destino, { readonly: true });
    const ok = d.pragma('integrity_check').map(r => Object.values(r)[0]).join('') === 'ok';
    const ventas = (() => { try { return d.prepare('SELECT COUNT(*) n FROM sales').get().n; } catch (_) { return null; } })();
    d.close();
    console.log(ok ? '✓ Integridad de la base: correcta' : '✗ La base tiene errores de integridad');
    if (ventas != null) console.log(`  Ventas registradas en esta copia: ${ventas}`);
  } catch (_) { console.log('  (No se verificó la integridad: better-sqlite3 no está instalado en esta PC.)'); }

  console.log(`
Para RESTAURAR en el servidor (con el sistema detenido):
  1. pm2 stop comercialos
  2. cp backend/src/db/database.sqlite backend/src/db/database.ANTES-DE-RESTAURAR.sqlite   (por las dudas)
  3. Copiá ${destino} como backend/src/db/database.sqlite
  4. pm2 start comercialos
Las ventas hechas DESPUÉS de la hora de esta copia no están incluidas.`);
})();
