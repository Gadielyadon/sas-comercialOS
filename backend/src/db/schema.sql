PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  sku               TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL,
  price             REAL NOT NULL DEFAULT 0,
  stock             INTEGER NOT NULL DEFAULT 0,
  category          TEXT,
  iva               REAL NOT NULL DEFAULT 0,
  ieps              REAL NOT NULL DEFAULT 0,
  pesable           INTEGER NOT NULL DEFAULT 0,
  hay               INTEGER NOT NULL DEFAULT 1,
  venta_sin_stock   INTEGER NOT NULL DEFAULT 0,
  descripcion       TEXT,
  price_cost        REAL DEFAULT NULL,
  margen            REAL DEFAULT NULL,
  price_promo       REAL DEFAULT NULL,
  en_promo          INTEGER DEFAULT 0,
  imagen            TEXT DEFAULT NULL,
  price_mayorista   REAL DEFAULT NULL,
  qty_mayorista     INTEGER DEFAULT NULL,
  price_tarjeta     REAL DEFAULT NULL,
  sucursal_id       INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  total           REAL NOT NULL,
  payment_method  TEXT NOT NULL,
  cash_received   REAL,
  change_amount   REAL,
  cliente_id      INTEGER REFERENCES clientes(id) DEFAULT 1,
  status          TEXT DEFAULT 'completada',
  sucursal_id     INTEGER DEFAULT 1,
  discount_pct    REAL DEFAULT 0,
  discount_fixed  REAL DEFAULT 0,
  recargo_pct     REAL DEFAULT 0,
  monto_mixto2    REAL DEFAULT NULL,
  anulacion_motivo TEXT,
  anulada_at      TEXT,
  anulada_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sale_items (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id  INTEGER NOT NULL,
  sku      TEXT NOT NULL,
  name     TEXT NOT NULL,
  price    REAL NOT NULL,
  qty      INTEGER NOT NULL,
  subtotal REAL NOT NULL,
  iva      REAL DEFAULT 0,
  ieps     REAL DEFAULT 0,
  pesable  INTEGER DEFAULT 0,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS caja (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_open   TEXT NOT NULL,
  opened_at   TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at   TEXT,
  closed_by   TEXT,
  total_sales REAL DEFAULT 0,
  items_sold  INTEGER DEFAULT 0,
  sucursal_id INTEGER DEFAULT 1,
  status      TEXT NOT NULL DEFAULT 'abierta' CHECK(status IN ('abierta', 'cerrada'))
);

CREATE TABLE IF NOT EXISTS clientes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre         TEXT NOT NULL,
  documento      TEXT,
  telefono       TEXT,
  email          TEXT,
  direccion      TEXT,
  saldo          REAL NOT NULL DEFAULT 0,
  limite_credito REAL DEFAULT NULL,
  sucursal_id    INTEGER DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Consumidor Final por defecto
INSERT OR IGNORE INTO clientes (id, nombre, documento, saldo)
VALUES (1, 'Consumidor Final', NULL, 0);

CREATE TABLE IF NOT EXISTS cuenta_corriente (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id  INTEGER NOT NULL,
  tipo        TEXT NOT NULL CHECK(tipo IN ('cargo','pago')),
  monto       REAL NOT NULL,
  descripcion TEXT,
  sale_id     INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

CREATE TABLE IF NOT EXISTS proveedores (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT NOT NULL,
  contacto    TEXT,
  telefono    TEXT,
  email       TEXT,
  direccion   TEXT,
  saldo       REAL NOT NULL DEFAULT 0,
  status      TEXT DEFAULT 'activo',
  sucursal_id INTEGER DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gastos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  descripcion TEXT NOT NULL,
  monto       REAL NOT NULL,
  categoria   TEXT,
  fecha       TEXT NOT NULL DEFAULT (date('now')),
  status      TEXT DEFAULT 'activo',
  sucursal_id INTEGER DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Valores por defecto
INSERT OR IGNORE INTO config (key, value) VALUES ('empresa_nombre',    'Mi Comercio');
INSERT OR IGNORE INTO config (key, value) VALUES ('empresa_direccion', '');
INSERT OR IGNORE INTO config (key, value) VALUES ('empresa_telefono',  '');
INSERT OR IGNORE INTO config (key, value) VALUES ('empresa_email',     '');
INSERT OR IGNORE INTO config (key, value) VALUES ('ticket_formato',    '80mm');
INSERT OR IGNORE INTO config (key, value) VALUES ('ticket_footer',     '¡Gracias por su compra!');

-- ── Índices para producción ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_sku       ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category  ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_stock     ON products(stock);
CREATE INDEX IF NOT EXISTS idx_sales_created_at   ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_cliente_id   ON sales(cliente_id);
CREATE INDEX IF NOT EXISTS idx_sales_payment      ON sales(payment_method);
CREATE INDEX IF NOT EXISTS idx_sales_status       ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_sucursal     ON sales(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sku     ON sale_items(sku);
CREATE INDEX IF NOT EXISTS idx_cuenta_corriente_cliente ON cuenta_corriente(cliente_id);
CREATE INDEX IF NOT EXISTS idx_config_key         ON config(key);