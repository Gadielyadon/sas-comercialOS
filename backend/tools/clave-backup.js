#!/usr/bin/env node
// Calcula la clave de cifrado de las copias de un cliente a partir de tu clave maestra.
//   Uso:  node tools/clave-backup.js <CLAVE_MAESTRA> <nombre-del-cliente>
// Sirve para (1) instalar un cliente nuevo y (2) recuperar la clave si se pierde el servidor.
// La clave maestra NO va en los servidores de los clientes: guardala vos en un lugar seguro.
const { derivarClave } = require('../src/services/backup_crypto');
const [, , maestra, cliente] = process.argv;
if (!maestra || !cliente) {
  console.error('Uso: node tools/clave-backup.js <CLAVE_MAESTRA> <nombre-del-cliente>');
  process.exit(1);
}
console.log(derivarClave(maestra, cliente));
