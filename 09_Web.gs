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

  // Lista blanca: solo el administrador y el profesorado dado de alta (con
  // su email, o el del sustituto/a) en Configuración → Docentes.
  const acceso = _accesoPermitido();
  if (!acceso.ok) return _paginaSinAcceso(acceso.email);

  const page = (e && e.parameter && e.parameter.page) || '';

  // Enlace directo para el Site del profesorado: solo el tramo en curso.
  if (e && e.parameter && e.parameter.vista === 'ahora') {
    const ta = HtmlService.createTemplateFromFile('ahora');
    ta.datos = datosAhora();
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
