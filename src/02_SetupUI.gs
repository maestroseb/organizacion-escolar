/**
 * Punto de entrada del wizard de setup.
 *
 * onOpen() añade un menú "Horarios" con la opción de abrir el wizard.
 * abrirSetup() lo abre como diálogo modal grande.
 *
 * El HTML está en src/ui/setup.html y orquesta todos los pasos del MVP.
 * Comunica con el backend vía google.script.run.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Horarios')
    .addItem('Abrir asistente de configuración', 'abrirSetup')
    .addToUi();
}

function abrirSetup() {
  const html = HtmlService.createHtmlOutputFromFile('ui/setup')
    .setWidth(820)
    .setHeight(620);
  SpreadsheetApp.getUi().showModalDialog(html, 'Asistente de configuración');
}
