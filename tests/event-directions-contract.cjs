// Dependency-free, isolated component contract. No network, live RPC or purchases.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/event-directions.js'), 'utf8');
const event = {local:'Espaço São João & Arte',endereco:'Rua da Música, 120',cidade:'Recife',uf:'PE'};
const destination = 'Espaço São João & Arte, Rua da Música, 120, Recife, PE, Brasil';
let copied = [], checks = 0;
const elements = {};
for (const id of ['details','unavailable','address','map','copy','status']) elements['directions-'+id] = {
  value:'',textContent:'',hidden:false,disabled:false,onclick:null,
  removeAttribute(name) { delete this[name]; },focus() { this.focused=true; },select() {},
  setSelectionRange(start,end) { this.selectionStart=start;this.selectionEnd=end; }
};
const window = {isSecureContext:true};
const navigator = {clipboard:{async writeText(text) {copied.push(text);}}};
vm.runInNewContext(source,{window,navigator,document:{getElementById(id){return elements[id];}}});
const render=window.CTEventDirections.render;
const el=name=>elements['directions-'+name];
function valid(e=event) {render(e);assert.equal(el('details').hidden,false);assert.equal(el('address').value,destination);checks++;}
function invalid(e) {render(e);assert.equal(el('details').hidden,true);assert.equal(el('unavailable').hidden,false);assert.equal(el('map').href,undefined);assert.equal(el('copy').onclick,null);assert.equal(el('address').value,'');checks++;}
(async()=>{
valid();
assert.equal(copied.length,0);
const url=new URL(el('map').href);
assert.equal(url.origin,'https://www.google.com');assert.equal(url.pathname,'/maps/dir/');
assert.equal(url.searchParams.get('destination'),destination);assert.equal(url.searchParams.get('api'),'1');assert.equal([...url.searchParams].length,2);
await el('copy').onclick();assert.deepEqual(copied,[destination]);assert.match(el('status').textContent,/Endereço copiado/);checks++;
for(const patch of [{local:''},{endereco:''},{cidade:''},{uf:''},{uf:'XX'},{local:'Online'},{endereco:'https://meet.google.com/a'},{local:'meet.google.com/abc'},{endereco:'www.zoom.us/a'},{endereco:'<img src=x>'},{endereco:'A definir'},{endereco:'A confirmar com a organização'},{endereco:'zoom.us/j/123456789'},{local:'Evento online',endereco:'Link enviado por e-mail'},{local:'Encontro virtual'},{endereco:'Local a ser definido'},{endereco:'Endereço será divulgado em breve'},{endereco:'Link enviado por email'},{endereco:'á'.repeat(500)},{endereco:'\ud800'},{endereco:123},{cidade:null}]) invalid({...event,...patch});
invalid(null);invalid(undefined);
for(const type of ['PUBLICO','PRIVADO']) valid({...event,tipoEvento:type});
valid({...event,local:'  Espaço São João & Arte\n',uf:'pe'});
navigator.clipboard.writeText=async()=>{throw new Error('denied');};await el('copy').onclick();
assert.equal(el('address').focused,true);assert.equal(el('address').selectionEnd,destination.length);assert.match(el('status').textContent,/selecionado/);checks++;
window.isSecureContext=false;valid();await el('copy').onclick();assert.match(el('status').textContent,/selecionado/);checks++;window.isSecureContext=true;
let resolve, calls=0;navigator.clipboard.writeText=()=>{calls++;return new Promise(r=>resolve=r);};valid();
const pending=el('copy').onclick();await el('copy').onclick();assert.equal(calls,1);assert.equal(el('copy').disabled,true);valid();resolve();await pending;
assert.equal(el('status').textContent,'');assert.equal(el('copy').disabled,false);checks++;
let reject;navigator.clipboard.writeText=()=>new Promise((_,r)=>reject=r);valid();const rejected=el('copy').onclick();invalid({});reject(new Error('denied'));await rejected;assert.equal(el('status').textContent,'');checks++;
for(const route of ['evento','evento-v2']) {
 const html=fs.readFileSync(path.join(root,route,'index.html'),'utf8');
 assert.equal((html.match(/id="event-directions"/g)||[]).length,1);
 assert.match(html,/CTEventDirections\.render\(e\)/);
 assert.match(html,/event-directions\.js\?v=20261009-1/);
 assert.match(html,/id="directions-map" target="_blank" rel="noopener noreferrer"/);
 assert.match(html,/id="directions-status" role="status" aria-live="polite"/);
 assert(!/uber:\/\/|99taxis:\/\/|m\.uber\.com/.test(html));
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
 checks++;
}
assert(!/fetch\(|XMLHttpRequest|navigator\.geolocation|window\.open|innerHTML|\.submit\(/.test(source));
console.log(`${checks} isolated contract cases passed; inline scripts parsed on both event pages.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
