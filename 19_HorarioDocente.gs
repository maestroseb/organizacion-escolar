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
      localizacion_id: '', rol_loc_id: '', grupo_destino_id: '',
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
