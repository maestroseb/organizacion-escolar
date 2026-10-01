/**
 * TURNOS DE RECREO.
 *
 * Zonas de vigilancia (_ZonasRecreo: nombre y plazas) y quién vigila cada
 * una, cada día. Cada turno se guarda como una ocupación normal para que
 * aparezca sola en el horario individual, la sábana y Ahora:
 *
 *   tipo 'especial', tramo = el recreo, rol = «Recreo» (Vigilancia de recreo; «Gua.» en centros antiguos),
 *   localizacion_id = id de la zona, semana '' (todas) | 'A' | 'B'.
 *
 * La pestaña Recreos es la única que edita estas filas.
 */

function listarZonasRecreo() {
  return getAll(SHEETS.ZONAS_RECREO).sort(function(a, b) { return (a.orden || 0) - (b.orden || 0); });
}

function guardarZonasRecreo(zonas) {
  _exigirEdicion();
  if (!Array.isArray(zonas)) throw new Error('Formato inválido.');
  const vistos = {};
  const filas = zonas.map(function(z, i) {
    const nombre = String(z.nombre || '').trim();
    if (!nombre) throw new Error('Zona ' + (i + 1) + ': el nombre es obligatorio.');
    const k = nombre.toLowerCase();
    if (vistos[k]) throw new Error('Hay dos zonas llamadas "' + nombre + '".');
    vistos[k] = true;
    return { id: z.id || undefined, nombre: nombre, plazas: Math.max(1, parseInt(z.plazas, 10) || 1), orden: i + 1, color: z.color || '' };
  });
  const r = bulkMerge_(SHEETS.ZONAS_RECREO, filas, ['nombre'], 'reemplazar');
  // Turnos de zonas que ya no existen: fuera.
  const ids = {};
  listarZonasRecreo().forEach(function(z) { ids[z.id] = true; });
  const ocs = getAll(SHEETS.OCUPACIONES);
  const resto = ocs.filter(function(o) { return !(_esTurnoRecreo(o) && !ids[o.localizacion_id]); });
  if (resto.length !== ocs.length) bulkReplace_(SHEETS.OCUPACIONES, resto);
  return { ok: true, total: r.total };
}

/** Todo lo que necesita la pestaña Recreos. */
function datosRecreos() {
  const tramos = getAll(SHEETS.TRAMOS).sort(function(a, b) { return (a.orden || 0) - (b.orden || 0); });
  const recreos = tramos.filter(function(t) { return t.es_recreo; });
  const docentes = getAll(SHEETS.DOCENTES).filter(function(d) { return d.activo !== false; });
  const ocs = getAll(SHEETS.OCUPACIONES);

  // Quién está en el centro cada día y semana (tiene algo ese día).
  const presente = {}; // id -> 'L|A' -> true
  ocs.forEach(function(o) {
    if (!o.docente_id) return;
    const d = _diaCanon(o.dia), s = String(o.semana || '').trim().toUpperCase();
    const p = presente[o.docente_id] || (presente[o.docente_id] = {});
    (s ? [s] : ['A', 'B']).forEach(function(w) { p[d + '|' + w] = true; });
  });

  return {
    tramos: recreos.map(function(t) { return { id: t.id, orden: t.orden, horas: _hhmm(t.hora_inicio) + ' – ' + _hhmm(t.hora_fin), etiqueta: t.etiqueta || '' }; }),
    zonas: listarZonasRecreo().map(function(z) { return { id: z.id, nombre: z.nombre, plazas: z.plazas || 1, color: z.color || '' }; }),
    docentes: docentes.map(function(d) {
      return { id: d.id, nombre: String(d.sustituto || '').trim() || d.nombre_corto, titular: d.nombre_corto, presente: presente[d.id] || {} };
    }).sort(function(a, b) { return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }); }),
    turnos: ocs.filter(_esTurnoRecreo).map(function(o) {
      return { docente_id: o.docente_id, dia: _diaCanon(o.dia), tramo_id: o.tramo_id, zona_id: o.localizacion_id, semana: String(o.semana || '').trim().toUpperCase() };
    }),
    semanaActual: semanaActual()
  };
}

/**
 * Reemplaza los turnos de un recreo. turnos: [{ docente_id, dia, zona_id, semana }].
 */
function guardarRecreos(tramoId, turnos) {
  _exigirEdicion();
  if (!tramoId) throw new Error('Falta el recreo.');
  if (!Array.isArray(turnos)) throw new Error('Formato inválido.');
  const zonas = {};
  listarZonasRecreo().forEach(function(z) { zonas[z.id] = true; });
  const rol = _rolGuardia();
  const vistos = {};
  const nuevas = [];
  turnos.forEach(function(t) {
    const dia = _diaCanon(t.dia), sem = String(t.semana || '').toUpperCase();
    if (!t.docente_id || !zonas[t.zona_id] || _DIAS_VALIDOS.indexOf(dia) === -1) return;
    const k = [t.docente_id, dia, t.zona_id, sem].join('|');
    if (vistos[k]) return;
    vistos[k] = true;
    nuevas.push({
      docente_id: t.docente_id, dia: dia, tramo_id: tramoId, tipo: 'especial',
      grupo_id: '', materia_id: '', localizacion_id: t.zona_id, rol_loc_id: '', grupo_destino_id: '',
      rol_especial_id: rol, notas: '', mitad: '', semana: (sem === 'A' || sem === 'B') ? sem : ''
    });
  });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const resto = getAll(SHEETS.OCUPACIONES).filter(function(o) { return !(_esTurnoRecreo(o) && o.tramo_id === tramoId); });
    bulkReplace_(SHEETS.OCUPACIONES, resto.concat(nuevas));
  } finally {
    lock.releaseLock();
  }
  return { ok: true, total: nuevas.length };
}

// ---------- Internos ----------

function _esTurnoRecreo(o) {
  return o.tipo === 'especial' && /^zona/.test(String(o.localizacion_id || ''));
}

/** Id del rol de recreo («Recreo» o el antiguo «Gua.»); si no existe, se crea. */
function _rolGuardia() {
  const roles = getAll(SHEETS.ROLES);
  const r = roles.filter(function(x) { return /^gua|guardia|recreo/i.test(String(x.nombre) + ' ' + String(x.nombre_largo || '')); })[0];
  if (r) return r.id;
  const nuevo = insert_(SHEETS.ROLES, { nombre: 'Recreo', nombre_largo: 'Vigilancia de recreo', color: '#9b9ba3', categoria: 'cargo',
    orden: roles.reduce(function(m, x) { return Math.max(m, x.orden || 0); }, 0) + 1 });
  return nuevo.id;
}
