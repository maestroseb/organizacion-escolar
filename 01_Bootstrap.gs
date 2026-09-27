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
  // Atajo sin abrir la hoja: esquema ya comprobado recientemente (caché 6 h).
  const props0 = PropertiesService.getScriptProperties();
  const id0 = props0.getProperty(PROP_BD_ID);
  const c = _cache();
  if (id0 && c) {
    const f0 = id0 + '|' + _firmaEsquema();
    if (c.get('bd_ok') === f0 && props0.getProperty(PROP_ESQUEMA_OK) === f0) return true;
  }
  const ss = getBd();
  const firma = ss.getId() + '|' + _firmaEsquema();
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROP_ESQUEMA_OK) === firma) {
    const existentes = {};
    ss.getSheets().forEach(function(h) { existentes[h.getName()] = true; });
    if (SHEET_ORDER.every(function(n) { return existentes[n]; })) { if (c) c.put('bd_ok', firma, 21600); return true; }
  }
  inicializarLibro();
  props.setProperty(PROP_ESQUEMA_OK, firma);
  if (c) c.put('bd_ok', firma, 21600);
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
  try {
    const idBd = PropertiesService.getScriptProperties().getProperty(PROP_BD_ID);
    bdUrl = idBd ? 'https://docs.google.com/spreadsheets/d/' + idBd + '/edit' : '';
  } catch (e) {}

  return {
    configurado: configurado,
    centro: centro || null,
    bdUrl: bdUrl,
    permisos: permisosUsuario(),
    urlApp: (function() { try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; } })(),
    contadores: {
      tramos:         _contar(SHEETS.TRAMOS),
      semanas:        _contar(SHEETS.SEMANAS),
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
 * Qué puede hacer el usuario que abre la app. Admin = propietario del script
 * (quien despliega). Equipo directivo = docente cuyo email coincide con el
 * del usuario (o el de su sustituto/a) y tiene marcado «Edición» en
 * Configuración → Docentes. El resto del profesorado solo puede ver.
 * Session.getActiveUser() solo da el email dentro del mismo dominio.
 */
function permisosUsuario() {
  let email = '', owner = '', admin = false, directivo = false;
  try { email = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) {}
  try {
    owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
    admin = !!email && email === owner;
  } catch (e) {}
  if (email && !admin) {
    try {
      directivo = getAll(SHEETS.DOCENTES).some(function(d) {
        // El sustituto/a que cubre a un titular hereda su acceso.
        return (String(d.email || '').trim().toLowerCase() === email ||
                (String(d.sustituto || '').trim() && String(d.sustituto_email || '').trim().toLowerCase() === email)) &&
               (d.acceso_sust === true || String(d.acceso_sust).toUpperCase() === 'TRUE') && d.activo !== false;
      });
    } catch (e) {}
  }
  // `edicion`: ve Configuración y puede guardar. Sin él, solo lectura.
  // (`sustituciones` se mantiene como alias por compatibilidad.)
  return { admin: admin, directivo: directivo, edicion: admin || directivo, sustituciones: admin || directivo, email: email, propietario: owner };
}

/**
 * Toda función que modifica datos empieza por aquí: solo el administrador y
 * quien tiene permiso de Edición (casilla «Edición» en Docentes). Durante el
 * alta inicial (centro sin configurar) solo puede el administrador.
 */
function _exigirEdicion() {
  if (!permisosUsuario().edicion) throw new Error('Solo lectura: necesitas permiso de Edición para guardar cambios.');
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
  semanas:        'SEMANAS',
  grupos:         'GRUPOS',
  docentes:       'DOCENTES',
  localizaciones: 'LOCALIZACIONES',
  materias:       'MATERIAS',
  roles:          'ROLES',
  ocupaciones:    'OCUPACIONES',
  zonas_recreo:   'ZONAS_RECREO'
};

function vaciarSeccion(clave) {
  _exigirEdicion();
  const nombreConst = SECCIONES_VACIABLES[clave];
  if (!nombreConst) throw new Error('Sección desconocida: ' + clave);
  bulkReplace_(SHEETS[nombreConst], []);
  // Sin zonas, los turnos de recreo quedarían huérfanos: fuera también.
  if (clave === 'zonas_recreo') bulkReplace_(SHEETS.OCUPACIONES, getAll(SHEETS.OCUPACIONES).filter(function(o) { return !_esTurnoRecreo(o); }));
  return { ok: true };
}

/**
 * Reinicia el centro por completo: vacía todas las secciones de datos y la
 * fila del centro, y borra las preferencias del wizard. Deja la base lista
 * para un alta guiada desde cero (la estructura de pestañas se conserva).
 */
function reiniciarCentro() {
  _exigirEdicion();
  Object.keys(SECCIONES_VACIABLES).forEach(function(clave) {
    bulkReplace_(SHEETS[SECCIONES_VACIABLES[clave]], []);
  });
  bulkReplace_(SHEETS.CENTRO, []);
  try {
    PropertiesService.getScriptProperties().deleteProperty(PROP_KEY_WIZARD);
  } catch (e) {}
  return { ok: true };
}
