'use strict';
// Synthetic identifiers generated locally. No network, Apps Script, account or real record access.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../produtor/solicitar/index.html'),'utf8');
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const nodes=new Map();
function node(id){if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:false,selectionStart:0,selectionEnd:0,handlers:{},classList:{add(){},remove(){},toggle(){}},addEventListener(k,v){this.handlers[k]=v},setCustomValidity(v){this.validation=v},reportValidity(){this.reported=true},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b}});return nodes.get(id)}
const calls=[];
const context=vm.createContext({document:{getElementById:node},window:{addEventListener(){}},location:{replace(){}},sessionStorage:{getItem(){return JSON.stringify({token:'synthetic-session'})}},localStorage:{getItem(){return null}},setTimeout,clearTimeout,console});
vm.runInContext(script.replace(/load\(\);\s*}\(\)\);/,`globalThis.testApi={formatDocument,validDocument,fillForm,maskDocumentInput};session={token:'synthetic-session'};rpc=async function(method,args){globalThis.testCalls.push({method,args});return {sucesso:true,solicitacao:null}}; }());`),Object.assign(context,{testCalls:calls}));
const api=context.testApi;
const backend=vm.createContext({});
const oracle=fs.readFileSync(path.join(__dirname,'fixtures/producer-document-oracle.js'),'utf8');
assert.equal(require('node:crypto').createHash('sha256').update(oracle).digest('hex'),'ab3b525a825115bf971ff0fcf61227b9b59b0b846da4c08418dc2fdfb25f5948','Pinned backend oracle changed; review source provenance before updating');
vm.runInContext(oracle,backend);
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name)}
function cpf(base){let d=base;for(let len=9;len<11;len++){let sum=0;for(let i=0;i<len;i++)sum+=Number(d[i])*(len+1-i);let v=sum*10%11;d+=String(v===10?0:v)}return d}
function cnpj(base){let d=base;for(const w of [[5,4,3,2,9,8,7,6,5,4,3,2],[6,5,4,3,2,9,8,7,6,5,4,3,2]]){let sum=0;w.forEach((x,i)=>sum+=Number(d[i])*x);let v=sum%11;d+=String(v<2?0:11-v)}return d}
const syntheticCpf=cpf('012345678'),syntheticCnpj=cnpj('012345670001');
test('CPF mask retains leading zero',()=>{assert.match(api.formatDocument(syntheticCpf),/^0\d{2}\.\d{3}\.\d{3}-\d{2}$/);assert.equal(api.formatDocument(syntheticCpf).replace(/\D/g,''),syntheticCpf)});
test('CNPJ mask retains all fourteen digits and zero',()=>{assert.match(api.formatDocument(syntheticCnpj),/^0\d\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);assert.equal(api.formatDocument(syntheticCnpj).replace(/\D/g,''),syntheticCnpj)});
test('all partial masks preserve exact digits without padding',()=>{for(const d of [syntheticCpf,syntheticCnpj])for(let n=0;n<=d.length;n++)assert.equal(api.formatDocument(d.slice(0,n)).replace(/\D/g,''),d.slice(0,n))});
test('CPF to CNPJ transition does not discard digits',()=>{for(let n=11;n<=14;n++)assert.equal(api.formatDocument(syntheticCnpj.slice(0,n)).replace(/\D/g,''),syntheticCnpj.slice(0,n))});
test('overlong input remains invalid rather than truncating to valid document',()=>{assert.equal(api.formatDocument(syntheticCnpj+'9'),syntheticCnpj+'9');assert.equal(api.validDocument(syntheticCnpj+'9'),false)});
test('non-digit characters are removed by mask',()=>assert.equal(api.formatDocument('abc'+syntheticCpf).replace(/\D/g,''),syntheticCpf));
test('valid and invalid checksums match backend across synthetic corpus',()=>{for(let i=0;i<100;i++){const d=cpf(String(i+12345).padStart(9,'0')),e=cnpj(String(i+123450001).padStart(12,'0'));for(const x of [d,e,d.slice(1),e.slice(1),d.slice(0,-1)+(Number(d.at(-1))+1)%10,e.slice(0,-1)+(Number(e.at(-1))+1)%10])assert.equal(api.validDocument(x),backend.ctProdutorCpfCnpjValido_(x))}});
test('repeated-digit and incomplete documents rejected',()=>{for(const d of ['', '0'.repeat(11),'1'.repeat(14),syntheticCpf.slice(1)])assert.equal(api.validDocument(d),false)});
test('fillForm masks persisted document without inventing zero',()=>{api.fillForm({cpfCnpj:syntheticCpf});assert.equal(node('cpfCnpj').value,api.formatDocument(syntheticCpf));api.fillForm({cpfCnpj:syntheticCpf.slice(1)});assert.equal(node('cpfCnpj').value.replace(/\D/g,''),syntheticCpf.slice(1))});
test('input caret and selection track digit positions',()=>{const n=node('cpfCnpj');n.value=syntheticCnpj;n.selectionStart=3;n.selectionEnd=5;api.maskDocumentInput();assert.equal(n.value.slice(0,n.selectionStart).replace(/\D/g,'').length,3);assert.equal(n.value.slice(0,n.selectionEnd).replace(/\D/g,'').length,5)});
test('editing clears previous validation error',()=>{node('cpfCnpj').validation='invalid';api.maskDocumentInput();assert.equal(node('cpfCnpj').validation,'')});
(async()=>{
 for(const kind of ['creation','resubmission']){calls.length=0;api.fillForm({cpfCnpj:kind==='creation'?syntheticCpf:syntheticCnpj});await node('producerForm').handlers.submit({preventDefault(){}});const sent=calls.find(x=>x.method==='ctProdutorOnboardingEnviarPROD');assert.ok(sent);assert.equal(typeof sent.args[1].cpfCnpj,'string');assert.equal(sent.args[1].cpfCnpj,kind==='creation'?syntheticCpf:syntheticCnpj);count++;console.log('PASS '+kind+' sends unformatted string preserving zero')}
 calls.length=0;node('cpfCnpj').value=syntheticCpf.slice(1);await node('producerForm').handlers.submit({preventDefault(){}});assert.equal(calls.length,0);assert.ok(node('cpfCnpj').validation);count++;console.log('PASS invalid document stops before RPC');
 console.log('PASS '+count+' isolated producer document tests');
})().catch(e=>{console.error(e);process.exitCode=1});
