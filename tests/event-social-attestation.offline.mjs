import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {verifyAttestation,canonical,AUDIENCE,ISSUER} from '../scripts/verify-event-social-attestation.mjs';
import {buildSealedCandidate} from '../scripts/build-event-social-sealed-release-lab.mjs';

const EVENT='EVT-07112026-TBT-DO-ASTRO-ANIVERSARIO-DE-HERMINHO-F103E26A';
const NOW=Date.parse('2026-10-29T16:14:22.000Z');
const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519'); // Runtime fixture ONLY.
const {publicKey:untrustedKey}=crypto.generateKeyPairSync('ed25519');
const env={CT_SOCIAL_PREVIEW_PUBLIC_KEY_PEM:publicKey.export({type:'spki',format:'pem'}),CT_SOCIAL_PREVIEW_KEY_ID:'lab-fixture-v1'};
const event={
 id:EVENT,nome:'TBT do Astro — Aniversário de Herminho',modoAcesso:'PUBLICO',status:'ATIVO',
 visual:{capaUrl:'https://cariocaticket.com.br/assets/eventos/herminho-tbt-20261107-a2f84c198ed5b283.jpg'},
 temporal:{state:'TEMPORAL_V1',temporalVersion:1,fusoHorario:'America/Recife',inicioEm:'2026-10-01T12:00:00.000Z',fimEm:'2026-11-08T06:00:00.000Z'}
};
const snapshot={
 sucesso:true,temporalVersion:1,eligibilityContract:'CT_PUBLIC_ELIGIBILITY_EXCLUSIVE_V1',
 serverNow:'2026-10-29T16:14:20.000Z',temporalEvaluatedAt:'2026-10-29T16:14:19.000Z',
 validUntil:'2026-10-29T16:15:45.000Z',nextTransitionAt:null,cacheStale:false,eventos:[event]
};
function sign(revision=1,overrides={}){
  const body={
    version:1,issuer:ISSUER,audience:AUDIENCE,keyId:env.CT_SOCIAL_PREVIEW_KEY_ID,revision,
    issuedAt:'2026-10-29T16:14:21.000Z',expiresAt:'2026-10-29T16:15:21.000Z',
    snapshot
  };
  Object.assign(body,overrides);
  const signature=crypto.sign(null,Buffer.from(canonical(body),'utf8'),privateKey).toString('base64url');
  return {...body,signature};
}
assert.equal(verifyAttestation(sign(),{now:NOW,env}).manifest[0].eventoId,EVENT);
const bad=[
  {source:sign(),options:{env:{}}},
  {source:sign(),options:{env:{...env,CT_SOCIAL_PREVIEW_KEY_ID:'other'}}},
  {source:{...sign(),signature:'x'.repeat(86)}},
  {source:{...sign(),revision:2}},
  {source:sign(1,{audience:'other'})},
  {source:sign(1,{issuer:'untrusted'})},
  {source:sign(1,{expiresAt:'2026-10-29T16:17:21.000Z'})},
  {source:sign(1,{issuedAt:'2026-10-29T16:16:21.000Z'})},
  {source:sign(1,{snapshot:{...snapshot,cacheStale:true}})},
  {source:sign(1,{snapshot:{...snapshot,eventos:[{...event,temporal:null}]}})},
  {source:sign(1,{snapshot:{...snapshot,eventos:[{...event,modoAcesso:'PRIVADO_CONVITE'}]}})},
  {source:sign(1,{snapshot:{...snapshot,eventos:[{...event,status:'INATIVO'}]}})},
  {source:sign(),options:{now:Date.parse('2026-10-29T16:16:00.000Z')}},
  {source:sign(),options:{previousRevision:1}},
  {source:sign(),options:{previousRevision:2}},
  {source:sign(),options:{env:{...env,CT_SOCIAL_PREVIEW_PUBLIC_KEY_PEM:untrustedKey.export({type:'spki',format:'pem'})}}},
  {source:{...sign(),unexpected:'data'}}
];
for(const {source,options={}} of bad){
 assert.throws(()=>verifyAttestation(source,{now:NOW,env,...options}),/SOCIAL_(ATTESTATION_DENIED|CATALOG_REJECTED)/);
}
const work=fs.mkdtempSync(path.join(os.tmpdir(),'ct-signed-release-lab-'));
try{
 const candidate=path.join(work,'approved');
 const receipt=buildSealedCandidate(sign(40),candidate,{now:NOW,env});
 assert.equal(receipt.signedRevision,40);
 assert.equal(receipt.count,1);
 assert.equal(receipt.eventIds[0],EVENT);
 const html=fs.readFileSync(path.join(candidate,'compartilhar',EVENT,'index.html'),'utf8');
 assert.match(html,/property="og:image"/);
 assert.match(html,/TBT do Astro/);
 const next=path.join(work,'revoked');
 const empty=buildSealedCandidate(sign(41,{snapshot:{...snapshot,eventos:[]}}),next,{now:NOW,env,previousReceipt:receipt});
 assert.equal(empty.count,0);
 assert.deepEqual(fs.readdirSync(path.join(next,'compartilhar')),[]);
 assert.throws(()=>buildSealedCandidate(sign(40),path.join(work,'replay'),{now:NOW,env,previousReceipt:receipt}),/SOCIAL_ATTESTATION_DENIED/);
 assert(!fs.existsSync(path.join(work,'replay')));
 const tampered={...sign(42),snapshot:{...snapshot,eventos:[{...event,nome:'Outro evento'}]}};
 assert.throws(()=>buildSealedCandidate(tampered,path.join(work,'tampered'),{now:NOW,env,previousReceipt:receipt}),/SOCIAL_ATTESTATION_DENIED/);
 assert(!fs.existsSync(path.join(work,'tampered')));
} finally {fs.rmSync(work,{recursive:true,force:true});}
console.log('SOCIAL_SIGNED_ATTESTATION_LAB_OFFLINE_OK');
