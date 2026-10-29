// Ed25519 authorization boundary for public-catalog snapshots (LAB).
// Private signing keys must remain only inside a future trusted backend issuer.
// This verifier reads PUBLIC keys. Not a production integration.
import crypto from 'node:crypto';
import {deriveApprovedManifest} from './derive-event-social-manifest.mjs';

const AUDIENCE='ct-social-preview-release-v1';
const ISSUER='ct-public-catalog-authoritative';
const MAX_TTL=120_000;
function deny(message){throw new Error('SOCIAL_ATTESTATION_DENIED: '+message);}
function canonical(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
function strictBase64Url(value){
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value)||value.length<80)deny('assinatura invalida');
  const decoded=Buffer.from(value,'base64url');
  if(decoded.toString('base64url')!==value||decoded.length!==64)deny('assinatura invalida');
  return decoded;
}
function verificationKey(env){
  const pem=env.CT_SOCIAL_PREVIEW_PUBLIC_KEY_PEM;
  const kid=env.CT_SOCIAL_PREVIEW_KEY_ID;
  if(typeof pem!=='string'||typeof kid!=='string'||!/^[A-Za-z0-9._-]{3,80}$/.test(kid))
    deny('configuracao de chave publica ausente');
  let key;
  try {key=crypto.createPublicKey(pem);}catch(_){deny('chave publica PEM invalida');}
  if(key.asymmetricKeyType!=='ed25519')deny('algoritmo da chave publica diferente de Ed25519');
  return {key,kid};
}
function verifyAttestation(input,{now=Date.now(),env=process.env,previousRevision=null}={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||!Number.isFinite(now))deny('atestado invalido');
  const keys=Object.keys(input).sort();
  const expected=['audience','expiresAt','issuedAt','issuer','keyId','revision','signature','snapshot','version'].sort();
  if(keys.length!==expected.length||keys.some((k,i)=>k!==expected[i]))deny('esquema de atestado desconhecido');
  const {key,kid}=verificationKey(env);
  if(input.version!==1||input.audience!==AUDIENCE||input.issuer!==ISSUER||input.keyId!==kid)
    deny('identidade ou audiencia invalida');
  if(!Number.isSafeInteger(input.revision)||input.revision<1||
     (previousRevision!==null&&(!Number.isSafeInteger(previousRevision)||input.revision<=previousRevision)))
    deny('revisao ausente, repetida ou antiga');
  if(typeof input.issuedAt!=='string'||typeof input.expiresAt!=='string')deny('instantes ausentes');
  const issued=Date.parse(input.issuedAt),expires=Date.parse(input.expiresAt);
  if(!Number.isFinite(issued)||!Number.isFinite(expires)||
     new Date(issued).toISOString()!==input.issuedAt||
     new Date(expires).toISOString()!==input.expiresAt||
     expires-issued<=0||expires-issued>MAX_TTL||
     issued>now+5000||now-issued>MAX_TTL||expires<=now)
    deny('atestado expirado ou incoerente');
  const {signature,...body}=input;
  const received=strictBase64Url(signature);
  const ok=crypto.verify(null,Buffer.from(canonical(body),'utf8'),key,received);
  if(!ok)deny('assinatura Ed25519 incorreta');
  const manifest=deriveApprovedManifest(input.snapshot,{now});
  return {snapshot:input.snapshot,manifest,revision:input.revision,issuedAt:input.issuedAt,expiresAt:input.expiresAt};
}
export {verifyAttestation,canonical,AUDIENCE,ISSUER};
