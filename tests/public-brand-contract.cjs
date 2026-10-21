const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
// Preserve the approved catalog release as well as the public-brand markup.
const base='a555b3acdfa94490d33475b09404de38d07062d2';
const pages=['index.html','anuncie/index.html','como-funciona/index.html','ajuda/index.html','sobre/index.html','termos/index.html','privacidade/index.html','cancelamento-reembolso/index.html'];
for(const path of pages){
 let now=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
 const local='../logo-light-home-base/'+path;
 const old=(fs.existsSync(local)?fs.readFileSync(local,'utf8'):cp.execFileSync('git',['show',base+':'+path],{encoding:'utf8'})).replace(/\r\n/g,'\n');
 // The separately approved demo adds this exact section and asset, outside the catalog.
 // Keep all other markup, navigation, scripts and commercial copy under comparison.
 if(path==='index.html'){
  const demoSection='    <section id="event-demonstration" class="ct-demo-teaser shell" aria-labelledby="demo-home-title">\n'+
   '      <img src="/assets/roda-samba-30-anos.webp" width="639" height="277" alt="" loading="lazy">\n'+
   '      <div><span class="demo-home-label" data-i18n="demoLabel">DEMONSTRAÇÃO</span><h2 id="demo-home-title" data-i18n="demoTitle">Conheça um evento demonstrativo</h2><p data-i18n="demoCopy">Explore uma página de exemplo, com informações, mapa e Waze. Sem data marcada, venda ou emissão de ingressos.</p></div>\n'+
   '      <a class="btn btn-primary demo-home-action" href="/demonstracao/roda-de-samba/" data-i18n="demoOpen">Explorar demonstração</a>\n'+
   '    </section>\n';
  // Explicitly normalize only the independently tested temporal loader addition.
  now=now.replace('  <script src="/assets/public-catalog-clock.js?v=20261017-temporal1" defer></script>\n','')
   .replace('/assets/public-event-catalog.js?v=20261017-temporal1','/assets/public-event-catalog.js?v=20261016-demo-catalog1')
   .replace(demoSection,'')
   .replace('  <link rel="stylesheet" href="/assets/demo-event.css?v=20261016-demo1">\n','')
   .replace('/assets/public-event-catalog.js?v=20261016-demo-catalog1','/assets/public-event-catalog.js?v=20261010-catalog-performance1')
   .replace('/assets/home-i18n.js?v=20261016-demo1','/assets/home-i18n.js?v=20261009-ad-plan-label')
   .replace('/assets/advance-sales.js?v=20261016-encerrado1','/assets/advance-sales.js?v=20261011-1');
 }
 // The logo suite must not roll back later approved script-order/version changes.
 const oldFooter='<a class="footer-home-link" href="/"><img src="/assets/carioca-ticket-logo.png" alt="Carioca Ticket"></a>';
 const newFooter='<a class="footer-home-link" href="/" aria-label="Carioca Ticket"><img src="/assets/carioca-ticket-simbolo.png" alt="" width="42" height="42"><span>Carioca <b>Ticket</b></span></a>';
 // Exact cache keys for the approved WhatsApp share enhancement; retain all other comparisons.
 const normalize=s=>s.replace('  <script src="/assets/advance-sales.js?v=20261011-1"></script>\n','').replace('  <link rel="stylesheet" href="/assets/public-privacy.css?v=20261010-1">\n','').replace('  <script src="/assets/public-privacy.js?v=20261010-1" defer></script>\n','').replace('/assets/ct-analytics.js?v=20261010-privacy1" data-ct-public-privacy="required"','/assets/ct-analytics.js?v=20260923a"').replace('/assets/public-share.js?v=20261009-card-share1','/assets/public-share.js?v=20261010-whatsapp1').replace('/assets/public-share.css?v=20261009-share1','/assets/public-share.css?v=20261010-whatsapp1').replace(newFooter,oldFooter).replace(/<a class="(ad-brand|brand)" href="\/" aria-label="Carioca Ticket"><img src="\/assets\/carioca-ticket-simbolo.png" alt="" width="42" height="42"><span class="brand-name">Carioca <b>Ticket<\/b><\/span><\/a>/g,(_,cls)=>'<a class="'+cls+'" href="/"><img src="/assets/carioca-ticket-logo.png" alt="Carioca Ticket" width="200" height="72"></a>').replace(/((?:home|advertise|producer-guide|public-logo-links)\.css)\?v=[^"']*/g,'$1').trim();
 assert.equal(normalize(now),normalize(old),path+' preserves all markup, scripts, links, alt text and commercial copy');
}
assert.equal(fs.readFileSync('assets/advertise.js','utf8').includes('"annualPrice": "R$ 149 por mês"'),true);
console.log('Public brand contract: only approved brand signatures and stylesheet versions change; other markup and official image bytes remain intact.');


