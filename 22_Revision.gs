/**
 * Revisión / resolución de problemas.
 *
 * Analiza la integridad de _Ocupaciones contra el catálogo y devuelve los
 * problemas agrupados por tipo, cada uno con lo necesario para resolverlo
 * desde la pestaña de Revisión (marcar parcial, reasignar o borrar una
 * ocupación, o un enlace al editor correspondiente).
 *
 * Comprobaciones:
 *   - ref:              ocupaciones que apuntan a docente, tramo, grupo, materia
 *                       o rol/cargo inexistente (referencias rotas / no definidas).
 *   - incompleto:       docente activo (no parcial) con huecos en tramos lectivos.
 *   - solape:           un docente con dos ocupaciones a la vez (día/tramo/mitad/semana).
 *   - sin_tutor:        grupos sin tutor (sus huecos salen "sin cubrir" en la sábana).
 *   - tutor_roto:       grupos cuyo tutor apunta a un docente inexistente.
 *   - ocup_incompleta:  ocupaciones a las que les faltan datos (materia, grupo, rol…).
 *   - clase_recreo:     clases asignadas en un tramo marcado como recreo.
 *   - tramos_solapados: tramos que comparten franja horaria.
 *   - semanas_solapadas / sin_calendario: incidencias del calendario A/B.
 *   - duplicados:       nombres repetidos en el catálogo.
 *   - sin_color:        materias o cargos sin color propio.
 */

const _DIAS_REV = ['L', 'M', 'X', 'J', 'V'];

