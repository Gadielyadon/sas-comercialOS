// src/services/backup_crypto.js
// Cifrado de las copias de seguridad que se suben a Google Drive.
//
// Formato de un archivo .axbk:
//     "AXBK1" (5 bytes) · IV (12 bytes) · datos comprimidos (gzip) y cifrados con AES-256-GCM · etiqueta de autenticación (16 bytes)
// Si alguien modifica el archivo, o la clave no es la correcta, el descifrado falla (no entrega datos corruptos).
//
// Este módulo NO depende de la base de datos: lo usan también las herramientas de restauración
// (tools/restaurar-backup.js) que se corren fuera del sistema.
const fs     = require('fs');
const zlib   = require('zlib');
const crypto = require('crypto');
const { Transform } = require('stream');
const { pipeline }  = require('stream/promises');

const MAGIC   = Buffer.from('AXBK1');
const IV_LEN  = 12;
const TAG_LEN = 16;

// La clave de cada cliente se deriva de una clave maestra (que solo tenés vos) y del nombre del cliente.
// Así no hace falta guardar una clave por cliente: si se pierde un servidor, la volvés a calcular.
function derivarClave(maestra, cliente) {
  if (!maestra || !cliente) throw new Error('Faltan la clave maestra o el nombre del cliente');
  return crypto.createHmac('sha256', String(maestra))
    .update('axsoft-backup-v1|' + String(cliente).trim().toLowerCase())
    .digest('hex');
}

function claveBuffer(claveHex) {
  if (!/^[0-9a-fA-F]{64}$/.test(String(claveHex || ''))) {
    throw new Error('La clave de cifrado debe tener 64 caracteres hexadecimales');
  }
  return Buffer.from(claveHex, 'hex');
}

async function cifrarArchivo(origen, destino, claveHex) {
  const key = claveBuffer(claveHex);
  const iv  = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(MAGIC);
  await fs.promises.writeFile(destino, Buffer.concat([MAGIC, iv]));
  const cifrar = new Transform({
    transform(chunk, _enc, cb) { try { cb(null, cipher.update(chunk)); } catch (e) { cb(e); } },
    flush(cb) {
      try { this.push(cipher.final()); this.push(cipher.getAuthTag()); cb(); } catch (e) { cb(e); }
    },
  });
  try {
    await pipeline(fs.createReadStream(origen), zlib.createGzip(), cifrar, fs.createWriteStream(destino, { flags: 'a' }));
  } catch (e) {
    try { fs.unlinkSync(destino); } catch (_) {}
    throw e;
  }
}

async function descifrarArchivo(origen, destino, claveHex) {
  const key = claveBuffer(claveHex);
  const stat = await fs.promises.stat(origen);
  if (stat.size < MAGIC.length + IV_LEN + TAG_LEN) throw new Error('El archivo es demasiado chico: no es una copia válida');

  const fd = await fs.promises.open(origen, 'r');
  let header, tag;
  try {
    header = Buffer.alloc(MAGIC.length + IV_LEN);
    await fd.read(header, 0, header.length, 0);
    tag = Buffer.alloc(TAG_LEN);
    await fd.read(tag, 0, TAG_LEN, stat.size - TAG_LEN);
  } finally { await fd.close(); }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('No es una copia de seguridad de AxSoft (formato desconocido)');

  const iv = header.subarray(MAGIC.length);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  const descifrar = new Transform({
    transform(chunk, _enc, cb) { try { cb(null, decipher.update(chunk)); } catch (e) { cb(e); } },
    flush(cb) {
      try { this.push(decipher.final()); cb(); }
      catch (_) { cb(new Error('La clave no es correcta o el archivo fue modificado/está dañado')); }
    },
  });
  try {
    await pipeline(
      fs.createReadStream(origen, { start: header.length, end: stat.size - TAG_LEN - 1 }),
      descifrar, zlib.createGunzip(), fs.createWriteStream(destino));
  } catch (e) {
    try { fs.unlinkSync(destino); } catch (_) {}
    // Con una clave equivocada el error puede salir de la descompresión, antes de la verificación final
    if (!/La clave no es correcta/.test(e.message) && /header check|invalid|unexpected end|incorrect|bad|corrupt/i.test(e.message)) {
      throw new Error('La clave no es correcta o el archivo fue modificado/está dañado');
    }
    throw e;
  }
}

module.exports = { derivarClave, cifrarArchivo, descifrarArchivo, MAGIC };
