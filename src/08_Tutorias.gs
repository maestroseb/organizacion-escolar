/**
 * Lógica del paso 6 del wizard: tutorías.
 *
 * No hay tabla propia: la tutoría se guarda como `tutor_id` en _Grupos,
 * apuntando al id del docente correspondiente.
 *
 * Esta capa solo expone (1) el listado conjunto de grupos + docentes para
 * pintar la pantalla, y (2) el guardado en lote de las asignaciones.
 */

function datosTutorias() {
  return {
    grupos: listarGrupos(),
    docentes: listarDocentes().filter(function(d) { return d.activo !== false; })
  };
}

/**
 * Recibe un mapa { grupo_id: tutor_id|'' } y aplica los cambios en _Grupos.
 * Solo modifica el campo tutor_id; el resto del grupo queda intacto.
 */
function guardarTutorias(asignaciones) {
  if (!asignaciones || typeof asignaciones !== 'object') {
    throw new Error('Formato inválido.');
  }

  const docentesValidos = {};
  listarDocentes().forEach(function(d) { docentesValidos[d.id] = true; });

  Object.keys(asignaciones).forEach(function(grupoId) {
    const tutorId = asignaciones[grupoId] || '';
    if (tutorId && !docentesValidos[tutorId]) {
      throw new Error('Docente desconocido: ' + tutorId);
    }
  });

  const grupos = getAll(SHEETS.GRUPOS);
  let cambios = 0;
  grupos.forEach(function(g) {
    if (asignaciones[g.id] !== undefined) {
      g.tutor_id = asignaciones[g.id] || '';
      cambios++;
    }
  });
  bulkReplace(SHEETS.GRUPOS, grupos);

  return { ok: true, total: cambios };
}
