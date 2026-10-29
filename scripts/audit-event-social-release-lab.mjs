// Carioca Ticket — OFFLINE release acceptance gate for social preview pages.
// Never publishes, changes routes, requests live APIs, or handles payments.
// Verify a SIGNED attestation and compare the complete candidate on disk.
// Local validation is NOT proof that WhatsApp/Meta can fetch HTTP 200 assets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyAttestation} from './verify-event-social-attestation.mjs';
import {render} from './generate-event-social-previews.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const EXPECTED='CT_PUBLIC_ELIGIBILITY_EXCLUSIVE_V1';
function deny(reason){throw new Error('SOCIAL_RELEASE_AUDIT_DENIED: '+reason);}
function assertRegular(file){
  let stat;
  try{stat=fs.lstatSync(file);}catch(_){deny('arquivo obrigatorio ausente');}
  if(!stat.isFile()||stat.isSymbolicLink())deny('arquivo nao regular ou symlink');
  return stat;
}
function assertDir(dir){
  let stat;
  try{stat=fs.lstatSync(dir);}catch(_){deny('diretorio obrigatorio ausente');}
  if(!stat.isDirectory()||stat.isSymbolicLink())deny('diretorio nao confiavel');
}
function list(dir){
  assertDir(dir);
  return fs.readdirSync(dir).sort();
}
function equalSets(actual,expected,label){
  if(actual.join('\n')!==[...expected].sort().join('\n'))deny(label+' divergente');
}
function readJson(file){
  const stat=assertRegular(file);
  if(stat.size>1500000)deny('arquivo JSON excessivo');
  try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(_){deny('arquivo JSON invalido');}
}
function checkCover(url){
  const parsed=new URL(url);
  const expectedOrigin='https://cariocaticket.com.br';
  if(parsed.origin!==expectedOrigin||parsed.search||parsed.hash||
     !/^\/assets\/eventos\/[A-Za-z0-9._-]+\.(?:jpe?g|png)$/i.test(parsed.pathname))
    deny('capa fora do repositorio oficial');
  const folder=path.join(ROOT,'assets','eventos');
  assertDir(folder);
  const local=path.resolve(ROOT,parsed.pathname.slice(1));
  if(!local.startsWith(folder+path.sep))deny('capa fora da pasta');
  const stat=assertRegular(local);
  if(stat.size<512||stat.size>8_000_000)deny('capa com tamanho invalido');
  const fd=fs.openSync(local,'r');
  try{
    const bytes=Buffer.alloc(8);
    fs.readSync(fd,bytes,0,bytes.length,0);
    if(/\.jpe?g$/i.test(local)){
      if(!(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff))deny('assinatura JPEG invalida');
    }else{
      if(!bytes.equals(Buffer.from([137,80,78,71,13,10,26,10])))deny('assinatura PNG invalida');
    }
  }finally{fs.closeSync(fd);}
}
function auditEventSocialRelease(candidate,attestation,{
  now=Date.now(),env=process.env,previousRevision=null
}={}){
  // Never trust manifest.json, release.json or input event flags alone.
  const verified=verifyAttestation(attestation,{now,env,previousRevision});
  const expected=verified.manifest;
  const dir=path.resolve(candidate);
  if(dir===ROOT||dir.startsWith(ROOT+path.sep))deny('candidato dentro do repositorio');
  equalSets(list(dir),['manifest.json','release.json','compartilhar'],'arquivos raiz');
  const manifest=readJson(path.join(dir,'manifest.json'));
  try{assert.deepStrictEqual(manifest,expected);}catch(_){deny('manifesto divergente da assinatura');}
  const receipt=readJson(path.join(dir,'release.json'));
  if(!receipt||receipt.status!=='LAB_CANDIDATE_NOT_PUBLISHED'||
     receipt.sourceContract!==EXPECTED||
     receipt.sourceServerNow!==verified.snapshot.serverNow||
     receipt.count!==expected.length||!Array.isArray(receipt.eventIds)||
     receipt.eventIds.join('\n')!==expected.map(e=>e.eventoId).sort().join('\n'))
    deny('recibo de release divergente');
  const folder=path.join(dir,'compartilhar');
  equalSets(list(folder),expected.map(e=>e.eventoId),'conjunto de paginas (stale proibido)');
  for(const item of expected){
    const eventDir=path.join(folder,item.eventoId);
    equalSets(list(eventDir),['index.html'],'arquivos da previa');
    const htmlFile=path.join(eventDir,'index.html');
    if(assertRegular(htmlFile).size>20000)deny('HTML muito grande');
    const html=fs.readFileSync(htmlFile,'utf8');
    if(html!==render(item).html)deny('HTML bruto ou tags OG adulteradas');
    // The template comparison covers OG title/description/image/share URL,
    // canonical, Twitter image, and the correct event-v2/legacy redirect.
    checkCover(item.imagemSocialHttps);
  }
  return Object.freeze({
    status:'LAB_AUDITED_NOT_PUBLISHED',count:expected.length,
    signedRevision:verified.revision,eventIds:expected.map(e=>e.eventoId).sort()
  });
}
export {auditEventSocialRelease};
