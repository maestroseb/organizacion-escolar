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

function guardarTramos(tramos) {
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

  const idsConservados = {};
  ordenados.forEach(function(t) { if (t.id) idsConservados[t.id] = true; });
  const existentes = getAll(SHEETS.TRAMOS);
  existentes.forEach(function(e) {
    if (!idsConservados[e.id]) remove(SHEETS.TRAMOS, e.id);
  });

  const guardados = [];
  ordenados.forEach(function(t, i) {
    const fila = {
      id: t.id || undefined,
      orden: i + 1,
      hora_inicio: t.hora_inicio,
      hora_fin: t.hora_fin,
      es_recreo: !!t.es_recreo,
      etiqueta: t.etiqueta || ''
    };
    guardados.push(upsert(SHEETS.TRAMOS, fila));
  });

  return { ok: true, total: guardados.length };
}

/**
 * Plantilla típica de CEIP andaluz: jornada 9:00-14:00 con recreo central.
 * 6 sesiones lectivas + 1 recreo = 7 tramos.
 */
function plantillaTramos() {
  const base = [
    { hora_inicio: '09:00', hora_fin: '09:45', es_recreo: false },
    { hora_inicio: '09:45', hora_fin: '10:30', es_recreo: false },
    { hora_inicio: '10:30', hora_fin: '11:15', es_recreo: false },
    { hora_inicio: '11:15', hora_fin: '11:45', es_recreo: true  },
    { hora_inicio: '11:45', hora_fin: '12:30', es_recreo: false },
    { hora_inicio: '12:30', hora_fin: '13:15', es_recreo: false },
    { hora_inicio: '13:15', hora_fin: '14:00', es_recreo: false }
  ];
  return base.map(function(t, i) {
    return {
      orden: i + 1,
      hora_inicio: t.hora_inicio,
      hora_fin: t.hora_fin,
      es_recreo: t.es_recreo,
      etiqueta: 'TR' + String(i + 1).padStart(2, '0')
    };
  });
}

function _minutos(hhmm) {
  const p = String(hhmm).split(':');
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}
