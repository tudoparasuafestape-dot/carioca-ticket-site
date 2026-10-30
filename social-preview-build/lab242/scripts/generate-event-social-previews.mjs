#!/usr/bin/env node
// Carioca Ticket — OFFLINE ONLY. Not connected to producer/admin publication.
// The manifest must eventually be built and certified by an authoritative backend.
import fs from 'node:fs';
import path from 'node:path';

const CANONICAL='https://cariocaticket.com.br';
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,219}$/;
const REQUIRED_SOURCE='CT_PUBLIC_APPROVAL_V1';

function fail(message){throw new Error('SOCIAL_PREVIEW_DENIED: '+message);}
function escapeHtml(value){
  return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function clean(value, limit, field){
  if(typeof value!=='string'||!value.trim()||value.length>limit||/[\u0000-\u001f\u007f]/.test(value))
    fail(field+' invalido');
  return value.trim();
}
function verifiedUrl(value, field){
  let u;
  try{u=new URL(value);}catch(_){fail(field+' nao e URL valida');}
  if(u.protocol!=='https:'||u.username||u.password||u.hash||u.origin!==CANONICAL)fail(field+' fora do dominio HTTPS');
  if(u.searchParams.has('token')||u.searchParams.has('sig')||u.searchParams.has('auth'))fail(field+' contem token');
  return u;
}
function render(event,imageMetadata){
  if(imageMetadata!==undefined&&(!imageMetadata||!['image/png','image/jpeg'].includes(imageMetadata.mime)||![imageMetadata.width,imageMetadata.height].every(n=>Number.isInteger(n)&&n>0&&n<=65535)))fail('image metadata invalid');
  if(!event||typeof event!=='object'||Array.isArray(event))fail('evento invalido');
  if(event.fonte!==REQUIRED_SOURCE||event.publicado!==true||
    event.modoAcesso!=='PUBLICO'||event.elegivel!==true||
    event.gateVendasAtivo!==true)fail('evento nao autorizado para compartilhamento');
  const id=clean(event.eventoId,220,'eventoId');
  if(!ID.test(id)||id==='.'||id==='..')fail('id invalido');
  const title=clean(event.titulo,220,'titulo');
  const description=clean(event.descricao,350,'descricao');
  const image=verifiedUrl(event.imagemSocialHttps,'imagem');
  if(!(/^\/assets\/eventos\/[A-Za-z0-9._-]+\.(?:jpe?g|png)$/i.test(image.pathname)||(imageMetadata&&/^\/assets\/social-previews\/[a-f0-9]{64}\.jpg$/.test(image.pathname)))||image.search)
    fail('capa precisa ser um asset estatico JPEG/PNG aprovado do evento');
  const target=verifiedUrl(event.destinoPublicoHttps,'destino');
  if(!/^\/evento(?:-v2)?\/$/.test(target.pathname)||target.searchParams.get('evento')!==id||
     [...target.searchParams.keys()].some(k=>k!=='evento'))fail('destino divergente');
  const share=CANONICAL+'/compartilhar/'+encodeURIComponent(id)+'/';
  const meta=(name,value,attribute='property')=>
    '<meta '+attribute+'="'+name+'" content="'+escapeHtml(value)+'">';
  const html=[
    '<!doctype html>','<html lang="pt-BR">','<head>',
    '<meta charset="utf-8">','<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>'+escapeHtml(title)+' | Carioca Ticket</title>',
    meta('description',description,'name'),
    '<link rel="canonical" href="'+escapeHtml(share)+'">',
    meta('og:type','website'),meta('og:site_name','Carioca Ticket'),
    meta('og:title',title),meta('og:description',description),
    meta('og:url',share),meta('og:image',image.href),
    meta('og:image:secure_url',image.href),
    ...(imageMetadata?[meta('og:image:type',imageMetadata.mime),meta('og:image:width',imageMetadata.width),meta('og:image:height',imageMetadata.height)]:[]),
    meta('og:image:alt','Capa do evento: '+title),
    meta('twitter:card','summary_large_image','name'),
    meta('twitter:title',title,'name'),meta('twitter:description',description,'name'),
    meta('twitter:image',image.href,'name'),
    '<meta name="robots" content="noindex,follow">',
    '</head>','<body>',
    '<p>Visite a pagina oficial do evento na Carioca Ticket.</p>',
    '<a href="'+escapeHtml(target.href)+'">Abrir evento</a>',
    '<script>window.location.replace('+JSON.stringify(target.href).replace(/</g,'\\u003c')+');</script>',
    '</body>','</html>'
  ].join('\n')+'\n';
  return {id,html,share,image:image.href,destination:target.href};
}
function generate(manifestPath,outDir){
  if(!manifestPath||!outDir)fail('uso: node scripts/generate-event-social-previews.mjs MANIFESTO.json PASTA_LAB_EXTERNA');
  const dir=path.resolve(outDir);
  const root=path.resolve('.');
  if(dir===root||dir.startsWith(root+path.sep))fail('saidas no repositorio estao bloqueadas neste laboratorio');
  const events=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  if(!Array.isArray(events)||events.length===0||events.length>100)fail('manifesto deve conter 1..100 eventos');
  const pages=events.map(render),ids=new Set();
  for(const page of pages){
    if(ids.has(page.id))fail('evento duplicado');ids.add(page.id);
    const target=path.join(dir,page.id,'index.html');
    if(fs.existsSync(target))fail('recusa substituir previa existente');
  }
  // All authorization and shape checks must complete before writing anything.
  for(const page of pages){
    const folder=path.join(dir,page.id);
    fs.mkdirSync(folder,{recursive:true});
    fs.writeFileSync(path.join(folder,'index.html'),page.html,{flag:'wx',mode:0o644});
  }
  return pages.map(p=>({eventoId:p.id,url:p.share,destino:p.destination}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
  try{
    const result=generate(process.argv[2],process.argv[3]);
    console.log('SOCIAL_PREVIEW_LAB_OK '+JSON.stringify(result));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
export {render,generate};
