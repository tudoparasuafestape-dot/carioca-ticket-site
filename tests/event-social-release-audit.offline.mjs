import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {buildSealedCandidate} from '../scripts/build-event-social-sealed-release-lab.mjs';
import {auditEventSocialRelease} from '../scripts/audit-event-social-release-lab.mjs';
import {canonical} from '../scripts/verify-event-social-attestation.mjs';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/social-preview-ed25519-contract.json',import.meta.url),'utf8'));
const H='EVT-07112026-TBT-DO-ASTRO-ANIVERSARIO-DE-HERMINHO-F103E26A';
const NOW=Date.parse('2026-10-29T16:14:23.000Z');
const env={CT_SOCIAL_PREVIEW_PUBLIC_KEY_PEM:fixture.publicKeyPem,
           CT_SOCIAL_PREVIEW_KEY_ID:fixture.attestation.keyId};
function workspace(fn){
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'ct-og-audit-'));
  try{return fn(base);}finally{fs.rmSync(base,{recursive:true,force:true});}
}
function candidate(dir){
  const output=path.join(dir,'candidate');
  buildSealedCandidate(fixture.attestation,output,{now:NOW,env});
  return output;
}
function audit(dir,att=fixture.attestation,settings={}){
  return auditEventSocialRelease(dir,att,{now:NOW,env,...settings});
}
function denied(fn){
  assert.throws(fn,/SOCIAL_(?:RELEASE_AUDIT_DENIED|ATTESTATION_DENIED|CATALOG_REJECTED)/);
}
workspace(dir=>{
  const folder=candidate(dir);
  const result=audit(folder);
  assert.equal(result.status,'LAB_AUDITED_NOT_PUBLISHED');
  assert.equal(result.count,1);
  assert.equal(result.signedRevision,41);
  assert.deepEqual(result.eventIds,[H]);
  const html=fs.readFileSync(path.join(folder,'compartilhar',H,'index.html'),'utf8');
  assert(html.includes('og:image'));
  assert(html.includes('og:url'));
  assert(html.includes('twitter:image'));
  assert(html.includes('TBT do Astro'));
  assert(html.includes('herminho-tbt-20261107'));
});
workspace(dir=>{
  const folder=candidate(dir),html=path.join(folder,'compartilhar',H,'index.html');
  fs.appendFileSync(html,'<!-- different title/image or injected tag -->');
  denied(()=>audit(folder));
});
workspace(dir=>{
  const folder=candidate(dir);
  fs.mkdirSync(path.join(folder,'compartilhar','EVT-STALE-REMOVED'));
  fs.writeFileSync(path.join(folder,'compartilhar','EVT-STALE-REMOVED','index.html'),'stale');
  denied(()=>audit(folder));
});
workspace(dir=>{
  const folder=candidate(dir);
  const receipt=path.join(folder,'release.json');
  const obj=JSON.parse(fs.readFileSync(receipt,'utf8'));
  obj.eventIds=['OTHER'];
  fs.writeFileSync(receipt,JSON.stringify(obj));
  denied(()=>audit(folder));
});
workspace(dir=>{
  const folder=candidate(dir);
  const manifest=path.join(folder,'manifest.json');
  const obj=JSON.parse(fs.readFileSync(manifest,'utf8'));
  obj[0].titulo='Adulterado';
  fs.writeFileSync(manifest,JSON.stringify(obj));
  denied(()=>audit(folder));
});
workspace(dir=>{
  const folder=candidate(dir);
  const html=path.join(folder,'compartilhar',H,'index.html');
  fs.unlinkSync(html);
  fs.symlinkSync(path.join(folder,'manifest.json'),html);
  denied(()=>audit(folder));
});
workspace(dir=>{
  const folder=candidate(dir);
  denied(()=>audit(folder,{...fixture.attestation,revision:99}));
  denied(()=>audit(folder,fixture.attestation,{previousRevision:41}));
  denied(()=>audit(folder,fixture.attestation,{now:Date.parse('2026-10-29T16:15:23.000Z')}));
});
workspace(dir=>{
  const folder=candidate(dir);
  fs.writeFileSync(path.join(folder,'unexpected-private.json'),'{ "cpf": "private" }');
  denied(()=>audit(folder));
});
// A newly signed *empty* authorized catalog produces a new empty release.
// Neither previously published event IDs nor stale HTML may survive.
workspace(dir=>{
  const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');
  const {signature,...body}=fixture.attestation;
  const unsigned={...body,keyId:'fixture-revoke-v1',revision:42,
    snapshot:{...body.snapshot,eventos:[]}};
  const sign=crypto.sign(null,Buffer.from(canonical(unsigned),'utf8'),privateKey).toString('base64url');
  const att={...unsigned,signature:sign};
  const settings={now:NOW,env:{CT_SOCIAL_PREVIEW_PUBLIC_KEY_PEM:publicKey.export({type:'spki',format:'pem'}),
                               CT_SOCIAL_PREVIEW_KEY_ID:'fixture-revoke-v1'},previousRevision:41};
  const folder=path.join(dir,'empty');
  buildSealedCandidate(att,folder,{now:NOW,env:settings.env,previousReceipt:{signedRevision:41}});
  const a=auditEventSocialRelease(folder,att,settings);
  assert.equal(a.count,0);
  assert.deepEqual(fs.readdirSync(path.join(folder,'compartilhar')),[]);
  fs.mkdirSync(path.join(folder,'compartilhar',H));
  fs.writeFileSync(path.join(folder,'compartilhar',H,'index.html'),'stale');
  denied(()=>auditEventSocialRelease(folder,att,settings));
});
console.log('SOCIAL_PREVIEW_SIGNED_RELEASE_AUDIT_OFFLINE_OK');
