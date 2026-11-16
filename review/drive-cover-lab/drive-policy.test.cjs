const test=require('node:test'),assert=require('node:assert/strict');
const {assessDriveAsset:check}=require('./drive-policy.cjs');
function fixture(){const sha='a'.repeat(64),url='https://drive.google.com/uc?id=synthetic&export=download';return {now:1000000,file:{id:'synthetic',parents:['private-folder'],mimeType:'image/png',size:'20',webContentLink:url,permissions:[{type:'anyone',role:'reader',allowFileDiscovery:false}]},record:{fileId:'synthetic',folderId:'private-folder',mime:'image/png',bytes:20,sha256:sha,validation:'FULL_DECODE_PASSED',editorialApproval:true},computedSha256:sha,probe:{url,anonymous:true,cookiesUsed:false,authorizationUsed:false,status:200,mime:'image/png',bytes:20,sha256:sha,htmlDetected:false,checkedAt:999999}};}
test('private source never becomes public-ready',()=>{let x=fixture();x.file.permissions=[];assert.equal(check(x).reason,'PRIVATE_SOURCE_ONLY');});
test('public bytes not permanent or OG guarantee',()=>{let x=check(fixture());assert.equal(x.state,'PUBLIC_BYTES_VERIFIED');assert.equal(x.ogVerified,false);assert.equal(x.permanentDeliveryGuaranteed,false);});
test('thumbnail cannot be persisted',()=>{let x=fixture();x.file.thumbnailLink=x.file.webContentLink;assert.equal(check(x).reason,'NO_DOCUMENTED_DELIVERY_URL');});
test('login HTML or auth-assisted fetch fails',()=>{for(const change of [{htmlDetected:true},{authorizationUsed:true},{cookiesUsed:true},{status:302},{mime:'text/html'}]){let x=fixture();Object.assign(x.probe,change);assert.equal(check(x).state,'NOT_READY');}});
test('changed bytes reject',()=>{let x=fixture();x.computedSha256='b'.repeat(64);assert.equal(check(x).reason,'HASH_MISMATCH');});
test('wrong folder or trashed reject',()=>{let x=fixture();x.file.parents=['elsewhere'];assert.equal(check(x).reason,'FILE_SCOPE');x=fixture();x.file.trashed=true;assert.equal(check(x).reason,'FILE_SCOPE');});
test('expired proof rejects',()=>{let x=fixture();x.probe.checkedAt=0;assert.equal(check(x).reason,'STALE_PROBE');});
test('review and full decode mandatory',()=>{for(const key of ['validation','editorialApproval']){let x=fixture();x.record[key]=false;assert.equal(check(x).reason,'APPROVAL_PENDING');}});
