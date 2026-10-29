#!/usr/bin/env node
// Gerador offline de prévias sociais. Sem RPC, sem operações financeiras.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const origin='https://cariocaticket.com.br';
const manifest=JSON.parse(fs.readFileSync(path.join(root,'social/events-publicados.json'),'utf8'));
assert.equal(manifest.version,1);
assert.equal(manifest.policy,'public-catalog-only');
assert(Array.isArray(manifest.events)&&manifest.events.length<=50);
const checking=process.argv.includes('--check');
const seen=new Set(),mapping=Object.create(null),outputs=new Map();

function escapeHtml(v){return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function safeId(v){return typeof v==='string'&&/^EVT-[A-Z0-9][A-Z0-9_-]{4,215}$/.test(v);}
function safeText(v,limit){return typeof v==='string'&&v.length>0&&v.length<=limit&&!/[\u0000-\u001f\u007f<>]/.test(v);}
function jpegDimensions(b){
  if(b.length<16||b[0]!==0xff||b[1]!==0xd8)return null;
  let i=2;
  while(i+8<b.length){
    if(b[i]!==0xff){i++;continue;}
    let mark=b[i+1];i+=2;
    if(mark===0xd9||mark===0xda)break;
    if(mark===0x00||mark===0xff||mark===0xd8||mark===0x01||mark>=0xd0&&mark<=0xd7)continue;
    if(i+2>b.length)break;
    const len=b.readUInt16BE(i);
    if(len<2||i+len>b.length)break;
    if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(mark)){
      if(len>=7)return{height:b.readUInt16BE(i+3),width:b.readUInt16BE(i+5)};
      break;
    }
    i+=len;
  }
  return null;
}
function eventHtml(event,image){
  const id=event.id;
  const social='/compartilhar/'+encodeURIComponent(id)+'/';
  const dest=event.detail+'?evento='+encodeURIComponent(id);
  const src=origin+event.cover;
  const canonical=origin+social;
  const title=escapeHtml(event.title+' | Carioca Ticket');
  const desc=escapeHtml(event.description);
  const img=escapeHtml(src);
  const go=escapeHtml(dest);
  return '<!doctype html>\n'+
    '<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n'+
    '<title>'+title+'</title><meta name="description" content="'+desc+'">\n'+
    '<meta property="og:locale" content="pt_BR"><meta property="og:type" content="website">\n'+
    '<meta property="og:site_name" content="Carioca Ticket">\n'+
    '<meta property="og:title" content="'+title+'"><meta property="og:description" content="'+desc+'">\n'+
    '<meta property="og:url" content="'+escapeHtml(canonical)+'">\n'+
    '<meta property="og:image" content="'+img+'"><meta property="og:image:secure_url" content="'+img+'">\n'+
    '<meta property="og:image:type" content="image/jpeg">\n'+
    '<meta property="og:image:width" content="'+image.width+'"><meta property="og:image:height" content="'+image.height+'">\n'+
    '<meta property="og:image:alt" content="'+escapeHtml(event.title)+'">\n'+
    '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="'+title+'">\n'+
    '<meta name="twitter:description" content="'+desc+'"><meta name="twitter:image" content="'+img+'">\n'+
    '<link rel="canonical" href="'+escapeHtml(canonical)+'"><meta name="robots" content="noindex,follow">\n'+
    '</head><body><main><h1>'+title+'</h1><p>'+desc+'</p>\n'+
    '<p><a href="'+go+'">Abrir página oficial de ingressos na Carioca Ticket</a></p></main>\n'+
    '<script>location.replace('+JSON.stringify(dest).replace(/</g,'\\u003c')+');</script>\n'+
    '</body></html>\n';
}
for(const event of manifest.events){
  assert(event&&typeof event==='object');
  assert(safeId(event.id),'ID inválido');
  assert(!seen.has(event.id),'ID duplicado');seen.add(event.id);
  assert.equal(event.public,true,'Nunca gerar prévia para evento não público');
  assert(safeText(event.title,180)&&safeText(event.description,380),'Texto público inválido');
  assert(event.detail==='/evento/'||event.detail==='/evento-v2/','Destino público não autorizado');
  assert(typeof event.cover==='string'&&/^\/assets\/eventos\/[a-z0-9][a-z0-9._-]*\.jpe?g$/.test(event.cover),'Capa deve ser JPEG HTTPS no próprio domínio');
  const imagePath=path.join(root,event.cover.slice(1));
  const buf=fs.readFileSync(imagePath);
  assert(buf.length>=1024&&buf.length<=600*1024,'Capa fora do limite de 600 KiB');
  const image=jpegDimensions(buf);
  assert(image&&image.width>=300&&image.height>=300&&image.width/image.height<=4,'Dimensões da capa incompatíveis');
  const route='/compartilhar/'+event.id+'/';
  mapping[event.id]=route;
  outputs.set(path.join(root,'compartilhar',event.id,'index.html'),eventHtml(event,image));
}
// Este arquivo só lista rotas que o gerador realmente criou.
outputs.set(path.join(root,'assets/social-event-pages.js'),
  '(function(root){\'use strict\';var pages='+JSON.stringify(mapping)+';'+
  'root.CTSocialEventPages=Object.freeze({url:function(id){'+
  'var v=pages[String(id||\'\')];return v||\'\';}});'+
  '}(typeof window===\'object\'?window:this));\n');
// Remoção de previews despublicados somente em PR de sincronização. Nunca
// publicar metadados de um evento que saiu do catálogo público verificado.
if(process.argv.includes('--prune')){
  const dir=path.join(root,'compartilhar');
  if(fs.existsSync(dir))for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(!entry.isDirectory()||!safeId(entry.name)||seen.has(entry.name))continue;
    const page=path.join(dir,entry.name,'index.html');
    if(!fs.existsSync(page))continue;
    const html=fs.readFileSync(page,'utf8');
    if(!html.includes('<meta property="og:site_name" content="Carioca Ticket">')||
       !html.includes('/compartilhar/'+entry.name+'/'))throw Error('Preview não reconhecido: '+entry.name);
    if(checking)throw Error('Preview retirado do catálogo ainda existe: '+entry.name);
    fs.unlinkSync(page);
    fs.rmdirSync(path.dirname(page));
  }
}

for(const [target,value] of outputs){
  if(checking){
    assert(fs.existsSync(target),'Prévia ausente: '+path.relative(root,target));
    assert.equal(fs.readFileSync(target,'utf8'),value,'Prévia divergente: '+path.relative(root,target));
  }else{
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,value);
  }
}
console.log('CT_SOCIAL_PREVIEWS_OK generated='+manifest.events.length+' mode='+(checking?'check':'build'));
