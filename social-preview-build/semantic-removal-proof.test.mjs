import test from 'node:test';import assert from 'node:assert/strict';
import {semanticHash,verifySemanticRemoval,REMOVED_ID} from './semantic-removal-proof.mjs';
const old={eligibilityContract:{version:1},temporalVersion:'fixture',eventos:[{id:REMOVED_ID,field:'old'},{id:'EVT-KEPT',nested:{amount:7}}]};
const current={...old,eventos:[old.eventos[1]]};const pins={old:semanticHash(old),current:semanticHash(current)};
test('exact full semantic removal passes',()=>assert.doesNotThrow(()=>verifySemanticRemoval(old,current,pins)));
for(const [label,mutate] of [['retained event',s=>s.eventos[0].nested.amount++],['contract',s=>s.eligibilityContract.version++],['temporal version',s=>s.temporalVersion='other'],['additional event',s=>s.eventos.push({id:'EVT-EXTRA'})],['additional removal',s=>s.eventos=[]]])test(label+' change fails even when new hash is supplied',()=>{const s=structuredClone(current);mutate(s);assert.throws(()=>verifySemanticRemoval(old,s,{...pins,current:semanticHash(s)}),/beyond exact authorized removal/)});
