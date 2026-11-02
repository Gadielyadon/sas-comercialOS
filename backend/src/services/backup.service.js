// src/services/backup.service.js
// Copias de seguridad de la base de datos SQLite.
//
// Usa "VACUUM INTO" — la forma segura de sacarle una foto a una base SQLite
// mientras está en uso, sin bloquearla ni arriesgar corrupción (a diferencia
// de copiar el archivo .sqlite a mano mientras el sistema puede estar
// escribiendo en él).

const fs   = require('fs');
const path = require('path');
const { db } = require('../db');

// BACKUPS_DIR es opcional (lo usan las pruebas automáticas para no tocar las copias reales).
const BACKUPS_DIR = process.env.BACKUPS_DIR || path.join(__dirname, '..', 'db', 'backups');

function ensureDir() {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// Fecha y hora de Argentina (aunque la VPS esté en otra zona horaria, como UTC)
function ahoraAR(d = new Date()) {
  const f = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(d).replace('T', ' ');
  return { fecha: f.slice(0, 10), hora: Number(f.slice(11, 13)), hhmmss: f.slice(11, 19).replace(/:/g, '') };
}

// Devuelve un nombre que NO exista todavía y que sea POSTERIOR al de cualquier copia anterior del mismo tipo
// (así la limpieza de copias viejas nunca confunde la nueva con una vieja).
// VACUUM INTO no sobrescribe: si se piden dos copias en el mismo segundo (por ejemplo, un doble clic),
// la segunda usa el segundo siguiente en vez de fallar.
function nombreArchivo(prefijo = 'backup') {
  let existentes = [];
  try { existentes = fs.readdirSync(BACKUPS_DIR).filter(f => f.startsWith(prefijo + '_')); } catch (_) {}
  for (let n = 0; n < 3600; n++) {
    const { fecha, hhmmss } = ahoraAR(new Date(Date.now() + n * 1000));
    const nombre = `${prefijo}_${fecha}_${hhmmss}.sqlite`;
    if (!existentes.some(f => f >= nombre)) return nombre;
  }
  throw new Error('No se pudo elegir un nombre libre para la copia');
}

// Crea una copia de seguridad y devuelve su info (nombre, tamaño, fecha)
function crearBackup(prefijo = 'backup') {
  ensureDir();
  const filename = nombreArchivo(prefijo);
  const fullPath = path.join(BACKUPS_DIR, filename);

  // VACUUM INTO copia la base entera a un archivo nuevo, de forma atómica
  // y consistente, sin frenar al resto del sistema mientras se genera.
  db.exec(`VACUUM INTO '${fullPath.replace(/'/g, "''")}'`);

  const stat = fs.statSync(fullPath);
  return { filename, size: stat.size, created_at: stat.mtime.toISOString() };
}

function listBackups() {
  ensureDir();
  return fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.endsWith('.sqlite'))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUPS_DIR, f));
      return { filename: f, size: stat.size, created_at: stat.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// Devuelve la ruta absoluta de un backup, validando que el nombre no se
// escape del directorio de backups (nada de "../../etc/passwd" ni similares)
function getBackupPath(filename) {
  const safe = path.basename(String(filename || ''));
  if (!safe.endsWith('.sqlite')) return null;
  const fullPath = path.join(BACKUPS_DIR, safe);
  if (!fs.existsSync(fullPath)) return null;
  return fullPath;
}

function eliminarBackup(filename) {
  const fullPath = getBackupPath(filename);
  if (!fullPath) return false;
  fs.unlinkSync(fullPath);
  return true;
}

module.exports = {
  crearBackup,
  listBackups,
  getBackupPath,
  eliminarBackup,
  BACKUPS_DIR,
  ahoraAR,
};
