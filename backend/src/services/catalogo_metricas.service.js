// src/services/catalogo_metricas.service.js
// Contador simple por día y tipo de evento. No es Google Analytics, es lo
// mínimo para responder "¿esto se está usando?" y "¿la gente llega a pedir
// o se cae en el camino?" — visitas vs agregados al carrito vs pedidos reales.
const { all, get, run } = require('../db');

function initSchema() {
  run(`CREATE TABLE IF NOT EXISTS catalogo_metricas (
    fecha TEXT NOT NULL,   -- YYYY-MM-DD
    tipo TEXT NOT NULL,    -- 'visita' | 'agregar_carrito'
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (fecha, tipo)
  )`);
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function registrar(tipo) {
  if (!['visita', 'agregar_carrito'].includes(tipo)) return;
  run(
    `INSERT INTO catalogo_metricas (fecha, tipo, count) VALUES (?, ?, 1)
     ON CONFLICT(fecha, tipo) DO UPDATE SET count = count + 1`,
    [hoy(), tipo]
  );
}

function sumaDesde(tipo, dias) {
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);
  const desdeStr = desde.toISOString().slice(0, 10);
  const r = get(`SELECT COALESCE(SUM(count),0) as total FROM catalogo_metricas WHERE tipo = ? AND fecha >= ?`, [tipo, desdeStr]);
  return r?.total || 0;
}

function resumen() {
  const visitasHoy = get(`SELECT COALESCE(count,0) as n FROM catalogo_metricas WHERE tipo='visita' AND fecha=?`, [hoy()])?.n || 0;
  const visitas7d = sumaDesde('visita', 7);
  const agregados7d = sumaDesde('agregar_carrito', 7);
  const pedidos7d = get(`SELECT COUNT(*) as n FROM catalogo_pedidos WHERE DATE(created_at) >= DATE('now','-7 days','localtime')`)?.n || 0;

  return {
    visitasHoy,
    visitas7d,
    agregados7d,
    pedidos7d,
    conversion7d: visitas7d > 0 ? Math.round((pedidos7d / visitas7d) * 1000) / 10 : null, // % con 1 decimal
  };
}

module.exports = { initSchema, registrar, resumen };
