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
  docentes.sort(function(a, b) { return (a.orden || 0) - (b.orden || 0); });
  return docentes;
}

function guardarDocentes(docentes, modo) {
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
      activo: d.activo === false ? false : true,
      orden: i + 1,
      color: d.color || '',
      sustituto: d.sustituto || '',
      parcial: d.parcial === true ? true : false
    };
  });
  const resumen = bulkMerge(SHEETS.DOCENTES, filas, ['nombre_corto'], modo || 'reemplazar');
  return { ok: true, total: resumen.total, resumen: resumen };
}

/**
 * Marca (o desmarca) a un docente como de horario parcial. Los docentes
 * parciales no aparecen como "horario incompleto" en la Revisión, porque no
 * cubren todos los tramos del centro. Usado desde la pestaña de Revisión.
 */
function marcarDocenteParcial(id, parcial) {
  if (!id) throw new Error('Falta el docente.');
  update(SHEETS.DOCENTES, id, { parcial: !!parcial });
  return { ok: true };
}
