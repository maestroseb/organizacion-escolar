# organizacion-escolar

Gestor de horarios y sustituciones para CEIP. Ver [DESIGN.md](DESIGN.md) para
el documento de diseño completo.

## Arquitectura

- **Script standalone** de Google Apps Script desplegado como **Web App**
  (no está pegado a ninguna hoja).
- La **base de datos** es una hoja de cálculo que el propio script **crea
  automáticamente** la primera vez que se abre, en el Drive de quien despliega.
  Su id se guarda en las propiedades del script (`01_Bootstrap.gs`).
- La UI es una **única app con pestañas** (SPA). `doGet()` (`09_Web.gs`) sirve
  siempre el mismo shell (`app.html`), evaluado como plantilla de HtmlService y
  compuesto con parciales mediante `include()`:
  - `partial_estilos.html` — sistema de diseño único (claro/oscuro).
  - `partial_onboarding.html` — alta guiada del primer arranque.
  - `partial_secciones.html` — editores de centro, tramos, grupos, docentes,
    tutorías, localizaciones, materias y roles (una pestaña cada uno).
  - `partial_importar.html` — importación de Séneca (XML), CSV del Gem y texto
    libre, con modo de fusión (añadir / combinar / reemplazar).
  - `partial_config.html` — pestaña de Configuración (abrir la hoja, vaciar
    secciones, reiniciar el centro).
- Al abrir por primera vez (centro sin configurar), la app muestra el **alta
  guiada**: pide el **código de centro** (con buscador contra el catálogo de
  `maestroseb/contactos-g.educaand`), ofrece importar datos y luego repasa lo
  que falta para completarlo sección por sección. Una vez configurado, aparecen
  las pestañas del espacio de trabajo.

## Estado

Fase 1: alta guiada, configuración del centro por pestañas, importación de
Séneca (XML), CSV (con revisión) y texto libre, y reimportación con fusión
(añadir/combinar/reemplazar). Pendientes: vistas (sábana, horario por
docente/grupo), módulo "Ahora" y sustituciones.

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
