# organizacion-escolar

Gestor de horarios y sustituciones para CEIP. Ver [DESIGN.md](DESIGN.md) para
el documento de diseño completo.

## Estado

En desarrollo — Fase 1 (MVP), paso 1: estructura básica de pestañas.

## Cómo probar el paso 1

1. Crea un Google Sheets vacío.
2. `Extensiones → Apps Script`.
3. Copia el contenido de `appsscript.json` en el manifiesto del proyecto
   (icono de engranaje → "Mostrar archivo de manifiesto appsscript.json").
4. Crea dos archivos de script y pega el contenido de:
   - `src/00_Constants.gs`
   - `src/01_Schema.gs`
5. Guarda, recarga el Sheets. Aparecerá un menú **Horarios** arriba.
6. `Horarios → Inicializar libro (crear pestañas)`.
7. Se crearán las 9 pestañas `_*` con sus cabeceras.

La función es idempotente: puedes volver a ejecutarla sin perder datos.
