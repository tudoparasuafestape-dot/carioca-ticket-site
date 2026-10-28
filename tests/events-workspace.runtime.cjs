'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../eventos-v2/index.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('function criarCardEvento('));
const nodes={workspaceEventSearch:{value:''},workspaceSearchStatus:{textContent:''},listaEventos:{innerHTML:''}};
const context=vm.createContext({document:{addEventListener(){},getElementById(id){return nodes[id]}},console});vm.runInContext(script,context);
const event={id:'SYNTH & /event',nome:'Festival de Música <local>',status:'RASCUNHO',publicacao:{prontoPublicar:false,pendencias:['<script>unsafe()</script>',null,4]}};
let card=context.criarCardEvento(event);assert(card.includes('Festival de Música &lt;local&gt;'));assert(card.includes('SYNTH%20%26%20%2Fevent'));assert(card.includes('&lt;script&gt;unsafe()&lt;/script&gt;'));assert(!card.includes('<script>unsafe()'));assert(card.includes('1 pendência(s) informada(s)'));assert(card.includes('<details class="evento-technical">'));assert(!card.includes('Referência técnica</summary><div class="evento-id" open'));
for(const [search,count] of [['musica',1],['FESTIVAL',1],['sem correspondencia',0],['',1]]){nodes.workspaceEventSearch.value=search;context.preencherListaEventos([event]);assert.equal((nodes.listaEventos.innerHTML.match(/<article /g)||[]).length,count);}
assert(context.criarEtapasEvento({publicacao:{publicado:true}}).includes('Vendas publicadas'));assert(context.criarEtapasEvento({publicacao:{prontoPublicar:true}}).includes('Pronto para revisão final'));assert(context.criarEtapasEvento({}).includes('Consulte a situação antes de publicar'));assert(!context.criarEtapasEvento({}).includes('pendência(s) informada(s)'));
console.log('PASS: event workspace runtime — escaping, encoded IDs, names/accents/search/reset, honest publication states and optional pending items.');
