// OFFLINE-TESTED protocol adapter. No request is executed by this module.
// Network caller must bind request/response to verified Apps Script deployment
// over HTTPS, disallow credentials and all unapproved redirect destinations.
const METHOD='ctEventosPublicosListarPROD';
const PREFIX='<!doctype html><html><head><meta charset="utf-8"></head><body><script>(function(){var b=atob(';
const SUFFIX=');var u=new Uint8Array(b.length);for(var i=0;i<b.length;i++){u[i]=b.charCodeAt(i);}var p=JSON.parse(new TextDecoder("utf-8").decode(u));try{window.top.postMessage(p,"https://cariocaticket.com.br");}catch(e){}try{window.top.postMessage(p,"https://www.cariocaticket.com.br");}catch(e){}}());</script></body></html>';
function deny(reason){throw new Error('CT_CATALOG_TRANSPORT_DENIED: '+reason);}
function requestId(id){if(typeof id!=='string'||!/^CT_SOCIAL_READ_[A-Za-z0-9_-]{12,80}$/.test(id))deny('request id invalido');return id;}
export function catalogReadRequest(id){
 return new URLSearchParams({ctMinhaCariocaAction:'publicRpc',
  ctMinhaCariocaRequestId:requestId(id),metodo:METHOD,argsJson:'[]'}).toString();
}
export function decodeCatalogReadResponse(html,id){
 requestId(id);
 if(typeof html!=='string'||Buffer.byteLength(html)>1000000||
  !html.startsWith(PREFIX)||!html.endsWith(SUFFIX))deny('template nao reconhecido');
 const literal=html.slice(PREFIX.length,-SUFFIX.length);
 if(!/^"[A-Za-z0-9+/]*={0,2}"$/.test(literal))deny('payload nao literal base64');
 const encoded=JSON.parse(literal),bytes=Buffer.from(encoded,'base64');
 if(bytes.toString('base64')!==encoded)deny('base64 nao canonico');
 let envelope;
 try{envelope=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 catch(_){deny('JSON UTF8 invalido');}
 if(!envelope||Array.isArray(envelope)||typeof envelope!=='object'||
  Object.keys(envelope).sort().join('|')!==['ctMinhaCariocaPost','id','ok','resultado','erro'].sort().join('|')||
  envelope.ctMinhaCariocaPost!==true||envelope.id!==id||envelope.ok!==true||envelope.erro!=='')
  deny('envelope/identidade/resultado invalido');
 const result=envelope.resultado;
 if(!result||Array.isArray(result)||typeof result!=='object'||result.sucesso!==true||
  !Array.isArray(result.eventos)||result.total!==result.eventos.length)deny('catalogo invalido');
 // Return to strict source/schema/public/active/time validator, not publication.
 return result;
}
export function validateCatalogResponseOrigin(url,verifiedDeploymentUrl){
 let actual,expected;
 try{actual=new URL(url);expected=new URL(verifiedDeploymentUrl);}catch(_){deny('URL invalida');}
 if(expected.protocol!=='https:'||expected.hostname!=='script.google.com'||expected.port||expected.username||expected.password||expected.search||expected.hash||
  !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(expected.pathname))deny('deployment nao permitido');
 if(actual.protocol!=='https:'||actual.port||actual.username||actual.password||actual.hash)deny('origem invalida');
 if(actual.href===expected.href)return true;
 // A Google redirect is acceptable ONLY when obtained from the verified
 // preceding HTTPS response. This check alone does not establish that chain.
 if(actual.hostname==='script.googleusercontent.com'&&actual.pathname==='/macros/echo')return true;
 deny('redirect/origem nao permitido');
}
export {METHOD};
