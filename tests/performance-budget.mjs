import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const failures=[];
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const count=(s,needle)=>s.split(needle).length-1;
const fail=(m)=>failures.push(m);

const publicPages=['index.html','eventos-v2/index.html','evento-v2/index.html','checkout-v2/index.html','evento/index.html','checkout/index.html'];
for(const file of publicPages){
  const html=read(file);
  if(html.includes('/assets/ct-analytics.js')) fail(file+': analytics geral voltou ao caminho publico');
}

const evento=read('evento-v2/index.html');
const checkout=read('checkout-v2/index.html');

if(count(evento,'.ctEventoPublicoCarregarPROD(')!==1){
  fail('evento-v2: bootstrap deve ter exatamente 1 RPC critico ctEventoPublicoCarregarPROD');
}
if(count(evento,'.ctEventoPublicoCarregarVideoDataPROD(')!==0){
  fail('evento-v2: video nao pode abrir segunda execucao Apps Script');
}
if(evento.includes(';base64,')||evento.includes('data:video/')){
  fail('evento-v2: video nao pode trafegar inline/base64');
}
if(!evento.includes('videoDiretoUrl')){
  fail('evento-v2: video publico deve usar URL direta da origem/CDN');
}

if(count(checkout,'.ctCheckoutPublicoCarregarEventoPROD(')!==1){
  fail('checkout-v2: bootstrap deve ter exatamente 1 RPC critico de catalogo');
}

for(const [name,html] of [['evento-v2',evento],['checkout-v2',checkout]]){
  if(count(html,'.ctCuponsPublicoRegistrarAcessoSeguroPROD(')>1){
    fail(name+': telemetria de campanha duplicada');
  }
  if(html.includes('.ctCuponsPublicoRegistrarAcessoSeguroPROD(')){
    if(!html.includes('window.setTimeout(function(){')){
      fail(name+': telemetria de campanha deve ser adiada');
    }
    if(!html.includes('CT_CAMPANHA_ACESSO_REGISTRADO_')){
      fail(name+': telemetria de campanha deve ser deduplicada por sessao');
    }
  }
}

const analytics=read('assets/ct-analytics.js');
if(!/return;/.test(analytics)){
  fail('assets/ct-analytics.js: deve permanecer no-op durante P0');
}

if(failures.length){
  console.error('\n❌ ORCAMENTO P0 DE PERFORMANCE FALHOU\n');
  failures.forEach(x=>console.error('- '+x));
  process.exit(1);
}
console.log('✅ Orçamento P0 de performance do front público preservado.');
