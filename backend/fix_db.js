const path = require('path');
const fs = require('fs');

// Buscar database.sqlite
function findDB(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.name === 'node_modules' || item.name === '.git') continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      const found = findDB(full);
      if (found) return found;
    } else if (item.name === 'database.sqlite') {
      return full;
    }
  }
  return null;
}

const dbPath = findDB('.');
if (!dbPath) {
  console.error('ERROR: No encontré database.sqlite. Corré desde la carpeta sas-comercialOS/');
  process.exit(1);
}
console.log('DB encontrada:', dbPath);

const Database = require('better-sqlite3');
const db = new Database(dbPath);

function toArg(s) {
  if (!s) return null;
  s = String(s);
  if (s.includes('T') || s.endsWith('Z') || s.includes('+')) {
    const d = new Date(s);
    const offset = -3 * 60;
    const local = new Date(d.getTime() + offset * 60 * 1000);
    return local.toISOString().replace('T', ' ').substring(0, 19);
  }
  return s;
}

const cajas = db.prepare('SELECT id, opened_at, closed_at, sucursal_id FROM caja').all();

for (const c of cajas) {
  const newOpen = toArg(c.opened_at);
  const newClose = toArg(c.closed_at);
  const hasta = newClose || (() => {
    const d = new Date();
    const local = new Date(d.getTime() + (-3 * 60) * 60 * 1000);
    return local.toISOString().replace('T', ' ').substring(0, 19);
  })();

  const r = db.prepare(
    `SELECT COALESCE(SUM(total),0) as t FROM sales 
     WHERE created_at >= ? AND created_at <= ? AND sucursal_id = ?`
  ).get(newOpen, hasta, c.sucursal_id || 1);

  const total = r ? r.t : 0;

  db.prepare('UPDATE caja SET opened_at=?, closed_at=?, total_sales=? WHERE id=?')
    .run(newOpen, newClose, total, c.id);

  console.log(`Caja #${c.id}: ${c.opened_at} -> ${newOpen} | ventas: $${total.toLocaleString('es-AR')}`);
}

console.log('\n✅ Listo! Recargá el navegador.');
