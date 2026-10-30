// Explicit LAB alternative to signed242: only trusted in-process HTTP caller.
// No networking, signatures, deployment, or automatic activation in this module.
import crypto from 'node:crypto';
import fs from 'node:fs';import path from 'node:path';
import{deriveApprovedManifest}from './derive-current397-trusted.mjs';
import{render}from './lab242/scripts/generate-event-social-previews.mjs';
import{imageMetadata}from './image-metadata.mjs';
import{derivePreviewImage}from './derive-preview-image.mjs';
import{decodeGoogleCatalogWrapper}from './google-htmlservice-wrapper-candidate.mjs';
const deny=m=>{throw Error('CT_TRUSTED_BUILD_DENIED: '+m)};
const canonical=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v);
export const semanticHash=s=>crypto.createHash('sha256').update(canonical({contract:s.eligibilityContract,version:s.temporalVersion,eventos:[...s.eventos].sort((a,b)=>a.id.localeCompare(b.id))})).digest('hex');
export function validateSnapshot(s,now){
 if(!s||s.versaoModulo!=='1.0.0'||s.cacheStale===true||s.total!==s.eventos?.length||!Array.isArray(s.eventos)||s.eventos.length>50)deny('explicit fresh authoritative contract missing');
 // Validate envelope even for zero events. Never interpret an error as revocation.
 deriveApprovedManifest({...s,eventos:[]},{now});
 const eligible=[],excluded=[],ids=new Set();
 for(const e of s.eventos){
  if(!e||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,219}$/.test(e.id)||ids.has(e.id))deny('invalid identity/public gate');
  ids.add(e.id);
  if(e.status!==undefined&&!['ATIVO','INATIVO','ENCERRADO','CANCELADO'].includes(e.status))deny('unknown status');
  if(e.modoAcesso!==undefined&&!['PUBLICO','PRIVADO','RESTRITO'].includes(e.modoAcesso))deny('unknown visibility');
  if((e.status!==undefined&&e.status!=='ATIVO')||(e.modoAcesso!==undefined&&e.modoAcesso!=='PUBLICO')){excluded.push({eventId:e.id,reason:'NOT_PUBLIC_ACTIVE'});continue;}
  if(e.temporal?.state==='LEGADO_SEM_FIM'){
   if(['inicioEm','fimEm','fusoHorario','temporalVersion'].some(k=>e.temporal[k]!==null))deny('malformed legacy temporal');
   excluded.push({eventId:e.id,reason:'NO_VERIFIABLE_END'});continue;
  }
  // Explicit valid finite end is required; expiry removes derived preview only.
  const t=e.temporal;
  if(!t||t.state!=='TEMPORAL_V1'||t.temporalVersion!==1||typeof t.fusoHorario!=='string'||!(t.fusoHorario==='UTC'||/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/.test(t.fusoHorario)))deny('unknown temporal');
  for(const k of ['inicioEm','fimEm'])if(typeof t[k]!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(t[k])||!Number.isFinite(Date.parse(t[k]))||new Date(t[k]).toISOString()!==t[k])deny('noncanonical temporal');
  if(Date.parse(t.fimEm)<=Date.parse(t.inicioEm))deny('invalid interval');
  if(Date.parse(t.fimEm)<=now){excluded.push({eventId:e.id,reason:'ENDED'});continue;}
  // Unknown temporal, malformed covers or fields abort release.
  deriveApprovedManifest({...s,eventos:[e]},{now});eligible.push(e);
 }
 return {manifest:deriveApprovedManifest({...s,eventos:eligible},{now}),excluded};
}
export function buildTrustedCandidate(first,second,{now=Date.now(),assetRoot}={}){
 const a=validateSnapshot(first,now),b=validateSnapshot(second,now);
 if(Date.parse(second.serverNow)<Date.parse(first.serverNow))deny('source ordering');
 const revision=semanticHash(first);if(revision!==semanticHash(second))deny('source changed');
 const files={},derivatives=new Map();
 for(const e of b.manifest){
  const p=render(e),asset=path.resolve(assetRoot,'.'+new URL(p.image).pathname),root=path.resolve(assetRoot,'assets/eventos')+path.sep;
  for(const directory of [path.resolve(assetRoot),path.resolve(assetRoot,'assets'),path.resolve(assetRoot,'assets/eventos')]){
   if(!fs.existsSync(directory)||!fs.lstatSync(directory).isDirectory()||fs.lstatSync(directory).isSymbolicLink())deny('untrusted asset directory');
  }
  if(!asset.startsWith(root)||!fs.existsSync(asset)||!fs.lstatSync(asset).isFile()||fs.lstatSync(asset).isSymbolicLink()||!fs.realpathSync(asset).startsWith(fs.realpathSync(root)+path.sep))deny('missing approved image');
  const bytes=fs.readFileSync(asset);if(bytes.length<512||bytes.length>8e6)deny('image size');
  if(/\.png$/i.test(asset)?!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))deny('image signature');
  imageMetadata(bytes,asset);
  const sourceHash=crypto.createHash('sha256').update(bytes).digest('hex');
  if(!derivatives.has(sourceHash))derivatives.set(sourceHash,derivePreviewImage(bytes));
  const derivative=derivatives.get(sourceHash);
  files['compartilhar/'+p.id+'/index.html']=render({...e,imagemSocialHttps:'https://cariocaticket.com.br/'+derivative.path},derivative.metadata).html;
  files[derivative.path]=derivative.body;
 }
 const index={schema:'CT_PUBLISHED_SHARE_INDEX_V1',revision,generatedAt:second.serverNow,
  fallbacks:b.excluded.filter(e=>e.reason==='NO_VERIFIABLE_END').map(e=>({eventId:e.eventId,detailUrl:'https://cariocaticket.com.br/evento/?evento='+encodeURIComponent(e.eventId),reason:e.reason})),
  entries:b.manifest.map(e=>({eventId:e.eventoId,sharePath:'/compartilhar/'+encodeURIComponent(e.eventoId)+'/',detailUrl:e.destinoPublicoHttps,
   endsAt:second.eventos.find(x=>x.id===e.eventoId).temporal.fimEm})).sort((a,b)=>a.eventId.localeCompare(b.eventId))};
 files['assets/social-event-pages.json']=JSON.stringify(index,null,2)+'\n';
 const receipt={schema:'CT_TRUSTED_BUILD_LAB_V1',mode:'TRUSTED_HTTP_CURRENT397_NOT_SIGNED242',status:'LOCAL_NOT_PUBLISHED',revision,
  sourceServerNow:second.serverNow,sourceValidUntil:second.validUntil,excluded:b.excluded,
  hashes:Object.fromEntries(Object.entries(files).map(([p,b])=>[p,crypto.createHash('sha256').update(b).digest('hex')]))};
 return {files,index,receipt};
}
export function auditTrustedCandidate(candidate,first,second,options){
 const expected=buildTrustedCandidate(first,second,options);
 if(canonical(candidate)!==canonical(expected))deny('artifact/index/receipt tamper');return true;
}
export function buildFromCapturedResponses(firstHtml,secondHtml,{firstId,secondId,deploymentUrl,...options}){
 if(firstId===secondId)deny('distinct request correlations required');
 return buildTrustedCandidate(decodeGoogleCatalogWrapper(firstHtml,firstId,deploymentUrl),decodeGoogleCatalogWrapper(secondHtml,secondId,deploymentUrl),options);
}
export function writeFreshStage(candidate,destination){
 // No replacement of previous output. Caller publishes entire audited stage only.
 if(fs.existsSync(destination))deny('destination exists');
 fs.mkdirSync(destination,{recursive:false,mode:0o700});
 try{for(const [relative,body]of Object.entries(candidate.files)){
  if(!/^(?:compartilhar\/[A-Za-z0-9_-]+\/index\.html|assets\/social-event-pages\.json|assets\/social-previews\/[a-f0-9]{64}\.jpg)$/.test(relative))deny('output path');
  const out=path.join(destination,relative);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,body,{flag:'wx'});
 }fs.writeFileSync(path.join(destination,'publication-receipt.json'),JSON.stringify(candidate.receipt,null,2),{flag:'wx'});
 }catch(e){fs.rmSync(destination,{recursive:true,force:true});throw e;}
}