function revisarProblemas() {
  const docentes = getAll(SHEETS.DOCENTES);
  const grupos = getAll(SHEETS.GRUPOS);
  const tramos = getAll(SHEETS.TRAMOS).sort(function(a, b) { return (a.orden || 0) - (b.orden || 0); });
  const materias = getAll(SHEETS.MATERIAS);
  const roles = getAll(SHEETS.ROLES);
  const locs = getAll(SHEETS.LOCALIZACIONES);
  const ocup = getAll(SHEETS.OCUPACIONES);

  const has = function(list) { const s = {}; list.forEach(function(x) { s[x.id] = true; }); return s; };
  const docSet = has(docentes), grupoSet = has(grupos), tramoSet = has(tramos),
        matSet = has(materias), rolSet = has(roles), locSet = has(locs);

  const docById = {}; docentes.forEach(function(d) { docById[d.id] = d; });
  const grupoById = {}; grupos.forEach(function(g) { grupoById[g.id] = g; });
  const tramoById = {}; tramos.forEach(function(t) { tramoById[t.id] = t; });
  const matById = {}; materias.forEach(function(m) { matById[m.id] = m; });
  const rolById = {}; roles.forEach(function(r) { rolById[r.id] = r; });

  const nombreDoc = function(id) { const d = docById[id]; return d ? d.nombre_corto : ('¿? (' + (id || 'vacío') + ')'); };
  const etqTramo = function(id) {
    const t = tramoById[id];
    if (!t) return '¿tramo?';
    return (t.es_recreo ? 'Recreo' : ('T' + t.orden)) + ' ' + _hhmm(t.hora_inicio) + '–' + _hhmm(t.hora_fin);
  };
  const idsRotos = function(csv, set) {
    return String(csv || '').split(',').map(function(s) { return s.trim(); })
      .filter(function(s) { return s && !set[s]; });
  };

  const gruposProblemas = [];

  // ---- A) Referencias rotas ----
  const refItems = [];
  ocup.forEach(function(o) {
    const base = { ocup_id: o.id, docente: nombreDoc(o.docente_id), dia: o.dia, tramo: etqTramo(o.tramo_id) };
    if (o.docente_id && !docSet[o.docente_id]) refItems.push(_ref(base, 'docente_id', 'Docente', o.docente_id));
    if (o.tramo_id && !tramoSet[o.tramo_id]) refItems.push(_ref(base, 'tramo_id', 'Tramo', o.tramo_id));
    if (o.tipo === 'grupo') {
      if (o.materia_id && !matSet[o.materia_id]) refItems.push(_ref(base, 'materia_id', 'Materia', o.materia_id));
      idsRotos(o.grupo_id, grupoSet).forEach(function(v) { refItems.push(_ref(base, 'grupo_id', 'Grupo', v)); });
    } else if (o.tipo === 'localizacion') {
      if (o.rol_loc_id && !rolSet[o.rol_loc_id]) refItems.push(_ref(base, 'rol_loc_id', 'Rol/apoyo', o.rol_loc_id));
      if (o.localizacion_id && !locSet[o.localizacion_id]) refItems.push(_ref(base, 'localizacion_id', 'Localización', o.localizacion_id));
      idsRotos(o.grupo_destino_id, grupoSet).forEach(function(v) { refItems.push(_ref(base, 'grupo_destino_id', 'Grupo destino', v)); });
    } else if (o.tipo === 'especial') {
      if (o.rol_especial_id && !rolSet[o.rol_especial_id]) refItems.push(_ref(base, 'rol_especial_id', 'Cargo', o.rol_especial_id));
    }
  });
  if (refItems.length) {
    gruposProblemas.push({
      tipo: 'ref', gravedad: 'error', titulo: 'Referencias rotas o no definidas',
      descripcion: 'Ocupaciones que apuntan a algo que ya no existe (borrado o mal importado). Reasigna el valor correcto o borra la ocupación.',
      items: refItems
    });
  }

  // ---- B) Horario incompleto ----
  const lectivos = tramos.filter(function(t) { return !t.es_recreo; });
  const esperado = lectivos.length * _DIAS_REV.length;
  // (docente_id) → set de "dia|tramo" lectivos ocupados
  const ocupPorDoc = {};
  ocup.forEach(function(o) {
    if (!o.docente_id) return;
    const t = tramoById[o.tramo_id];
    if (!t || t.es_recreo) return;
    if (_DIAS_REV.indexOf(_diaCanon(o.dia)) === -1) return;
    (ocupPorDoc[o.docente_id] = ocupPorDoc[o.docente_id] || {})[_diaCanon(o.dia) + '|' + o.tramo_id] = true;
  });
  const incItems = [];
  if (esperado > 0) {
    docentes.forEach(function(d) {
      if (d.activo === false || d.parcial === true) return;
      const ocupados = Object.keys(ocupPorDoc[d.id] || {}).length;
      if (ocupados < esperado) {
        incItems.push({ docente_id: d.id, docente: d.nombre_corto, ocupados: ocupados, esperado: esperado, huecos: esperado - ocupados });
      }
    });
  }
  if (incItems.length) {
    gruposProblemas.push({
      tipo: 'incompleto', gravedad: 'aviso', titulo: 'Horario incompleto',
      descripcion: 'Docentes activos con huecos sin asignar en tramos lectivos. Si su jornada es parcial, márcalos como parciales para dejar de avisar; si no, completa su horario.',
      items: incItems.sort(function(a, b) { return b.huecos - a.huecos; })
    });
  }

  // ---- C) Solapes (doble reserva) ----
  const porSlot = {};
  ocup.forEach(function(o) {
    if (!o.docente_id) return;
    const k = [o.docente_id, _diaCanon(o.dia), o.tramo_id, o.mitad || '', o.semana || ''].join('|');
    (porSlot[k] = porSlot[k] || []).push(o);
  });
  const solItems = [];
  Object.keys(porSlot).forEach(function(k) {
    const g = porSlot[k];
    if (g.length < 2) return;
    const o0 = g[0];
    solItems.push({
      docente_id: o0.docente_id, docente: nombreDoc(o0.docente_id),
      dia: _diaLargo(_diaCanon(o0.dia)), tramo: etqTramo(o0.tramo_id),
      cuantas: g.length,
      detalles: g.map(function(o) { return _resumenOcup(o, matById, rolById, grupoById); })
    });
  });
  if (solItems.length) {
    gruposProblemas.push({
      tipo: 'solape', gravedad: 'error', titulo: 'Solapes de docente',
      descripcion: 'Un mismo docente tiene dos o más ocupaciones a la vez (mismo día, tramo, mitad y semana). Abre su horario para dejar solo la correcta.',
      items: solItems
    });
  }

  // ---- D) Grupos sin tutor ----
  const sinTutor = grupos.filter(function(g) { return !String(g.tutor_id || '').trim(); })
    .map(function(g) { return { grupo_id: g.id, grupo: g.nombre_corto }; });
  if (sinTutor.length) {
    gruposProblemas.push({
      tipo: 'sin_tutor', gravedad: 'aviso', titulo: 'Grupos sin tutor',
      descripcion: 'Sin tutor, los huecos sin clase de estos grupos salen como "sin cubrir" en la sábana. Asigna su tutor/a.',
      items: sinTutor
    });
  }

  // ---- E) Tutores inexistentes (grupo con tutor_id roto) ----
  const tutorRoto = grupos
    .filter(function(g) { return String(g.tutor_id || '').trim() && !docSet[g.tutor_id]; })
    .map(function(g) { return _gen(g.nombre_corto + ' — tutor/a inexistente (' + g.tutor_id + ')', [{ t: 'tab', label: 'Editar grupos', tab: 'grupos' }]); });
  if (tutorRoto.length) gruposProblemas.push({
    tipo: 'tutor_roto', gravedad: 'error', titulo: 'Tutores inexistentes',
    descripcion: 'Grupos cuyo tutor/a apunta a un docente que ya no existe. Reasigna el tutor en Grupos.', items: tutorRoto
  });

  // ---- F) Ocupaciones incompletas (faltan datos, no referencias rotas) ----
  const incompletas = [];
  ocup.forEach(function(o) {
    const faltas = [];
    if (!o.docente_id) faltas.push('sin docente');
    if (!o.dia) faltas.push('sin día');
    if (!o.tramo_id) faltas.push('sin tramo');
    if (o.tipo === 'grupo') {
      if (!o.materia_id) faltas.push('sin materia');
      if (!String(o.grupo_id || '').trim()) faltas.push('sin grupo');
    } else if (o.tipo === 'localizacion') {
      if (!o.rol_loc_id) faltas.push('sin rol/apoyo');
    } else if (o.tipo === 'especial') {
      if (!o.rol_especial_id) faltas.push('sin cargo');
    } else if (!o.tipo) {
      faltas.push('sin tipo');
    }
    if (!faltas.length) return;
    const acc = [];
    if (o.docente_id && docSet[o.docente_id]) acc.push({ t: 'horario', docente_id: o.docente_id });
    acc.push({ t: 'borrar', ocup_id: o.id });
    incompletas.push(_gen(nombreDoc(o.docente_id) + ' · ' + (o.dia || '¿día?') + ' ' + etqTramo(o.tramo_id) + ' — ' + faltas.join(', '), acc));
  });
  if (incompletas.length) gruposProblemas.push({
    tipo: 'ocup_incompleta', gravedad: 'aviso', titulo: 'Ocupaciones incompletas',
    descripcion: 'Ocupaciones a las que les faltan datos (docente, materia, grupo, rol…). Complétalas en el horario del docente o bórralas.', items: incompletas
  });

  // ---- G) Clases en tramo de recreo ----
  const enRecreo = [];
  ocup.forEach(function(o) {
    const t = tramoById[o.tramo_id];
    if (t && t.es_recreo && o.tipo === 'grupo') {
      const acc = [];
      if (o.docente_id && docSet[o.docente_id]) acc.push({ t: 'horario', docente_id: o.docente_id });
      acc.push({ t: 'borrar', ocup_id: o.id });
      enRecreo.push(_gen(nombreDoc(o.docente_id) + ' · ' + (o.dia || '') + ' ' + etqTramo(o.tramo_id) + ' — clase en un tramo marcado como recreo', acc));
    }
  });
  if (enRecreo.length) gruposProblemas.push({
    tipo: 'clase_recreo', gravedad: 'aviso', titulo: 'Clases en tramo de recreo',
    descripcion: 'Hay clases asignadas en un tramo marcado como recreo. Revisa si el tramo no debería ser lectivo o mueve la clase.', items: enRecreo
  });

  // ---- H) Tramos solapados en horario ----
  const solTramos = [];
  for (let i = 0; i < tramos.length; i++) {
    for (let j = i + 1; j < tramos.length; j++) {
      const a = tramos[i], b = tramos[j];
      const ai = _horaAMin(a.hora_inicio), af = _horaAMin(a.hora_fin), bi = _horaAMin(b.hora_inicio), bf = _horaAMin(b.hora_fin);
      if (ai < 0 || af < 0 || bi < 0 || bf < 0) continue;
      if (ai < bf && bi < af) {
        solTramos.push(_gen(etqTramo(a.id) + ' se solapa con ' + etqTramo(b.id), [{ t: 'tab', label: 'Editar tramos', tab: 'tramos' }]));
      }
    }
  }
  if (solTramos.length) gruposProblemas.push({
    tipo: 'tramos_solapados', gravedad: 'aviso', titulo: 'Tramos solapados',
    descripcion: 'Dos tramos comparten franja horaria. Ajusta sus horas en Tramos.', items: solTramos
  });

  // ---- I) Semanas alternas: solapes de fechas y alternancia sin calendario ----
  const semanas = getAll(SHEETS.SEMANAS).sort(function(a, b) {
    return String(a.fecha_inicio) < String(b.fecha_inicio) ? -1 : String(a.fecha_inicio) > String(b.fecha_inicio) ? 1 : 0;
  });
  const solSemanas = [];
  for (let i = 0; i < semanas.length; i++) {
    for (let j = i + 1; j < semanas.length; j++) {
      const a = semanas[i], b = semanas[j];
      if (a.fecha_inicio && a.fecha_fin && b.fecha_inicio && b.fecha_fin &&
          String(a.fecha_inicio) <= String(b.fecha_fin) && String(b.fecha_inicio) <= String(a.fecha_fin)) {
        solSemanas.push(_gen('«' + (a.etiqueta || (a.fecha_inicio + '…' + a.fecha_fin)) + '» y «' + (b.etiqueta || (b.fecha_inicio + '…' + b.fecha_fin)) + '» comparten fechas',
          [{ t: 'tab', label: 'Editar semanas', tab: 'tramos' }]));
      }
    }
  }
  if (solSemanas.length) gruposProblemas.push({
    tipo: 'semanas_solapadas', gravedad: 'aviso', titulo: 'Semanas alternas solapadas',
    descripcion: 'Dos semanas del calendario A/B cubren fechas comunes; una fecha podría resolverse a la semana equivocada.', items: solSemanas
  });

  const conAlternancia = ocup.filter(function(o) { const s = String(o.semana || '').trim().toUpperCase(); return s === 'A' || s === 'B'; }).length;
  if (conAlternancia > 0 && semanas.length === 0) {
    gruposProblemas.push({
      tipo: 'sin_calendario', gravedad: 'aviso', titulo: 'Alternancia sin calendario',
      descripcion: 'Hay ocupaciones marcadas con semana A/B pero no hay calendario de semanas alternas; no se podrá saber qué semana toca cada día.',
      items: [_gen(conAlternancia + ' ocupación(es) con semana A/B y ningún calendario configurado', [{ t: 'tab', label: 'Configurar semanas', tab: 'tramos' }])]
    });
  }

  // ---- J) Nombres duplicados en el catálogo ----
  const dups = [];
  _dupNombres(docentes, 'nombre_corto').forEach(function(n) { dups.push(_gen('Docentes: «' + n + '» aparece más de una vez', [{ t: 'tab', label: 'Editar docentes', tab: 'docentes' }])); });
  _dupNombres(grupos, 'nombre_corto').forEach(function(n) { dups.push(_gen('Grupos: «' + n + '» aparece más de una vez', [{ t: 'tab', label: 'Editar grupos', tab: 'grupos' }])); });
  _dupNombres(materias, 'nombre').forEach(function(n) { dups.push(_gen('Materias: «' + n + '» aparece más de una vez', [{ t: 'tab', label: 'Editar áreas', tab: 'areas' }])); });
  _dupNombres(roles, 'nombre').forEach(function(n) { dups.push(_gen('Cargos: «' + n + '» aparece más de una vez', [{ t: 'tab', label: 'Editar cargos', tab: 'areas' }])); });
  if (dups.length) gruposProblemas.push({
    tipo: 'duplicados', gravedad: 'aviso', titulo: 'Nombres duplicados',
    descripcion: 'Hay entradas repetidas en el catálogo; el emparejamiento por nombre puede volverse ambiguo. Deja una sola.', items: dups
  });

  // ---- K) Áreas y cargos sin color ----
  const sinColor = [];
  const matSinCol = materias.filter(function(m) { return !String(m.color || '').trim(); }).map(function(m) { return m.abreviatura || m.nombre; });
  const rolSinCol = roles.filter(function(r) { return !String(r.color || '').trim(); }).map(function(r) { return r.nombre; });
  if (matSinCol.length) sinColor.push(_gen('Materias sin color: ' + _muestra(matSinCol), [{ t: 'tab', label: 'Editar áreas', tab: 'areas' }]));
  if (rolSinCol.length) sinColor.push(_gen('Cargos sin color: ' + _muestra(rolSinCol), [{ t: 'tab', label: 'Editar cargos', tab: 'areas' }]));
  if (sinColor.length) gruposProblemas.push({
    tipo: 'sin_color', gravedad: 'aviso', titulo: 'Áreas o cargos sin color',
    descripcion: 'Sin color propio, la sábana usa colores por defecto. Asigna uno para que se distingan mejor.', items: sinColor
  });

  let errores = 0, avisos = 0;
  gruposProblemas.forEach(function(gp) {
    if (gp.gravedad === 'error') errores += gp.items.length; else avisos += gp.items.length;
  });

  return {
    catalogo: catalogoImportacion(),
    resumen: { errores: errores, avisos: avisos, total: errores + avisos, grupos: gruposProblemas.length },
    grupos: gruposProblemas
  };
}

