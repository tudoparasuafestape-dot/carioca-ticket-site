'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
// Entire page is local; external scripts removed and every network request aborted.
const source=fs.readFileSync(path.join(__dirname,'../produtor/solicitar/index.html'),'utf8');
const html=source.replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/g,'').replace(/load\(\);\s*}\(\)\);/,`globalThis.maskTest={formatDocument,validDocument,fillForm};document.getElementById('formCard').classList.remove('hidden');document.getElementById('loading').classList.add('hidden'); }());`);
function cpf(base){let d=base;for(let n=9;n<11;n++){let sum=0;for(let i=0;i<n;i++)sum+=Number(d[i])*(n+1-i);const v=sum*10%11;d+=v===10?'0':String(v)}return d}
function cnpj(base){let d=base;for(const w of [[5,4,3,2,9,8,7,6,5,4,3,2],[6,5,4,3,2,9,8,7,6,5,4,3,2]]){let sum=0;w.forEach((x,i)=>sum+=x*Number(d[i]));const v=sum%11;d+=String(v<2?0:11-v)}return d}
(async()=>{const browser=await chromium.launch({headless:true});try{const context=await browser.newContext({serviceWorkers:'block'});let requests=0;await context.route('**/*',route=>{requests++;return route.abort()});const page=await context.newPage();await page.setContent(html);const input=page.locator('#cpfCnpj'),a=cpf('012345678'),b=cnpj('012345670001');
 await input.pressSequentially(a);assert.equal((await input.inputValue()).replace(/\D/g,''),a);assert.equal((await input.inputValue()).length,14);
 await input.fill('');await input.pressSequentially(b);assert.equal((await input.inputValue()).replace(/\D/g,''),b);assert.equal((await input.inputValue()).length,18);
 await input.fill(b);assert.equal((await input.inputValue()).replace(/\D/g,''),b);assert.equal(await page.evaluate(()=>maskTest.validDocument(document.getElementById('cpfCnpj').value)),true);
 await page.evaluate(v=>maskTest.fillForm({cpfCnpj:v}),a);assert.equal((await input.inputValue()).replace(/\D/g,''),a);
 await input.fill(a.slice(1));assert.equal(await page.evaluate(()=>maskTest.validDocument(document.getElementById('cpfCnpj').value)),false);
 console.log('PASS 5 isolated Chromium mask interactions; all network denied ('+requests+' requests aborted)');await context.close();}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
