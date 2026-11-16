'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {permitted,probe,IMAGE_URL}=require('./drive-browser-probe.cjs');
const origin='http://127.0.0.1:1234';
test('only exact public fixture and exact loopback page GET allowed',()=>{assert.equal(permitted(IMAGE_URL,'GET',origin),true);assert.equal(permitted(origin+'/review/drive-cover-lab/','GET',origin),true);});
test('reject writes, login, APIs, alternate ID, query changes and lookalike origins',()=>{for(const url of ['https://accounts.google.com/',IMAGE_URL+'&token=x',IMAGE_URL.replace('1ZKtn','OTHER'),origin+'/api/payments',origin+'.evil.test/review/drive-cover-lab/','https://cariocaticket.com.br/'])assert.equal(permitted(url,'GET',origin),false);for(const method of ['POST','PUT','DELETE','HEAD'])assert.equal(permitted(IMAGE_URL,method,origin),false);});
test('no browser or network before explicit probe scope',async()=>{await assert.rejects(probe({htmlPath:'missing',outputPath:'missing',approved:'yes'}),/EXPLICIT_PROBE_SCOPE/);});
test('wrong HTML fails before server/browser',async()=>{await assert.rejects(probe({htmlPath:__filename,outputPath:path.join(__dirname,'never-created.json'),approved:'READ_ONLY_EXISTING_PUBLIC_FIXTURE'}),/HTML_CHANGED/);});

test('diagnostic URL labels omit query and credentials',()=>{const {urlLabel}=require('./drive-browser-probe.cjs');assert.equal(urlLabel('https://user:secret@example.test/path?token=hidden#x',origin),'https://example.test/path');assert.equal(urlLabel(IMAGE_URL,origin),'PUBLIC_FIXTURE');});
