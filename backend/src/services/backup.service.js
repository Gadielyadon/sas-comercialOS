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

const BACKUPS_DIR = path.join(__dirname, '..', 'db', 'backups');

function ensureDir() {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

function nombreArchivo(prefijo = 'backup') {
  const ahora = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fecha = `${ahora.getFullYear()}-${pad(ahora.getMonth()+1)}-${pad(ahora.getDate())}`;
  const hora  = `${pad(ahora.getHours())}${pad(ahora.getMinutes())}${pad(ahora.getSeconds())}`;
  return `${prefijo}_${fecha}_${hora}.sqlite`;
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
};
