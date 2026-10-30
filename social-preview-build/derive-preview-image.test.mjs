import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import{derivePreviewImage}from './derive-preview-image.mjs';import{buildTrustedCandidate as build,writeFreshStage}from './trusted-build-candidate.mjs';
import os from 'node:os';import path from 'node:path';
const root=new URL('./',import.meta.url).pathname,filename=root+'lab242/assets/eventos/herminho-horizontal-905fe9374a491192.png';
test('mechanical JPEG proportional, deterministic, smaller, no original change',()=>{
 const input=fs.readFileSync(filename),a=derivePreviewImage(input),b=derivePreviewImage(input);
 assert.deepEqual(a.body,b.body);assert.equal(a.metadata.mime,'image/jpeg');assert.equal(a.metadata.width,1200);assert.equal(a.metadata.height,629);
 assert.ok(Math.abs(a.metadata.width/a.metadata.height-1732/908)<0.002);assert.ok(a.body.length<input.length/4);
 assert.equal(a.path,'assets/social-previews/'+crypto.createHash('sha256').update(a.body).digest('hex')+'.jpg');assert.deepEqual(fs.readFileSync(filename),input);
});
test('invalid or truncated image never converted into successful preview',()=>{
 assert.throws(()=>derivePreviewImage(Buffer.alloc(1024)),/DENIED/);assert.throws(()=>derivePreviewImage(fs.readFileSync(filename).subarray(0,512)),/DENIED/);
});
test('derived image staged and hashed, deduplicated across events; revocation removes derived output',()=>{
 const source=JSON.parse(fs.readFileSync(root+'results/catalog-read-decoded.json'));
 const options={now:Date.parse(source.serverNow),assetRoot:root+'lab242'};
 const e=structuredClone(source.eventos[0]);e.id='EVT_NEW_DERIVATIVE';source.eventos.push(e);source.total++;
 const c=build(source,source,options),images=Object.keys(c.files).filter(p=>p.endsWith('.jpg'));assert.equal(images.length,1);assert.equal(c.index.entries.length,2);
 assert.equal(c.receipt.hashes[images[0]],crypto.createHash('sha256').update(c.files[images[0]]).digest('hex'));
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ct-jpeg-test-'));try{writeFreshStage(c,path.join(temp,'stage'));assert.deepEqual(fs.readFileSync(path.join(temp,'stage',images[0])),c.files[images[0]]);}finally{fs.rmSync(temp,{recursive:true,force:true});}
 source.eventos=[];source.total=0;const empty=build(source,source,options);assert.deepEqual(Object.keys(empty.files),['assets/social-event-pages.json']);
});
