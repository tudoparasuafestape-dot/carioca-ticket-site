// This is a laboratory entrypoint, NOT an active publication hook.
// A trusted issuer must produce the signed attestation independently.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyAttestation} from './verify-event-social-attestation.mjs';
import {buildRelease} from './build-event-social-release-lab.mjs';

function deny(x){throw new Error('SOCIAL_SEALED_RELEASE_DENIED: '+x);}
function buildSealedCandidate(attestation,target,{now=Date.now(),env=process.env,previousReceipt=null}={}){
  let prior=null;
  if(previousReceipt!==null){
    if(!previousReceipt||!Number.isSafeInteger(previousReceipt.signedRevision)||
       previousReceipt.signedRevision<1)deny('revision de release anterior invalida');
    prior=previousReceipt.signedRevision;
  }
  const verified=verifyAttestation(attestation,{now,env,previousRevision:prior});
  const release=buildRelease(verified.snapshot,target,{now});
  return Object.freeze({
    ...release,signedRevision:verified.revision,
    attestedAt:verified.issuedAt,attestationExpiresAt:verified.expiresAt
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length<4||process.argv.length>5)deny('uso: node scripts/build-event-social-sealed-release-lab.mjs ATESTADO.json PASTA_EXTERNA [RECIBO_ANTERIOR.json]');
    const attestation=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
    const previousReceipt=process.argv[4]?JSON.parse(fs.readFileSync(process.argv[4],'utf8')):null;
    console.log(JSON.stringify(buildSealedCandidate(attestation,process.argv[3],{previousReceipt})));
  }catch(e){console.error(e.message);process.exitCode=1;}
}
export {buildSealedCandidate};
