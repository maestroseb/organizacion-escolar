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

  const page = (e && e.parameter && e.parameter.page) || '';

  // Enlace directo para el Site del profesorado: solo el tramo en curso.
  if (e && e.parameter && e.parameter.vista === 'ahora') {
    const ta = HtmlService.createTemplateFromFile('ahora');
    ta.datos = datosAhora();
    return ta.evaluate()
      .setTitle('Ahora · Sábana')
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
