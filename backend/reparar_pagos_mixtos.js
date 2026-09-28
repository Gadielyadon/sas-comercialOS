// reparar_pagos_mixtos.js
// Corrige ventas con pago mixto cuyo 2° monto (monto_mixto2) quedó guardado x100
// por un bug del POS. Por defecto solo MUESTRA lo que cambiaría (dry-run).
//
// Uso (desde la carpeta backend):
//   node reparar_pagos_mixtos.js            -> solo muestra
//   node reparar_pagos_mixtos.js --aplicar  -> hace backup y corrige
//   node reparar_pagos_mixtos.js --inferir-faltantes [--aplicar]
//        -> además completa ventas mixtas viejas que NO guardaron el 2° monto
//           (monto_mixto2 vacío): lo calcula como total - 1° monto. Solo si la venta
//           no tiene recargo. Es una estimación: revisá la lista antes de aplicar.
//
// Cambia únicamente sales.monto_mixto2 (y change_amount si quedó inflado).
// NO toca saldos de clientes ni cuenta corriente.
const path = require('path');
const fs   = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'src', 'db', 'database.sqlite');
const aplicar = process.argv.includes('--aplicar');
const db = new Database(DB_PATH);

const filas = db.prepare(`
  SELECT id, created_at, payment_method, total, cash_received, monto_mixto2, change_amount
  FROM sales
  WHERE payment_method LIKE '%+%' AND monto_mixto2 IS NOT NULL AND monto_mixto2 > total * 2
  ORDER BY id`).all();

const inferir = process.argv.includes('--inferir-faltantes');
const faltantes = inferir ? db.prepare(`
  SELECT id, created_at, payment_method, total, cash_received, monto_mixto2, change_amount, recargo_pct
  FROM sales
  WHERE payment_method LIKE '%+%' AND monto_mixto2 IS NULL AND cash_received IS NOT NULL
    AND cash_received < total AND COALESCE(recargo_pct,0) = 0
    AND COALESCE(status,'completada') != 'anulada'
  ORDER BY id`).all() : [];

if (!filas.length && !faltantes.length) { console.log('No hay ventas mixtas para corregir.'); process.exit(0); }

const cambios = filas.map(v => {
  const nuevo = Math.round((v.monto_mixto2 / 100) * 100) / 100;
  const ok = nuevo <= v.total * 2;                       // /100 tiene sentido
  const m2 = ok ? nuevo : Math.max(0, Math.round((v.total - (v.cash_received || 0)) * 100) / 100);
  const chg = (v.change_amount || 0) > v.total ? 0 : v.change_amount;
  return { ...v, nuevo_m2: m2, nuevo_change: chg, metodo: ok ? '÷100' : 'total - 1°monto' };
});

console.log(`Ventas afectadas: ${cambios.length}\n`);
cambios.forEach(c => console.log(
  `#${c.id}  ${c.created_at}  ${c.payment_method}  total=${c.total}  1°=${c.cash_received}  ` +
  `2°: ${c.monto_mixto2} -> ${c.nuevo_m2}  (${c.metodo})  vuelto: ${c.change_amount} -> ${c.nuevo_change}`));

const completar = faltantes.map(v => ({ ...v, nuevo_m2: Math.round((v.total - v.cash_received) * 100) / 100 }));
if (completar.length) {
  console.log(`\nVentas mixtas viejas sin 2° monto (se completaría como total - 1°): ${completar.length}`);
  completar.forEach(c => console.log(`#${c.id}  ${c.created_at}  ${c.payment_method}  total=${c.total}  1°=${c.cash_received}  2°: vacío -> ${c.nuevo_m2}`));
}

if (!aplicar) { console.log('\n(dry-run) No se modificó nada. Ejecutá con --aplicar para corregir.'); process.exit(0); }

const backup = DB_PATH.replace('.sqlite', `.backup-mixtos-${Date.now()}.sqlite`);
fs.copyFileSync(DB_PATH, backup);
console.log('\nBackup creado:', backup);

const upd = db.prepare(`UPDATE sales SET monto_mixto2 = ?, change_amount = ? WHERE id = ?`);
const upd2 = db.prepare(`UPDATE sales SET monto_mixto2 = ? WHERE id = ?`);
db.transaction(() => {
  cambios.forEach(c => upd.run(c.nuevo_m2, c.nuevo_change, c.id));
  completar.forEach(c => upd2.run(c.nuevo_m2, c.id));
})();
console.log('Listo: ventas corregidas.');
