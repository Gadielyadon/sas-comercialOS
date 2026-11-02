// src/routes/ayuda.routes.js
// Guarda las preguntas que el asistente de ayuda NO supo responder (o que el usuario
// marcó como "no me sirvió"), para que el administrador sepa qué agregar a la ayuda.
//
//   POST /api/ayuda/log         → lo usa el widget (cualquier usuario con sesión)
//   GET  /api/ayuda/pendientes  → lista agrupada de preguntas más repetidas (solo admin)
//   POST /api/ayuda/resolver    → marca una pregunta como ya resuelta (solo admin)

const express = require('express');
const router  = express.Router();
const { all, run } = require('../db');

let _listo = false;
function asegurarTabla() {
  if (_listo) return;
  run(`
    CREATE TABLE IF NOT EXISTS ayuda_sin_respuesta (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      pregunta   TEXT NOT NULL,
      resultado  TEXT NOT NULL DEFAULT 'sin_respuesta',
      entrada_id TEXT,
      modulo     TEXT,
      pantalla   TEXT,
      usuario_id INTEGER,
      resuelta   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);
  _listo = true;
}

function esAdmin(req) {
  const r = String(req.session?.user?.role || '').trim().toLowerCase();
  return r === 'admin' || r === 'administrador';
}

const limpiar = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

/* Registrar (el widget lo llama solo cuando no supo responder / el usuario marca 👎) */
router.post('/log', (req, res) => {
  try {
    asegurarTabla();
    const pregunta = limpiar(req.body.pregunta, 200);
    if (!pregunta) return res.json({ ok: true });
    const resultado = req.body.resultado === 'no_sirvio' ? 'no_sirvio' : 'sin_respuesta';

    // Freno simple contra spam: máx. 30 registros por usuario por hora
    const uid = req.session?.user?.id || null;
    const recientes = all(
      `SELECT COUNT(*) n FROM ayuda_sin_respuesta WHERE usuario_id IS ? AND created_at >= datetime('now','localtime','-1 hour')`,
      [uid]
    )[0]?.n || 0;
    if (recientes >= 30) return res.json({ ok: true });

    run(
      `INSERT INTO ayuda_sin_respuesta (pregunta, resultado, entrada_id, modulo, pantalla, usuario_id)
       VALUES (?,?,?,?,?,?)`,
      [pregunta, resultado, limpiar(req.body.entrada_id, 60) || null,
       limpiar(req.body.modulo, 40) || null, limpiar(req.body.pantalla, 120) || null, uid]
    );
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });   // el chat nunca debe romperle nada al usuario
  }
});

/* Ver qué preguntan más y no se pudo responder (admin).
   Se abre desde el navegador: /api/ayuda/pendientes */
router.get('/pendientes', (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ error: 'Acceso denegado' });
  try {
    asegurarTabla();
    const filas = all(`
      SELECT pregunta, resultado, modulo, COUNT(*) veces, MAX(created_at) ultima
      FROM ayuda_sin_respuesta
      WHERE resuelta = 0
      GROUP BY lower(pregunta), resultado
      ORDER BY veces DESC, ultima DESC
      LIMIT 200
    `);
    res.json({ total: filas.length, pendientes: filas });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo leer' });
  }
});

/* Marcar como resuelta una pregunta (después de agregarla a ayuda-base.js) */
router.post('/resolver', (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ error: 'Acceso denegado' });
  try {
    asegurarTabla();
    run(`UPDATE ayuda_sin_respuesta SET resuelta = 1 WHERE lower(pregunta) = lower(?)`, [limpiar(req.body.pregunta, 200)]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo actualizar' });
  }
});

module.exports = router;
