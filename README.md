# organizacion-escolar

Gestor de horarios y sustituciones para CEIP. Ver [DESIGN.md](DESIGN.md) para
el documento de diseño completo.

## Estado

En desarrollo — Fase 1 (MVP), paso 1: estructura básica de pestañas vía
asistente HTML.

## Cómo probar

1. Crea un Google Sheets vacío.
2. `Extensiones → Apps Script`.
3. En el editor de Apps Script:
   - Icono de engranaje → "Mostrar archivo de manifiesto" → pega el contenido
     de `appsscript.json`.
   - Crea estos archivos (botón `+` → Script / HTML) con el mismo nombre y
     pega el contenido:
     - `00_Constants.gs`
     - `01_Schema.gs`
     - `02_SetupUI.gs`
     - `ui/setup.html`  *(en Apps Script, ponle el nombre `ui/setup` al
       crearlo como HTML; el editor permite la barra)*
4. Guarda y recarga el Sheets.
5. Aparecerá un menú **Horarios** arriba → **Abrir asistente de configuración**.
6. Se abre el wizard; pulsa **Crear estructura de pestañas**.

Más adelante usaremos `clasp` para sincronizar el repo con Apps Script en vez
del copiar/pegar manual.
