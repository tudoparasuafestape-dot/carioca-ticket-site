// Executable only after specific production publication approval. No implicit run.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import{prepareTrustedRelease}from './trusted-build-runner-candidate.mjs';
export function previousWatermark(receipt,{allowInit=false}={}){
 if(allowInit&&receipt&&receipt.schema==='CT_FIRST_PUBLICATION_404_APPROVED'&&Object.keys(receipt).length===1)return null;
 if(!receipt||receipt.schema!=='CT_TRUSTED_BUILD_LAB_V1'||receipt.mode!=='TRUSTED_HTTP_CURRENT397_NOT_SIGNED242'||receipt.status!=='LOCAL_NOT_PUBLISHED'||!/^[a-f0-9]{64}$/.test(receipt.revision)||typeof receipt.sourceServerNow!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(receipt.sourceServerNow)||!Number.isFinite(Date.parse(receipt.sourceServerNow))||new Date(receipt.sourceServerNow).toISOString()!==receipt.sourceServerNow)throw Error('Unknown previous publication receipt');
 return receipt.sourceServerNow;
}
export async function preparePages({siteRoot,output,fetchImpl,previousPublishedServerNow=null,clock=Date.now}){
 siteRoot=fs.realpathSync(siteRoot);output=path.resolve(output);
 const realOutputParent=fs.realpathSync(path.dirname(output));
 output=path.join(realOutputParent,path.basename(output));
 function rejectLinks(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  if(['.git','.github','node_modules','social-preview-build'].includes(item.name))continue;
  const p=path.join(dir,item.name);if(item.isSymbolicLink())throw Error('Symlink in site tree denied');if(item.isDirectory())rejectLinks(p);
 }}rejectLinks(siteRoot);
 if(output===siteRoot||output.startsWith(siteRoot+path.sep)||fs.existsSync(output))throw Error('Require fresh external artifact');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ct-preview-build-'));const stage=path.join(temp,'derived');
 try{
  const receipt=await prepareTrustedRelease({fetchImpl,assetRoot:siteRoot,destination:stage,previousPublishedServerNow,clock});
  fs.cpSync(siteRoot,output,{recursive:true,dereference:false,filter:p=>!['.git','.github','node_modules'].includes(path.basename(p))&&!p.includes(path.sep+'social-preview-build'+path.sep)});
  fs.rmSync(path.join(output,'social-preview-build'),{recursive:true,force:true});
  fs.rmSync(path.join(output,'compartilhar'),{recursive:true,force:true});
  if(fs.existsSync(path.join(stage,'compartilhar')))fs.cpSync(path.join(stage,'compartilhar'),path.join(output,'compartilhar'),{recursive:true});
  fs.mkdirSync(path.join(output,'assets'),{recursive:true});
  fs.rmSync(path.join(output,'assets/social-previews'),{recursive:true,force:true});
  if(fs.existsSync(path.join(stage,'assets/social-previews')))fs.cpSync(path.join(stage,'assets/social-previews'),path.join(output,'assets/social-previews'),{recursive:true});
  fs.copyFileSync(path.join(stage,'assets/social-event-pages.json'),path.join(output,'assets/social-event-pages.json'));
  fs.copyFileSync(path.join(stage,'publication-receipt.json'),path.join(output,'assets/social-publication-receipt.json'));
  return receipt;
 }catch(e){fs.rmSync(output,{recursive:true,force:true});throw e;}finally{fs.rmSync(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){
 if(process.env.CT_APPROVED_PUBLICATION!=='1')throw Error('Explicit approved publication context required');
 const[siteRoot,output,receiptPath]=process.argv.slice(2);if(!siteRoot||!output||!receiptPath)throw Error('Usage SITE_ROOT OUTPUT PREVIOUS_RECEIPT_JSON');
 const previous=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
 console.log(JSON.stringify(await preparePages({siteRoot,output,fetchImpl:fetch,previousPublishedServerNow:previousWatermark(previous,{allowInit:process.env.CT_INITIAL_RECEIPT_404==='1'})})));
}
