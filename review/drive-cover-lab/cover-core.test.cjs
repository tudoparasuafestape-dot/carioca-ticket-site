'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCoverCore}=require('./cover-core.cjs');
const asset={eventId:'EVT-A',producerId:'PROD-A',assetId:'asset-a',name:'A',url:'https://example.invalid/a.png',sha256:'a'.repeat(64),mime:'image/png',bytes:20,state:'READY'};
function core(rows=[],legacy=[]){let reads=0;return {get reads(){return reads;},api:createCoverCore({authorize:async(t,e)=>t==='owner'?{authorized:true,userId:'U',producerId:'PROD-A',eventId:e}:null,registry:{list:async()=>{reads++;return rows;}},legacy})};}
const selection={eventId:'EVT-A',assetId:'asset-a',expectedVersion:'b'.repeat(64),motivo:'Selecionar arte'};
test('new event has empty library',async()=>assert.deepEqual((await core().api.list('owner','EVT-NEW')).assets,[]));
test('auth precedes registry',async()=>{const c=core([asset]);await assert.rejects(c.api.list('expired','EVT-A'),/ACCESS_DENIED/);assert.equal(c.reads,0);});
test('other event and producer never leak',async()=>assert.deepEqual((await core([{...asset,eventId:'EVT-B'},{...asset,producerId:'PROD-B'}]).api.list('owner','EVT-A')).assets,[]));
test('pending validation or approval not selectable',async()=>{for(const state of ['UPLOADING','PENDING_REVIEW','REJECTED'])await assert.rejects(core([{...asset,state}]).api.resolveSelection('owner',selection),/ASSET_NOT/);});
test('legacy remains readable',async()=>assert.equal((await core([], [asset]).api.list('owner','EVT-A')).assets[0].assetId,asset.assetId));
test('duplicate registry identity fails closed',async()=>await assert.rejects(core([asset],[asset]).api.list('owner','EVT-A'),/AMBIGUOUS/));
test('client cannot choose URL or producer',async()=>{for(const k of ['url','producerId'])await assert.rejects(core([asset]).api.resolveSelection('owner',{...selection,[k]:'evil'}),/INVALID_SELECTION/);});
test('resolution preserves expected version without performing save',async()=>{const x=await core([asset]).api.resolveSelection('owner',selection);assert.equal(x.expectedVersion,selection.expectedVersion);assert.equal(x.producerId,'PROD-A');assert.equal(x.asset.url,asset.url);});

test('actual legacy shape without state or mime remains readable',async()=>{const old={...asset,url:'https://example.invalid/old.jpg'};delete old.state;delete old.mime;assert.equal((await core([], [old]).api.list('owner','EVT-A')).assets.length,1);});
test('picker cannot receive empty asset names',async()=>{await assert.rejects(core([{...asset,name:''}]).api.list('owner','EVT-A'),/INVALID_REGISTRY/);});
