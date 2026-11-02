// tests/helpers.js
// Levanta el sistema REAL en un puerto libre con una base de datos TEMPORAL
// (variable DB_PATH). Nunca toca la base de datos verdadera.
const { spawn } = require('child_process');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const net  = require('net');

const BACKEND = path.join(__dirname, '..');

function puertoLibre() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on('error', reject);
  });
}

const esperar = ms => new Promise(r => setTimeout(r, ms));

async function iniciarServidor() {
  const dbPath = path.join(os.tmpdir(), `axsoft-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
  const port = await puertoLibre();
  const proc = spawn(process.execPath, ['src/app.js'], {
    cwd: BACKEND,
    env: { ...process.env, DB_PATH: dbPath, PORT: String(port), SESSION_SECRET: 'test', NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', d => { log += d; });
  proc.stderr.on('data', d => { log += d; });

  const base = `http://127.0.0.1:${port}`;
  let listo = false;
  for (let i = 0; i < 80 && !listo; i++) {
    try { const r = await fetch(base + '/login'); if (r.status < 500) listo = true; } catch (_) {}
    if (!listo) await esperar(250);
  }
  if (!listo) { proc.kill(); throw new Error('El servidor de prueba no arrancó:\n' + log.slice(-1500)); }

  // Abrimos la MISMA base temporal para preparar datos y leer resultados
  const Database = require('better-sqlite3');
  const bcrypt   = require('bcrypt');
  const db = new Database(dbPath);
  db.prepare('UPDATE users SET password = ? WHERE username = ?').run(bcrypt.hashSync('test1234', 4), 'admin');

  // Login → cookie de sesión
  const lr = await fetch(base + '/login', {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'username=admin&password=test1234',
  });
  const cookie = (lr.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) { proc.kill(); throw new Error('No se pudo iniciar sesión en el servidor de prueba'); }

  const headers = extra => ({ Cookie: cookie, ...(extra || {}) });
  const api = {
    base, db,
    async get(url)  { const r = await fetch(base + url, { headers: headers(), redirect: 'manual' }); return r; },
    async json(url) { const r = await this.get(url); return r.json(); },
    async enviar(metodo, url, body) {
      const r = await fetch(base + url, { method: metodo, redirect: 'manual',
        headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
      let data = null; try { data = await r.json(); } catch (_) {}
      return { status: r.status, data };
    },
    post(url, body)  { return this.enviar('POST', url, body); },
    put(url, body)   { return this.enviar('PUT', url, body); },
    patch(url, body) { return this.enviar('PATCH', url, body); },
  };

  async function cerrar() {
    try { db.close(); } catch (_) {}
    proc.kill();
    await esperar(300);
    for (const f of [dbPath, dbPath + '-wal', dbPath + '-shm', dbPath + '-journal']) { try { fs.unlinkSync(f); } catch (_) {} }
  }
  return { api, cerrar };
}

module.exports = { iniciarServidor };
