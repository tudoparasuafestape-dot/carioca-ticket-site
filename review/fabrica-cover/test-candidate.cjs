'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {ASSET,hash,validateCandidate:v}=require('./validate-candidate.cjs');
if(!process.argv[2])throw new Error('Pass the exact approved PNG path; no network download is performed.');
const png=fs.readFileSync(process.argv[2]),base=new Map([['index.html',Buffer.from('unchanged')]]);
const e={baselineManifestSha256:hash(Buffer.from(JSON.stringify([['index.html',hash(base.get('index.html'))]]))),publishedCommit:'a'.repeat(40),publishedRunId:1};
const good=()=>new Map([...base,[ASSET.path,png]]);
let n=0;assert.equal(v(base,good(),e).salesReady,false);n++;
for(const change of [c=>c.delete('index.html'),c=>c.set('index.html',Buffer.from('changed')),c=>c.set('other',Buffer.from('x')),c=>c.set(ASSET.path,Buffer.from('bad')),c=>{const b=Buffer.from(png);b[100]^=1;c.set(ASSET.path,b)},c=>c.set('../bad',Buffer.from('x'))]){const c=good();change(c);assert.throws(()=>v(base,c,e));n++}
assert.throws(()=>v(base,good(),{...e,baselineManifestSha256:'0'.repeat(64)}));n++;
assert.throws(()=>v(base,good(),{...e,approved:true}));n++;
assert.throws(()=>v(base,good(),{...e,publishedRunId:0}));n++;
console.log(n+' offline cases PASS; synthetic baseline only; no publication');
