// Attestation verifier for approved public-catalog snapshots (LAB).
// There is no signer in the website. The future trusted backend MUST issue
// these records; operator-provided flags/JSON are never authoritative.
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
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value)||value.length<40)deny('assinatura invalida');
  const decoded=Buffer.from(value,'base64url');
  if(decoded.toString('base64url')!==value||decoded.length!==32)deny('assinatura invalida');
  return decoded;
}
function keyFromEnvironment(env){
  const raw=env.CT_SOCIAL_PREVIEW_VERIFY_KEY_B64;
  const kid=env.CT_SOCIAL_PREVIEW_KEY_ID;
  if(typeof raw!=='string'||typeof kid!=='string'||!/^[A-Za-z0-9._-]{3,80}$/.test(kid))
    deny('configuracao de chave ausente');
  const key=Buffer.from(raw,'base64');
  if(key.length!==32||key.toString('base64')!==raw)deny('chave deve ter 32 bytes base64 canonico');
  return {key,kid};
}
function verifyAttestation(input,{now=Date.now(),env=process.env,previousRevision=null}={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||!Number.isFinite(now))deny('atestado invalido');
  const keys=Object.keys(input).sort();
  const expected=['audience','expiresAt','issuedAt','issuer','keyId','revision','signature','snapshot','version'].sort();
  if(keys.length!==expected.length||keys.some((k,i)=>k!==expected[i]))deny('esquema de atestado desconhecido');
  const {key,kid}=keyFromEnvironment(env);
  if(input.version!==1||input.audience!==AUDIENCE||input.issuer!==ISSUER||input.keyId!==kid)
    deny('identidade ou audiencia invalida');
  if(!Number.isSafeInteger(input.revision)||input.revision<1||
     (previousRevision!==null&&(!Number.isSafeInteger(previousRevision)||input.revision<=previousRevision)))
    deny('revisao ausente, repetida ou antiga');
  const issued=Date.parse(input.issuedAt),expires=Date.parse(input.expiresAt);
  if(typeof input.issuedAt!=='string'||typeof input.expiresAt!=='string'||
     !Number.isFinite(issued)||!Number.isFinite(expires)||
     new Date(issued).toISOString()!==input.issuedAt||
     new Date(expires).toISOString()!==input.expiresAt||
     expires-issued<=0||expires-issued>MAX_TTL||
     issued>now+5000||now-issued>MAX_TTL||expires<=now)
    deny('atestado expirado ou incoerente');
  const {signature,...body}=input;
  const expectedMac=crypto.createHmac('sha256',key).update(canonical(body),'utf8').digest();
  const received=strictBase64Url(signature);
  if(!crypto.timingSafeEqual(expectedMac,received))deny('assinatura incorreta');
  // Signature alone never overrides the public eligibility contract.
  const manifest=deriveApprovedManifest(input.snapshot,{now});
  return {snapshot:input.snapshot,manifest,revision:input.revision,issuedAt:input.issuedAt,expiresAt:input.expiresAt};
}
export {verifyAttestation,canonical,AUDIENCE,ISSUER};
