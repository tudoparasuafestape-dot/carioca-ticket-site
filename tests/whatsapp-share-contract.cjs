const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'assets/public-share.js'),'utf8');
let locale='pt-BR',blocked=false,callbacks=0,clearCount=0;
const listeners={};
const link={hidden:true,listeners:{},setAttribute(k,v){this[k]=v},removeAttribute(k){delete this[k]},addEventListener(k,f){(this.listeners[k] ||= []).push(f)},closest(){return blocked?{}:null}};
const document={querySelectorAll(selector){return selector==='.ct-whatsapp-share'?[link]:[]},getElementById(){return null},addEventListener(k,f){listeners[k]=f}};
const window={localStorage:{getItem:()=>locale},addEventListener(){}};
const context={window,document,WeakMap,WeakSet,encodeURIComponent,MutationObserver:function(){throw new Error('Unexpected observer')},navigator:{}};
vm.runInNewContext(source,context);
const api=window.CTPublicShare;
const labels={'pt-BR':'Compartilhar no WhatsApp','en-US':'Share on WhatsApp',es:'Compartir en WhatsApp','zh-Hans':'通过 WhatsApp 分享'};
for(const language of Object.keys(labels)) {
 locale=language;
 api.eventWhatsApp(link,{nome:'Festa <img> & 中文',data:'20/12/2030',horario:'18h',local:'Casa',cidade:'Recife',uf:'PE',token:'PRIVATE'},'A&B / 中文',()=>callbacks++);
 assert.equal(link.textContent,labels[locale]);assert.equal(link.lang,locale);assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');
 const url=new URL(link.href);assert.equal(url.origin,'https://wa.me');assert.deepEqual([...url.searchParams.keys()],['text']);
 assert(url.searchParams.get('text').startsWith('Festa <img> & 中文 · 20/12/2030 · 18h · Casa · Recife · PE · '));
 assert(url.searchParams.get('text').endsWith(' https://cariocaticket.com.br/evento/?evento=A%26B%20%2F%20%E4%B8%AD%E6%96%87'));assert(!link.href.includes('PRIVATE'));
 api.clearEventWhatsApp(link);assert.equal(link.hidden,true);assert(!('href' in link));clearCount++;
}
assert.equal(link.listeners.click.length,1,'Repeated renders must not duplicate listeners');
locale='pt-BR';api.eventWhatsApp(link,{nome:'Somente nome'},'ID',()=>callbacks++);
assert.equal(new URL(link.href).searchParams.get('text'),'Somente nome · Confira este evento na Carioca Ticket. https://cariocaticket.com.br/evento/?evento=ID');
let prevented=false;blocked=true;link.listeners.click[0]({stopPropagation(){},preventDefault(){prevented=true}});assert(prevented);assert.equal(callbacks,0);
blocked=false;link.listeners.click[0]({stopPropagation(){},preventDefault(){throw new Error('Unexpected prevention')}});assert.equal(callbacks,1);
window.CTPublicI18n={};locale='en-US';listeners['ct:public-language']();assert.equal(link.textContent,labels[locale]);
for(const file of ['evento/index.html','evento-v2/index.html']) {
 const html=fs.readFileSync(path.join(root,file),'utf8');
 assert(html.includes('<script src="/assets/public-share.js?v=20261010-whatsapp1"></script>'));
 assert(html.includes('id="shareWhatsAppAction"'));assert(html.includes('window.CTPublicShare.eventWhatsApp('));assert.equal((html.match(/clearEventWhatsApp/g)||[]).length,2);
 for(const [,body] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(body);
}
new vm.Script(source);console.log('PASS WhatsApp: 4 locales, public encoding, no recipient/private fields, missing facts, inert guard, language refresh, stale clearing and single listener; both event template scripts parse.');

