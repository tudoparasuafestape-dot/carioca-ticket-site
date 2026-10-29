// LAB integration only: build one complete, immutable candidate release from
// a RECENT public-catalog response. No HTTP, GitHub writes or production deploy.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {deriveApprovedManifest} from './derive-event-social-manifest.mjs';
import {generate} from './generate-event-social-previews.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function fail(message){throw new Error('SOCIAL_RELEASE_DENIED: '+message);}
function ensureExternal(dest){
  const location=path.resolve(dest);
  if(location===ROOT||location.startsWith(ROOT+path.sep))fail('escrita no repositorio bloqueada');
  if(fs.existsSync(location))fail('destino de release ja existe');
  return location;
}
function verifyCover(url){
  const parsed=new URL(url);
  const relative=decodeURIComponent(parsed.pathname).replace(/^\/+/,'');
  const filename=path.resolve(ROOT,relative);
  const assets=path.resolve(ROOT,'assets/eventos');
  if(!filename.startsWith(assets+path.sep))fail('capa fora da pasta oficial');
  if(!fs.existsSync(filename)||!fs.statSync(filename).isFile())fail('capa oficial ausente');
  const bytes=fs.readFileSync(filename);
  if(bytes.length<512||bytes.length>8_000_000)fail('tamanho da imagem suspeito');
  if(/\.jpe?g$/i.test(filename)){
    if(bytes[0]!==0xff||bytes[1]!==0xd8||bytes[2]!==0xff)fail('JPEG invalido');
  }else if(/\.png$/i.test(filename)){
    if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))fail('PNG invalido');
  }else fail('extensao nao permitida');
}
function buildRelease(snapshot,destination,options={}){
  const dest=ensureExternal(destination);
  const manifest=deriveApprovedManifest(snapshot,options);
  for(const e of manifest)verifyCover(e.imagemSocialHttps);
  // Build complete snapshot in a staging directory. No merging with old
  // files, and no fallback to previous releases if an event is removed.
  const stage=dest+'.staging-'+crypto.randomBytes(8).toString('hex');
  if(fs.existsSync(stage))fail('staging ocupado');
  fs.mkdirSync(stage,{recursive:true,mode:0o700});
  let committed=false;
  try{
    fs.writeFileSync(path.join(stage,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
    if(manifest.length)generate(path.join(stage,'manifest.json'),path.join(stage,'compartilhar'));
    else fs.mkdirSync(path.join(stage,'compartilhar'));
    const receipt={
      status:'LAB_CANDIDATE_NOT_PUBLISHED',
      sourceContract:'CT_PUBLIC_ELIGIBILITY_EXCLUSIVE_V1',
      sourceServerNow:snapshot.serverNow,
      count:manifest.length,
      eventIds:manifest.map(e=>e.eventoId).sort()
    };
    fs.writeFileSync(path.join(stage,'release.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
    fs.renameSync(stage,dest);
    committed=true;
    return receipt;
  }finally{
    if(!committed&&fs.existsSync(stage))fs.rmSync(stage,{force:true,recursive:true});
  }
}
const called=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(called){
  try{
    if(process.argv.length!==4)fail('uso: node scripts/build-event-social-release-lab.mjs SNAPSHOT.json DIRETORIO_EXTERNO');
    const snapshot=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
    console.log(JSON.stringify(buildRelease(snapshot,process.argv[3])));
  }catch(e){console.error(e.message);process.exitCode=1;}
}
export {buildRelease};
