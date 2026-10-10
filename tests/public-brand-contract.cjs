const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
// Preserve the approved catalog release as well as the public-brand markup.
const base='ad904039f13b17da7f3f0c5f8a598ec065201ac2';
const pages=['index.html','anuncie/index.html','como-funciona/index.html','ajuda/index.html','sobre/index.html','termos/index.html','privacidade/index.html','cancelamento-reembolso/index.html'];
for(const path of pages){
 const now=fs.readFileSync(path,'utf8');
 const local='../public-brand-postcatalog-base/'+path;
 const old=fs.existsSync(local)?fs.readFileSync(local,'utf8'):cp.execFileSync('git',['show',base+':'+path],{encoding:'utf8'});
 // The logo suite must not roll back later approved script-order/version changes.
 const normalize=s=>s.replace(/((?:home|advertise|producer-guide|public-logo-links)\.css)\?v=[^"']*/g,'$1').trim();
 assert.equal(normalize(now),normalize(old),path+' preserves all markup, scripts, links, alt text and commercial copy');
}
assert.equal(fs.readFileSync('assets/advertise.js','utf8').includes('"annualPrice": "R$ 149 por mês"'),true);
console.log('Public brand contract: eight pages preserve all HTML except stylesheet versions; logo image bytes untouched.');
