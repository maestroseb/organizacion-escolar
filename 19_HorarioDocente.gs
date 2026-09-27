/**
 * Editor del horario individual de un docente.
 *
 * Permite corregir a mano las ocupaciones de un docente (lo que falla o falta
 * tras importar). El editor trabaja con el conjunto completo de ocupaciones de
 * ese docente y las guarda de forma atómica: se sustituyen todas las suyas por
 * las nuevas, sin tocar las del resto.
 */

const _DIAS_VALIDOS = ['L', 'M', 'X', 'J', 'V'];

/**
 * Datos para el editor: catálogo (para los desplegables) y las ocupaciones
 * actuales del docente, normalizadas a una forma cómoda para el frontend.
 */
function datosHorarioDocente(docenteId) {
  if (!docenteId) throw new Error('Falta el docente.');
  const cat = catalogoImportacion(); // { docentes, grupos, materias, roles, tramos }
  const ocupaciones = getAll(SHEETS.OCUPACIONES)
    .filter(function(o) { return o.docente_id === docenteId; })
    .map(function(o) {
      return {
        dia: o.dia || '',
        tramo_id: o.tramo_id || '',
        tipo: o.tipo || 'grupo',
        materia_id: o.materia_id || '',
        grupo_id: o.grupo_id || '',
        rol_id: (o.tipo === 'localizacion' ? o.rol_loc_id : o.rol_especial_id) || '',
        grupo_destino_id: o.grupo_destino_id || '',
        localizacion_id: o.localizacion_id || '', // zona de recreo (24_Recreos)
        // Filas antiguas guardaron la mitad como número (1/2): el editor
        // compara con '1'/'2'.
        mitad: String(o.mitad || ''),
        semana: String(o.semana || ''),
        notas: o.notas || ''
      };
    });
  return { catalogo: cat, ocupaciones: ocupaciones };
}

/**
 * Reemplaza TODAS las ocupaciones del docente por las recibidas.
 * Cada fila debe traer dia, tramo_id y tipo; el resto según el tipo.
 */
function guardarHorarioDocente(docenteId, ocupaciones) {
  _exigirEdicion();
  if (!docenteId) throw new Error('Falta el docente.');
  if (!Array.isArray(ocupaciones)) throw new Error('Formato inválido.');

  const errores = [];
  ocupaciones.forEach(function(f, i) {
    const n = i + 1;
    if (_DIAS_VALIDOS.indexOf(String(f.dia || '').toUpperCase()) === -1) errores.push('Fila ' + n + ': día no válido.');
    if (!f.tramo_id) errores.push('Fila ' + n + ': falta el tramo.');
    if (['grupo', 'localizacion', 'especial'].indexOf(f.tipo) === -1) errores.push('Fila ' + n + ': tipo no válido.');
  });
  if (errores.length) throw new Error('No se pudo guardar:\n' + errores.join('\n'));

  const nuevas = ocupaciones.map(function(f) {
    const fila = {
      docente_id: docenteId,
      dia: String(f.dia).toUpperCase(),
      tramo_id: f.tramo_id,
      tipo: f.tipo,
      grupo_id: '', materia_id: '',
      localizacion_id: f.localizacion_id || '', rol_loc_id: '', grupo_destino_id: '',
      rol_especial_id: '',
      notas: f.notas || '',
      mitad: f.mitad || '',
      semana: f.semana || ''
    };
    if (f.tipo === 'grupo') {
      fila.grupo_id = f.grupo_id || '';
      fila.materia_id = f.materia_id || '';
    } else if (f.tipo === 'localizacion') {
      fila.rol_loc_id = f.rol_id || '';
      fila.grupo_destino_id = f.grupo_destino_id || '';
    } else if (f.tipo === 'especial') {
      fila.rol_especial_id = f.rol_id || '';
    }
    return fila;
  });

  const todas = getAll(SHEETS.OCUPACIONES);
  const otras = todas.filter(function(o) { return o.docente_id !== docenteId; });
  bulkReplace(SHEETS.OCUPACIONES, otras.concat(nuevas));

  return { ok: true, total: nuevas.length };
}

// ---------- Horario de un GRUPO ----------

