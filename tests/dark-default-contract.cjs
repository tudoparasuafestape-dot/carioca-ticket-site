const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/home-theme.js','utf8');let cases=0;
function run(saved,dark,blocked=false){
 let store=saved;const listeners={},win={},media={matches:dark,addEventListener:(_,fn)=>media.change=fn};
 const select={value:'',closest:()=>({hidden:true}),addEventListener:(k,f)=>listeners[k]=f};
 const root={dataset:{}},meta={};const document={documentElement:root,querySelector:()=>meta,getElementById:()=>select,addEventListener:(_,f)=>f()};
 vm.runInNewContext(source,{document,window:{matchMedia:()=>media,addEventListener:(k,f)=>win[k]=f},localStorage:{getItem(){if(blocked)throw Error('denied');return store;},setItem(k,v){if(blocked)throw Error('denied');store=v;}}});
 return {root,meta,select,media,change(v){select.value=v;listeners.change();},storage(v){win.storage({key:'ct-home-theme',newValue:v});},saved:()=>store};
}
for(const os of [false,true])for(const saved of [null,'invalid','light','dark','system']){
 const r=run(saved,os),want=saved==='system'?(os?'dark':'light'):['light','dark'].includes(saved)?saved:'dark';assert.equal(r.root.dataset.homeTheme,want);assert.equal(r.select.value,['light','dark','system'].includes(saved)?saved:'dark');
 r.media.matches=!os;r.media.change();assert.equal(r.root.dataset.homeTheme,saved==='system'?(os?'light':'dark'):want);
 for(const choice of ['light','dark','system']){r.change(choice);assert.equal(r.saved(),choice);assert.equal(run(r.saved(),os).select.value,choice);}
 r.storage('light');assert.equal(r.root.dataset.homeTheme,'light');r.storage(null);assert.equal(r.root.dataset.homeTheme,'dark');r.storage('system');assert.equal(r.root.dataset.homeTheme,os?'light':'dark');cases++;
}
for(const os of [false,true]){let r=run('light',os,true);assert.equal(r.root.dataset.homeTheme,'dark');r.change('light');assert.equal(r.root.dataset.homeTheme,'light');cases++;}
for(const file of ['index.html','anuncie/index.html','evento/index.html','evento-v2/index.html']){const h=fs.readFileSync(file,'utf8');assert(h.indexOf('home-theme.js')<h.indexOf('<style')||h.indexOf('home-theme.js')<h.indexOf('home.css'));assert.match(h,/home-theme.js\?v=20261009-dark-default/);}
const html=fs.readFileSync('index.html','utf8');assert.match(html,/class="ad-house-actions"/);assert.match(html,/href="\/anuncie\/" data-i18n="adLearnMore">Conheça os planos/);assert.equal((fs.readFileSync('assets/home-i18n.js','utf8').match(/"adLearnMore"/g)||[]).length,4);
console.log(cases+' theme contract cases passed; four route bootstraps and localized CTA verified.');

