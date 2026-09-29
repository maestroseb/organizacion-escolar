#!/usr/bin/env python3
"""Genera panel/index.html: Ahora como página independiente (fuera de Google).

Reutiliza los mismos estilos y el mismo código de pintado que la app
(partial_estilos, partial_sabana, partial_ahora) y sustituye google.script.run
por llamadas JSONP a la implementación abierta (?api=ahora&k=CLAVE).
Así la pantalla no muestra la banda de Apps Script ni necesita iniciar sesión.

Uso (desde la raíz del repositorio):
  python3 tools/generar_panel.py --url https://<usuario>.github.io/<ruta>/panel.html --centro "C.E.I.P. …"
--url es la dirección final del panel (para la vista previa de WhatsApp/Telegram:
la imagen panel-preview.png debe estar en la misma carpeta). Sin --url, sin imagen.
Después, copia panel/index.html (con el nombre que quieras) y panel/panel-preview.png
al repositorio con GitHub Pages.
"""
import os, re, argparse, html as _html
from urllib.parse import urljoin

ap = argparse.ArgumentParser()
ap.add_argument('--url', default='', help='URL pública final del panel')
ap.add_argument('--centro', default='', help='Nombre del centro para el título')
ARGS = ap.parse_args()

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
leer = lambda n: open(os.path.join(RAIZ, n + '.html'), encoding='utf-8').read()

CABECERA = r'''<script>
  // URL de la implementación sin el dominio: /a/<dominio>/macros/s/ID/exec
  // obliga a iniciar sesión; /macros/s/ID/exec es la que sirve sin cuenta.
  function _urlAbierta(u) {
    var m = String(u || '').match(/\/s\/([A-Za-z0-9_-]+)\/exec/);
    return m ? 'https://script.google.com/macros/s/' + m[1] + '/exec' : String(u || '').replace(/\?.*$/, '');
  }
  // ---- Configuración del panel: ?u=<URL /exec>&k=<clave> (se recuerda) ----
  var PANEL = (function() {
    var q = new URLSearchParams(location.search), g = function(k) { try { return localStorage.getItem('panel-' + k) || ''; } catch (e) { return ''; } };
    var u = q.get('u') || g('u'), k = q.get('k') || g('k');
    try { if (u) localStorage.setItem('panel-u', u); if (k) localStorage.setItem('panel-k', k); } catch (e) {}
    return { u: _urlAbierta(u), k: k };
  })();
  var AH_CLAVE = PANEL.k;
  // JSONP contra la implementación abierta (sin CORS ni sesión).
  var _jsonpN = 0;
  function _panelPedir(ok, ko) {
    var cb = '_panelCb' + (++_jsonpN), s = document.createElement('script'), fin = false;
    var t = setTimeout(function() { if (!fin) { fin = true; limpiar(); ko && ko(new Error('Sin respuesta del servidor')); } }, 20000);
    function limpiar() { clearTimeout(t); delete window[cb]; s.remove(); }
    window[cb] = function(d) { if (fin) return; fin = true; limpiar(); if (d && d.error) { ko && ko(new Error(d.error)); } else { d._t = Date.now(); ok && ok(d); } };
    s.onerror = function() { if (!fin) { fin = true; limpiar(); ko && ko(new Error('No se pudo conectar. Comprueba que la implementación abierta tiene la última versión del código y acceso «Cualquier usuario».')); } };
    s.src = PANEL.u + '?api=ahora&k=' + encodeURIComponent(PANEL.k) + '&callback=' + cb + '&_=' + Date.now();
    document.head.appendChild(s);
  }
  // Sustituto de google.script.run: solo existe la lectura de Ahora.
  window.google = { script: { run: (function() {
    var mk = function() { var ok = null, ko = null, o = {
      withSuccessHandler: function(f) { ok = f; return o; }, withFailureHandler: function(f) { ko = f; return o; },
      datosAhoraPublico: function() { _panelPedir(ok, ko); }, datosAhora: function() { _panelPedir(ok, ko); } }; return o; };
    return new Proxy({}, { get: function(_, p) { return mk()[p]; } });
  })() } };
  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function _errHtml(err) { return '<div class="result err">✗ ' + _esc((err && err.message) || err || 'Error') + '</div>'; }
  function aviso(msg) { console.log(msg); }
  var ESTADO = null, DATOS_VERSION = 0;
</script>'''

