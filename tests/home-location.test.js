'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const G=require('../assets/home-location-worker.js');
const load=n=>JSON.parse(fs.readFileSync(`${__dirname}/../assets/geo-ibge-2025/${n}.json`,'utf8'));
const f=(id,polygons)=>({id,polygons,bbox:[0,0,10,10]});
const square=[[0,0],[10,0],[10,10],[0,10],[0,0]],hole=[[4,4],[6,4],[6,6],[4,6],[4,4]];
test('Polygon holes are excluded; boundaries are not confident suggestions',()=>{
 const city=f('a',[[square,hole]]);assert(G.contains([2,2],city));assert(!G.contains([5,5],city));assert.equal(G.locate([city],[0,5],10).status,'uncertain');assert.equal(G.locate([city],[4.001,5],10).status,'uncertain');
});
test('MultiPolygon includes detached islands',()=>{const city=f('a',[[[[0,0],[2,0],[2,2],[0,2],[0,0]]],[[[8,8],[10,8],[10,10],[8,10],[8,8]]]]);assert(G.contains([9,9],city));assert(!G.contains([5,5],city));});
test('overlapping UFs, outside and coarse accuracy never auto-resolve',()=>{const a=f('a',[[square]]),b=f('b',[[square]]);assert.equal(G.locate([a,b],[5,5],10).status,'uncertain');for(const point of [[20,20],[NaN,0],[181,0]])assert.equal(G.locate([a],point,10).status,'uncertain');for(const accuracy of [5001,-1,NaN,Infinity])assert.equal(G.locate([a],[5,5],accuracy).status,'uncertain');});
test('shared TopoJSON arcs, reverse arcs and transforms decode correctly',()=>{
 const topology={type:'Topology',transform:{scale:[1,1],translate:[0,0]},arcs:[[[0,0],[10,0]],[[10,0],[0,10]],[[10,10],[-10,0]],[[0,0],[0,10]]],objects:{x:{geometries:[{type:'Polygon',properties:{codarea:'a'},arcs:[[0,1,2,-4]]}]}}};
 const [decoded]=G.decode(topology);assert.deepEqual(decoded.polygons[0][0],square);assert(G.contains([5,5],decoded));
});
test('national snapshot reconciles all 5571 selectable codes, checksums and 27 UFs',()=>{
 const manifest=load('manifest'),rows=JSON.parse(fs.readFileSync(`${__dirname}/../assets/home-municipalities.json`));assert.equal(rows.length,5571);assert.equal(G.decode(load('UF')).length,27);
 for(const [name,entry] of Object.entries(manifest.files)){
  const data=fs.readFileSync(`${__dirname}/../assets/geo-ibge-2025/${name}.json`);assert.equal(crypto.createHash('sha256').update(data).digest('hex'),entry.sha256);assert.equal(data.length,entry.bytes);
  if(name==='UF')continue;
  const ids=new Set(G.decode(JSON.parse(data)).map(g=>g.id));for(const row of rows.filter(r=>r[1]===name))assert(ids.has(row[0]),row.join('/'));
 }
});
test('real PE/RJ/SP locations resolve locally with one state mesh',()=>{
 const uf=G.decode(load('UF'));
 for(const [state,point,id] of [['PE',[-34.9,-8.06],'2611606'],['RJ',[-43.2,-22.91],'3304557'],['SP',[-46.63,-23.55],'3550308']]){
  const result=G.locate(uf,point,30);assert.equal(G.STATE_CODES[result.id],state,JSON.stringify(result));assert.equal(G.locate(G.decode(load(state)),point,30).id,id);
 }
});
