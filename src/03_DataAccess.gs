/**
 * Capa genérica de acceso a datos sobre las pestañas _*.
 *
 * Diseño:
 * - Cada pestaña es una tabla con cabeceras definidas en SCHEMA (00_Constants.gs).
 * - Cada fila es un objeto {columna: valor}.
 * - La columna 'id' es siempre la primera y es la clave primaria.
 * - IDs autoincrementales legibles: "centro_1", "tramo_3", etc.
 *
 * Estas funciones son los ladrillos que usarán los pasos del wizard,
 * las vistas y el módulo de sustituciones.
 */

/**
 * Devuelve todas las filas de una pestaña como array de objetos.
 * Si la pestaña está vacía, devuelve [].
 */
function getAll(sheetName) {
  const sheet = _getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  const headers = SCHEMA[sheetName];
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function(row) {
    return _rowToObject(row, headers);
  }).filter(function(obj) {
    return obj.id !== '' && obj.id !== null;
  });
}

/** Busca una fila por id. Devuelve el objeto o null. */
function findById(sheetName, id) {
  const all = getAll(sheetName);
  for (let i = 0; i < all.length; i++) {
    if (all[i].id === id) return all[i];
  }
  return null;
}

/**
 * Inserta una fila nueva. Si obj.id no viene, se autogenera.
 * Devuelve el objeto guardado (con id).
 */
function insert(sheetName, obj) {
  const sheet = _getSheet(sheetName);
  const headers = SCHEMA[sheetName];
  const prefix = _idPrefix(sheetName);

  if (!obj.id) obj.id = _nextId(sheetName, prefix);

  const row = headers.map(function(h) {
    return obj[h] === undefined ? '' : obj[h];
  });
  sheet.appendRow(row);
  return obj;
}

/**
 * Actualiza una fila existente por id. Solo modifica las columnas presentes
 * en `cambios`. Devuelve el objeto actualizado, o lanza si no existe.
 */
function update(sheetName, id, cambios) {
  const sheet = _getSheet(sheetName);
  const headers = SCHEMA[sheetName];
  const idx = _findRowIndex(sheet, id);
  if (idx === -1) throw new Error('No existe ' + sheetName + ' con id=' + id);

  const range = sheet.getRange(idx, 1, 1, headers.length);
  const current = _rowToObject(range.getValues()[0], headers);
  const merged = Object.assign({}, current, cambios, { id: id });
  const newRow = headers.map(function(h) {
    return merged[h] === undefined ? '' : merged[h];
  });
  range.setValues([newRow]);
  return merged;
}

/**
 * Insert si no existe (por id), update si existe. Útil para entidades
 * singleton como _Centro.
 */
function upsert(sheetName, obj) {
  if (obj.id && findById(sheetName, obj.id)) {
    return update(sheetName, obj.id, obj);
  }
  return insert(sheetName, obj);
}

/** Borra una fila por id. */
function remove(sheetName, id) {
  const sheet = _getSheet(sheetName);
  const idx = _findRowIndex(sheet, id);
  if (idx === -1) return false;
  sheet.deleteRow(idx);
  return true;
}

// ---------- Internos ----------

function _getSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Pestaña no encontrada: ' + sheetName);
  return sheet;
}

function _rowToObject(row, headers) {
  const obj = {};
  for (let i = 0; i < headers.length; i++) {
    obj[headers[i]] = _normalizar(row[i]);
  }
  return obj;
}

/**
 * Convierte valores a tipos JSON-serializables compatibles con
 * google.script.run. Especialmente: Date → string.
 * Si el Date está a medianoche, lo tratamos como fecha (YYYY-MM-DD).
 * Si tiene hora distinta de 00:00, lo tratamos como hora (HH:MM).
 */
function _normalizar(v) {
  if (!(v instanceof Date)) return v;
  const tz = Session.getScriptTimeZone();
  const h = v.getHours(), m = v.getMinutes(), s = v.getSeconds();
  if (h === 0 && m === 0 && s === 0) {
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  if (v.getFullYear() < 1950) {
    return Utilities.formatDate(v, tz, 'HH:mm');
  }
  return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
}

function _findRowIndex(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2;
  }
  return -1;
}

/**
 * Prefijo del id autoincremental por pestaña. Ej: _Docentes → "doc".
 * Se basa en una tabla fija para no depender del nombre exacto.
 */
function _idPrefix(sheetName) {
  const prefijos = {
    '_Centro': 'centro',
    '_Tramos': 'tramo',
    '_Grupos': 'grupo',
    '_Docentes': 'doc',
    '_Localizaciones': 'loc',
    '_Materias': 'mat',
    '_RolesEspeciales': 'rol',
    '_Ocupaciones': 'ocup',
    '_Sustituciones': 'sus'
  };
  return prefijos[sheetName] || 'row';
}

function _nextId(sheetName, prefix) {
  const all = getAll(sheetName);
  let max = 0;
  all.forEach(function(o) {
    const m = String(o.id).match(new RegExp('^' + prefix + '_(\\d+)$'));
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  });
  return prefix + '_' + (max + 1);
}
