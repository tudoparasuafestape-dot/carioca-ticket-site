const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
// Preserve the approved catalog release as well as the public-brand markup.
const base='a555b3acdfa94490d33475b09404de38d07062d2';
const pages=['index.html','anuncie/index.html','como-funciona/index.html','ajuda/index.html','sobre/index.html','termos/index.html','privacidade/index.html','cancelamento-reembolso/index.html'];
for(const path of pages){
 const now=fs.readFileSync(path,'utf8');
 const local='../logo-light-home-base/'+path;
 const old=fs.existsSync(local)?fs.readFileSync(local,'utf8'):cp.execFileSync('git',['show',base+':'+path],{encoding:'utf8'});
 // The logo suite must not roll back later approved script-order/version changes.
 const oldFooter='<a class="footer-home-link" href="/"><img src="/assets/carioca-ticket-logo.png" alt="Carioca Ticket"></a>';
 const newFooter='<a class="footer-home-link" href="/" aria-label="Carioca Ticket"><img src="/assets/carioca-ticket-simbolo.png" alt="" width="42" height="42"><span>Carioca <b>Ticket</b></span></a>';
 const normalize=s=>s.replace(newFooter,oldFooter).replace(/((?:home|advertise|producer-guide|public-logo-links)\.css)\?v=[^"']*/g,'$1').trim();
 assert.equal(normalize(now),normalize(old),path+' preserves all markup, scripts, links, alt text and commercial copy');
}
assert.equal(fs.readFileSync('assets/advertise.js','utf8').includes('"annualPrice": "R$ 149 por mês"'),true);
console.log('Public brand contract: only approved footer signature and stylesheet versions change; other markup and official image bytes remain intact.');

