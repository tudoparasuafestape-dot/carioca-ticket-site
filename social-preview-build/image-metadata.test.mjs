import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import{imageMetadata}from './image-metadata.mjs';import{buildTrustedCandidate as build}from './trusted-build-candidate.mjs';
const root=new URL('./',import.meta.url).pathname;
const source=JSON.parse(fs.readFileSync(root+'results/catalog-read-decoded.json'));
const options={now:Date.parse(source.serverNow),assetRoot:root+'lab242'};
test('real canonical PNG bytes produce exact unique structured tags without changing source/image',()=>{
 const path=root+'lab242/assets/eventos/herminho-horizontal-905fe9374a491192.png',before=fs.readFileSync(path);
 assert.deepEqual(imageMetadata(before,path),{mime:'image/png',width:1732,height:908});
 const c=build(source,source,options),html=Object.values(c.files)[0];
 for(const [key,value]of [['type','image/jpeg'],['width','1200'],['height','629']]){
  const tag=`<meta property="og:image:${key}" content="${value}">`;
  assert.equal(html.split(tag).length-1,1);assert.ok(html.indexOf(tag)>html.indexOf('property="og:image"'));
 }
 assert.match(html,/06h00/);assert.equal(c.index.entries.length,1);assert.equal(c.index.fallbacks.length,2);assert.deepEqual(fs.readFileSync(path),before);
});
test('new event also gets byte-derived metadata, no event allowlist',()=>{
 const s=structuredClone(source),e=structuredClone(s.eventos[0]);e.id='EVT_NEW_METADATA';s.eventos.push(e);s.total++;
 const c=build(s,s,options);assert.match(c.files['compartilhar/EVT_NEW_METADATA/index.html'],/og:image:width" content="1200/);
});
test('JPEG baseline/progressive dimensions derive from marker, not filename or event',()=>{
 for(const marker of [192,194]){
  const b=Buffer.from([255,216,255,224,0,4,0,0,255,marker,0,17,8,3,32,4,176,3,1,17,0,2,17,0,3,17,0,255,217]);
  assert.deepEqual(imageMetadata(b,'cover.jpg'),{mime:'image/jpeg',width:1200,height:800});
  assert.throws(()=>imageMetadata(b,'cover.png'));
 }
});
test('malformed and truncated headers fail closed',()=>{
 const p=fs.readFileSync(root+'lab242/assets/eventos/herminho-horizontal-905fe9374a491192.png');
 for(const change of [b=>b.writeUInt32BE(0,16),b=>b.writeUInt32BE(70000,20),b=>b.writeUInt32BE(12,8),b=>b.write('BAD!',12)]){const b=Buffer.from(p);change(b);assert.throws(()=>imageMetadata(b,'x.png'));}
 for(const b of [Buffer.alloc(32),p.subarray(0,24),Buffer.from([255,216,255,224,255,255,...Array(30).fill(0)])])assert.throws(()=>imageMetadata(b,'x.jpg'));
});
