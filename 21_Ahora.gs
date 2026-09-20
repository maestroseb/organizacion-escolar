/**
 * Módulo "Ahora": qué toca en este preciso momento.
 *
 * A partir de la fecha y hora del servidor calcula el día lectivo, el tramo
 * activo y la semana (A/B) que corresponde, y reutiliza el motor de la sábana
 * (_sabanaTramoData) para resolver quién está en cada aula, apoyo o cargo.
 *
 * Devuelve también el tramo siguiente (útil en el cambio de clase, cuando el
 * docente aún no se ha movido) y una mini-agenda del día para ubicarse.
 */

function ahoraDatos() {
  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const fecha = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const horaActual = Utilities.formatDate(now, tz, 'HH:mm');
  const nowMin = _horaAMin(horaActual);

  // Día ISO: 1 = lunes … 7 = domingo.
  const diaIso = parseInt(Utilities.formatDate(now, tz, 'u'), 10);
  const dia = { 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V' }[diaIso] || '';
  const finde = !dia;

  const sem = semanaDeFecha(fecha); // {tipo, etiqueta} o null

  const base = {
    fecha: fecha,
    fechaLarga: _fechaLarga(now, tz),
    horaActual: horaActual,
    dia: dia,
    diaLargo: dia ? _diaLargo(dia) : _diaLargo({ 6: 'S', 0: 'D', 7: 'D' }[diaIso] || ''),
    finde: finde,
    semana: sem ? { tipo: sem.tipo, etiqueta: sem.etiqueta } : null
  };

  if (finde) {
    return Object.assign(base, {
      lectivo: false, estado: 'finde',
      hayTramos: getAll(SHEETS.TRAMOS).length > 0,
      tramoActual: null, tramoSiguiente: null, agenda: []
    });
  }

  const ctx = _sabanaContexto();
  if (!ctx.tramos.length) {
    return Object.assign(base, {
      lectivo: true, estado: 'sin-tramos', hayTramos: false,
      tramoActual: null, tramoSiguiente: null, agenda: []
    });
  }

  const ocupDia = ctx.ocupaciones.filter(function(o) { return _diaCanon(o.dia) === dia; });

  // Clasifica los tramos respecto a la hora actual.
  let actual = null, siguiente = null;
  ctx.tramos.forEach(function(t) {
    const ini = _horaAMin(t.hora_inicio), fin = _horaAMin(t.hora_fin);
    if (ini <= nowMin && nowMin < fin) actual = t;
    if (ini > nowMin && (!siguiente || ini < _horaAMin(siguiente.hora_inicio))) siguiente = t;
  });

  let estado;
  if (actual) estado = actual.es_recreo ? 'recreo' : 'en-tramo';
  else if (siguiente && nowMin < _horaAMin(ctx.tramos[0].hora_inicio)) estado = 'antes';
  else if (siguiente) estado = 'entre';
  else estado = 'despues';

  const agenda = ctx.tramos.map(function(t) {
    return {
      id: t.id, orden: t.orden, es_recreo: !!t.es_recreo,
      etiqueta: t.etiqueta || '',
      horas: _hhmm(t.hora_inicio) + ' – ' + _hhmm(t.hora_fin),
      color: ctx.colorTramo[t.id] || '#4f9d84',
      actual: !!(actual && actual.id === t.id),
      siguiente: !!(siguiente && siguiente.id === t.id)
    };
  });

  return Object.assign(base, {
    lectivo: true,
    estado: estado,
    hayTramos: true,
    tramoActual: actual ? _sabanaTramoData(actual, ocupDia, ctx) : null,
    tramoSiguiente: siguiente ? _sabanaTramoData(siguiente, ocupDia, ctx) : null,
    agenda: agenda
  });
}

function _horaAMin(v) {
  if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
  const m = String(v || '').match(/(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : -1;
}

function _fechaLarga(fecha, tz) {
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const d = parseInt(Utilities.formatDate(fecha, tz, 'u'), 10) % 7; // 7(domingo)→0
  const dm = parseInt(Utilities.formatDate(fecha, tz, 'd'), 10);
  const mes = parseInt(Utilities.formatDate(fecha, tz, 'M'), 10) - 1;
  return dias[d] + ', ' + dm + ' de ' + meses[mes];
}
