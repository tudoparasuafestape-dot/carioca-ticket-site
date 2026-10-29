// Carioca Ticket — read-only transition planner, SYNTHETIC / OFFLINE ONLY.
// No network, no GitHub Pages changes, no delete/copy/deploy operations.
// Both candidates must pass complete signed-release audit first.
import fs from 'node:fs';
import path from 'node:path';
import {auditEventSocialRelease} from './audit-event-social-release-lab.mjs';

function deny(reason){throw new Error('SOCIAL_TRANSITION_DENIED: '+reason);}
function readManifest(candidate){
  // Called ONLY after the signed, complete candidate has been audited.
  const items=JSON.parse(fs.readFileSync(path.join(path.resolve(candidate),'manifest.json'),'utf8'));
  return new Map(items.map(item=>[item.eventoId,JSON.stringify(item)]));
}
function planEventSocialTransitionLab({
  previousCandidate,previousAttestation,nextCandidate,nextAttestation,
  now=Date.now(),env=process.env
}={}){
  if(!Number.isSafeInteger(now)||now<0)deny('relogio invalido');
  if(typeof previousCandidate!=='string'||!previousCandidate||
     typeof nextCandidate!=='string'||!nextCandidate||
     !previousAttestation||!nextAttestation)
    deny('provas de release anterior e atual obrigatorias; bootstrap nao autorizado');
  if(path.resolve(previousCandidate)===path.resolve(nextCandidate))
    deny('release anterior e novo devem ser independentes');
  // Historical signature is verified at its original issuance instant.
  // It is evidence of the prior candidate's contents, NOT proof of deployment.
  const previousIssued=Date.parse(previousAttestation.issuedAt);
  if(!Number.isSafeInteger(previousIssued)||previousIssued>now)
    deny('instante historico invalido');
  const previous=auditEventSocialRelease(previousCandidate,previousAttestation,{
    now:previousIssued+1,env
  });
  const next=auditEventSocialRelease(nextCandidate,nextAttestation,{
    now,env,previousRevision:previous.signedRevision
  });
  const was=readManifest(previousCandidate),will=readManifest(nextCandidate);
  const wouldAdd=[],wouldRemove=[],wouldRefresh=[],unchanged=[];
  for(const [id,content] of will){
    if(!was.has(id))wouldAdd.push(id);
    else if(was.get(id)!==content)wouldRefresh.push(id);
    else unchanged.push(id);
  }
  for(const id of was.keys())if(!will.has(id))wouldRemove.push(id);
  for(const a of [wouldAdd,wouldRemove,wouldRefresh,unchanged])a.sort();
  return Object.freeze({
    status:'LAB_TRANSITION_PLAN_NOT_PUBLISHED',
    previousRevision:previous.signedRevision,nextRevision:next.signedRevision,
    nextPreviewCount:next.count,
    wouldAdd,wouldRemove,wouldRefresh,unchanged
  });
}
export {planEventSocialTransitionLab};
