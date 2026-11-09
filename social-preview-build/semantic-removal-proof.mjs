// Offline proof only. Same canonical semantic hash as the governed builder.
import crypto from 'node:crypto';
import {POLICY} from './tony-publication-guard.mjs';
export const REMOVED_ID='EVT-07112026-TBT-DO-ASTRO-ANIVERSARIO-DE-HERMINHO-F103E26A';
const canonical=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v);
export const semanticHash=s=>crypto.createHash('sha256').update(canonical({contract:s.eligibilityContract,version:s.temporalVersion,eventos:[...s.eventos].sort((a,b)=>a.id.localeCompare(b.id))})).digest('hex');
export function verifySemanticRemoval(old,current,pins={old:POLICY.publishedRevision,current:POLICY.candidateRevision}){
 const deny=m=>{throw Error('SEMANTIC_REMOVAL_DENIED: '+m)};
 if(semanticHash(old)!==pins.old || semanticHash(current)!==pins.current)deny('snapshot hash differs from reviewed pins');
 if(old.eventos.filter(e=>e.id===REMOVED_ID).length!==1)deny('expected exactly one removed event');
 const projected={...old,eventos:old.eventos.filter(e=>e.id!==REMOVED_ID)};
 if(semanticHash(projected)!==pins.current)deny('change beyond exact authorized removal');
 return {old: pins.old,current:pins.current,removedId:REMOVED_ID};
}
