/**
 * Lógica del paso 2 del wizard: datos del centro.
 *
 * _Centro es una entidad singleton: una sola fila con id="centro_1".
 *
 * Además de los campos del DESIGN §3.1, guardamos en PropertiesService
 * tres "preferencias del wizard" que afinan los defaults de pasos
 * posteriores (etapas, líneas por curso, idioma bilingüe). No son datos
 * de dominio, son hints de UX, por eso no van en la pestaña.
 */

const CENTRO_ID = 'centro_1';
const PROP_KEY_WIZARD = 'wizard_prefs';

function obtenerCentro() {
  const centro = findById(SHEETS.CENTRO, CENTRO_ID);
  const prefs = obtenerPreferenciasWizard();
  return { centro: centro, prefs: prefs };
}

function guardarCentro(datos) {
  if (!datos || !datos.nombre || !String(datos.nombre).trim()) {
    throw new Error('El nombre del centro es obligatorio.');
  }
  if (!datos.curso_academico || !String(datos.curso_academico).trim()) {
    throw new Error('El curso académico es obligatorio.');
  }

  const fila = {
    id: CENTRO_ID,
    nombre: _str(datos.nombre),
    codigo: _str(datos.codigo),
    localidad: _str(datos.localidad),
    provincia: _str(datos.provincia),
    comunidad: _str(datos.comunidad) || 'Andalucía',
    etapas: _str(datos.etapas),
    curso_academico: _str(datos.curso_academico),
    fecha_inicio: datos.fecha_inicio || '',
    fecha_fin: datos.fecha_fin || ''
  };
  upsert(SHEETS.CENTRO, fila);

  guardarPreferenciasWizard({
    etapas: datos.etapas || '',
    lineas: datos.lineas || '',
    bilingue: datos.bilingue || ''
  });

  return { ok: true };
}

/**
 * Guardado del PRIMER paso del alta guiada: crea (o actualiza) la fila del
 * centro solo con lo mínimo (código, nombre, curso), sin exigir el resto de
 * campos que sí pide guardarCentro() desde la pestaña Centro. El resto de
 * campos que ya existieran se conservan.
 */
function guardarCentroInicial(datos) {
  datos = datos || {};
  const nombre = _str(datos.nombre);
  const codigo = _str(datos.codigo);
  if (!nombre && !codigo) {
    throw new Error('Indica al menos el código o el nombre del centro.');
  }

  const previo = findById(SHEETS.CENTRO, CENTRO_ID) || {};
  const fila = {
    id: CENTRO_ID,
    nombre: nombre || previo.nombre || 'Centro',
    codigo: codigo || previo.codigo || '',
    localidad: _str(datos.localidad) || previo.localidad || '',
    provincia: _str(datos.provincia) || previo.provincia || '',
    comunidad: _str(datos.comunidad) || previo.comunidad || 'Andalucía',
    etapas: _str(datos.etapas) || previo.etapas || '',
    curso_academico: _str(datos.curso_academico) || previo.curso_academico || '',
    fecha_inicio: datos.fecha_inicio || previo.fecha_inicio || '',
    fecha_fin: datos.fecha_fin || previo.fecha_fin || ''
  };
  upsert(SHEETS.CENTRO, fila);
  return { ok: true, centro: fila };
}

function obtenerPreferenciasWizard() {
  // OJO: este script es standalone (no ligado a un documento), así que
  // getDocumentProperties() devuelve null. Usamos las propiedades del script.
  const raw = PropertiesService.getScriptProperties().getProperty(PROP_KEY_WIZARD);
  if (!raw) return { etapas: '', lineas: '', bilingue: '' };
  try { return JSON.parse(raw); }
  catch (e) { return { etapas: '', lineas: '', bilingue: '' }; }
}

function guardarPreferenciasWizard(prefs) {
  PropertiesService.getScriptProperties()
    .setProperty(PROP_KEY_WIZARD, JSON.stringify(prefs));
}

function _str(v) { return v == null ? '' : String(v).trim(); }
