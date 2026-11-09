import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compareDerivatives as check,hash,POLICY} from './tony-publication-guard.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url));
const receipt=read('./fixtures/social-publication-receipt.json'),index=read('./fixtures/social-event-pages.json');
const now=Date.parse('2026-11-09T12:00:00.000Z'),id='EVT-07112026-TBT-DO-ASTRO-ANIVERSARIO-DE-HERMINHO-F103E26A';
// Synthetic candidate only. No writing of a real receipt or publication timestamps.
function fixture(mutate=()=>{}){const r=JSON.parse(receipt),i=JSON.parse(index);r.sourceServerNow=i.generatedAt=new Date(now).toISOString();r.sourceValidUntil=new Date(now+300000).toISOString();r.revision=i.revision='89ccaaab7ae276c35ba8748ce7acb39205efb0fa11f314260aa995c20592b9a8';r.hashes={};i.entries=[];const f=new Map();mutate(r,i,f);const ib=Buffer.from(JSON.stringify(i));r.hashes['assets/social-event-pages.json']=hash(ib);f.set('assets/social-event-pages.json',ib);f.set('assets/social-publication-receipt.json',Buffer.from(JSON.stringify(r)));return{publishedReceiptBytes:receipt,publishedIndexBytes:index,candidateFiles:f,now};}
test('only authorized expired Herminho derivative removal passes',()=>assert.doesNotThrow(()=>check(fixture())));
test('catalog revision change denied',()=>assert.throws(()=>check(fixture((r,i)=>{r.revision=i.revision='0'.repeat(64)})),/revision changed/));
test('removing any preexisting exclusion denied',()=>assert.throws(()=>check(fixture(r=>r.excluded.shift())),/excluded changed/));
test('adding another exclusion denied',()=>assert.throws(()=>check(fixture(r=>r.excluded.push({eventId:'EVT-OTHER',reason:'ENDED'}))),/excluded changed/));
test('changing fallback denied',()=>assert.throws(()=>check(fixture((r,i)=>i.fallbacks=[])),/index changed/));
test('publishing Tony entry denied',()=>assert.throws(()=>check(fixture((r,i)=>i.entries.push({eventId:'EVT-TONY',endsAt:'2026-11-29T12:00:00.000Z'}))),/index changed/));
test('retaining expired entry denied',()=>assert.throws(()=>check(fixture((r,i)=>i.entries=JSON.parse(index).entries)),/index changed/));
test('retaining removed page denied',()=>assert.throws(()=>check(fixture((r,i,f)=>f.set('compartilhar/'+id+'/index.html',Buffer.from('old')))),/removal mismatch/));
test('adding unapproved derivative denied',()=>assert.throws(()=>check(fixture((r,i,f)=>{const p='compartilhar/EVT-OTHER/index.html',b=Buffer.from('x');f.set(p,b);r.hashes[p]=hash(b)})),/inventory changed/));
test('stale candidate denied',()=>assert.throws(()=>check(fixture(r=>{r.sourceServerNow='2026-11-09T11:00:00.000Z'})),/temporal validity/));
test('watermark rollback denied',()=>assert.throws(()=>check(fixture(r=>r.sourceServerNow='2026-11-06T12:00:00.000Z')),/watermark rollback/));
test('changing existing exclusion reason denied',()=>assert.throws(()=>check(fixture(r=>r.excluded.at(-1).reason='NOT_PUBLIC_ACTIVE')),/excluded changed/));
function otherEventFixture(tamper=false){
  const priorR=JSON.parse(receipt),priorI=JSON.parse(index),p='compartilhar/EVT-OTHER/index.html',original=Buffer.from('retained other event');
  priorR.hashes[p]=hash(original);priorI.entries.push({eventId:'EVT-OTHER',sharePath:'/compartilhar/EVT-OTHER/',detailUrl:'https://cariocaticket.com.br/evento/?evento=EVT-OTHER',endsAt:'2026-12-01T00:00:00.000Z'});
  const priorIB=Buffer.from(JSON.stringify(priorI));priorR.hashes['assets/social-event-pages.json']=hash(priorIB);const priorRB=Buffer.from(JSON.stringify(priorR));
  const args=fixture((r,i,f)=>{i.entries=priorI.entries.filter(e=>e.eventId!==id);const b=tamper?Buffer.from('unauthorized change'):original;r.hashes[p]=hash(b);f.set(p,b);});
  args.publishedReceiptBytes=priorRB;args.publishedIndexBytes=priorIB;args.policy={...POLICY,publishedReceiptHash:hash(priorRB)};return args;
}
test('synthetic second event and derivative preserved',()=>assert.doesNotThrow(()=>check(otherEventFixture())));
test('synthetic second event derivative modification rejected',()=>assert.throws(()=>check(otherEventFixture(true)),/published derivative hash changed/));
