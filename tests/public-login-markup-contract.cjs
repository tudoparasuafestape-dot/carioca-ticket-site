'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),cp=require('node:child_process');
// Public privacy integration is separately covered by public-privacy.contract/runtime/browser.
// Strip only its two exact external includes; keep every legacy script/form byte protected.
const withoutPrivacy=s=>s.replace('  <link rel="stylesheet" href="/assets/public-privacy.css?v=20261010-1">\n','').replace('  <script src="/assets/public-privacy.js?v=20261010-1" defer></script>\n','');
const base=process.env.MARKUP_BASE||'b9083c93ff81299d09e60ce3243fb5f98efc5b65';
function execute(html){
 const all=[];const node=tag=>{const n={tag,children:[],append(...v){this.children.push(...v)},addEventListener(){},classList:{add(){},remove(){}},setAttribute(){}};all.push(n);return n};
 const blocks=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];assert.equal(blocks.length,1);
 let code=blocks[0][1];assert.equal((code.match(/\binit\(\);/g)||[]).length,1);
 code=code.replace('  init();','  globalThis.testRender=renderAccount; globalThis.helperType=typeof officialPurchaseLink; globalThis.helper=typeof officialPurchaseLink==="function"?officialPurchaseLink:null;');
 const context={window:{addEventListener(){}},document:{getElementById:node,createElement:node},URL,location:{href:'https://cariocaticket.com.br/minha-carioca/login/'}};
 vm.createContext(context);vm.runInContext(code,context);return {context,all};
}
for(const route of ['login','acesso']){
 const path='minha-carioca/'+route+'/index.html';const local='../public-brand-followup-work/'+path;
 const source=fs.existsSync(local)?fs.readFileSync(local,'utf8'):cp.execFileSync('git',['show',base+':'+path],{encoding:'utf8'});const current=withoutPrivacy(fs.readFileSync(path,'utf8'));
 const definition=source.split('\n').find(x=>x.includes('function officialPurchaseLink(raw)'));assert.ok(definition);assert.ok(source.indexOf(definition)<source.indexOf('<html'));
 const expected=source.replace(definition+'\n','').replace("  'use strict';","  'use strict';\n"+definition);assert.equal(current,expected,'Only relocate the exact existing helper: '+route);
 const old=execute(source);assert.equal(old.context.helperType,'undefined');assert.throws(()=>old.context.testRender({usuario:{},compras:[{link:'/?pedido=fixture&token=fake'}]}),/officialPurchaseLink is not defined/);
 const fixed=execute(current);assert.equal(fixed.context.helperType,'function');
 for(const [input,output] of [['https://example.invalid/?pedido=fixture&token=fake','/minha-carioca/?pedido=fixture&token=fake'],['/?pedido=a%20b&token=c%2Fd','/minha-carioca/?pedido=a%20b&token=c%2Fd'],['/?pedido=x','#'],['/?token=y','#'],['','#'],[null,'#']])assert.equal(fixed.context.helper(input),output);
 fixed.context.testRender({usuario:{nome:'Fixture'},compras:[{eventoNome:'Local fixture',quantidade:1,link:'/?pedido=fixture&token=fake'}]});assert.equal(fixed.all.find(n=>n.tag==='a').href,'/minha-carioca/?pedido=fixture&token=fake');
}
console.log('Both public login pages: exact helper relocation only; old ReferenceError reproduced; synthetic ticket cards and unchanged safe-link outputs verified. No auth/network execution.');

