import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {canonical} from '../scripts/verify-event-social-attestation.mjs';
import {buildSealedCandidate} from '../scripts/build-event-social-sealed-release-lab.mjs';
import {planEventSocialTransitionLab} from '../scripts/plan-event-social-transition-lab.mjs';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/social-preview-ed25519-contract.json',import.meta.url),'utf8'));
const H='EVT-07112026-TBT-DO-ASTRO-ANIVERSARIO-DE-HERMINHO-F103E26A';
const NOW=Date.parse('2026-10-29T16:14:23.000Z');
const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');
const env={CT_SOCIAL_PREVIEW_PUBLIC_KEY_PEM:publicKey.export({type:'spki',format:'pem'}),
  CT_SOCIAL_PREVIEW_KEY_ID:'transition-lab-v1'};
const baseEvent=fixture.attestation.snapshot.eventos[0];
const {signature:unusedSignature,...base}=fixture.attestation;
function sign(revision,eventos){
  const body={...base,keyId:env.CT_SOCIAL_PREVIEW_KEY_ID,revision,
    snapshot:{...base.snapshot,eventos}};
  return {...body,signature:crypto.sign(null,Buffer.from(canonical(body),'utf8'),privateKey).toString('base64url')};
}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ct-social-transition-'));
try{
  const prior=sign(41,[baseEvent]),revoked=sign(42,[]);
  const old=path.join(root,'old'),empty=path.join(root,'empty');
  const oldReceipt=buildSealedCandidate(prior,old,{now:NOW,env});
  buildSealedCandidate(revoked,empty,{now:NOW,env,previousReceipt:oldReceipt});
  const revokedPlan=planEventSocialTransitionLab({
    previousCandidate:old,previousAttestation:prior,nextCandidate:empty,
    nextAttestation:revoked,now:NOW,env
  });
  assert.equal(revokedPlan.status,'LAB_TRANSITION_PLAN_NOT_PUBLISHED');
  assert.equal(revokedPlan.previousRevision,41);
  assert.equal(revokedPlan.nextRevision,42);
  assert.equal(revokedPlan.nextPreviewCount,0);
  assert.deepEqual(revokedPlan.wouldRemove,[H]);
  assert.deepEqual(revokedPlan.wouldAdd,[]);
  assert.deepEqual(fs.readdirSync(path.join(empty,'compartilhar')),[]);
  // A changed official event gets a refresh; unchanged inputs do not.
  const updated=sign(43,[{...baseEvent,nome:baseEvent.nome+' — edição especial'}]);
  const updatedDir=path.join(root,'updated');
  buildSealedCandidate(updated,updatedDir,{now:NOW,env,previousReceipt:oldReceipt});
  const updatePlan=planEventSocialTransitionLab({
    previousCandidate:old,previousAttestation:prior,nextCandidate:updatedDir,
    nextAttestation:updated,now:NOW,env
  });
  assert.deepEqual(updatePlan.wouldRefresh,[H]);
  assert.deepEqual(updatePlan.wouldRemove,[]);
  const unchanged=sign(44,[baseEvent]),unchangedDir=path.join(root,'unchanged');
  buildSealedCandidate(unchanged,unchangedDir,{now:NOW,env,previousReceipt:oldReceipt});
  const samePlan=planEventSocialTransitionLab({
    previousCandidate:old,previousAttestation:prior,nextCandidate:unchangedDir,
    nextAttestation:unchanged,now:NOW,env
  });
  assert.deepEqual(samePlan.unchanged,[H]);
  assert.deepEqual(samePlan.wouldRefresh,[]);
  const other={...baseEvent,id:'EVT-SINTETICO-SEGUNDO',nome:'Evento sintético público'};
  const added=sign(45,[baseEvent,other]),addedDir=path.join(root,'added');
  buildSealedCandidate(added,addedDir,{now:NOW,env,previousReceipt:oldReceipt});
  const addPlan=planEventSocialTransitionLab({
    previousCandidate:old,previousAttestation:prior,nextCandidate:addedDir,
    nextAttestation:added,now:NOW,env
  });
  assert.deepEqual(addPlan.wouldAdd,['EVT-SINTETICO-SEGUNDO']);
  assert.deepEqual(addPlan.unchanged,[H]);
  const call=(args={})=>()=>planEventSocialTransitionLab({
    previousCandidate:old,previousAttestation:prior,nextCandidate:empty,
    nextAttestation:revoked,now:NOW,env,...args
  });
  assert.throws(call({nextAttestation:prior}),/SOCIAL_ATTESTATION_DENIED/);
  assert.throws(call({nextAttestation:{...revoked,revision:99}}),/SOCIAL_ATTESTATION_DENIED/);
  assert.throws(call({now:NOW+120000}),/SOCIAL_ATTESTATION_DENIED/);
  assert.throws(call({previousCandidate:null}),/SOCIAL_TRANSITION_DENIED/);
  assert.throws(call({nextCandidate:old}),/SOCIAL_TRANSITION_DENIED/);
  // Audit must fail closed on a tampered historical HTML; no action plan.
  const html=path.join(old,'compartilhar',H,'index.html');
  fs.appendFileSync(html,'<!-- stale private page contamination -->');
  assert.throws(call(),/SOCIAL_RELEASE_AUDIT_DENIED/);
  assert.deepEqual(fs.readdirSync(path.join(empty,'compartilhar')),[]);
  console.log('SOCIAL_SIGNED_TRANSITION_PLAN_OFFLINE_OK');
}finally{fs.rmSync(root,{recursive:true,force:true});}
