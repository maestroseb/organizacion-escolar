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
  // Caché por ejecución: una misma petición (estadoApp, sábana, importación…)
  // suele leer la misma pestaña varias veces. Se lee UNA vez y se devuelven
  // copias, para que los llamantes puedan ordenar/mutar sin afectar a otros.
  let filas = _TABLAS_CACHE[sheetName];
  if (!filas) {
    filas = _leerTabla(sheetName);
    _TABLAS_CACHE[sheetName] = filas;
  }
  return filas.map(function(o) { return Object.assign({}, o); });
}

/** Número de filas con id de una pestaña, leyendo solo la columna id. */
function contarFilas(sheetName) {
  if (_TABLAS_CACHE[sheetName]) return _TABLAS_CACHE[sheetName].length;
  const sheet = _getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  return sheet.getRange(2, 1, lastRow - 1, 1).getValues()
    .filter(function(r) { return r[0] !== '' && r[0] !== null; }).length;
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

  const row = headers.map(function(h) { return _celda(obj[h]); });
  sheet.appendRow(row);
  _invalidarTabla(sheetName);
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
  const newRow = headers.map(function(h) { return _celda(merged[h]); });
  range.setValues([newRow]);
  _invalidarTabla(sheetName);
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

/**
 * Reemplaza el contenido completo de una pestaña con la lista dada.
 * Mucho más rápido que llamar a `upsert` en bucle (1 lectura + 1
 * limpieza + 1 escritura por pestaña, en lugar de O(N) llamadas a la
 * API de Sheets).
 *
 * Para cada objeto:
 *   - Si tiene `id`, se conserva (importante para no romper FKs).
 *   - Si no, se autogenera continuando desde el máximo existente.
 *
 * Devuelve los objetos con su id asignado.
 */
function bulkReplace(sheetName, objects) {
  const sheet = _getSheet(sheetName);
  const headers = SCHEMA[sheetName];
  const prefix = _idPrefix(sheetName);

  // Solo hace falta conocer el máximo id existente si hay objetos sin id
  // (vaciar una sección o reescribir con ids conocidos no lee la pestaña).
  if (objects.some(function(o) { return !o.id; })) {
    const re = new RegExp('^' + prefix + '_(\\d+)$');
    let maxN = 0;
    getAll(sheetName).concat(objects).forEach(function(o) {
      const m = String(o.id || '').match(re);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxN) maxN = n;
      }
    });
    objects.forEach(function(o) {
      if (!o.id) {
        maxN++;
        o.id = prefix + '_' + maxN;
      }
    });
  }

  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  }

  if (objects.length > 0) {
    const rows = objects.map(function(o) {
      return headers.map(function(h) { return _celda(o[h]); });
    });
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  _invalidarTabla(sheetName);
  return objects;
}

/**
 * Fusiona una lista de objetos con lo que ya hay en la pestaña, según el modo:
 *
 *   - 'reemplazar': descarta lo existente y deja solo `objects` (= bulkReplace).
 *   - 'combinar'  : para cada objeto, si su clave natural coincide con una fila
 *                   existente, la actualiza (conservando su id); si no, la añade.
 *   - 'anadir'    : solo añade los objetos cuya clave natural NO exista ya; los
 *                   que coinciden se ignoran (no se duplican ni se tocan).
 *
 * `keyFields` es un array de nombres de columna que forman la clave natural
 * (p.ej. ['nombre_corto'] para docentes, ['hora_inicio','hora_fin'] para tramos).
 * La comparación es tolerante: se normaliza (trim + minúsculas + espacios).
 *
 * Devuelve un resumen { total, nuevos, actualizados, ignorados }.
 */
function bulkMerge(sheetName, objects, keyFields, modo) {
  objects = objects || [];
  modo = modo || 'combinar';
  keyFields = (keyFields && keyFields.length) ? keyFields : ['id'];

  if (modo === 'reemplazar') {
    bulkReplace(sheetName, objects);
    return { total: objects.length, nuevos: objects.length, actualizados: 0, ignorados: 0 };
  }

  const claveDe = function(o) {
    return keyFields.map(function(k) { return _keyNorm(o[k]); }).join('|');
  };

  const existentes = getAll(sheetName);
  const indice = {};
  existentes.forEach(function(o) { indice[claveDe(o)] = o; });

  let nuevos = 0, actualizados = 0, ignorados = 0;
  const resultado = existentes.slice();

  objects.forEach(function(nuevo) {
    const k = claveDe(nuevo);
    const previo = indice[k];
    if (previo) {
      if (modo === 'combinar') {
        // Solo sobrescribe con los campos no vacíos del objeto entrante, para
        // no borrar datos ya presentes (p.ej. el tutor de un grupo) al
        // recombinar una importación que no trae ese campo.
        Object.keys(nuevo).forEach(function(campo) {
          if (campo === 'id') return;
          const val = nuevo[campo];
          if (val !== undefined && val !== null && val !== '') previo[campo] = val;
        });
        actualizados++;
      } else {
        ignorados++;
      }
    } else {
      const copia = Object.assign({}, nuevo);
      delete copia.id; // que bulkReplace le asigne id nuevo continuando la secuencia
      resultado.push(copia);
      indice[k] = copia;
      nuevos++;
    }
  });

  bulkReplace(sheetName, resultado);
  return { total: resultado.length, nuevos: nuevos, actualizados: actualizados, ignorados: ignorados };
}

/** Normaliza un valor para comparar claves naturales (trim + minúsculas). */
function _keyNorm(v) {
  return String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' ');
}

// ---------- Internos ----------

// Cachés por ejecución (Apps Script reinicia el estado global en cada
// petición, así que no hay riesgo de servir datos de otra llamada).
const _TABLAS_CACHE = {};
const _HOJAS_CACHE = {};
let _TZ_CACHE = null;

function _invalidarTabla(sheetName) { delete _TABLAS_CACHE[sheetName]; }

function _leerTabla(sheetName) {
  const sheet = _getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  const headers = SCHEMA[sheetName];
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const obj = _rowToObject(values[i], headers);
    if (obj.id !== '' && obj.id !== null) out.push(obj);
  }
  return out;
}

function _getSheet(sheetName) {
  let sheet = _HOJAS_CACHE[sheetName];
  if (sheet) return sheet;
  sheet = getBd().getSheetByName(sheetName);
  if (!sheet) throw new Error('Pestaña no encontrada: ' + sheetName);
  _HOJAS_CACHE[sheetName] = sheet;
  return sheet;
}

/**
 * Valor listo para escribir en una celda. Las cadenas que Sheets
 * reinterpretaría (códigos con ceros a la izquierda como "04000018", horas,
 * fechas, "1"/"2" de mitad, textos que empiezan por "=" o "+") se fuerzan a
 * texto con un apóstrofo inicial, que Sheets no guarda como parte del valor.
 */
function _celda(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' && /^[=+\-'\d.]/.test(v)) return "'" + v;
  return v;
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
  const tz = _TZ_CACHE || (_TZ_CACHE = Session.getScriptTimeZone());
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
