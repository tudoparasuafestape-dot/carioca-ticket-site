import {decodeCatalogReadResponse,validateCatalogResponseOrigin} from './public-catalog-transport-candidate.mjs';
// Decode DATA ONLY from an authenticated response captured by the bounded HTTP
// caller. Never execute Google scripts, iframe URLs, or returned function names.
export function decodeGoogleCatalogWrapper(html,id,deploymentUrl){
 const deny=()=>{throw new Error('CT_HTMLSERVICE_WRAPPER_DENIED');};
 if(typeof html!=='string'||Buffer.byteLength(html)>1000000)deny();
 validateCatalogResponseOrigin(deploymentUrl,deploymentUrl);
 const calls=[...html.matchAll(/goog\.script\.init\s*\(/g)];
 if(calls.length!==1)deny();
 const start=calls[0].index+calls[0][0].length;
 const m=html.slice(start).match(/^\s*("(?:[^"\\\r\n]|\\[^\r\n])*")\s*,/);
 if(!m)deny();
 let json,wrapper;
 try{
  const literal=m[1].replace(/\\x([0-9a-fA-F]{2})/g,(_,h)=>'\\u00'+h);
  json=JSON.parse(literal);
  if(typeof json!=='string')deny();
  wrapper=JSON.parse(json);
 }catch(_){deny();}
 // Tokenize every complete JSON string before detecting keys. Normalizing key
 // escapes prevents duplicate aliases such as "\\u0064eploymentId".
 const counts=new Map();
 for(const token of json.matchAll(/"(?:[^"\\]|\\.)*"/g)){
  if(!/^\s*:/.test(json.slice(token.index+token[0].length)))continue;
  const key=JSON.parse(token[0]);counts.set(key,(counts.get(key)||0)+1);
 }
 for(const key of ['deploymentId','sandboxMode','userHtml']){
  if(counts.get(key)!==1)deny();
 }
 const deploymentId=new URL(deploymentUrl).pathname.split('/')[3];
 if(!wrapper||Array.isArray(wrapper)||wrapper.deploymentId!==deploymentId||
    wrapper.sandboxMode!=='IFRAME_SANDBOX'||typeof wrapper.userHtml!=='string')deny();
 return decodeCatalogReadResponse(wrapper.userHtml,id);
}
