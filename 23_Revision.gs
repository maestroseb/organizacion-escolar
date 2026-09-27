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
 *   - atedu_sin_religion: ATEDU con un grupo sin Religión a la vez.
 *   - materias_a_la_vez:  dos materias distintas a la vez en un grupo (salvo
 *                         Religión/ATEDU y Francés/ALCT; medias horas y
 *                         semanas A/B no chocan).
 *   - aula_vacia, religion_sin_atedu, materia_dos_docentes,
 *     horas_descompensadas, tutor_poco, apoyo_en_especialidad,
 *     semanas_descompensadas, recreos.
 * Todo salvo las referencias rotas se puede «descartar» desde la pantalla
 * (se guarda en las propiedades del script).
 *   - duplicados:       nombres repetidos en el catálogo.
 *   - sin_color:        materias o cargos sin color propio.
 */

const _DIAS_REV = ['L', 'M', 'X', 'J', 'V'];

/** Duración de un tramo en horas (1 si no tiene horas válidas). */
function _durTramoH(t) {
  if (!t) return 1;
  const a = _horaAMin(t.hora_inicio), b = _horaAMin(t.hora_fin);
  return a >= 0 && b > a ? (b - a) / 60 : 1;
}

function _horaAMin(v) {
  if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
  const m = String(v || '').match(/(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : -1;
}

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

  // ---- E2) Grupos sin nivel (p. ej. creados desde un volcado no reconocido) ----
  const sinNivel = grupos
    .filter(function(g) { return !String(g.nivel || '').trim(); })
    .map(function(g) { return _gen(g.nombre_corto + ' — sin nivel asignado (ordena al final en las vistas)', [{ t: 'tab', label: 'Editar grupos', tab: 'grupos' }]); });
  if (sinNivel.length) gruposProblemas.push({
    tipo: 'sin_nivel', gravedad: 'aviso', titulo: 'Grupos sin nivel',
    descripcion: 'Grupos sin nivel (Infantil/Primaria). Se crean igualmente pero ordenan al final; asígnales el nivel en Grupos.', items: sinNivel
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
      tipo: 'sin_calendario', gravedad: 'info', titulo: 'Alternancia sin calendario',
      descripcion: 'Hay ocupaciones con semana A/B pero no hay calendario de semanas alternas: la semana se calcula alternando desde la fecha de inicio del curso, sin tener en cuenta vacaciones. Configura el calendario en Tramos y semanas.',
      items: [_gen(conAlternancia + ' ocupación(es) con semana A/B y ningún calendario configurado', [{ t: 'tab', label: 'Configurar semanas', tab: 'tramos' }])]
    });
  }

  // ---- I2) Coincidencias en un mismo grupo y momento ----
  // Cada clase se reparte en «cuartos» (semana A/B × 1ª/2ª mitad): dos clases
  // solo coinciden si comparten cuarto, así que las medias horas y las
  // semanas alternas no cuentan como choque.
  const copia = JSON.parse(JSON.stringify(ocup));
  _emparejarRelAtedu(copia, matById, rolById);
  const tipoMat = function(txt) {
    const t = String(txt || '').toLowerCase();
    if (/relig/.test(t)) return 'rel';
    if (/atedu|atenci[oó]n educ/.test(t)) return 'atedu';
    if (/alct|^alt\b|^alt\.|alternativ/.test(t)) return 'altfr';
    if (/franc|^fra\b/.test(t)) return 'fr';
    return '';
  };
  const cuartos = function(o) {
    const s = String(o.semana || '').trim().toUpperCase(), m = String(o.mitad || '').trim();
    const out = [];
    (s === 'A' || s === 'B' ? [s] : ['A', 'B']).forEach(function(w) { (m === '1' || m === '2' ? [m] : ['1', '2']).forEach(function(h) { out.push(w + h); }); });
    return out;
  };
  const enGrupo = {}; // dia|tramo|grupo|cuarto -> [{mat, tipo, doc}]
  copia.forEach(function(o) {
    const t = tramoById[o.tramo_id];
    if (!t || t.es_recreo) return;
    let nombre = '', gs = '';
    if (o.tipo === 'grupo') { const m = matById[o.materia_id]; if (!m) return; nombre = m.abreviatura || m.nombre; gs = o.grupo_id; o._t = tipoMat(m.nombre + ' ' + (m.abreviatura || '')); }
    else if (o.tipo === 'localizacion') { const r = rolById[o.rol_loc_id]; if (!r) return; o._t = tipoMat(r.nombre + ' ' + (r.nombre_largo || '')); if (o._t !== 'atedu') return; nombre = r.nombre; gs = o.grupo_destino_id; }
    else return;
    String(gs || '').split(',').map(function(x) { return x.trim(); }).filter(Boolean).forEach(function(g) {
      cuartos(o).forEach(function(q) {
        const k = _diaCanon(o.dia) + '|' + o.tramo_id + '|' + g + '|' + q;
        (enGrupo[k] = enGrupo[k] || []).push({ mat: nombre, tipo: o._t, doc: o.docente_id });
      });
    });
  });
  const atedu = {}, choques = {};
  Object.keys(enGrupo).forEach(function(k) {
    const xs = enGrupo[k], p = k.split('|'), base = p.slice(0, 3).join('|');
    const tipos = xs.map(function(x) { return x.tipo; });
    // ATEDU sin Religión a la vez.
    if (tipos.indexOf('atedu') !== -1 && tipos.indexOf('rel') === -1) (atedu[base] = atedu[base] || { xs: xs, q: {} }).q[p[3]] = 1;
    // Dos materias distintas a la vez (salvo Religión/ATEDU y Francés/ALCT).
    const mats = {}; xs.forEach(function(x) { mats[x.mat] = x.tipo; });
    const ks = Object.keys(mats);
    if (ks.length < 2) return;
    const par = function(a, b) { return ks.every(function(m) { return mats[m] === a || mats[m] === b; }); };
    if (par('rel', 'atedu') || par('fr', 'altfr')) return;
    (choques[base] = choques[base] || { xs: xs, q: {} }).q[p[3]] = 1;
  });
  const etqCuartos = function(q) {
    const ks = Object.keys(q);
    if (ks.length === 4) return '';
    const sem = ['A', 'B'].filter(function(w) { return ks.some(function(k) { return k[0] === w; }); });
    const mit = ['1', '2'].filter(function(h) { return ks.some(function(k) { return k[1] === h; }); });
    return ' (' + [sem.length === 1 ? 'semana ' + sem[0] : '', mit.length === 1 ? mit[0] + 'ª mitad' : ''].filter(Boolean).join(', ') + ')';
  };
  const itemsDe = function(mapa, texto) {
    return Object.keys(mapa).map(function(base) {
      const p = base.split('|'), x = mapa[base], vistos = {};
      const acc = [];
      x.xs.forEach(function(e) { if (e.doc && docSet[e.doc] && !vistos[e.doc]) { vistos[e.doc] = 1; acc.push({ t: 'horario', docente_id: e.doc }); } });
      const quien = x.xs.map(function(e) { return e.mat + ' (' + nombreDoc(e.doc) + ')'; }).filter(function(v, i, a) { return a.indexOf(v) === i; }).join(' + ');
      return _gen(((grupoById[p[2]] || {}).nombre_corto || p[2]) + ' · ' + _diaLargo(p[0]) + ' ' + etqTramo(p[1]) + etqCuartos(x.q) + ' — ' + texto(quien), acc);
    });
  };
  const atItems = itemsDe(atedu, function(q) { return q + ': ATEDU sin Religión a la vez'; });
  if (atItems.length) gruposProblemas.push({
    tipo: 'atedu_sin_religion', gravedad: 'error', titulo: 'Atención Educativa sin Religión',
    descripcion: 'La Atención Educativa (ATEDU) se da a la vez que Religión con el mismo grupo. Aquí hay ATEDU sin su Religión: revisa el horario del docente de Religión o el de ATEDU.', items: atItems
  });
  const chItems = itemsDe(choques, function(q) { return q + ' a la vez'; });
  if (chItems.length) gruposProblemas.push({
    tipo: 'materias_a_la_vez', gravedad: 'error', titulo: 'Dos materias a la vez en un grupo',
    descripcion: 'Un grupo tiene dos materias distintas en el mismo momento (sin ser medias horas ni semanas alternas). Solo es normal Religión con ATEDU y Francés con su alternativa (ALCT).', items: chItems
  });

  // ---- I3) Más comprobaciones pedagógicas ----
  const lectivosT = tramos.filter(function(t) { return !t.es_recreo; });
  const nomG = function(id) { return (grupoById[id] || {}).nombre_corto || id; };
  // Horas reales de una ocupación por semana: duración del tramo (los hay de
  // media hora y de una hora) × ½ si es media clase × ½ si es de semana A/B.
  const peso = function(o) { return _durTramoH(tramoById[o.tramo_id]) * (String(o.semana || '').trim() ? 0.5 : 1) * (String(o.mitad || '').trim() ? 0.5 : 1); };
  const horas = function(n) { return (Math.round(n * 100) / 100 + '').replace('.', ',') + ' h'; };
  const accDocs = function(ids) { const v = {}; return ids.filter(function(id) { if (!id || !docSet[id] || v[id]) return false; v[id] = 1; return true; }).map(function(id) { return { t: 'horario', docente_id: id }; }); };

  // Aula vacía: tramo lectivo en que un grupo no tiene clase (algún cuarto libre).
  const cubierto = {};
  copia.forEach(function(o) {
    if (o.tipo !== 'grupo' || !tramoById[o.tramo_id] || tramoById[o.tramo_id].es_recreo) return;
    String(o.grupo_id || '').split(',').map(function(x) { return x.trim(); }).filter(Boolean).forEach(function(g) {
      cuartos(o).forEach(function(q) { cubierto[_diaCanon(o.dia) + '|' + o.tramo_id + '|' + g + '|' + q] = 1; });
    });
  });
  const vacias = [];
  grupos.forEach(function(g) {
    _DIAS_REV.forEach(function(d) {
      lectivosT.forEach(function(t) {
        const q = {};
        ['A1', 'A2', 'B1', 'B2'].forEach(function(k) { if (!cubierto[d + '|' + t.id + '|' + g.id + '|' + k]) q[k] = 1; });
        if (!Object.keys(q).length) return;
        vacias.push(_gen(g.nombre_corto + ' · ' + _diaLargo(d) + ' ' + etqTramo(t.id) + etqCuartos(q) + ' — aula vacía (sin clase asignada)',
          g.tutor_id && docSet[g.tutor_id] ? [{ t: 'horario', label: 'Horario del tutor/a', docente_id: g.tutor_id }] : [{ t: 'tab', label: 'Editar grupos', tab: 'grupos' }]));
      });
    });
  });
  if (vacias.length) gruposProblemas.push({
    tipo: 'aula_vacia', gravedad: 'error', titulo: 'Aulas vacías',
    descripcion: 'Tramos lectivos en que un grupo no tiene ninguna clase asignada: en la sábana salen «sin cubrir». Asigna la clase (o descártalo si ese grupo no tiene clase a esa hora).', items: vacias
  });

  // Religión sin ATEDU; misma materia con dos docentes a la vez.
  const relSin = {}, dosDoc = {};
  Object.keys(enGrupo).forEach(function(k) {
    const xs = enGrupo[k], p = k.split('|'), base = p.slice(0, 3).join('|');
    const tipos = xs.map(function(x) { return x.tipo; });
    if (tipos.indexOf('rel') !== -1 && tipos.indexOf('atedu') === -1) (relSin[base] = relSin[base] || { xs: xs, q: {} }).q[p[3]] = 1;
    const porMat = {};
    xs.forEach(function(x) { (porMat[x.mat] = porMat[x.mat] || {})[x.doc] = 1; });
    if (Object.keys(porMat).some(function(m) { return Object.keys(porMat[m]).length > 1; })) (dosDoc[base] = dosDoc[base] || { xs: xs, q: {} }).q[p[3]] = 1;
  });
  const relItems = itemsDe(relSin, function(q) { return q + ': Religión sin ATEDU a la vez'; });
  if (relItems.length) gruposProblemas.push({
    tipo: 'religion_sin_atedu', gravedad: 'aviso', titulo: 'Religión sin Atención Educativa',
    descripcion: 'Religión sin ATEDU a la vez con el mismo grupo. Es correcto solo si todo el grupo cursa Religión.', items: relItems
  });
  const ddItems = itemsDe(dosDoc, function(q) { return q + ': misma materia con dos docentes'; });
  if (ddItems.length) gruposProblemas.push({
    tipo: 'materia_dos_docentes', gravedad: 'aviso', titulo: 'Misma materia con dos docentes a la vez',
    descripcion: 'Un grupo tiene la misma materia con dos docentes en el mismo momento. Puede ser un desdoble legítimo; si no, sobra uno.', items: ddItems
  });

  // Horas por materia descompensadas entre grupos del mismo nivel.
  const hMat = {}; // grupo -> materia -> horas
  copia.forEach(function(o) {
    if (o.tipo !== 'grupo' || !matById[o.materia_id] || !tramoById[o.tramo_id] || tramoById[o.tramo_id].es_recreo) return;
    String(o.grupo_id || '').split(',').map(function(x) { return x.trim(); }).filter(Boolean).forEach(function(g) {
      const h = hMat[g] = hMat[g] || {};
      h[o.materia_id] = (h[o.materia_id] || 0) + peso(o);
    });
  });
  const porNivel = {};
  grupos.forEach(function(g) { const n = String(g.nivel || '').trim() || String(g.nombre_corto || '').replace(/\s*[A-Z]$/i, ''); (porNivel[n] = porNivel[n] || []).push(g); });
  const desc = [];
  Object.keys(porNivel).forEach(function(n) {
    const gs = porNivel[n];
    if (gs.length < 2) return;
    const mats = {};
    gs.forEach(function(g) { Object.keys(hMat[g.id] || {}).forEach(function(m) { mats[m] = 1; }); });
    Object.keys(mats).forEach(function(m) {
      const hs = gs.map(function(g) { return { g: g, h: (hMat[g.id] || {})[m] || 0 }; });
      const max = Math.max.apply(null, hs.map(function(x) { return x.h; })), min = Math.min.apply(null, hs.map(function(x) { return x.h; }));
      if (max - min < 0.5) return;
      const mm = matById[m];
      desc.push(_gen((mm.abreviatura || mm.nombre) + ' en ' + n + ': ' + hs.map(function(x) { return x.g.nombre_corto + ' ' + horas(x.h); }).join(' · '),
        [{ t: 'tab', label: 'Ver horarios', tab: 'horario' }]));
    });
  });
  if (desc.length) gruposProblemas.push({
    tipo: 'horas_descompensadas', gravedad: 'aviso', titulo: 'Horas por materia distintas en un mismo nivel',
    descripcion: 'Grupos del mismo nivel con distinto número de horas semanales de una materia.', items: desc
  });

  // Tutor/a que apenas da clase a su grupo.
  const tutPoco = [];
  grupos.forEach(function(g) {
    if (!g.tutor_id || !docSet[g.tutor_id]) return;
    let h = 0;
    copia.forEach(function(o) {
      if (o.tipo === 'grupo' && o.docente_id === g.tutor_id && tramoById[o.tramo_id] && !tramoById[o.tramo_id].es_recreo &&
          String(o.grupo_id || '').split(',').map(function(x) { return x.trim(); }).indexOf(g.id) !== -1) h += peso(o);
    });
    if (h < 3) tutPoco.push(_gen(g.nombre_corto + ' — su tutor/a (' + nombreDoc(g.tutor_id) + ') ' + (h ? 'solo le da ' + horas(h) + ' a la semana' : 'no le da clase'),
      [{ t: 'horario', docente_id: g.tutor_id }, { t: 'tab', label: 'Editar grupos', tab: 'grupos' }]));
  });
  if (tutPoco.length) gruposProblemas.push({
    tipo: 'tutor_poco', gravedad: 'aviso', titulo: 'Tutor/a con pocas horas en su grupo',
    descripcion: 'El tutor o tutora da menos de 3 horas semanales a su grupo (o ninguna). Revisa la tutoría o el horario.', items: tutPoco
  });

  // Apoyo / PT / AL que coincide con Religión/ATEDU o una especialidad.
  const especial = function(txt) { return /relig|atedu|atenci[oó]n educ|educaci[oó]n f|^ef\b|ingl|^ing\b|m[uú]sica|^mus\b|franc|^fra\b/i.test(String(txt || '')); };
  const apEsp = [];
  copia.forEach(function(o) {
    if (o.tipo !== 'localizacion' || !o.grupo_destino_id) return;
    const r = rolById[o.rol_loc_id];
    if (r && /atedu|atenci[oó]n educ/i.test(r.nombre + ' ' + (r.nombre_largo || ''))) return;
    String(o.grupo_destino_id).split(',').map(function(x) { return x.trim(); }).filter(Boolean).forEach(function(g) {
      const qs = cuartos(o), vistos = {};
      qs.forEach(function(q) {
        (enGrupo[_diaCanon(o.dia) + '|' + o.tramo_id + '|' + g + '|' + q] || []).forEach(function(x) {
          if (x.doc === o.docente_id || !especial(x.mat) || vistos[x.mat]) return;
          vistos[x.mat] = 1;
          apEsp.push(_gen(nombreDoc(o.docente_id) + ' (' + (r ? r.nombre : 'apoyo') + ') · ' + nomG(g) + ' · ' + _diaLargo(_diaCanon(o.dia)) + ' ' + etqTramo(o.tramo_id) +
            ' — coincide con ' + x.mat + ' (' + nombreDoc(x.doc) + ')', accDocs([o.docente_id, x.doc])));
        });
      });
    });
  });
  if (apEsp.length) gruposProblemas.push({
    tipo: 'apoyo_en_especialidad', gravedad: 'aviso', titulo: 'Apoyo o PT/AL durante una especialidad',
    descripcion: 'Un apoyo, PT o AL saca alumnado de su grupo mientras tiene Religión/ATEDU o una especialidad (EF, Inglés, Música, Francés).', items: apEsp
  });

  // Semana A y B descompensadas (por docente).
  const semDesc = [];
  docentes.forEach(function(d) {
    if (d.activo === false) return;
    const h = { A: 0, B: 0 };
    copia.forEach(function(o) {
      if (o.docente_id !== d.id || !tramoById[o.tramo_id] || tramoById[o.tramo_id].es_recreo) return;
      const s0 = String(o.semana || '').trim().toUpperCase(), w = _durTramoH(tramoById[o.tramo_id]) * (String(o.mitad || '').trim() ? 0.5 : 1);
      if (s0 === 'A' || s0 === 'B') h[s0] += w; else { h.A += w; h.B += w; }
    });
    if (Math.abs(h.A - h.B) >= 0.5) semDesc.push(_gen(d.nombre_corto + ' — semana A ' + horas(h.A) + ' · semana B ' + horas(h.B), [{ t: 'horario', docente_id: d.id }]));
  });
  if (semDesc.length) gruposProblemas.push({
    tipo: 'semanas_descompensadas', gravedad: 'aviso', titulo: 'Semana A y B descompensadas',
    descripcion: 'Docentes con distinto número de horas lectivas en la semana A y en la B.', items: semDesc
  });

  // Recreos: turno un día sin estar en el centro; reparto desigual.
  const turnos = ocup.filter(_esTurnoRecreo), recItems = [];
  const presente = {};
  ocup.forEach(function(o) {
    if (!o.docente_id || _esTurnoRecreo(o)) return;
    const s0 = String(o.semana || '').trim().toUpperCase();
    (s0 === 'A' || s0 === 'B' ? [s0] : ['A', 'B']).forEach(function(w) { presente[o.docente_id + '|' + _diaCanon(o.dia) + '|' + w] = 1; });
  });
  const nTurnos = {};
  turnos.forEach(function(o) {
    const s0 = String(o.semana || '').trim().toUpperCase(), ws = s0 === 'A' || s0 === 'B' ? [s0] : ['A', 'B'];
    nTurnos[o.docente_id] = (nTurnos[o.docente_id] || 0) + (ws.length === 1 ? 0.5 : 1);
    if (ws.some(function(w) { return !presente[o.docente_id + '|' + _diaCanon(o.dia) + '|' + w]; }))
      recItems.push(_gen(nombreDoc(o.docente_id) + ' · ' + _diaLargo(_diaCanon(o.dia)) + (s0 ? ' (semana ' + s0 + ')' : '') + ' — turno de recreo un día que no está en el centro', [{ t: 'tab', label: 'Ir a Recreos', tab: 'recreos' }]));
  });
  const ids = Object.keys(nTurnos);
  if (ids.length > 2) {
    const media = ids.reduce(function(a, id) { return a + nTurnos[id]; }, 0) / ids.length;
    ids.forEach(function(id) {
      if (nTurnos[id] >= media + 2) recItems.push(_gen(nombreDoc(id) + ' — ' + horas(nTurnos[id]).replace(' h', '') + ' turnos de recreo por semana (la media es ' + horas(media).replace(' h', '') + ')', [{ t: 'tab', label: 'Ir a Recreos', tab: 'recreos' }]));
    });
  }
  if (recItems.length) gruposProblemas.push({
    tipo: 'recreos', gravedad: 'aviso', titulo: 'Turnos de recreo',
    descripcion: 'Turnos asignados un día en que la persona no está en el centro, o reparto muy por encima de la media.', items: recItems
  });

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

  // Descartados por el usuario (todo salvo referencias rotas se puede descartar).
  const desc0 = _descartesRevision();
  let descartados = 0;
  gruposProblemas.forEach(function(gp) {
    gp.descartable = gp.tipo !== 'ref';
    gp.items.forEach(function(it) { it.clave = gp.tipo + '|' + (it.texto || it.docente_id || it.grupo_id || it.grupo || it.ocup_id || JSON.stringify(it)); });
    if (!gp.descartable) return;
    const antes = gp.items.length;
    gp.items = gp.items.filter(function(it) { return !desc0[it.clave]; });
    descartados += antes - gp.items.length;
  });
  for (let i = gruposProblemas.length - 1; i >= 0; i--) if (!gruposProblemas[i].items.length) gruposProblemas.splice(i, 1);

  let errores = 0, avisos = 0;
  gruposProblemas.forEach(function(gp) {
    if (gp.gravedad === 'error') errores += gp.items.length; else avisos += gp.items.length;
  });

  return {
    catalogo: catalogoImportacion(),
    resumen: { errores: errores, avisos: avisos, total: errores + avisos, grupos: gruposProblemas.length, descartados: descartados },
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

// ---------- Descartes (avisos que el usuario da por buenos) ----------
const PROP_REV_DESCARTES = 'REV_DESCARTES';
function _descartesRevision() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(PROP_REV_DESCARTES) || '{}') || {}; } catch (e) { return {}; }
}
function descartarAvisoRevision(clave) {
  if (!clave) throw new Error('Falta el aviso.');
  const d = _descartesRevision();
  d[String(clave).slice(0, 300)] = 1;
  PropertiesService.getScriptProperties().setProperty(PROP_REV_DESCARTES, JSON.stringify(d));
  return { ok: true };
}
function restaurarDescartesRevision() {
  PropertiesService.getScriptProperties().deleteProperty(PROP_REV_DESCARTES);
  return { ok: true };
}
