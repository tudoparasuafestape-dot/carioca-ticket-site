const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const s=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
test('static OG image and img use same existing fixture',()=>{const expected='https://drive.usercontent.google.com/download?id=1ZKtn5Z7APZpQjiNEVZSOrfCws5liDLIq&amp;export=download';assert.ok(s.includes('property="og:image" content="'+expected+'"'));assert.ok(s.includes('src="'+expected+'"'));});
test('lab has no scripts, forms, auth or production integration',()=>{for(const x of ['<script','<form','script.google.com','fetch(','access_token','api_key'])assert.ok(!s.includes(x));});
