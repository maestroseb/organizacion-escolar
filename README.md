# organizacion-escolar

Gestor de horarios y sustituciones para CEIP. Ver [DESIGN.md](DESIGN.md) para
el documento de diseño completo.

## Arquitectura

- **Script standalone** de Google Apps Script desplegado como **Web App**
  (no está pegado a ninguna hoja).
- La **base de datos** es una hoja de cálculo que el propio script **crea
  automáticamente** la primera vez que se abre, en el Drive de quien despliega.
  Su id se guarda en las propiedades del script (`01_Bootstrap.gs`).
- La UI son páginas HTML servidas por `doGet()` (`09_Web.gs`): portada
  (`app.html`), asistente de configuración (`setup.html`) e importador de
  horarios (`csv.html`).

## Estado

Fase 1 (MVP): configuración del centro, importación de Séneca (XML) e
importación de horarios (CSV con revisión). Pendientes: vistas (sábana,
horario por docente/grupo), módulo "Ahora" y sustituciones.

## Cómo desplegar

Con [`clasp`](https://github.com/google/clasp):

1. `clasp login`
2. Crea un proyecto standalone: `clasp create --type standalone --title "Gestor de Horarios"`
3. `clasp push` para subir el contenido de `src/` y `appsscript.json`.
4. Despliega como Web App: `clasp deploy` (o desde el editor:
   **Desplegar → Nueva implementación → Aplicación web**), con
   *Ejecutar como: yo* y *Acceso: solo yo* (valores por defecto del manifiesto).
5. Abre la URL de la web app. La primera vez creará su hoja-base de datos
   automáticamente y mostrará la portada.

> El módulo público "Ahora" (cuando esté) usará una implementación aparte con
> *Acceso: cualquiera*, ejecutándose como el propietario.

## Desarrollo

Cada cambio va por Pull Request y se mergea a `main`. Tras `clasp push`,
recuerda que la Web App necesita **redesplegar** (o usar la URL `/dev`) para
reflejar los cambios en la implementación estable.
