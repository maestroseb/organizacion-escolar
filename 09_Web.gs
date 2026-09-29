/**
 * Punto de entrada de la Web App (script standalone).
 *
 * La app es ahora una SPA: doGet sirve SIEMPRE el mismo shell (app.html),
 * evaluado como plantilla de HtmlService para poder componerlo con parciales
 * mediante include(). El shell decide en el cliente entre el alta guiada
 * (si el centro no está configurado) y el espacio de trabajo con pestañas.
 *
 * El parámetro ?page= (o el hash #pestaña) se conserva solo como enlace
 * profundo: no cambia de página, únicamente selecciona la pestaña inicial.
 */

function doGet(e) {
  asegurarBaseDatos();
  const par = (e && e.parameter) || {};

  // Datos de Ahora para el panel externo (página fuera de Google, sin banda
  // ni sesión): JSON/JSONP con la clave del panel y sin ausentes.
  if (par.api === 'ahora') return _apiAhora(par);

  // Panel abierto (conserjería, pantalla de la sala de profesorado): Ahora sin
  // cuenta, con la clave secreta del enlace. Solo ve el tramo en curso.
  const publico = par.vista === 'ahora' && _clavePanelValida(par.k);
  if (publico) _LECTURA = true;

  // Lista blanca: solo el administrador y el profesorado dado de alta (con
  // su email, o el del sustituto/a) en Configuración → Docentes.
  if (!publico) {
    const acceso = _accesoPermitido();
    if (!acceso.ok) return _paginaSinAcceso(acceso.email);
    _LECTURA = true;
  }

  const page = par.page || '';

  // Enlace directo para el Site del profesorado: solo el tramo en curso.
  if (par.vista === 'ahora') {
    const ta = HtmlService.createTemplateFromFile('ahora');
    ta.datos = publico ? _ahoraSinAusentes(datosAhora()) : datosAhora();
    ta.clave = publico ? String(par.k) : '';
    return ta.evaluate()
      .setTitle('Ahora · Localizaciones')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setFaviconUrl(FAVICON_URL)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  const t = HtmlService.createTemplateFromFile('app');
  t.pestanaInicial = page;
  t.inicial = _datosIniciales();

  return t.evaluate()
    .setTitle('Gestor de Horarios y Sustituciones')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setFaviconUrl(FAVICON_URL)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ---------- Acceso de lectura ----------
// Cada llamada del navegador (google.script.run) es una ejecución nueva: getAll
// comprueba una vez por ejecución que quien llama está en la lista blanca, así
// nadie sin acceso puede pedir datos aunque tenga una página de la app.
var _LECTURA = null;   // null · 'comprobando' · true
function _exigirLectura() {
  if (_LECTURA) return;            // ya comprobado (o comprobándose: lectura interna)
  _LECTURA = 'comprobando';
  let ok = false;
  try { ok = _accesoPermitido().ok; } finally { _LECTURA = ok ? true : null; }
  if (!ok) throw new Error('Sin acceso: tu cuenta no está dada de alta en el profesorado del centro.');
}

// ---------- Clave del panel abierto (Ahora sin cuenta) ----------
const PROP_CLAVE_PANEL = 'CLAVE_PANEL_AHORA';
function _clavePanel() {
  const props = PropertiesService.getScriptProperties();
  let k = props.getProperty(PROP_CLAVE_PANEL);
  if (!k) { k = Utilities.getUuid().replace(/-/g, ''); props.setProperty(PROP_CLAVE_PANEL, k); }
  return k;
}
function _clavePanelValida(k) { return !!k && String(k) === _clavePanel(); }
/** Clave actual (solo Edición), para montar el enlace del panel. */
function obtenerClavePanel() { _exigirEdicion(); return _clavePanel(); }
/** Nueva clave: el enlace anterior del panel deja de funcionar. */
function regenerarClavePanel() {
  _exigirEdicion();
  PropertiesService.getScriptProperties().deleteProperty(PROP_CLAVE_PANEL);
  return _clavePanel();
}
/** Refresco del panel abierto: solo con la clave correcta. */
function datosAhoraPublico(k) {
  if (!_clavePanelValida(k)) throw new Error('Enlace del panel no válido o caducado.');
  _LECTURA = true;
  return _ahoraSinAusentes(datosAhora());
}
function _apiAhora(par) {
  let datos;
  if (_clavePanelValida(par.k)) { _LECTURA = true; datos = _ahoraSinAusentes(datosAhora()); }
  else datos = { error: 'Enlace del panel no válido o caducado.' };
  const json = JSON.stringify(datos);
  // JSONP (?callback=fn): la página del panel lo carga con <script>, sin CORS.
  if (par.callback && /^[A-Za-z_$][\w$.]*$/.test(par.callback))
    return ContentService.createTextOutput(par.callback + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/** Panel abierto: sin la lista de ausentes ni sus nombres (solo quién sustituye). */
function _ahoraSinAusentes(res) {
  delete res.ausentes;
  (res.tramos || []).forEach(function(t) {
    (t.cursos || []).forEach(function(c) { (c.ocupantes || []).forEach(function(o) { if (o.ausente) o.ausente = 'otro docente'; }); });
    (t.apoyos || []).forEach(function(a) { if (a.ausente) a.ausente = 'otro docente'; });
  });
  return res;
}

/** ¿Puede abrir la app quien la visita? Admin o docente activo con ese email. */
function _accesoPermitido() {
  const p = permisosUsuario();
  if (p.admin) return { ok: true, email: p.email };
  if (!p.email) return { ok: false, email: '' };
  let ok = false;
  try {
    ok = getAll(SHEETS.DOCENTES).some(function(d) {
      if (d.activo === false) return false;
      return String(d.email || '').trim().toLowerCase() === p.email ||
             (String(d.sustituto || '').trim() !== '' && String(d.sustituto_email || '').trim().toLowerCase() === p.email);
    });
  } catch (e) {}
  return { ok: ok, email: p.email };
}

function _paginaSinAcceso(email) {
  const esc = function(x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
  const html = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>body{margin:0;font-family:system-ui,sans-serif;background:#f4f5f8;color:#171a23;display:grid;place-items:center;min-height:100vh}' +
    '.c{background:#fff;border:1px solid #e3e5eb;border-radius:12px;padding:28px 32px;max-width:420px;text-align:center;box-shadow:0 4px 14px rgba(16,20,34,.06)}' +
    'h1{font-size:19px;margin:0 0 8px}p{color:#4f5566;margin:6px 0;line-height:1.45}code{background:#eef0f4;padding:1px 5px;border-radius:4px}' +
    '@media (prefers-color-scheme:dark){body{background:#0e1016;color:#e9ebf1}.c{background:#171a22;border-color:#2a2f3b}p{color:#b0b5c2}code{background:#242935}}</style></head>' +
    '<body><div class="c"><h1>Sin acceso</h1>' +
    (email ? '<p>La cuenta <code>' + esc(email) + '</code> no está dada de alta en el profesorado de este centro.</p>'
           : '<p>No se ha podido identificar tu cuenta. Entra con tu cuenta del centro.</p>') +
    '<p>Si deberías tener acceso, pide a Jefatura de Estudios que añadan tu email en Configuración → Docentes.</p></div></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Sin acceso')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Incluye el contenido de otro archivo HTML dentro del shell.
 * Uso en las plantillas:  <?!= include('partial_estilos') ?>
 */
function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}


/**
 * Datos que viajan DENTRO de la página: estado, sábana de la semana en curso
 * y docentes. El cliente pinta la sábana sin llamar al servidor. Las lecturas salen de la caché de
 * datos (03_DataAccess), así que servir la página apenas se retrasa.
 * Si algo falla, null: el cliente lo pide como siempre.
 */
function _datosIniciales() {
  try {
    const estado = estadoApp();
    const ini = { estado: estado };
    if (!estado.configurado) return ini;
    // Solo la semana en curso y la lista de docentes viajan en la página
    // (sábana ya calculada en caché). La otra semana y los horarios se
    // precargan en segundo plano cuando la sábana ya está pintada.
    ini.sabanas = [sabanaSemana('')];
    ini.lecturas = { listarDocentes: listarDocentes() };
    return ini;
  } catch (e) {
    return null;
  }
}
