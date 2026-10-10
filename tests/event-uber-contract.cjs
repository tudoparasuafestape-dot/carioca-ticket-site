const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ID='EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD';
// Public location fields read from PROD EVENTOS row 1002 on 2026-10-10; old fixture omitted the district.
const event={id:ID,local:'Vevets Recepções',endereco:'Rua Arenópolis, 82 - Candeias',cidade:'Jaboatão dos Guararapes',uf:'PE'};
class Node {constructor(){this.attrs={};this.hidden=false;this.textContent='';}setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}}
const nodes=Object.fromEntries(['directions-uber','directions-uber-note','directions-uber-label','directions-details'].map(id=>[id,new Node()]));
const listeners={},context={window:{localStorage:{getItem:()=> 'pt-BR'},addEventListener:(k,v)=>listeners[k]=v},document:{getElementById:id=>nodes[id],addEventListener:(k,v)=>listeners[k]=v}};
for(const file of ['event-ride-destinations.js','event-uber.js'])vm.runInNewContext(fs.readFileSync('assets/'+file,'utf8'),context);
const api=context.window.CTEventUber,link=nodes['directions-uber'],note=nodes['directions-uber-note'];
const registry=context.window.CTEventRideDestinations;
assert(Object.isFrozen(registry));assert(Object.isFrozen(registry[ID]));
const url=new URL(api.buildUrl(event,ID));assert.equal(url.origin,'https://m.uber.com');assert.equal(url.pathname,'/looking');
assert.deepEqual([...url.searchParams.keys()],['pickup','drop[0]']);assert.equal(url.searchParams.get('pickup'),'my_location');
const drop=JSON.parse(url.searchParams.get('drop[0]'));
assert.equal(drop.latitude,-8.1932272);assert.equal(drop.longitude,-34.9293376);assert.equal(drop.addressLine1,'Vevets Recepções');assert.match(drop.addressLine2,/Rua Arenópolis, 82/);
api.render(event,ID);assert.equal(link.hidden,false);assert.equal(note.hidden,false);assert.equal(link.attrs['aria-label'],undefined);assert.equal(link.attrs.href,url.href);assert.equal(nodes['directions-uber-label'].textContent,'Ir de Uber');
for(const locale of ['en-US','es','zh-Hans']){context.window.CTPublicI18n={getLocale:()=>locale};listeners['ct:public-language']();assert.equal(link.attrs.lang,locale);assert.equal(note.attrs.lang,locale);}
delete context.window.CTPublicI18n;context.window.localStorage={getItem(){throw Error('denied')}};listeners.pageshow();assert.equal(link.attrs.lang,'pt-BR');
for(const bad of [null,{}, {...event,id:'OTHER'}, {...event,id:''}, {...event,local:'Outro salão'}, {...event,endereco:'Rua Arenópolis, 83'}, {...event,endereco:'Rua Arenópolis, 82'}, {...event,endereco:'Rua Arenópolis, 82 - Outro bairro'}, {...event,cidade:'Recife'}, {...event,uf:'RJ'}, {...event,endereco:''}, {...event,local:'Online'}, {...event,endereco:'https://example.test'}, {...event,endereco:['Rua Arenópolis, 82']}]){
 api.render(event,ID);api.render(bad,ID);assert.equal(link.hidden,true);assert.equal(link.attrs.href,undefined);assert.equal(note.hidden,true);
}
assert.equal(api.buildUrl(event,'OTHER'),'');assert.equal(api.buildUrl({...event,id:'__proto__'},'__proto__'),'');
assert.equal(api.buildUrl({...event,latitude:10,longitude:20},ID),url.href); // unreviewed payload coordinates cannot override
assert.equal(api.buildUrl({...event,endereco:'Rua ARENOPOLIS,82 - Candeias',uf:'pe'},ID),url.href);
for(const patch of [{approved:false},{revision:''},{latitude:NaN},{latitude:Infinity},{latitude:91},{longitude:181},{latitude:'-8.1932272'},{latitude:0,longitude:0},{addressLine1:''},{addressLine2:'x'.repeat(501)}]){
 context.window.CTEventRideDestinations={[ID]:{...registry[ID],...patch}};assert.equal(api.buildUrl(event,ID),'');
}
context.window.CTEventRideDestinations=registry;
nodes['directions-details'].hidden=true;api.render(event,ID);assert.equal(link.hidden,true);nodes['directions-details'].hidden=false;
api.render(event,ID);api.clear();listeners.pageshow();assert.equal(link.hidden,true);assert.equal(link.attrs.href,undefined);
for(const route of ['evento','evento-v2']){
 const html=fs.readFileSync(route+'/index.html','utf8');
 assert.equal((html.match(/id="directions-uber"/g)||[]).length,1);
 assert.match(html,/id="directions-uber" hidden target="_self" rel="noreferrer"/);
 assert.match(html,/CTEventUber\.render\(e,state\.eventoId\)/);
 assert.match(html,/function showError\(msg,retryable\)\{\s*if\(window.CTEventUber\)window.CTEventUber.clear\(\)/);
 assert.match(html,/event-ride-destinations\.js\?v=20261010-2/);
 assert(html.indexOf('event-ride-destinations.js')<html.indexOf('event-uber.js'));
}
console.log('PASS: approved event/address binding, current URL encoding, no coordinate guessing, invalid pin/ID guards, locale/storage handling, stale-state cleanup, both templates');
