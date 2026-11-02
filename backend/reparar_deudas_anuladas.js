// reparar_deudas_anuladas.js
// Revierte la deuda de clientes por ventas FIADAS que ya estaban ANULADAS antes de que
// el sistema revirtiera la deuda automáticamente. Por defecto solo MUESTRA (dry-run).
//
// Uso (desde la carpeta backend):
//   node reparar_deudas_anuladas.js            -> solo muestra qué haría
//   node reparar_deudas_anuladas.js --aplicar  -> hace backup y repara
//
// Por cada venta anulada con deuda colgada: baja el saldo del cliente por ese importe y deja un
// movimiento "Anulación venta #N — deuda revertida". No borra nada.
const path = require('path');
const fs   = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'src', 'db', 'database.sqlite');
const aplicar = process.argv.includes('--aplicar');
const db = new Database(DB_PATH);

const filas = db.prepare(`
  SELECT s.id AS sale_id, s.created_at, s.total, cc.cliente_id, cc.monto, c.nombre, c.saldo
  FROM sales s
  JOIN cuenta_corriente cc ON cc.sale_id = s.id AND cc.tipo = 'cargo'
  LEFT JOIN clientes c ON c.id = cc.cliente_id
  WHERE s.status = 'anulada'
    AND NOT EXISTS (SELECT 1 FROM cuenta_corriente x WHERE x.sale_id = s.id AND x.tipo = 'pago')
  ORDER BY s.id`).all();

if (!filas.length) { console.log('No hay ventas anuladas con deuda colgada. Nada para reparar.'); process.exit(0); }

console.log(`Ventas anuladas con deuda colgada: ${filas.length}\n`);
const porCliente = {};
filas.forEach(f => {
  console.log(`#${f.sale_id}  ${f.created_at}  cliente: ${f.nombre || f.cliente_id}  deuda a revertir: $${f.monto}`);
  porCliente[f.cliente_id] = (porCliente[f.cliente_id] || 0) + f.monto;
});
console.log('\nEfecto en los saldos:');
Object.entries(porCliente).forEach(([id, m]) => {
  const c = db.prepare('SELECT nombre, saldo FROM clientes WHERE id = ?').get(id);
  console.log(`  ${c ? c.nombre : id}: ${c ? c.saldo : '?'} -> ${c ? Math.round((c.saldo - m) * 100) / 100 : '?'}`);
});

if (!aplicar) { console.log('\n(dry-run) No se modificó nada. Ejecutá con --aplicar para reparar.'); process.exit(0); }

const backup = DB_PATH.replace('.sqlite', `.backup-deudas-${Date.now()}.sqlite`);
fs.copyFileSync(DB_PATH, backup);
console.log('\nBackup creado:', backup);

const getSaldo = db.prepare('SELECT saldo FROM clientes WHERE id = ?');
const setSaldo = db.prepare('UPDATE clientes SET saldo = ? WHERE id = ?');
const insCC = db.prepare(`INSERT INTO cuenta_corriente (cliente_id, tipo, monto, descripcion, sale_id) VALUES (?, 'pago', ?, ?, ?)`);
let tieneMetodo = true;
try { db.prepare('SELECT metodo FROM clientes_movimientos LIMIT 1').get(); } catch (_) { tieneMetodo = false; }
const insMov = db.prepare(tieneMetodo
  ? `INSERT INTO clientes_movimientos (cliente_id, tipo, monto, descripcion, sale_id, saldo_post, metodo) VALUES (?, 'pago', ?, ?, ?, ?, 'anulacion')`
  : `INSERT INTO clientes_movimientos (cliente_id, tipo, monto, descripcion, sale_id, saldo_post) VALUES (?, 'pago', ?, ?, ?, ?)`);

db.transaction(() => {
  filas.forEach(f => {
    const cli = getSaldo.get(f.cliente_id); if (!cli) return;
    const nuevo = Math.round((cli.saldo - f.monto) * 100) / 100;
    const desc = `Anulación venta #${f.sale_id} — deuda revertida`;
    setSaldo.run(nuevo, f.cliente_id);
    insCC.run(f.cliente_id, f.monto, desc, f.sale_id);
    insMov.run(f.cliente_id, f.monto, desc, f.sale_id, nuevo);
  });
})();
console.log('Listo: deudas revertidas.');
