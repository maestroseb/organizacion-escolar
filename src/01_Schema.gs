/**
 * Inicialización y reparación del esquema del libro.
 *
 * inicializarLibro() crea las 9 pestañas _* con sus cabeceras según SCHEMA.
 * Es idempotente: si una pestaña ya existe, no la borra; añade columnas
 * que falten al final y avisa de las que sobran.
 *
 * Se invoca desde el wizard HTML (ver src/ui/setup.html) vía google.script.run.
 * Devuelve un objeto con el resumen para que el wizard lo muestre.
 */

function inicializarLibro() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('No hay hoja de cálculo activa. Vincula este script a un Sheets.');
  }

  const detalle = [];

  SHEET_ORDER.forEach(function(nombre) {
    const cabeceras = SCHEMA[nombre];
    const existia = ss.getSheetByName(nombre) !== null;
    const sheet = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
    const estado = aplicarCabeceras_(sheet, cabeceras);
    detalle.push({ pestana: nombre, columnas: cabeceras.length, nueva: !existia, estado: estado });
  });

  eliminarHojaPorDefecto_(ss);

  return {
    ok: true,
    total: SHEET_ORDER.length,
    detalle: detalle
  };
}

/**
 * Indica si el libro ya tiene todas las pestañas _* creadas.
 * Lo usa el wizard para marcar el paso 1 como completado al reabrir.
 */
function estadoEstructura() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const faltan = SHEET_ORDER.filter(function(n) { return !ss.getSheetByName(n); });
  return {
    completo: faltan.length === 0,
    faltan: faltan,
    total: SHEET_ORDER.length
  };
}

function aplicarCabeceras_(sheet, cabeceras) {
  const ancho = cabeceras.length;
  const primeraFila = sheet.getRange(1, 1, 1, Math.max(ancho, sheet.getLastColumn() || 1))
                           .getValues()[0];
  const existentes = primeraFila.filter(function(v) { return v !== '' && v !== null; });

  if (existentes.length === 0) {
    sheet.getRange(1, 1, 1, ancho).setValues([cabeceras]);
    formatearCabecera_(sheet, ancho);
    sheet.setFrozenRows(1);
    return 'creada';
  }

  const faltan = cabeceras.filter(function(c) { return existentes.indexOf(c) === -1; });
  const sobran = existentes.filter(function(c) { return cabeceras.indexOf(c) === -1; });

  if (faltan.length > 0) {
    const colInicio = existentes.length + 1;
    sheet.getRange(1, colInicio, 1, faltan.length).setValues([faltan]);
    formatearCabecera_(sheet, existentes.length + faltan.length);
  }

  sheet.setFrozenRows(1);

  if (!faltan.length && !sobran.length) return 'ya existía (sin cambios)';
  const partes = [];
  if (faltan.length) partes.push('añadidas: ' + faltan.join(', '));
  if (sobran.length) partes.push('sobran: ' + sobran.join(', '));
  return partes.join(' | ');
}

function formatearCabecera_(sheet, ancho) {
  const rango = sheet.getRange(1, 1, 1, ancho);
  rango.setFontWeight('bold');
  rango.setBackground('#efefef');
}

function eliminarHojaPorDefecto_(ss) {
  const candidatas = ['Hoja 1', 'Hoja1', 'Sheet1', 'Sheet 1'];
  const hojas = ss.getSheets();
  if (hojas.length <= 1) return;
  hojas.forEach(function(h) {
    if (candidatas.indexOf(h.getName()) !== -1) {
      ss.deleteSheet(h);
    }
  });
}
