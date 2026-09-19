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

  const t = HtmlService.createTemplateFromFile('app');
  t.pestanaInicial = page;

  return t.evaluate()
    .setTitle('Gestor de Horarios y Sustituciones')
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
 * Permite componer URLs internas de la web app, usable desde el HTML.
 * Ahora todas las secciones viven en la misma página, así que el enlace
 * apunta a la raíz y, opcionalmente, a una pestaña vía hash.
 */
function enlaceA(page) {
  const base = ScriptApp.getService().getUrl();
  return base + (page && page !== 'inicio' ? ('#' + encodeURIComponent(page)) : '');
}
