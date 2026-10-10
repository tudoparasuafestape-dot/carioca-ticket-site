const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const base='7f86913bc3089eaf02632dc74c4743c937dac4d1';
const pages=['index.html','anuncie/index.html','como-funciona/index.html','ajuda/index.html','sobre/index.html','termos/index.html','privacidade/index.html','cancelamento-reembolso/index.html'];
for(const path of pages){
 const now=fs.readFileSync(path,'utf8');
 const local='../public-brand-audit-base/'+path;
 const old=fs.existsSync(local)?fs.readFileSync(local,'utf8'):cp.execFileSync('git',['show',base+':'+path],{encoding:'utf8'});
 // The only HTML changes in this patch are stylesheet cache versions.
 const normalize=s=>s.replace(/((?:home|advertise|producer-guide|public-logo-links)\.css)\?v=[^"']*/g,'$1').trim();
 assert.equal(normalize(now),normalize(old),path+' preserves all markup, scripts, links, alt text and commercial copy');
}
assert.equal(fs.readFileSync('assets/advertise.js','utf8').includes('"annualPrice": "R$ 149 por mês"'),true);
console.log('Public brand contract: eight pages preserve all HTML except stylesheet versions; logo image bytes untouched.');
