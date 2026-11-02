// src/services/offline.service.js
// Apoyo para las operaciones hechas SIN internet (ventas, ajustes de stock):
// cada una llega con un ID único generado en el navegador. Si el envío se corta y se
// reintenta, el servidor reconoce el ID y NO la aplica dos veces.
const { get, run } = require('../db');

function ensureSchema() {
  run(`CREATE TABLE IF NOT EXISTS ops_offline (
         uuid       TEXT PRIMARY KEY,
         tipo       TEXT NOT NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
       )`);
}

// Devuelve el ID si tiene formato válido, o null (se ignora: la operación igual se aplica, sin protección)
function uuidValido(v) {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
}

function yaAplicada(uuid) {
  return !!get('SELECT 1 AS x FROM ops_offline WHERE uuid = ?', [String(uuid)]);
}

function marcarAplicada(uuid, tipo) {
  run('INSERT OR IGNORE INTO ops_offline (uuid, tipo) VALUES (?, ?)', [String(uuid), String(tipo)]);
}

module.exports = { ensureSchema, uuidValido, yaAplicada, marcarAplicada };
