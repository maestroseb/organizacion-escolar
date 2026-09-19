/**
 * Arranque de la base de datos (script standalone).
 *
 * Este script NO está pegado a ninguna hoja. La primera vez que se usa,
 * crea automáticamente una hoja de cálculo en el Drive del usuario que
 * despliega la web app, la inicializa con las 9 pestañas y guarda su id
 * en las propiedades del script. A partir de ahí, todo el acceso a datos
 * pasa por getBd().
 */

/**
 * Devuelve la hoja de cálculo que actúa como base de datos. Si no existe
 * todavía (o el id guardado ya no es válido), la crea en blanco y guarda
 * su id. NO crea las pestañas: de eso se encarga asegurarBaseDatos().
 */
function getBd() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(PROP_BD_ID);
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (e) {
      // El id guardado ya no abre (borrada, sin permiso…): se recrea.
    }
  }
  const ss = SpreadsheetApp.create(NOMBRE_BD);
  props.setProperty(PROP_BD_ID, ss.getId());
  return ss;
}

/**
 * Garantiza que la base de datos existe Y tiene sus pestañas. Es el punto
 * de entrada que llama doGet antes de servir cualquier página.
 */
function asegurarBaseDatos() {
  getBd();
  const estado = estadoEstructura();
  if (!estado.completo) inicializarLibro();
  return true;
}

/**
 * Estado de la base de datos, para diagnóstico y para la pantalla de inicio.
 */
function estadoBaseDatos() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP_BD_ID);
  if (!id) return { creada: false };
  let url = '';
  try { url = SpreadsheetApp.openById(id).getUrl(); } catch (e) { return { creada: false }; }
  return { creada: true, id: id, url: url };
}

/**
 * URL pública de la propia web app (para construir enlaces internos).
 */
function urlApp() {
  return ScriptApp.getService().getUrl();
}

/**
 * Estado global de la app para decidir qué muestra el shell (onboarding vs
 * espacio de trabajo con pestañas) y para pintar el panel Resumen.
 *
 * `configurado` es true cuando ya existe la fila del centro con, al menos,
 * un nombre o un código: es la señal de que el alta guiada se completó.
 */
function estadoApp() {
  asegurarBaseDatos();
  const centro = findById(SHEETS.CENTRO, CENTRO_ID);
  const configurado = !!(centro && (String(centro.nombre || '').trim() ||
                                    String(centro.codigo || '').trim()));

  const bd = estadoBaseDatos();

  return {
    configurado: configurado,
    centro: centro || null,
    estructuraCompleta: estadoEstructura().completo,
    bdUrl: bd.creada ? bd.url : '',
    contadores: {
      tramos:         _contar(SHEETS.TRAMOS),
      grupos:         _contar(SHEETS.GRUPOS),
      docentes:       _contar(SHEETS.DOCENTES),
      tutorias:       _contarConTutor(),
      localizaciones: _contar(SHEETS.LOCALIZACIONES),
      materias:       _contar(SHEETS.MATERIAS),
      roles:          _contar(SHEETS.ROLES),
      ocupaciones:    _contar(SHEETS.OCUPACIONES)
    }
  };
}

function _contar(sheetName) {
  try { return getAll(sheetName).length; } catch (e) { return 0; }
}

function _contarConTutor() {
  try {
    return getAll(SHEETS.GRUPOS).filter(function(g) { return String(g.tutor_id || '').trim(); }).length;
  } catch (e) { return 0; }
}

/**
 * Vacía por completo una sección de datos (pestaña Configuración → zona
 * peligrosa). `clave` es una de las claves de SECCIONES_VACIABLES.
 */
const SECCIONES_VACIABLES = {
  tramos:         'TRAMOS',
  grupos:         'GRUPOS',
  docentes:       'DOCENTES',
  localizaciones: 'LOCALIZACIONES',
  materias:       'MATERIAS',
  roles:          'ROLES',
  ocupaciones:    'OCUPACIONES'
};

function vaciarSeccion(clave) {
  const nombreConst = SECCIONES_VACIABLES[clave];
  if (!nombreConst) throw new Error('Sección desconocida: ' + clave);
  bulkReplace(SHEETS[nombreConst], []);
  return { ok: true };
}

/**
 * Reinicia el centro por completo: vacía todas las secciones de datos y la
 * fila del centro, y borra las preferencias del wizard. Deja la base lista
 * para un alta guiada desde cero (la estructura de pestañas se conserva).
 */
function reiniciarCentro() {
  Object.keys(SECCIONES_VACIABLES).forEach(function(clave) {
    bulkReplace(SHEETS[SECCIONES_VACIABLES[clave]], []);
  });
  bulkReplace(SHEETS.CENTRO, []);
  try {
    PropertiesService.getScriptProperties().deleteProperty(PROP_KEY_WIZARD);
  } catch (e) {}
  return { ok: true };
}
