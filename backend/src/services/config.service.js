const { all, get, run } = require('../db');

function getAll() {
  const rows = all('SELECT key, value FROM config');
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  return obj;
}

function getValue(key) {
  const row = get('SELECT value FROM config WHERE key = ?', [key]);
  return row ? row.value : null;
}

function setValue(key, value) {
  run('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}

function setMany(obj) {
  const keys = Object.keys(obj);
  for (const key of keys) {
    const val = obj[key] !== undefined && obj[key] !== null ? String(obj[key]) : '';
    setValue(key, val);
  }
}

module.exports = { getAll, getValue, setValue, setMany };
