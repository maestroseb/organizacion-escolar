/**
 * Inicialización y reparación del esquema del libro.
 *
 * Función principal: inicializarLibro().
 * Ejecútala una vez sobre un Google Sheets vacío vinculado a este script.
 * Crea las 9 pestañas _* con sus cabeceras según SCHEMA.
 *
 * Es idempotente: si una pestaña ya existe, no la borra; añade columnas
 * que falten al final y avisa de las que sobran.
 */

function inicializarLibro() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('No hay hoja de cálculo activa. Vincula este script a un Sheets.');
  }

  const resumen = [];

  SHEET_ORDER.forEach(function(nombre) {
    const cabeceras = SCHEMA[nombre];
    const sheet = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
    const estado = aplicarCabeceras_(sheet, cabeceras);
    resumen.push(nombre + ': ' + estado);
  });

  eliminarHojaPorDefecto_(ss);

  const msg = 'Libro inicializado.\n\n' + resumen.join('\n');
  SpreadsheetApp.getActive().toast('Inicialización completada', 'OK', 5);
  Logger.log(msg);
  return msg;
}

/**
 * Escribe las cabeceras en la fila 1. Si ya hay cabeceras, comprueba que
 * coinciden y añade al final las que falten.
 */
function aplicarCabeceras_(sheet, cabeceras) {
  const ancho = cabeceras.length;
  const primeraFila = sheet.getRange(1, 1, 1, Math.max(ancho, sheet.getLastColumn() || 1))
                           .getValues()[0];
  const existentes = primeraFila.filter(function(v) { return v !== '' && v !== null; });

  if (existentes.length === 0) {
    sheet.getRange(1, 1, 1, ancho).setValues([cabeceras]);
    formatearCabecera_(sheet, ancho);
    sheet.setFrozenRows(1);
    return 'creada con ' + ancho + ' columnas';
  }

  const faltan = cabeceras.filter(function(c) { return existentes.indexOf(c) === -1; });
  const sobran = existentes.filter(function(c) { return cabeceras.indexOf(c) === -1; });

  if (faltan.length > 0) {
    const colInicio = existentes.length + 1;
    sheet.getRange(1, colInicio, 1, faltan.length).setValues([faltan]);
    formatearCabecera_(sheet, existentes.length + faltan.length);
  }

  let estado = 'ya existía';
  if (faltan.length) estado += ', añadidas: ' + faltan.join(', ');
  if (sobran.length) estado += ', sobran (revisar manualmente): ' + sobran.join(', ');
  sheet.setFrozenRows(1);
  return estado;
}

function formatearCabecera_(sheet, ancho) {
  const rango = sheet.getRange(1, 1, 1, ancho);
  rango.setFontWeight('bold');
  rango.setBackground('#efefef');
}

/**
 * Si el libro se acaba de crear, tendrá una pestaña por defecto "Hoja 1" /
 * "Sheet1" vacía. La eliminamos si seguimos teniendo más de una pestaña.
 */
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

/**
 * Menú personalizado que aparece al abrir el Sheets.
 * Permite lanzar la inicialización con un clic.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Horarios')
    .addItem('Inicializar libro (crear pestañas)', 'inicializarLibro')
    .addToUi();
}
