/**
 * Punto de entrada de la Web App (script standalone).
 *
 * doGet enruta por el parámetro ?page= y sirve la página correspondiente.
 * Antes de servir nada, garantiza que la base de datos existe e inicializada.
 *
 * Páginas:
 *   (sin page) / inicio → app.html   (portada + navegación)
 *   setup              → setup.html  (asistente de configuración)
 *   importar           → csv.html    (importador de horarios CSV)
 */

const PAGINAS = {
  inicio:   'app',
  setup:    'setup',
  importar: 'csv'
};

function doGet(e) {
  asegurarBaseDatos();

  const page = (e && e.parameter && e.parameter.page) || 'inicio';
  const archivo = PAGINAS[page] || PAGINAS.inicio;

  return HtmlService.createHtmlOutputFromFile(archivo)
    .setTitle('Gestor de Horarios y Sustituciones')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Permite componer URLs internas hacia otras páginas de la web app,
 * usable desde el HTML: google.script.run … enlaceA('setup').
 */
function enlaceA(page) {
  const base = ScriptApp.getService().getUrl();
  return base + (page && page !== 'inicio' ? ('?page=' + encodeURIComponent(page)) : '');
}
