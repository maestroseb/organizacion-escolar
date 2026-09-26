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
  if (_BD_CACHE) return _BD_CACHE;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(PROP_BD_ID);
  if (id) {
    try {
      _BD_CACHE = SpreadsheetApp.openById(id);
      return _BD_CACHE;
    } catch (e) {
      // El id guardado ya no abre (borrada, sin permiso…): se recrea.
    }
  }
  // Creación protegida con un lock: si dos peticiones llegan a la vez en el
  // primer arranque no se crean dos hojas-base de datos.
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const idTrasLock = props.getProperty(PROP_BD_ID);
    if (idTrasLock && idTrasLock !== id) {
      try { _BD_CACHE = SpreadsheetApp.openById(idTrasLock); return _BD_CACHE; } catch (e) {}
    }
    const ss = SpreadsheetApp.create(NOMBRE_BD);
    props.setProperty(PROP_BD_ID, ss.getId());
    props.deleteProperty(PROP_ESQUEMA_OK);
    _BD_CACHE = ss;
    return ss;
  } finally {
    lock.releaseLock();
  }
}

// Caché por ejecución del libro abierto (openById es de las llamadas más
// lentas y casi todas las funciones lo necesitan).
let _BD_CACHE = null;

/**
 * Garantiza que la base de datos existe Y tiene sus pestañas. Es el punto
 * de entrada que llama doGet antes de servir cualquier página.
 *
 * inicializarLibro() es idempotente (crea las pestañas que falten y AÑADE
 * columnas nuevas del esquema sin tocar los datos), pero cuesta ~20 llamadas
 * a Sheets. Para no repetirlo en cada carga, se guarda una firma del esquema
 * aplicado: si coincide y están todas las pestañas, no se hace nada.
 */
function asegurarBaseDatos() {
  const ss = getBd();
  const firma = ss.getId() + '|' + _firmaEsquema();
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROP_ESQUEMA_OK) === firma) {
    const existentes = {};
    ss.getSheets().forEach(function(h) { existentes[h.getName()] = true; });
    if (SHEET_ORDER.every(function(n) { return existentes[n]; })) return true;
  }
  inicializarLibro();
  props.setProperty(PROP_ESQUEMA_OK, firma);
  return true;
}

function _firmaEsquema() {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(SCHEMA));
  return Utilities.base64Encode(bytes);
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

  let bdUrl = '';
  try { bdUrl = getBd().getUrl(); } catch (e) {}

  return {
    configurado: configurado,
    centro: centro || null,
    bdUrl: bdUrl,
    permisos: permisosUsuario(),
    contadores: {
      tramos:         _contar(SHEETS.TRAMOS),
      grupos:         _contar(SHEETS.GRUPOS),
      docentes:       _contar(SHEETS.DOCENTES),
      tutorias:       _contarConTutor(),
      localizaciones: _contar(SHEETS.LOCALIZACIONES),
      materias:       _contar(SHEETS.MATERIAS),
      roles:          _contar(SHEETS.ROLES),
      // Solo la columna id: _Ocupaciones es la pestaña grande.
      ocupaciones:    _contar(SHEETS.OCUPACIONES)
    }
  };
}

/**
 * Qué puede ver el usuario que abre la app. Admin = propietario del script
 * (quien despliega). Equipo directivo = docente cuyo email coincide con el
 * del usuario y que tiene asignado un cargo directivo (DIR, JE, SEC).
 * Session.getActiveUser() solo da el email dentro del mismo dominio.
 */
function permisosUsuario() {
  let email = '', admin = false, directivo = false;
  try { email = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) {}
  try {
    const owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
    admin = !!email && email === owner;
  } catch (e) {}
  if (email && !admin) {
    try {
      const doc = getAll(SHEETS.DOCENTES).filter(function(d) {
        return String(d.email || '').trim().toLowerCase() === email;
      })[0];
      if (doc) {
        const rolesDir = {};
        getAll(SHEETS.ROLES).forEach(function(r) {
          if (/^(dir|je|sec)\b|direcci|jefatura|secretar/i.test(String(r.nombre || '') + ' ' + String(r.nombre_largo || ''))) rolesDir[r.id] = true;
        });
        directivo = getAll(SHEETS.OCUPACIONES).some(function(o) {
          return o.docente_id === doc.id && o.tipo === 'especial' && rolesDir[o.rol_especial_id];
        });
      }
    } catch (e) {}
  }
  return { admin: admin, directivo: directivo, sustituciones: admin || directivo };
}

function _contar(sheetName) {
  try { return contarFilas(sheetName); } catch (e) { return 0; }
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
