# Panel «Ahora» (pantallas sin cuenta)

`index.html` muestra el tramo en curso fuera de Google: sin la banda de Apps Script
y sin iniciar sesión. Lo genera `tools/generar_panel.py` a partir de los mismos
archivos de la app; vuelve a generarlo cuando cambie el aspecto de Ahora.

## Puesta en marcha

1. En Apps Script, crea una implementación aparte: «Ejecutar como: Yo»,
   «Quién tiene acceso: Cualquier usuario».
2. En la app, ve a Ahora → **Enlace directo** → «Pantalla sin cuenta». Pega la URL
   de esa implementación y copia el enlace (lleva la clave).
3. Copia `index.html` al repositorio del colegio (por ejemplo, en `panel/`) y
   activa GitHub Pages (Settings → Pages → rama `main`).
4. En la pantalla, abre la página de Pages. La primera vez pide el enlace del
   paso 2 y lo recuerda. Doble clic: pantalla completa.

La página pide los datos cada minuto. Si la clave cambia («Nueva clave»), vuelve a
pegar el enlace nuevo en cada pantalla.
