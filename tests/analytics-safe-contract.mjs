import fs from 'node:fs';

const path='assets/ct-analytics.js';
const src=fs.readFileSync(path,'utf8');
const failures=[];

function need(x,msg){if(!src.includes(x))failures.push(msg+' -> '+x)}
function forbid(x,msg){if(src.includes(x))failures.push(msg+' -> '+x)}

for(const x of [
  'CT_ANALYTICS_SESSION_V2',
  'CT_ANALYTICS_QUEUE_V2',
  'CT_ANALYTICS_SEEN_V2',
  'ctAnalyticsMasterRegistrarLotePublicoPROD',
  'navigator.webdriver',
  "host!=='cariocaticket.com.br'",
  'FLUSH_DELAY_MS=10000',
  "mode:'no-cors'",
  'keepalive:true',
  'window.setTimeout(flush,FLUSH_DELAY_MS)',
  'saveQueue([])',
  'MAX_QUEUE=8'
]) need(x,'contrato seguro ausente');

for(const x of [
  "createElement('iframe')",
  'createElement("iframe")',
  "createElement('form')",
  'createElement("form")',
  'setInterval(',
  'compradorEmail',
  'compradorCpf',
  'compradorWhatsapp',
  'buyerEmail',
  'buyerCpf',
  'buyerPhone'
]) forbid(x,'padrão proibido no analytics');

if(!/fetch\(APP/.test(src))failures.push('envio não usa fetch assíncrono');
if(!/\.catch\(function\(\)\{\}\)/.test(src))failures.push('erro de rede não é descartado silenciosamente');

for(const page of [
  'index.html',
  'eventos-v2/index.html',
  'evento-v2/index.html',
  'checkout-v2/index.html',
  'evento/index.html',
  'checkout/index.html'
]){
  const html=fs.readFileSync(page,'utf8');
  if(!html.includes('/assets/ct-analytics.js'))failures.push(page+': sem Analytics Master seguro');
}

if(failures.length){
  console.error('❌ Analytics Master seguro falhou');
  failures.forEach(x=>console.error('- '+x));
  process.exit(1);
}
console.log('✅ Analytics Master: atrasado, best-effort, sem PII, sem iframe/form e sem retry.');