PIE = r'''<div id="panel-config" class="panel-config" hidden>
  <h1>Panel «Ahora»</h1>
  <p>Pega el enlace del panel que da la app (Ahora → Enlace directo → Pantalla sin cuenta). Se recordará en esta pantalla.</p>
  <input type="text" id="panel-enlace" placeholder="https://script.google.com/macros/s/…/exec?vista=ahora&k=…">
  <button type="button" onclick="panelGuardar()">Guardar</button>
</div>
<script>
  function panelGuardar() {
    var v = document.getElementById('panel-enlace').value.trim(), m = v.match(/^(https:\/\/script\.google\.com\/[^?#]+\/exec)\?.*\bk=([^&#]+)/);
    if (!m) { alert('Enlace no válido: debe ser el /exec de la app con ?vista=ahora&k=…'); return; }
    location.search = '?u=' + encodeURIComponent(m[1]) + '&k=' + encodeURIComponent(decodeURIComponent(m[2]));
  }
  (function arrancar() {
    if (!PANEL.u || !PANEL.k) { document.getElementById('panel-config').hidden = false; document.getElementById('ah-body').innerHTML = ''; return; }
    var reintento = function(err) {
      var prueba = PANEL.u + '?api=ahora&k=' + encodeURIComponent(PANEL.k);
      document.getElementById('ah-body').innerHTML = _errHtml(err) + '<p class="hint">Se reintentará en un minuto. Para comprobarlo, abre en una ventana de incógnito: <a href="' + _esc(prueba) + '" target="_blank">' + _esc(prueba) + '</a> (debe mostrar datos, no una página de Google).</p>' +
        '<p class="hint"><a href="#" onclick="try{localStorage.clear()}catch(e){};location.search=\'\';return false">Cambiar el enlace del panel</a></p>';
      setTimeout(arrancar, 60000);
    };
    _panelPedir(function(d) { ahDatos(d); }, reintento);
  })();
  // Doble clic: pantalla completa.
  document.addEventListener('dblclick', function() { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch (e) {} });
</script>
<style>
  .panel-config { max-width: 640px; margin: 40px auto; padding: 20px; background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--radius); font-family: var(--font); }
  .panel-config h1 { font-size: 20px; margin: 0 0 8px; }
  .panel-config input { width: 100%; margin: 8px 0; font-family: var(--font-mono); font-size: 12px; }
</style>'''

# Vista previa al compartir el enlace (Open Graph: WhatsApp, Telegram…).
titulo = 'Ahora' + (' · ' + ARGS.centro if ARGS.centro else '')
desc = 'Quién está en cada clase en el tramo en curso, con las sustituciones de hoy.'
e = lambda x: _html.escape(x, quote=True)
og = ('<meta name="description" content="%s">\n<meta property="og:type" content="website">\n'
      '<meta property="og:title" content="%s">\n<meta property="og:description" content="%s">\n' % (e(desc), e(titulo), e(desc)))
if ARGS.url:
    img = urljoin(ARGS.url, 'panel-preview.png')
    og += ('<meta property="og:url" content="%s">\n<meta property="og:image" content="%s">\n'
           '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
           '<meta name="twitter:card" content="summary_large_image">\n' % (e(ARGS.url), e(img)))
else:
    print('Aviso: sin --url no se incluye imagen en la vista previa.')

html = ('<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '<title>' + e(titulo) + '</title>\n' + og +
        '<!-- GENERADO por tools/generar_panel.py: no editar a mano. -->\n'
        + CABECERA + '\n' + leer('partial_estilos') + '\n</head>\n<body class="ah-solo">\n<main class="shell">\n'
        '<div id="view-sabana" style="display:none">' + leer('partial_sabana') + '</div>\n'
        + leer('partial_ahora') + '\n</main>\n' + PIE + '\n</body>\n</html>\n')
if re.search(r'<\?', html): raise SystemExit('Quedan etiquetas de plantilla de Apps Script en el panel')
salida = os.path.join(RAIZ, 'panel', 'index.html')
os.makedirs(os.path.dirname(salida), exist_ok=True)
open(salida, 'w', encoding='utf-8').write(html)
print('Generado', os.path.relpath(salida, RAIZ), '(%d KB)' % (len(html) // 1024))
