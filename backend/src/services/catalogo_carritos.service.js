// src/services/catalogo_carritos.service.js
// Respaldo server-side del carrito de la vidriera. El carrito sigue viviendo
// en localStorage para que la UI sea instantánea, pero cada cambio también
// se guarda acá, identificado por una cookie de visitante de larga duración
// (180 días) — no por login, porque la vidriera es pública. Esto lo salva
// de perderse si el cliente borra el caché del navegador (aunque no lo
// sincroniza entre dispositivos distintos, eso ya sería requerir login).
const { get, run } = require('../db');

function initSchema() {
  run(`CREATE TABLE IF NOT EXISTS catalogo_carritos (
    visitor_id TEXT PRIMARY KEY,
    items TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);
}

function obtener(visitorId) {
  if (!visitorId) return {};
  const row = get('SELECT items FROM catalogo_carritos WHERE visitor_id = ?', [visitorId]);
  if (!row) return {};
  try { return JSON.parse(row.items) || {}; } catch (_) { return {}; }
}

function guardar(visitorId, items) {
  if (!visitorId) return;
  const json = JSON.stringify(items && typeof items === 'object' ? items : {});
  run(
    `INSERT INTO catalogo_carritos (visitor_id, items, updated_at) VALUES (?, ?, datetime('now','localtime'))
     ON CONFLICT(visitor_id) DO UPDATE SET items = excluded.items, updated_at = excluded.updated_at`,
    [visitorId, json]
  );
}

module.exports = { initSchema, obtener, guardar };
