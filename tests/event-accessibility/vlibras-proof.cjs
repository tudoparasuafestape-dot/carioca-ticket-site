// Explicit, manual proof only. Not imported by product pages or automated tests.
// node tests/event-accessibility/vlibras-proof.cjs
// A separate origin confines the third-party widget to synthetic text.
const http = require('node:http');
const shellOrigin = 'http://127.0.0.1:42972';
const frameOrigin = 'http://127.0.0.1:42973';
const syntheticText = 'Olá. Esta é uma demonstração de acessibilidade.';
function serve(port, html, csp) {
  return http.createServer((req, res) => {
    if (req.method !== 'GET' || req.headers.host !== `127.0.0.1:${port}` || req.url !== '/') {
      res.writeHead(403); res.end('Blocked'); return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp, 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
    res.end(html);
  }).listen(port, '127.0.0.1');
}
const shell = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Prova isolada de Libras</title>
<style>body{font:16px/1.6 system-ui;margin:0;background:#f5f5f2;color:#20242a}main{max-width:900px;margin:auto;padding:24px 18px 120px}button{min-height:44px;padding:10px 18px;font:inherit}iframe{width:100%;height:660px;border:1px solid #777;display:block;margin-top:20px}footer{position:fixed;bottom:0;left:0;right:0;background:#171717;color:#fff;padding:16px;text-align:center}footer button{background:#ffd66d;color:#171717;border:0;border-radius:12px}button:focus-visible{outline:3px solid #1351b4;outline-offset:3px}</style>
<main><h1>Prova isolada de Libras</h1><p>Somente texto sintético. Ao ativar, o quadro conecta ao serviço externo VLibras. Nada é carregado antes do clique. Não informe dados pessoais.</p>
<button id="activate">Ativar prova de Libras</button> <button id="remove" disabled>Fechar prova</button><p role="status" id="status">Não carregado.</p><div id="mount"></div></main>
<footer><button id="purchase" disabled>Compra simulada — indisponível</button></footer>
<script>let frame; const activate=document.getElementById('activate'), remove=document.getElementById('remove'), status=document.getElementById('status'), mount=document.getElementById('mount');activate.onclick=()=>{if(frame)return;frame=document.createElement('iframe');frame.title='VLibras com texto sintético';frame.sandbox='allow-scripts allow-same-origin';frame.referrerPolicy='no-referrer';frame.src='${frameOrigin}/';mount.append(frame);activate.disabled=true;remove.disabled=false;status.textContent='Quadro de demonstração aberto. Ative o botão de acessibilidade dentro dele.'};remove.onclick=()=>{frame.remove();frame=null;activate.disabled=false;remove.disabled=true;status.textContent='Prova fechada.';activate.focus()};</script></html>`;
const frame = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="referrer" content="no-referrer"><title>Texto sintético para VLibras</title><style>body{font:18px/1.6 system-ui;margin:24px;color:#20242a;background:#fff}h1{font-size:24px}</style><h1>Demonstração de acessibilidade</h1><p id="sample">${syntheticText}</p><p>Ative o botão azul e selecione o texto desta demonstração.</p><script src="https://vlibras.gov.br/app/vlibras-plugin.js"></script><script>new window.VLibras.Widget({rootPath:'https://vlibras.gov.br/app',position:'L'});</script></html>`;
function start() {
  const a = serve(42972, shell, `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src ${frameOrigin}; form-action 'none'; base-uri 'none'`);
  // External connections exist only inside this cross-origin, synthetic frame.
  const b = serve(42973, frame, "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://vlibras.gov.br https://cdn.jsdelivr.net; style-src 'unsafe-inline' https://vlibras.gov.br https://cdn.jsdelivr.net; img-src data: blob: https://vlibras.gov.br https://cdn.jsdelivr.net; font-src https://vlibras.gov.br https://cdn.jsdelivr.net; connect-src https://vlibras.gov.br https://*.vlibras.gov.br https://cdn.jsdelivr.net; frame-src https://vlibras.gov.br https://cdn.jsdelivr.net; worker-src blob:; form-action 'none'; base-uri 'none'");
  return { close: () => { a.close(); b.close(); } };
}
if (require.main === module) { start(); console.log(`Manual synthetic Libras proof: ${shellOrigin}/`); }
module.exports = { start, shellOrigin, frameOrigin, syntheticText };
