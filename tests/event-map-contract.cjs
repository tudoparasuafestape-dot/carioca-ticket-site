const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let created=[];let observer,timers=new Map(),seq=0,listeners={};
class Node {constructor(){this.attrs={};this.children=[];this.hidden=false;this.classList={add(){}};}setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}replaceChildren(...nodes){this.children=nodes;}}
const context={window:{addEventListener:(k,v)=>listeners[k]=v},document:{createElement:(tag)=>{const n=new Node();n.tag=tag;created.push(n);return n;},addEventListener:(k,v)=>listeners[k]=v},
 setTimeout(fn){timers.set(++seq,fn);return seq;},clearTimeout(id){timers.delete(id);},
 IntersectionObserver:class{constructor(cb){this.cb=cb;observer=this;}observe(n){this.node=n;}disconnect(){this.disconnected=true;}}};
vm.runInNewContext(fs.readFileSync('assets/event-map-preview.js','utf8'),context);
const api=context.window.CTEventMapPreview,host=new Node();
const destination='Local público, Rua Exemplo, 123, Recife, PE, Brasil';
api.render(host,destination);let frame=created.find(n=>n.tag==='iframe'),status=host.children[2];
assert.equal(host.children[1].children.length,0);
assert.equal(frame.src,undefined);assert.equal(timers.size,0);assert.equal(frame.loading,'lazy');
assert.equal(frame.referrerPolicy,'no-referrer');assert.match(frame.attrs.allow,/geolocation 'none'/);
observer.cb([{isIntersecting:false}]);assert.equal(frame.src,undefined);
observer.cb([{isIntersecting:true}]);assert.equal(new URL(frame.src).searchParams.get('q'),destination);
assert.equal(new URL(frame.src).hostname,'maps.google.com');assert.equal(host.children[1].children[0],frame);assert.equal(timers.size,1);
assert.match(status.textContent,/Carregando/);[...timers.values()][0]();assert.match(status.textContent,/demorando/);
frame.onload();assert.equal(timers.size,0);assert.match(status.textContent,/Se o mapa não aparecer/);
assert.doesNotMatch(status.textContent,/carregado com sucesso/);
context.window.CTPublicI18n={getLocale:()=> 'en-US'};listeners['ct:public-language']();assert.match(frame.title,/Map of the event/);assert.equal(host.lang,'en-US');delete context.window.CTPublicI18n;
const oldLoad=frame.onload;api.render(host,'Outro local, Avenida Teste, 10, Olinda, PE, Brasil');
assert.equal(frame.onload,null);oldLoad();assert.equal(host.children[1].children.length,0);
observer.cb([{isIntersecting:true}]);host.children[1].children[0].onerror();assert.equal(host.children[1].children[0].hidden,true);assert.match(host.children[2].textContent,/Não foi possível/);
for(const value of ['',null,undefined,'https://bad.test','abc@example.test','<script>','a\nb', 'x'.repeat(1501), '\ud800']){api.render(host,value);assert.equal(host.hidden,true);assert.equal(host.children.length,0);assert.equal(timers.size,0);}
api.render(host,destination);api.clear();assert.equal(host.hidden,true);assert.equal(host.children.length,0);
assert.equal(observer.disconnected,true);
console.log('PASS: lazy load, URL encoding, privacy attributes, timeout, non-authoritative load, language hook, rerender cleanup, error fallback, invalid input, teardown');

