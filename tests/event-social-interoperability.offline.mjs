import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {verifyAttestation} from '../scripts/verify-event-social-attestation.mjs';
import {buildSealedCandidate} from '../scripts/build-event-social-sealed-release-lab.mjs';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/social-preview-ed25519-contract.json',import.meta.url),'utf8'));
const env={
  CT_SOCIAL_PREVIEW_PUBLIC_KEY_PEM:fixture.publicKeyPem,
  CT_SOCIAL_PREVIEW_KEY_ID:fixture.attestation.keyId
};
const T=Date.parse('2026-10-29T16:14:23.000Z');
const id='EVT-07112026-TBT-DO-ASTRO-ANIVERSARIO-DE-HERMINHO-F103E26A';
function reject(value,options={}){
  assert.throws(()=>verifyAttestation(value,{env,now:T,...options}),
    /SOCIAL_(ATTESTATION_DENIED|CATALOG_REJECTED)/);
}
test('contract fixture verifies via real site Ed25519 verifier',()=>{
  assert.equal(fixture.fixtureOnly,true);
  const signed=verifyAttestation(fixture.attestation,{now:T,env});
  assert.equal(signed.revision,41);
  assert.equal(signed.manifest.length,1);
  assert.equal(signed.manifest[0].eventoId,id);
  assert.equal(signed.manifest[0].destinoPublicoHttps,'https://cariocaticket.com.br/evento-v2/?evento='+id);
});
test('tampering, replay, expiry or wrong public key fails closed',()=>{
  const a=fixture.attestation;
  reject({...a,revision:42});
  reject({...a,snapshot:{...a.snapshot,cacheStale:true}});
  reject({...a,snapshot:{...a.snapshot,eventos:[]}});
  reject({...a,keyId:'another-key'});
  reject({...a,signature:a.signature.slice(0,-1)+(a.signature.endsWith('A')?'B':'A')});
  reject(a,{previousRevision:41});
  reject(a,{now:Date.parse('2026-10-29T16:15:23.000Z')});
  reject(a,{env:{...env,CT_SOCIAL_PREVIEW_KEY_ID:'not-authorized'}});
});
test('site generator consumes signed contract without exposing any payment operation',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ct-interop-og-'));
  try{
    const result=buildSealedCandidate(fixture.attestation,path.join(dir,'candidate'),{now:T,env});
    assert.equal(result.status,'LAB_CANDIDATE_NOT_PUBLISHED');
    assert.equal(result.signedRevision,41);
    assert.deepEqual(result.eventIds,[id]);
    const html=fs.readFileSync(path.join(dir,'candidate','compartilhar',id,'index.html'),'utf8');
    assert.match(html,/og:image.*herminho-tbt-20261107/);
    assert.match(html,/TBT do Astro/);
    assert.match(html,/\/evento-v2\/\?evento=/);
    assert.doesNotMatch(html,/(?:ctCheckoutPixPublicoIniciarPROD|createPayment|api[_-]?key)/i);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