function _csvIds(csv) {
  return String(csv || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
}

/**
 * Horario de un grupo: las clases (tipo 'grupo') que lo incluyen, con su id de
 * fila para poder editarlas, y los apoyos que tienen al grupo como destino
 * (solo lectura: se editan desde el docente).
 */
function datosHorarioGrupo(grupoId) {
  if (!grupoId) throw new Error('Falta el grupo.');
  const cat = catalogoImportacion();
  const colores = {};
  listarMaterias().forEach(function(m) { colores[m.id] = m.color || ''; });
  cat.materias.forEach(function(m) { m.color = colores[m.id] || ''; });
  const todas = getAll(SHEETS.OCUPACIONES);
  const clases = [], apoyos = [];
  todas.forEach(function(o) {
    if (o.tipo === 'grupo' && _csvIds(o.grupo_id).indexOf(grupoId) !== -1) {
      clases.push({ id: o.id, dia: _diaCanon(o.dia), tramo_id: o.tramo_id, docente_id: o.docente_id || '',
        materia_id: o.materia_id || '', grupos: _csvIds(o.grupo_id),
        mitad: String(o.mitad || ''), semana: String(o.semana || ''), notas: o.notas || '' });
    } else if (o.tipo === 'localizacion' && _csvIds(o.grupo_destino_id).indexOf(grupoId) !== -1) {
      apoyos.push({ dia: _diaCanon(o.dia), tramo_id: o.tramo_id, docente_id: o.docente_id || '', rol_id: o.rol_loc_id || '',
        semana: String(o.semana || '') });
    }
  });
  return { catalogo: cat, ocupaciones: clases, apoyos: apoyos };
}

/**
 * Guarda las clases de un grupo. Cada elemento: { id?, dia, tramo_id,
 * docente_id, materia_id, grupos[], mitad, semana, notas }.
 * - Filas existentes (por id) se actualizan (afecta también a los otros grupos
 *   de esa clase compartida).
 * - Una clase que ya no está: se quita el grupo de la fila (si era el único
 *   grupo, la fila se borra).
 * - Sin id: clase nueva.
 */
function guardarHorarioGrupo(grupoId, lista) {
  _exigirEdicion();
  if (!grupoId) throw new Error('Falta el grupo.');
  if (!Array.isArray(lista)) throw new Error('Formato inválido.');
  const errores = [];
  lista.forEach(function(f, i) {
    if (_DIAS_VALIDOS.indexOf(String(f.dia || '').toUpperCase()) === -1) errores.push('Clase ' + (i + 1) + ': día no válido.');
    if (!f.tramo_id) errores.push('Clase ' + (i + 1) + ': falta el tramo.');
    if (!f.docente_id) errores.push('Clase ' + (i + 1) + ': falta el docente.');
  });
  if (errores.length) throw new Error('No se pudo guardar:\n' + errores.join('\n'));

  const porId = {};
  lista.forEach(function(f) { if (f.id) porId[f.id] = f; });
  const grupos = function(f) { const g = (f.grupos || []).filter(Boolean); if (g.indexOf(grupoId) === -1) g.unshift(grupoId); return g.join(','); };
  const aplicar = function(fila, f) {
    fila.dia = String(f.dia).toUpperCase(); fila.tramo_id = f.tramo_id; fila.docente_id = f.docente_id;
    fila.materia_id = f.materia_id || ''; fila.grupo_id = grupos(f);
    fila.mitad = f.mitad || ''; fila.semana = f.semana || ''; fila.notas = f.notas || '';
    return fila;
  };

  const salida = [];
  getAll(SHEETS.OCUPACIONES).forEach(function(o) {
    if (o.tipo !== 'grupo' || _csvIds(o.grupo_id).indexOf(grupoId) === -1) { salida.push(o); return; }
    if (porId[o.id]) { salida.push(aplicar(o, porId[o.id])); delete porId[o.id]; return; }
    const resto = _csvIds(o.grupo_id).filter(function(g) { return g !== grupoId; });
    if (resto.length) { o.grupo_id = resto.join(','); salida.push(o); }
  });
  let nuevas = 0;
  lista.forEach(function(f) {
    if (f.id && !porId.hasOwnProperty(f.id)) return; // ya aplicada
    salida.push(aplicar({ tipo: 'grupo', localizacion_id: '', rol_loc_id: '', grupo_destino_id: '', rol_especial_id: '' }, f));
    nuevas++;
  });
  bulkReplace(SHEETS.OCUPACIONES, salida);
  return { ok: true, total: lista.length, nuevas: nuevas };
}

// ---------- Todo de una vez (Horarios individuales) ----------

/**
 * Catálogo + TODAS las ocupaciones normalizadas, en una sola llamada. El
 * cliente lo guarda en caché y filtra por docente o por grupo: cambiar de
 * docente o de grupo en Horarios individuales es instantáneo.
 */
function datosHorarios() {
  const cat = catalogoImportacion();
  const ocupaciones = getAll(SHEETS.OCUPACIONES).map(function(o) {
    return {
      id: o.id, docente_id: o.docente_id || '',
      dia: _diaCanon(o.dia), tramo_id: o.tramo_id || '', tipo: o.tipo || 'grupo',
      materia_id: o.materia_id || '', grupo_id: o.grupo_id || '',
      rol_id: (o.tipo === 'localizacion' ? o.rol_loc_id : o.rol_especial_id) || '',
      grupo_destino_id: o.grupo_destino_id || '', localizacion_id: o.localizacion_id || '',
      mitad: String(o.mitad || ''), semana: String(o.semana || ''), notas: o.notas || ''
    };
  });
  cat.zonas = listarZonasRecreo().map(function(z) { return { id: z.id, nombre: z.nombre }; });
  return { catalogo: cat, ocupaciones: ocupaciones };
}
