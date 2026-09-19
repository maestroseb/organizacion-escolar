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
