import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const manifest=JSON.parse(read('social/events-publicados.json'));
assert.equal(manifest.version,1);
assert.equal(manifest.policy,'public-catalog-only');
assert(manifest.events.length>0);
const sandbox={window:{}};
vm.runInNewContext(read('assets/social-event-pages.js'),sandbox,{timeout:1000});
const api=sandbox.window.CTSocialEventPages;
assert(api&&typeof api.url==='function');
assert.equal(api.url('EVT-PRIVADO'),'','Evento sem prévia não pode gerar URL inexistente');

for(const e of manifest.events){
  assert.equal(e.public,true);
  const p='compartilhar/'+e.id+'/index.html';
  const html=read(p);
  const u='https://cariocaticket.com.br/compartilhar/'+encodeURIComponent(e.id)+'/';
  const image='https://cariocaticket.com.br'+e.cover;
  const detail=e.detail+'?evento='+encodeURIComponent(e.id);
  assert.equal(api.url(e.id),'/compartilhar/'+e.id+'/');
  assert(html.startsWith('<!doctype html>'));
  for(const x of ['og:title','og:description','og:url','og:image','twitter:card','twitter:image','og:image:width','og:image:height']){
    assert(html.includes(x),'Missing OG tag '+x);
  }
  assert(html.includes('content="'+u+'"'));
  assert(html.includes('content="'+image+'"'));
  assert(html.includes('location.replace('+JSON.stringify(detail)+')'));
  assert(html.indexOf('property="og:image"')<html.indexOf('<script>'),'OG tags must be server-readable');
  assert(!html.includes('ctCheckoutPixPublicoIniciarPROD'),'No checkout or payment API in social preview');
}
for(const pathPage of ['index.html','evento/index.html','evento-v2/index.html']){
  const html=read(pathPage);
  assert(html.includes('/assets/social-event-pages.js?v=20261029-social-og1'),'Manifest script missing from '+pathPage);
}
const share=read('assets/public-share.js');
assert(share.includes('window.CTSocialEventPages.url(id)'));
for(const x of ['evento/index.html','evento-v2/index.html'])
  assert(read(x).includes('window.CTSocialEventPages.url(state.eventoId)'));
console.log('CT_SOCIAL_PREVIEW_CONTRACT_OK '+manifest.events.length);
