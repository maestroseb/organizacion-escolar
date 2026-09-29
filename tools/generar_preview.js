// Genera panel/panel-preview.png (1200×630): la imagen de la vista previa al
// compartir el enlace del panel por WhatsApp/Telegram. Usa la escena animada
// de Ahora (modo día) con el título encima.
// Uso: node tools/generar_preview.js "C.E.I.P. Carlos III"   (necesita playwright)
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const RAIZ = path.join(__dirname, '..');
const centro = process.argv[2] || '';
const ahora = fs.readFileSync(path.join(RAIZ, 'partial_ahora.html'), 'utf8');
const m = ahora.match(/  function _ahEscena\(cv, modo\) \{[\s\S]*?\n  \}\n/);
if (!m) throw new Error('No encuentro _ahEscena en partial_ahora.html');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;font-family:"Segoe UI",system-ui,sans-serif}
  #cv{position:absolute;left:50%;top:50%;width:500px;transform:translate(-50%,-50%) scale(3.3);transform-origin:center;display:block}
  .t{position:absolute;left:56px;bottom:52px;background:rgba(255,255,255,.93);border-radius:28px;padding:26px 38px;box-shadow:0 10px 40px rgba(0,0,0,.18)}
  .t b{display:block;font-size:84px;line-height:1;color:#1e3a5f;letter-spacing:-.02em}
  .t span{display:block;margin-top:12px;font-size:30px;color:#3b4252;font-weight:600}
</style><canvas id="cv"></canvas>
<div class="t"><b>Ahora</b><span>${esc(centro ? centro + ' · ' : '')}quién está en cada clase</span></div>
<script>window.matchMedia=function(){return{matches:true}};${m[0]};_ahEscena(document.getElementById('cv'),'dia');</script>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 4 });
  await p.setContent(html); await p.waitForTimeout(600);
  const out = path.join(RAIZ, 'panel', 'panel-preview.png');
  await p.screenshot({ path: out, scale: 'css' }); await b.close();
  console.log('Generado', path.relative(RAIZ, out));
})();
