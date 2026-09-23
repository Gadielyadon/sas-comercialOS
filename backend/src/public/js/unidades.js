/* ─────────────────────────────────────────────────────────────
   unidades.js — unidades de medida de los ítems del presupuesto.

   Sirve en el navegador (window.AxUnidades) y en Node
   (require('../public/js/unidades')), así el presupuesto se ve
   igual en pantalla, en el A4 y en el ticket.

   "Unidad" (valor vacío) es el comportamiento de siempre:
   se muestra solo el número, sin ninguna palabra al lado.
───────────────────────────────────────────────────────────── */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AxUnidades = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // v = valor guardado · s = singular · p = plural
  const UNIDADES = [
    { v: 'Litro', s: 'litro', p: 'litros' },
    { v: 'm²',    s: 'm²',    p: 'm²'     },
    { v: 'cm',    s: 'cm',    p: 'cm'     },
  ];

  const fmtNum = (n) =>
    (Math.round(Number(n) * 1000) / 1000).toLocaleString('es-AR', { maximumFractionDigits: 3 });

  function buscar(unidad) {
    if (!unidad) return null;
    const u = String(unidad).trim().toLowerCase();
    return UNIDADES.find(x => x.v.toLowerCase() === u) || null;
  }

  // "litro" / "litros" según la cantidad ('' si el ítem no tiene unidad)
  function nombre(unidad, cantidad) {
    const u = buscar(unidad);
    if (!u) return '';
    return Number(cantidad) === 1 ? u.s : u.p;
  }

  // "40 litros" — o solo "40" si el ítem no tiene unidad
  function etiqueta(cantidad, unidad) {
    const n = nombre(unidad, cantidad);
    return fmtNum(cantidad) + (n ? ' ' + n : '');
  }

  return { UNIDADES, fmtNum, nombre, etiqueta };
});
