// src/db/index.js
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'database.sqlite');
const schemaPath = path.join(__dirname, 'schema.sql');

const db = new Database(dbPath);

// pragma
db.pragma('foreign_keys = ON');

// ejecutar schema siempre al iniciar
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
db.exec(schemaSql);

// helpers
function all(sql, params = []) {
  return db.prepare(sql).all(params);
}

function get(sql, params = []) {
  return db.prepare(sql).get(params);
}

function run(sql, params = []) {
  return db.prepare(sql).run(params);
}

// ✅ exportamos también la instancia db
module.exports = { all, get, run, db, dbPath };