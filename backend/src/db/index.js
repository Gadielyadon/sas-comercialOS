// src/db/index.js
const fs   = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath     = path.join(__dirname, 'database.sqlite');
const schemaPath = path.join(__dirname, 'schema.sql');

const db = new Database(dbPath);

// ── Optimizaciones SQLite para producción ─────────────────────
// DELETE mode: más seguro en VPS — evita corrupción si el servidor
// se reinicia abruptamente (WAL deja archivos -wal/-shm huérfanos)
db.pragma('journal_mode = DELETE');
// Sync FULL: garantiza que cada write quede en disco antes de continuar
db.pragma('synchronous = FULL');
// Cache de 8MB en memoria
db.pragma('cache_size = -8000');
// Temp tables en memoria
db.pragma('temp_store = MEMORY');
// Claves foráneas activas
db.pragma('foreign_keys = ON');

// Schema al iniciar
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
db.exec(schemaSql);

// ── Migración stock por sucursal/depósito (idempotente y no destructiva) ──
// 1) Marcar cada lugar como sucursal o depósito
try { db.exec(`ALTER TABLE sucursales ADD COLUMN tipo TEXT NOT NULL DEFAULT 'sucursal'`); } catch (_) {}
// 2) Pasar el stock actual de cada producto a su sucursal (solo crea filas faltantes; nunca pisa)
try {
  db.exec(`INSERT OR IGNORE INTO existencias (sku, sucursal_id, stock)
           SELECT sku, sucursal_id, stock FROM products`);
} catch (_) {}

// ── Helpers ────────────────────────────────────────────────────
function all(sql, params = []) {
  return db.prepare(sql).all(params);
}

function get(sql, params = []) {
  return db.prepare(sql).get(params);
}

function run(sql, params = []) {
  return db.prepare(sql).run(params);
}

module.exports = { all, get, run, db, dbPath };