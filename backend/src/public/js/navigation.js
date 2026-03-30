/**
 * ComercialOS — Navegación global con teclado
 * ─────────────────────────────────────────────
 * • Flechas ↑ ↓  → navegan entre filas de CUALQUIER tabla del sistema
 * • Flechas ← →  → navegan entre celdas dentro de la fila seleccionada
 * • Enter         → activa el primer botón/acción de la fila
 * • Escape        → deselecciona la fila actual
 * • Click en fila → la selecciona visualmente
 */

(function () {
  'use strict';

  // Tablas del sistema que se hacen navegables automáticamente
  const TABLE_SELECTORS = [
    '#productsTable',
    '#tablaClientes',
    '#tablaPresupuestos',
    '#tablaVentas',
    '#tablaGastos',
    '#tablaStock',
    '#tablaProveedores',
    '.sales-table',
    '.data-table',
  ].join(', ');

  let activeRow = null;
  let activeColIdx = -1;

  function getTbody(row) {
    return row?.closest('tbody');
  }

  function getVisibleRows(tbody) {
    return Array.from(tbody.querySelectorAll('tr')).filter(
      r => r.offsetParent !== null && r.style.display !== 'none'
    );
  }

  function clearActive() {
    if (activeRow) {
      activeRow.classList.remove('kb-row-active');
      activeRow.querySelectorAll('td').forEach(td => td.classList.remove('kb-cell-active'));
    }
    activeRow = null;
    activeColIdx = -1;
  }

  function selectRow(row, colIdx) {
    clearActive();
    if (!row) return;

    activeRow = row;
    activeColIdx = colIdx ?? -1;

    row.classList.add('kb-row-active');
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    if (activeColIdx >= 0) {
      const cells = row.querySelectorAll('td');
      if (cells[activeColIdx]) cells[activeColIdx].classList.add('kb-cell-active');
    }
  }

  function moveRow(direction) {
    if (!activeRow) {
      const firstTable = document.querySelector(TABLE_SELECTORS);
      if (!firstTable) return;
      const tbody = firstTable.querySelector('tbody') || firstTable;
      const rows = getVisibleRows(tbody);
      if (rows.length) selectRow(rows[0]);
      return;
    }
    const tbody = getTbody(activeRow);
    if (!tbody) return;
    const rows = getVisibleRows(tbody);
    const idx = rows.indexOf(activeRow);
    const next = direction === 'up' ? idx - 1 : idx + 1;
    if (next >= 0 && next < rows.length) selectRow(rows[next], activeColIdx);
  }

  function moveCol(direction) {
    if (!activeRow) return;
    const cells = activeRow.querySelectorAll('td');
    if (!cells.length) return;
    let next = activeColIdx + (direction === 'left' ? -1 : 1);
    next = Math.max(0, Math.min(next, cells.length - 1));
    selectRow(activeRow, next);
  }

  function activateRow() {
    if (!activeRow) return;
    const target = activeRow.querySelector('button, a[href], [onclick]');
    if (target) target.click();
  }

  // Listener principal de teclado
  document.addEventListener('keydown', function (e) {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const modal = document.querySelector('.modal-overlay.active, .sale-overlay.open, .cobro-overlay.open');
    if (modal) return;

    switch (e.key) {
      case 'ArrowUp':    e.preventDefault(); moveRow('up');    break;
      case 'ArrowDown':  e.preventDefault(); moveRow('down');  break;
      case 'ArrowLeft':  if (activeRow) { e.preventDefault(); moveCol('left');  } break;
      case 'ArrowRight': if (activeRow) { e.preventDefault(); moveCol('right'); } break;
      case 'Enter':      if (activeRow) { e.preventDefault(); activateRow(); } break;
      case 'Escape':     clearActive(); break;
    }
  });

  // Click en fila → seleccionar
  document.addEventListener('click', function (e) {
    const row = e.target.closest('tr');
    if (!row) {
      if (!e.target.closest('button, a, input, select, textarea, .modal-overlay, .sale-overlay, .cobro-overlay')) {
        clearActive();
      }
      return;
    }
    const tbody = row.closest('tbody');
    if (!tbody) return;
    const cell = e.target.closest('td');
    const cells = Array.from(row.querySelectorAll('td'));
    selectRow(row, cell ? cells.indexOf(cell) : -1);
  });

  // Si se filtra y la fila activa queda oculta, limpiar selección
  const observer = new MutationObserver(function () {
    if (activeRow && activeRow.style.display === 'none') clearActive();
  });

  function attachObservers() {
    document.querySelectorAll(TABLE_SELECTORS).forEach(table => {
      const tbody = table.querySelector('tbody') || table;
      observer.observe(tbody, { attributes: true, subtree: true, attributeFilter: ['style'] });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachObservers);
  } else {
    attachObservers();
  }

})();
