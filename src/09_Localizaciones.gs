/**
 * Lógica del paso 7 del wizard: localizaciones.
 *
 * Una localización es un espacio físico o lógico donde puede ocurrir una
 * actividad: un aula, una biblioteca, un patio de recreo, el aula de PT…
 *
 * Se usan sobre todo en ocupaciones del tipo LOCALIZACION (refuerzos, PT,
 * AL, ATEDU, guardias de recreo, etc.).
 *
 * La plantilla añade un "Aula" por cada grupo del centro más los espacios
 * comunes habituales en un CEIP, según las etapas configuradas.
 */

function listarLocalizaciones() {
  const locs = getAll(SHEETS.LOCALIZACIONES);
  locs.sort(function(a, b) { return (a.orden || 0) - (b.orden || 0); });
  return locs;
}

function plantillaLocalizaciones() {
  const prefs = obtenerPreferenciasWizard();
  const etapas = String(prefs.etapas || '').split(',');
  const grupos = listarGrupos();

  const items = [];

  grupos.forEach(function(g) {
    items.push({
      codigo: 'Aula ' + g.nombre_corto,
      descripcion: g.nombre_largo || ''
    });
  });

  const comunes = [
    { codigo: 'Biblioteca',    descripcion: '' },
    { codigo: 'Gimnasio',      descripcion: '' },
    { codigo: 'Salón Actos',   descripcion: '' },
    { codigo: 'Aula PT',       descripcion: 'Pedagogía Terapéutica' },
    { codigo: 'Aula AL',       descripcion: 'Audición y Lenguaje' },
    { codigo: 'Aula TIC',      descripcion: '' }
  ];
  comunes.forEach(function(c) { items.push(c); });

  if (etapas.indexOf('PRIMARIA') !== -1) {
    items.push({ codigo: 'Recreo Primaria', descripcion: 'Patio de Primaria' });
  }
  if (etapas.indexOf('INFANTIL') !== -1) {
    items.push({ codigo: 'Recreo Infantil', descripcion: 'Patio de Infantil' });
  }

  return items.map(function(it, i) {
    return { codigo: it.codigo, descripcion: it.descripcion, orden: i + 1 };
  });
}

function guardarLocalizaciones(locs) {
  if (!Array.isArray(locs)) throw new Error('Formato inválido.');

  locs.forEach(function(l, i) {
    const n = i + 1;
    if (!l.codigo || !String(l.codigo).trim()) {
      throw new Error('Localización ' + n + ': el código es obligatorio.');
    }
  });

  const codigos = {};
  locs.forEach(function(l) {
    const k = String(l.codigo).trim().toLowerCase();
    if (codigos[k]) {
      throw new Error('Hay localizaciones con el mismo código: "' + l.codigo + '".');
    }
    codigos[k] = true;
  });

  const idsConservados = {};
  locs.forEach(function(l) { if (l.id) idsConservados[l.id] = true; });
  const existentes = getAll(SHEETS.LOCALIZACIONES);
  existentes.forEach(function(e) {
    if (!idsConservados[e.id]) remove(SHEETS.LOCALIZACIONES, e.id);
  });

  const guardados = [];
  locs.forEach(function(l, i) {
    const fila = {
      id: l.id || undefined,
      codigo: String(l.codigo).trim(),
      descripcion: l.descripcion || '',
      orden: i + 1
    };
    guardados.push(upsert(SHEETS.LOCALIZACIONES, fila));
  });

  return { ok: true, total: guardados.length };
}
