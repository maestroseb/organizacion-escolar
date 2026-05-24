/**
 * Funciones de diagnóstico. Se ejecutan desde el editor de Apps Script
 * (botón Ejecutar) y vuelcan el resultado al log (Ver → Registros).
 *
 * Borrar este archivo cuando dejemos de usarlo.
 */

function diagnostico() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    Logger.log('NO HAY SS ACTIVO');
    return;
  }

  Logger.log('=== Pestañas en el libro ===');
  ss.getSheets().forEach(function(s) {
    Logger.log(' - "' + s.getName() + '"  filas=' + s.getLastRow() + '  cols=' + s.getLastColumn());
  });

  Logger.log('\n=== Contenido bruto de _Centro ===');
  const sheet = ss.getSheetByName('_Centro');
  if (!sheet) {
    Logger.log('La pestaña _Centro NO existe.');
    return;
  }
  const last = sheet.getLastRow();
  if (last < 1) {
    Logger.log('_Centro está totalmente vacía.');
    return;
  }
  const cols = Math.max(sheet.getLastColumn(), 10);
  const data = sheet.getRange(1, 1, last, cols).getValues();
  data.forEach(function(row, i) {
    Logger.log('Fila ' + (i + 1) + ': ' + JSON.stringify(row));
  });

  Logger.log('\n=== getAll(_Centro) ===');
  try {
    const todo = getAll(SHEETS.CENTRO);
    Logger.log('Filas devueltas: ' + todo.length);
    todo.forEach(function(o) { Logger.log(JSON.stringify(o)); });
  } catch (e) {
    Logger.log('ERROR en getAll: ' + e.message);
  }

  Logger.log('\n=== findById(_Centro, "centro_1") ===');
  try {
    const c = findById(SHEETS.CENTRO, 'centro_1');
    Logger.log('Resultado: ' + JSON.stringify(c));
  } catch (e) {
    Logger.log('ERROR en findById: ' + e.message);
  }

  Logger.log('\n=== obtenerCentro() ===');
  try {
    const res = obtenerCentro();
    Logger.log('Resultado: ' + JSON.stringify(res));
  } catch (e) {
    Logger.log('ERROR en obtenerCentro: ' + e.message);
  }
}
