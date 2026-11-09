import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {POLICY,TITLE,COVER,SUPPORT,HISTORICAL_SUPPORT,CRITICAL_RUNTIME,INDEX,RECEIPT,hash,validatePins,verifyGit,verifyStage,restorePublishedSupport,sealStage,readTree} from './tony-publication-guard.mjs';
import {publicationPolicy,readPublicationState,writeSeal,recheckBeforeDeploy} from './tony-publication-cli.mjs';
const now=Date.parse('2026-11-09T12:00:00.000Z');
const put=(root,p,b)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),b)};
const bytes=x=>Buffer.from(JSON.stringify(x));
const digestManifest=m=>hash(bytes(Object.fromEntries(Object.entries(m).sort(([a],[b])=>a.localeCompare(b,'en')))));
// Use code-unit sorting, matching guard canonicalization (not locale ordering).
const mh=m=>hash(bytes(Object.fromEntries(Object.keys(m).sort().map(k=>[k,m[k]]))));
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ct-tony-full-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const repo=path.join(root,'repo'),stage=path.join(root,'stage'),published=path.join(root,'published');for(const p of [repo,stage,published])fs.mkdirSync(p);
 const git=(...a)=>execFileSync('git',['-C',repo,...a],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git('init','-q');git('config','user.email','fixture@example.invalid');git('config','user.name','Local fixture');
 const baseline=new Map(CRITICAL_RUNTIME.map(p=>[p,Buffer.from('baseline '+p)]));
 baseline.set(SUPPORT[0],Buffer.from('historical test preserved'));baseline.set('assets/runtime.js',Buffer.from('untouched runtime'));
 for(const [p,b] of baseline)put(repo,p,b);
 const commit=label=>{git('add','.');git('commit','-qm',label);return [git('rev-parse','HEAD'),git('rev-parse','HEAD^{tree}')];};
 const [historicalSupportSha,historicalSupportTreeSha]=commit('historical');
 for(const p of new Set([...SUPPORT,...HISTORICAL_SUPPORT]))put(repo,p,'unpublished support '+p);
 const [publishedSiteSha,publishedSiteTreeSha]=commit('published runtime with excluded support');
 const baselineSha=publishedSiteSha,baselineTreeSha=publishedSiteTreeSha;
 const png=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.write('IHDR',12);png.writeUInt32BE(1920,16);png.writeUInt32BE(1080,20);
 put(repo,TITLE,'reviewed Tony title');put(repo,COVER,png);const [candidateSha,candidateTreeSha]=commit('Tony only');
 put(repo,'.github/workflows/new-guard.yml','offline fixture guard');const [expectedMainSha]=commit('guard');git('checkout','--detach',candidateSha);
 const publishedStaticManifest=Object.fromEntries([...baseline].map(([p,b])=>[p,hash(b)]));
 const policy={...POLICY,historicalSupportSha,historicalSupportTreeSha,validationSupportSha:historicalSupportSha,validationSupportTreeSha:historicalSupportTreeSha,baselineSha,baselineTreeSha,publishedSiteSha,publishedSiteTreeSha,candidateSha,candidateTreeSha,expectedMainSha,baselineTitleHash:hash(baseline.get(TITLE)),candidateTitleHash:hash(Buffer.from('reviewed Tony title')),candidateCoverHash:hash(png),candidateCoverBytes:png.length,publishedStaticManifest,publishedStaticManifestHash:mh(publishedStaticManifest)};
 const read=p=>fs.readFileSync(new URL('./fixtures/'+p,import.meta.url));const oldReceipt=read('social-publication-receipt.json'),oldIndex=read('social-event-pages.json');
 const r=JSON.parse(oldReceipt),i=JSON.parse(oldIndex);r.sourceServerNow=i.generatedAt=new Date(now).toISOString();r.sourceValidUntil=new Date(now+300000).toISOString();r.revision=i.revision=POLICY.candidateRevision;i.entries=[];r.hashes={[INDEX]:hash(bytes(i))};
 for(const p of CRITICAL_RUNTIME)put(published,p,baseline.get(p));put(published,RECEIPT,oldReceipt);put(published,INDEX,oldIndex);
 for(const p of Object.keys(JSON.parse(oldReceipt).hashes))if(p!==INDEX)put(published,p,fs.readFileSync(new URL('./fixtures/'+p,import.meta.url)));
 for(const [p,b] of readTree(repo,{skipGit:true}))if(!p.startsWith('.github/'))put(stage,p,b);
 put(stage,INDEX,bytes(i));put(stage,RECEIPT,bytes(r));
 const opts={repo,stage,published,policy,now};restorePublishedSupport(opts);return {root,repo,stage,published,policy,opts,git,commit,baseline};
}
test('default pins fail closed',()=>assert.throws(()=>validatePins(),/pending\/invalid pin: candidateSha/));
test('missing immutable dispatch pins denied',()=>assert.throws(()=>publicationPolicy({}),/site SHA still pending/));
test('dispatch SHA resolution preserves reviewed whole tree',()=>{const p=publicationPolicy({CT_EXPECTED_SITE_SHA:'a'.repeat(40),CT_EXPECTED_GUARD_SHA:'b'.repeat(40)});assert.equal(p.candidateTreeSha,POLICY.candidateTreeSha);});
test('complete exact synthetic release passes',t=>{const f=fixture(t);assert.doesNotThrow(()=>verifyStage(f.opts));});
test('support exclusions and historical bytes preserved',t=>{const f=fixture(t);assert.equal(fs.readFileSync(path.join(f.stage,SUPPORT[0]),'utf8'),'historical test preserved');assert.equal(fs.existsSync(path.join(f.stage,SUPPORT[2])),false);});
test('runtime mutation denied',t=>{const f=fixture(t);put(f.stage,'checkin/checkin.js','changed');assert.throws(()=>verifyStage(f.opts),/runtime bytes changed/);});
test('extra output denied',t=>{const f=fixture(t);put(f.stage,'extra.txt','changed');assert.throws(()=>verifyStage(f.opts),/files added\/removed/);});
test('missing output denied',t=>{const f=fixture(t);fs.unlinkSync(path.join(f.stage,TITLE));assert.throws(()=>verifyStage(f.opts),/files added\/removed/);});
test('dirty checkout denied',t=>{const f=fixture(t);put(f.repo,TITLE,'dirty');assert.throws(()=>verifyGit(f.repo,f.policy),/dirty worktree/);});
test('wrong full candidate tree denied',t=>{const f=fixture(t);assert.throws(()=>verifyGit(f.repo,{...f.policy,candidateTreeSha:'a'.repeat(40)}),/candidate tree/);});
test('manifest cannot resurrect support',t=>{const f=fixture(t);const m={...f.policy.publishedStaticManifest,[SUPPORT[2]]:hash(Buffer.from('support'))};assert.throws(()=>verifyGit(f.repo,{...f.policy,publishedStaticManifest:m,publishedStaticManifestHash:mh(m)}),/artifact inventory/);});
test('unauthenticated manifest denied',t=>{const f=fixture(t);assert.throws(()=>verifyGit(f.repo,{...f.policy,publishedStaticManifestHash:'a'.repeat(64)}),/manifest authentication/);});
test('links denied',t=>{const f=fixture(t);fs.symlinkSync(TITLE,path.join(f.stage,'link'));assert.throws(()=>verifyStage(f.opts),/symlink/);});
test('artifact seal includes full manifest and provenance',t=>{const f=fixture(t),r=sealStage(f.opts);assert.equal(r.seal.publishedArtifactId,13570818556);assert.equal(r.seal.coverSha256,f.policy.candidateCoverHash);assert.ok(r.archive.length);});
test('unresolved pins prevent network calls',async()=>{let calls=0;await assert.rejects(readPublicationState({token:'test',fetchImpl:()=>{calls++;throw Error('network forbidden')}}),/pending\/invalid pin/);assert.equal(calls,0);});
test('expired candidate denied',t=>{const f=fixture(t);assert.throws(()=>verifyStage({...f.opts,now:now+300001}),/temporal validity/);});
function mockFetch(f,mutate=()=>{}){return async url=>{const u=new URL(url);let result;
 if(u.hostname==='api.github.com'){
  if(u.pathname.endsWith('/git/ref/heads/main'))result={ref:'refs/heads/main',object:{type:'commit',sha:f.policy.expectedMainSha}};
  else if(u.pathname.endsWith('/runs')){const workflow=u.pathname.split('/').at(-2),a=f.policy.publisherAnchors.find(a=>a.workflow===workflow);assert.ok(a);result={total_count:a.runId===null?0:1,workflow_runs:a.runId===null?[]:[{id:a.runId,head_sha:a.headSha,status:'completed',conclusion:'success',path:'.github/workflows/'+workflow,event:'workflow_dispatch'}]};}
  else throw Error('Unexpected mocked URL '+u.pathname);
  mutate(u,result);return new Response(JSON.stringify(result));
 }
 assert.equal(u.origin,'https://cariocaticket.com.br');return new Response(fs.readFileSync(path.join(f.published,u.pathname.slice(1))));
};}
test('all six publisher anchors and unchanged main pass mocked reads',async t=>{const f=fixture(t);const r=await readPublicationState({policy:f.policy,token:'fixture',fetchImpl:mockFetch(f)});assert.equal(r.publishers.length,6);});
test('publisher movement is rejected',async t=>{const f=fixture(t);await assert.rejects(readPublicationState({policy:f.policy,token:'fixture',fetchImpl:mockFetch(f,(u,r)=>{if(u.pathname.endsWith('/runs')&&r.workflow_runs.length)r.workflow_runs[0].id++;})}),/baseline changed/);});
test('main movement is rejected',async t=>{const f=fixture(t);await assert.rejects(readPublicationState({policy:f.policy,token:'fixture',fetchImpl:mockFetch(f,(u,r)=>{if(r.object)r.object.sha='a'.repeat(40);})}),/main changed/);});
test('seal and exact same archive recheck pass mocked network',async t=>{const f=fixture(t);const o={...f.opts,archive:path.join(f.root,'artifact.tar'),seal:path.join(f.root,'seal.json')};writeSeal(o);const r=await recheckBeforeDeploy({...o,clock:()=>now,token:'fixture',fetchImpl:mockFetch(f)});assert.equal(r.verified,true);});
test('archive tampering rejected before network',async t=>{const f=fixture(t);const o={...f.opts,archive:path.join(f.root,'artifact.tar'),seal:path.join(f.root,'seal.json')};writeSeal(o);const b=fs.readFileSync(o.archive);b[100]^=1;fs.writeFileSync(o.archive,b);let calls=0;await assert.rejects(recheckBeforeDeploy({...o,clock:()=>now,token:'fixture',fetchImpl:()=>{calls++;throw Error('unexpected network');}}),/sealed archive changed/);assert.equal(calls,0);});
