// src/db/index.js
const fs   = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath     = path.join(__dirname, 'database.sqlite');
const schemaPath = path.join(__dirname, 'schema.sql');

const db = new Database(dbPath);

// ── Optimizaciones SQLite para producción ─────────────────────
// WAL: escrituras no bloquean lecturas — enorme mejora en concurrencia
db.pragma('journal_mode = WAL');
// Sync solo en checkpoints, no en cada write — más rápido sin perder durabilidad
db.pragma('synchronous = NORMAL');
// Cache de 16MB en memoria — evita leer del disco para queries frecuentes
db.pragma('cache_size = -16000');
// Temp tables en memoria
db.pragma('temp_store = MEMORY');
// mmap: acceso al archivo por memoria mapeada — más rápido en lecturas grandes
db.pragma('mmap_size = 134217728'); // 128MB
// Claves foráneas activas
db.pragma('foreign_keys = ON');

// Schema al iniciar
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
db.exec(schemaSql);

// ── Helpers — re-usan el prepare internamente pero no lo exponen ──
// Para consultas frecuentes es mejor usar db.prepare() directamente
// en el service y guardar el statement. Estos helpers son para
// consultas de una sola vez.
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
