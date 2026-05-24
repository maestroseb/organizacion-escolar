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

function guardarDocentes(docentes) {
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

  const idsConservados = {};
  docentes.forEach(function(d) { if (d.id) idsConservados[d.id] = true; });
  const existentes = getAll(SHEETS.DOCENTES);
  existentes.forEach(function(e) {
    if (!idsConservados[e.id]) remove(SHEETS.DOCENTES, e.id);
  });

  const guardados = [];
  docentes.forEach(function(d, i) {
    const fila = {
      id: d.id || undefined,
      nombre_corto: String(d.nombre_corto).trim(),
      nombre_completo: d.nombre_completo || '',
      puesto: d.puesto || '',
      email: d.email || '',
      activo: d.activo === false ? false : true,
      orden: i + 1,
      color: d.color || ''
    };
    guardados.push(upsert(SHEETS.DOCENTES, fila));
  });

  return { ok: true, total: guardados.length };
}
