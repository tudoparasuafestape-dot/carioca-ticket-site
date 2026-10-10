'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
class Node {constructor(){this.attrs={};this.hidden=false;this.textContent='';}setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}}
const nodes=Object.fromEntries(['directions-uber','directions-uber-label','directions-uber-note','directions-waze','directions-waze-label','directions-waze-note','directions-details'].map(id=>[id,new Node()]));
const listeners={},fail=()=>{throw Error('External action forbidden in synthetic contract');};
const context={window:{localStorage:{getItem:()=> 'pt-BR'},addEventListener:(k,v)=>listeners[k]=v,open:fail,fetch:fail},document:{getElementById:id=>nodes[id],addEventListener:(k,v)=>listeners[k]=v},fetch:fail,XMLHttpRequest:fail,WebSocket:fail};
for(const file of ['event-ride-destinations.js','event-uber.js'])vm.runInNewContext(fs.readFileSync(path.join(root,'assets',file),'utf8'),context);
const api=context.window.CTEventUber,registry=context.window.CTEventRideDestinations,waze=nodes['directions-waze'],note=nodes['directions-waze-note'];
const expected={'pt-BR':'Ir com Waze','en-US':'Go with Waze',es:'Ir con Waze','zh-Hans':'使用 Waze 导航'};
let checks=0;
function absent(){assert.equal(waze.hidden,true);assert.equal(waze.attrs.href,undefined);assert.equal(note.hidden,true);assert.equal(note.textContent,'');checks++;}
for(const [id,point] of Object.entries(registry)){
 const event={id,...Object.fromEntries(['local','endereco','cidade','uf'].map(k=>[k,point[k]]))};
 const raw=api.buildWazeUrl(event,id),url=new URL(raw),uber=new URL(api.buildUrl(event,id)),drop=JSON.parse(uber.searchParams.get('drop[0]'));
 assert.equal(url.origin,'https://waze.com');assert.equal(url.pathname,'/ul');assert.deepEqual([...url.searchParams.keys()],['ll','navigate']);assert.equal(url.searchParams.get('navigate'),'yes');
 assert.equal(url.searchParams.get('ll'),drop.latitude+','+drop.longitude);assert(raw.includes('%2C'));assert.equal(url.hash,'');checks++;
 api.render(event,id);assert.equal(waze.hidden,false);assert.equal(note.hidden,false);assert.equal(waze.attrs.href,raw);
 for(const [locale,label] of Object.entries(expected)){
  context.window.CTPublicI18n={getLocale:()=>locale};listeners['ct:public-language']();assert.equal(waze.attrs.lang,locale);assert.equal(note.attrs.lang,locale);assert.equal(nodes['directions-waze-label'].textContent,label);assert(note.textContent);assert.equal(waze.attrs['aria-label'],undefined);assert.equal(waze.attrs.href,raw);checks++;
 }
 for(const type of ['pageshow','storage']){listeners[type]({key:'ct-home-locale'});assert.equal(waze.attrs.href,raw);checks++;}
 delete context.window.CTPublicI18n;context.window.localStorage={getItem(){throw Error('disabled storage')}};listeners.pageshow();assert.equal(waze.attrs.lang,'pt-BR');checks++;
 // Only the approved source is used; untrusted payload pins and map center cannot override it.
 assert.equal(api.buildWazeUrl({...event,latitude:20,longitude:40,mapaUrl:'https://maps.example/?ll=10,20',destinoTransporte:{latitude:20,longitude:40}},id),raw);checks++;
 for(const invalid of [null,{}, {...event,id:'OTHER'}, {...event,id:'__proto__'}, {...event,local:'Other'}, {...event,endereco:'Other'}, {...event,cidade:'Other'}, {...event,uf:'XX'}, {...event,endereco:''}]){api.render(event,id);api.render(invalid,id);absent();assert.equal(api.buildWazeUrl(invalid,id),'');}
 api.render(event,id);api.render(event,'OTHER');absent();
 for(const patch of [{approved:false},{revision:''},{latitude:NaN},{latitude:Infinity},{latitude:91},{longitude:-181},{latitude:'-8'},{latitude:0,longitude:0},{addressLine1:''},{addressLine2:'x'.repeat(501)}]){
  context.window.CTEventRideDestinations={[id]:{...point,...patch}};assert.equal(api.buildWazeUrl(event,id),'');api.render(event,id);absent();
 }
 context.window.CTEventRideDestinations=registry;
 nodes['directions-details'].hidden=true;api.render(event,id);absent();nodes['directions-details'].hidden=false;
 api.render(event,id);api.clear();listeners.pageshow();absent();
 context.window.CTEventRideDestinations=undefined;api.render(event,id);absent();context.window.CTEventRideDestinations=registry;
}
// A future reviewed registry item needs no Waze-specific exception or allow-list.
const id='SYNTHETIC-FUTURE-EVENT',point={...Object.values(registry)[0],latitude:12.34,longitude:-56.78};
context.window.CTEventRideDestinations={[id]:point};assert.equal(new URL(api.buildWazeUrl({id,...point},id)).searchParams.get('ll'),'12.34,-56.78');checks++;
for(const route of ['evento','evento-v2']){
 const html=fs.readFileSync(path.join(root,route,'index.html'),'utf8');
 assert.equal((html.match(/id="directions-waze"/g)||[]).length,1);
 assert.match(html,/id="directions-waze" hidden target="_self" rel="noreferrer" aria-describedby="directions-waze-note"/);
 assert.match(html,/id="directions-uber"[^\n]*\n\s*<a id="directions-waze"/);
 assert.match(html,/id="directions-waze-note" hidden/);
 assert.match(html,/<img class="waze-mark" src="\/assets\/waze-mark\.svg" width="28" height="26" alt="" aria-hidden="true"><span id="directions-waze-label">/);
 assert.equal((html.match(/class="waze-mark"/g)||[]).length,1);
 assert.match(html,/event-uber\.js\?v=20261010-4/);assert.match(html,/event-uber\.css\?v=20261010-5/);checks++;
}
console.log(`PASS: ${checks} Waze synthetic groups; exact Uber destination, URL encoding, 4 locales, stale state, no destination, invalid coordinates, future registry record, both templates. Zero network/navigation.`);

// Pin the original artwork bytes. Waze is a third-party trademark; see asset provenance.
const icon=fs.readFileSync(path.join(root,'assets/waze-mark.svg'));
assert.equal(require('node:crypto').createHash('sha256').update(icon).digest('hex'),'817b77a1d7df3aa57776c18e8f3ba8ee20a298e5ed884395c8c3638b12916c7f');
assert.match(icon.toString(),/viewBox="0 0 108 100"/);
assert(!/<(?:script|foreignObject|image|use)\b|\b(?:href|onload|onclick)=/i.test(icon.toString()));
console.log('PASS: official bundled Waze mark, pinned bytes, decorative accessible markup on both routes.');
