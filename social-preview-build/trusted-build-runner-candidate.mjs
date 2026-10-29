// Local/injected runner only; no CLI and no implicit network transport.
import crypto from 'node:crypto';
import{readPublicCatalogHtml,DEPLOYMENT}from './trusted-http-caller-candidate.mjs';
import{decodeGoogleCatalogWrapper}from './google-htmlservice-wrapper-candidate.mjs';
import{buildTrustedCandidate,auditTrustedCandidate,validateSnapshot,writeFreshStage}from './trusted-build-candidate.mjs';
export async function prepareTrustedRelease({fetchImpl,assetRoot,destination,clock=Date.now,previousPublishedServerNow=null}){
 const prefix='CT_SOCIAL_READ_BUILD_'+crypto.randomBytes(12).toString('hex');
 const first=decodeGoogleCatalogWrapper(await readPublicCatalogHtml(prefix+'_A',{fetchImpl}),prefix+'_A',DEPLOYMENT);
 validateSnapshot(first,clock());
 const second=decodeGoogleCatalogWrapper(await readPublicCatalogHtml(prefix+'_B',{fetchImpl}),prefix+'_B',DEPLOYMENT);
 const now=clock();
 if(previousPublishedServerNow!==null&&(!Number.isFinite(Date.parse(previousPublishedServerNow))||Date.parse(second.serverNow)<Date.parse(previousPublishedServerNow)))throw Error('Publication watermark rollback denied');
 const options={now,assetRoot},candidate=buildTrustedCandidate(first,second,options);
 auditTrustedCandidate(candidate,first,second,options);
 // Caller must hold a single publisher lock from before reads until deploy.
 // This function creates only a NEW stage. It never touches published output.
 writeFreshStage(candidate,destination);
 return candidate.receipt;
}