// Item genérico para los chequeos simples: un texto y una lista de acciones
// que el frontend sabe pintar (enlace a pestaña, editar horario, o borrar).
function _gen(texto, acc) {
  return { texto: texto, acc: acc || [] };
}

// Nombres (normalizados) que aparecen más de una vez en una lista.
function _dupNombres(lista, campo) {
  const cuenta = {}, original = {};
  (lista || []).forEach(function(o) {
    const k = _keyNorm(o[campo]);
    if (!k) return;
    cuenta[k] = (cuenta[k] || 0) + 1;
    if (!original[k]) original[k] = String(o[campo]);
  });
  return Object.keys(cuenta).filter(function(k) { return cuenta[k] > 1; }).map(function(k) { return original[k]; });
}

// Muestra corta de una lista de nombres (para no saturar el aviso).
function _muestra(arr) {
  const n = arr.length;
  return arr.slice(0, 8).join(', ') + (n > 8 ? (' … (+' + (n - 8) + ')') : '');
}

function _ref(base, campo, campoLabel, valor) {
  return {
    ocup_id: base.ocup_id, docente: base.docente, dia: base.dia, tramo: base.tramo,
    campo: campo, campoLabel: campoLabel, valor: valor,
    // Campos de valor único → se puede reasignar con un desplegable; los CSV
    // de grupos se resuelven mejor en el editor de horario.
    reasignable: ['docente_id', 'tramo_id', 'materia_id', 'rol_loc_id', 'rol_especial_id'].indexOf(campo) !== -1
  };
}

