# Cómo instalar la sección "Importar"

## 1) Copiar 3 archivos nuevos (van tal cual)
- `services/importar.service.js`  →  `backend/src/services/importar.service.js`
- `routes/importar.routes.js`     →  `backend/src/routes/importar.routes.js`
- `views/importar.ejs`            →  `backend/src/views/pages/importar.ejs`

## 2) Editar `backend/src/middlewares/auth.middleware.js`
Buscar el objeto `RUTA_PERMISO` y agregar una línea:

```js
const RUTA_PERMISO = {
  '/ventas':          'ventas',
  '/historial':       'historial',
  '/reportes':        'reportes',
  '/reportes/ventas': 'reportes',
  '/caja':            'caja',
  '/clientes':        'clientes',
  '/presupuestos':    'presupuestos',
  '/inventario':      'inventario',
  '/stock':           'stock',
  '/proveedores':     'proveedores',
  '/gastos':          'gastos',
  '/importar':        'importar',   // ← AGREGAR ESTA LÍNEA
};
```

## 3) Editar `backend/src/app.js`
Buscar donde se montan las otras rutas (cerca de `gastosRoutes`) y agregar:

```js
const importarRoutes = require('./routes/importar.routes');
app.use('/importar', importarRoutes);
```

## 4) Editar `backend/src/views/partials/sidebar.ejs`
Agregar un ítem nuevo en el sidebar, cerca del de Gastos (línea ~114-120):

```html
<% if (typeof tienePermiso === 'undefined' || tienePermiso('importar')) { %>
<a href="/importar" class="nav-item <%= (typeof active !== 'undefined' && active === 'importar') ? 'active' : '' %>">
  <i class="bi bi-file-earmark-arrow-up"></i><span class="nav-text">Importar</span>
</a>
<% } %>
```

## 5) Reiniciar el proceso
```bash
pm2 restart NOMBRE_DEL_CLIENTE
```

---

## Cómo se usa (para vos o para el cliente)
1. Entrar a **Importar** en el sidebar.
2. Descargar la plantilla `.xlsx` (botón arriba).
3. Completar las hojas "Ventas" y/o "Gastos" SIN cambiar los encabezados de la fila 1
   ni el nombre de las hojas.
4. Subir el archivo → el sistema muestra un resumen (cantidad, totales, categorías
   nuevas que se van a crear, filas con error que no se importarán).
5. Tocar "Confirmar e importar".

## Reglas ya aplicadas
- En **Gastos**, la columna Categoría es OBLIGATORIA — fila sin categoría = error,
  no se importa esa fila.
- Categorías de gasto que no existen todavía en ese cliente se **crean automáticamente**
  con color/ícono por defecto (después se editan desde Gastos > Categorías).
- Cualquier empleado con permiso de Gastos o Ventas puede usar esta sección (no es
  exclusivo de admin) — se controla dándole o no el permiso `importar` al empleado,
  igual que se hace hoy con los demás permisos.
- Nada se escribe en la base hasta que se aprieta "Confirmar" — la previsualización
  es de solo lectura.

## Si un cliente nuevo pide un formato distinto
No lo caragues directo: la plantilla está fija a propósito. Si hace falta soportar
otro formato, avisame para adaptar `importar.service.js` (las funciones
`parsearVentas` / `parsearGastos`) antes de tocar producción.
