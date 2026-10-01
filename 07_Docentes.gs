/**
 * Lógica del paso 5 del wizard: docentes.
 *
 * Cada docente es una persona del claustro. El campo clave es
 * nombre_corto: es el que aparecerá en todas las vistas (sábana,
 * sustituciones, etc.) y debe ser único en el centro.
 *
 * No hay plantilla: se introducen a mano (o vendrán del XML de Séneca
 * en Fase 2).
 */

function listarDocentes() {
  const docentes = getAll(SHEETS.DOCENTES);
  docentes.sort(function(a, b) {
    return String(a.nombre_corto || '').localeCompare(String(b.nombre_corto || ''), 'es', { sensitivity: 'base' });
  });
  return docentes;
}

function guardarDocentes(docentes, modo) {
  _exigirEdicion();
  if (!Array.isArray(docentes)) throw new Error('Formato inválido.');

  docentes.forEach(function(d, i) {
    const n = i + 1;
    if (!d.nombre_corto || !String(d.nombre_corto).trim()) {
      throw new Error('Docente ' + n + ': el nombre corto es obligatorio.');
    }
  });

  const nombres = {};
  docentes.forEach(function(d) {
    const k = String(d.nombre_corto).trim().toLowerCase();
    if (nombres[k]) {
      throw new Error('Hay docentes con el mismo nombre corto: "' + d.nombre_corto + '".');
    }
    nombres[k] = true;
  });

  const filas = docentes.map(function(d, i) {
    return {
      id: d.id || undefined,
      nombre_corto: String(d.nombre_corto).trim(),
      nombre_completo: d.nombre_completo || '',
      puesto: d.puesto || '',
      email: d.email || '',
      telefono: d.telefono || '',
      activo: d.activo === false ? false : true,
      orden: i + 1,
      color: d.color || '',
      sustituto: d.sustituto || '',
      sustituto_email: d.sustituto_email || '',
      acceso_sust: d.acceso_sust === true,
      parcial: d.parcial === true
    };
  });
  const resumen = bulkMerge_(SHEETS.DOCENTES, filas, ['nombre_corto'], modo || 'reemplazar');
  return { ok: true, total: resumen.total, resumen: resumen };
}

/**
 * Marca (o desmarca) a un docente como de jornada parcial: no viene todos los
 * días, así que Revisión no avisa de «horario incompleto».
 */
function marcarDocenteParcial(id, parcial) {
  _exigirEdicion();
  if (!id) throw new Error('Falta el docente.');
  update_(SHEETS.DOCENTES, id, { parcial: !!parcial });
  return { ok: true };
}


/**
 * Fusiona docentes duplicados: el docente A (sin nombre completo) cuyo
 * nombre corto coincide con el nombre completo de otro docente B. Pasa a B
 * todo lo de A (horario, tutorías, sustituciones y los datos que B no
 * tenga) y borra A. Las ocupaciones de A que choquen con una de B en el
 * mismo día/tramo se descartan (B ya tiene ese hueco).
 * Pasa al reimportar un CSV con nombre corto + completo tras otro que solo
 * traía el nombre largo.
 */
function fusionarDocentesDuplicados() {
  _exigirEdicion();
  const docs = getAll(SHEETS.DOCENTES);
  const porCompleto = {};
  docs.forEach(function(d) { const k = _keyNorm(d.nombre_completo); if (k) porCompleto[k] = d; });
  const destino = {}; // id de A → B
  docs.forEach(function(a) {
    if (String(a.nombre_completo || '').trim()) return;
    const b = porCompleto[_keyNorm(a.nombre_corto)];
    if (b && b.id !== a.id) destino[a.id] = b;
  });
  const ids = Object.keys(destino);
  if (!ids.length) return { ok: true, fusionados: 0 };

  // Datos que B no tenga se toman de A.
  ids.forEach(function(idA) {
    const a = docs.filter(function(d) { return d.id === idA; })[0];
    const b = destino[idA];
    ['puesto', 'email', 'telefono', 'color', 'sustituto', 'sustituto_email'].forEach(function(c) {
      if (!String(b[c] || '').trim() && String(a[c] || '').trim()) b[c] = a[c];
    });
    if (String(a.activo).toUpperCase() !== 'FALSE' && a.activo !== false) b.activo = true;
  });
  const nuevoId = function(id) { return destino[id] ? destino[id].id : id; };

  // Ocupaciones: reasignar, sin duplicar huecos que B ya ocupa.
  const ocs = getAll(SHEETS.OCUPACIONES);
  const clave = function(o) { return [o.docente_id, o.dia, o.tramo_id, o.mitad || '', o.semana || ''].join('|'); };
  const ocupado = {};
  ocs.forEach(function(o) { if (!destino[o.docente_id]) ocupado[clave(o)] = true; });
  let descartadas = 0;
  const ocsFinal = [];
  ocs.forEach(function(o) {
    if (!destino[o.docente_id]) { ocsFinal.push(o); return; }
    o.docente_id = nuevoId(o.docente_id);
    if (ocupado[clave(o)]) { descartadas++; return; }
    ocupado[clave(o)] = true;
    ocsFinal.push(o);
  });
  bulkReplace_(SHEETS.OCUPACIONES, ocsFinal);

  const grupos = getAll(SHEETS.GRUPOS);
  if (grupos.some(function(g) { return destino[g.tutor_id]; })) {
    grupos.forEach(function(g) { g.tutor_id = nuevoId(g.tutor_id); });
    bulkReplace_(SHEETS.GRUPOS, grupos);
  }
  const sus = getAll(SHEETS.SUSTITUCIONES);
  if (sus.some(function(s) { return destino[s.ausente_id] || destino[s.sustituto_id]; })) {
    sus.forEach(function(s) { s.ausente_id = nuevoId(s.ausente_id); s.sustituto_id = nuevoId(s.sustituto_id); });
    bulkReplace_(SHEETS.SUSTITUCIONES, sus);
  }
  bulkReplace_(SHEETS.DOCENTES, docs.filter(function(d) { return !destino[d.id]; }));
  return { ok: true, fusionados: ids.length, descartadas: descartadas };
}