function _resumenOcup(o, matById, rolById, grupoById) {
  const gr = function(csv) {
    return String(csv || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean)
      .map(function(id) { const g = grupoById[id]; return g ? g.nombre_corto : id; }).join('/');
  };
  if (o.tipo === 'grupo') {
    const m = matById[o.materia_id];
    return ((m ? (m.abreviatura || m.nombre) : '¿materia?') + ' ' + gr(o.grupo_id)).trim();
  }
  if (o.tipo === 'localizacion') {
    const r = rolById[o.rol_loc_id];
    return (r ? r.nombre : '¿rol?') + (o.grupo_destino_id ? (' → ' + gr(o.grupo_destino_id)) : '');
  }
  if (o.tipo === 'especial') {
    const r = rolById[o.rol_especial_id];
    return r ? r.nombre : '¿cargo?';
  }
  return o.tipo || '¿?';
}

// ---------- Resolutores ----------

const _CAMPOS_REASIGNABLES = {
  docente_id: true, tramo_id: true, materia_id: true,
  rol_loc_id: true, rol_especial_id: true, grupo_id: true, grupo_destino_id: true,
  localizacion_id: true
};

/** Cambia un campo de una ocupación (para arreglar una referencia rota). */
function reasignarOcupacion(ocupId, campo, valor) {
  if (!ocupId) throw new Error('Falta la ocupación.');
  if (!_CAMPOS_REASIGNABLES[campo]) throw new Error('Campo no reasignable: ' + campo);
  update(SHEETS.OCUPACIONES, ocupId, _campoValor(campo, valor || ''));
  return { ok: true };
}

function _campoValor(campo, valor) { const o = {}; o[campo] = valor; return o; }

/** Borra una ocupación (p. ej. una huérfana con referencias rotas). */
function eliminarOcupacion(ocupId) {
  if (!ocupId) throw new Error('Falta la ocupación.');
  remove(SHEETS.OCUPACIONES, ocupId);
  return { ok: true };
}
