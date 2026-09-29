// Genera panel/panel-preview.png (1200×630): la imagen de la vista previa al
// compartir el enlace del panel por WhatsApp/Telegram. Usa la escena animada
// de Ahora (modo día) con el título encima.
// Uso: node tools/generar_preview.js "C.E.I.P. Carlos III"   (necesita playwright)
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const RAIZ = path.join(__dirname, '..');
const centro = process.argv[2] || '';
const semilla = parseInt(process.argv[3] || '21', 10);   // colocación fija de nubes y naranjas
const ahora = fs.readFileSync(path.join(RAIZ, 'partial_ahora.html'), 'utf8');
const m = ahora.match(/  function _ahEscena\(cv, modo\) \{[\s\S]*?\n  \}\n/);
if (!m) throw new Error('No encuentro _ahEscena en partial_ahora.html');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html = (`<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;font-family:"Segoe UI",system-ui,sans-serif}
  #cv{position:absolute;left:50%;top:50%;width:560px;transform:translate(-50%,-50%) scale(2.98);transform-origin:center;display:block}
  .t{position:absolute;left:44px;top:36px;background:rgba(255,255,255,.92);border-radius:24px;padding:18px 30px;box-shadow:0 10px 40px rgba(0,0,0,.16)}
  .t b{display:block;font-size:66px;line-height:1;color:#1e3a5f;letter-spacing:-.02em}
  .t span{display:block;margin-top:8px;font-size:26px;color:#3b4252;font-weight:600}
</style><canvas id="cv"></canvas>
<div class="t"><b>Ahora</b><span>${esc(centro ? centro + ' · ' : '')}quién está en cada clase</span></div>
<script>(function(){var a=SEMILLA;Math.random=function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};})();window.matchMedia=function(){return{matches:true}};${m[0]};_ahEscena(document.getElementById('cv'),'dia');</script>`).replace('SEMILLA', semilla);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 4 });
  await p.setContent(html); await p.waitForTimeout(600);
  const out = path.join(RAIZ, 'panel', 'panel-preview.png');
  await p.screenshot({ path: out, scale: 'css' }); await b.close();
  console.log('Generado', path.relative(RAIZ, out));
})();
