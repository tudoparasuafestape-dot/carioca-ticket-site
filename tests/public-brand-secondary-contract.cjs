'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const paths=['convite','minha-carioca','minha-carioca/login','minha-carioca/acesso','parceiro/programa','parceiro/manual','parceiro/conduta','parceiro/regulamento','produtor/solicitar','campanha','roda-de-samba'];
const base='7f86913bc3089eaf02632dc74c4743c937dac4d1';
for(const route of paths){
 const path=route+'/index.html';const source=fs.existsSync('../public-brand-audit-base/'+path)?fs.readFileSync('../public-brand-audit-base/'+path,'utf8'):cp.execFileSync('git',['show',base+':'+path],{encoding:'utf8'});const current=fs.readFileSync(path,'utf8');
 for(const expression of [/<script\b[^>]*>[\s\S]*?<\/script>/gi,/\b(?:href|action|method|name|id|data-[\w-]+)=["'][^"']*["']/gi,/<(?:input|button|select|textarea|iframe)\b[^>]*>/gi])assert.deepEqual(current.match(expression),source.match(expression),route+' behavior or navigation changed');
 const oldStyles=[...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]);const newStyles=[...current.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]);assert.equal(newStyles.length,oldStyles.length);oldStyles.forEach((s,i)=>assert.ok(newStyles[i].startsWith(s),route+' existing style changed'));
 const text=s=>s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();assert.equal(text(current),text(source),route+' page copy changed');
 assert.equal((current.match(/alt="Carioca Ticket"/g)||[]).length,(source.match(/alt="Carioca Ticket"/g)||[]).length,route+' accessible brand name changed');
 assert.ok(!current.includes('src="/assets/carioca-ticket-icon-192.png"'),route+' opaque app icon still used');
}
console.log('Secondary public brand: eleven pages preserve scripts, navigation, forms, copy and original CSS; official transparent artwork only.');
