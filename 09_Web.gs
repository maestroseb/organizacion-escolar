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

