/**
 * Lógica del paso 3 del wizard: tramos horarios.
 *
 * _Tramos es una tabla con N filas, una por cada tramo del horario del centro.
 * El campo `orden` define la secuencia (1, 2, 3…).
 *
 * Estrategia de guardado: el wizard envía la lista completa de tramos en
 * cada save. Conservamos los IDs de los que ya existían (para no romper
 * referencias futuras desde _Ocupaciones) y borramos los que el usuario
 * haya eliminado.
 */

function listarTramos() {
  const tramos = getAll(SHEETS.TRAMOS);
  tramos.sort(function(a, b) { return (a.orden || 0) - (b.orden || 0); });
  return tramos;
}

function guardarTramos(tramos, modo) {
  _exigirEdicion();
  if (!Array.isArray(tramos)) throw new Error('Formato inválido.');

  tramos.forEach(function(t, i) {
    const n = i + 1;
    if (!t.hora_inicio || !t.hora_fin) {
      throw new Error('Tramo ' + n + ': falta hora de inicio o fin.');
    }
    if (!/^\d{1,2}:\d{2}$/.test(t.hora_inicio) || !/^\d{1,2}:\d{2}$/.test(t.hora_fin)) {
      throw new Error('Tramo ' + n + ': las horas deben tener formato HH:MM.');
    }
    if (_minutos(t.hora_inicio) >= _minutos(t.hora_fin)) {
      throw new Error('Tramo ' + n + ': la hora de fin debe ser posterior al inicio.');
    }
  });

  const ordenados = tramos.slice().sort(function(a, b) {
    return _minutos(a.hora_inicio) - _minutos(b.hora_inicio);
  });

  const filas = ordenados.map(function(t, i) {
    return {
      id: t.id || undefined,
      orden: i + 1,
      // Normalizado a HH:MM ("9:00" → "09:00") para que la clave natural
      // de la fusión coincida con lo ya guardado.
      hora_inicio: _hhmmPad(t.hora_inicio),
      hora_fin: _hhmmPad(t.hora_fin),
      es_recreo: !!t.es_recreo,
      etiqueta: t.etiqueta || '',
      color: t.color || ''
    };
  });
  modo = modo || 'reemplazar';
  const resumen = bulkMerge_(SHEETS.TRAMOS, filas, ['hora_inicio', 'hora_fin'], modo);
  if (modo !== 'reemplazar') {
    // Al combinar/añadir se mezclan tramos viejos y nuevos: el `orden` (que
    // usan la importación CSV y la sábana) debe volver a ser 1..N por hora.
    const todos = getAll(SHEETS.TRAMOS).sort(function(a, b) {
      return _minutos(a.hora_inicio) - _minutos(b.hora_inicio);
    });
    todos.forEach(function(t, i) { t.orden = i + 1; });
    bulkReplace_(SHEETS.TRAMOS, todos);
  }
  return { ok: true, total: resumen.total, resumen: resumen };
}

/**
 * Plantilla típica de CEIP andaluz: jornada 9:00-14:00 con recreo central.
 * 6 sesiones lectivas + 1 recreo = 7 tramos.
 */
/**
 * Jornada por defecto cuando no hay ninguna referencia (tramos de una hora
 * o de media hora): 9-10, 10-11, 11-11:30, recreo 11:30-12, 12-13, 13-14.
 */
const TRAMOS_POR_DEFECTO = [
  { hora_inicio: '09:00', hora_fin: '10:00', es_recreo: false },
  { hora_inicio: '10:00', hora_fin: '11:00', es_recreo: false },
  { hora_inicio: '11:00', hora_fin: '11:30', es_recreo: false },
  { hora_inicio: '11:30', hora_fin: '12:00', es_recreo: true  },
  { hora_inicio: '12:00', hora_fin: '13:00', es_recreo: false },
  { hora_inicio: '13:00', hora_fin: '14:00', es_recreo: false }
];

function plantillaTramos() {
  return TRAMOS_POR_DEFECTO.map(function(t, i) {
    return {
      orden: i + 1,
      hora_inicio: t.hora_inicio,
      hora_fin: t.hora_fin,
      es_recreo: t.es_recreo,
      etiqueta: t.es_recreo ? 'Recreo' : 'TR' + String(i + 1).padStart(2, '0')
    };
  });
}

function _hhmmPad(hhmm) {
  const p = String(hhmm).split(':');
  return ('0' + parseInt(p[0], 10)).slice(-2) + ':' + ('0' + parseInt(p[1], 10)).slice(-2);
}

function _minutos(hhmm) {
  const p = String(hhmm).split(':');
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}
