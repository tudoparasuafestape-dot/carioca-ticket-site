'use strict';
// Pure policy for a server-owned Drive media pipeline. No requests or mutations.
// Drive metadata and probe must originate from trusted adapters, NEVER browser input.
function assessDriveAsset({file,record,computedSha256,probe,now}) {
  const no=reason=>({state:'NOT_READY',reason});
  if(!file||!record||!Number.isFinite(now))return no('INVALID_INPUT');
  if(file.trashed||file.id!==record.fileId||!Array.isArray(file.parents)||!file.parents.includes(record.folderId))return no('FILE_SCOPE');
  if(!['image/png','image/jpeg'].includes(file.mimeType)||file.mimeType!==record.mime||Number(file.size)!==record.bytes||record.bytes<1||record.bytes>10000000)return no('FILE_TYPE_OR_SIZE');
  if(!/^[a-f0-9]{64}$/.test(computedSha256)||computedSha256!==record.sha256)return no('HASH_MISMATCH');
  if(record.validation!=='FULL_DECODE_PASSED'||record.editorialApproval!==true)return no('APPROVAL_PENDING');
  // Private Drive files are valid source/quarantine assets, not public covers.
  if(!Array.isArray(file.permissions)||!file.permissions.some(p=>p.type==='anyone'&&p.role==='reader'&&p.allowFileDiscovery===false))return no('PRIVATE_SOURCE_ONLY');
  // Never use the ephemeral thumbnail URL or undocumented synthesized URLs.
  const url=file.webContentLink;
  if(typeof url!=='string'||url===file.thumbnailLink)return no('NO_DOCUMENTED_DELIVERY_URL');
  let parsed;try{parsed=new URL(url);}catch{return no('INVALID_DELIVERY_URL');}
  if(parsed.protocol!=='https:'||!['drive.google.com','drive.usercontent.google.com'].includes(parsed.hostname)||parsed.username||parsed.password)return no('INVALID_DELIVERY_URL');
  if(!probe||probe.url!==url||probe.anonymous!==true||probe.cookiesUsed!==false||probe.authorizationUsed!==false||probe.status!==200||probe.mime!==record.mime||probe.bytes!==record.bytes||probe.sha256!==record.sha256||probe.htmlDetected!==false)return no('PUBLIC_DELIVERY_UNVERIFIED');
  if(!Number.isFinite(probe.checkedAt)||probe.checkedAt>now||now-probe.checkedAt>300000)return no('STALE_PROBE');
  // Proof is bounded to the observation, not a stability or OG guarantee.
  return {state:'PUBLIC_BYTES_VERIFIED',url,checkedAt:probe.checkedAt,ogVerified:probe.ogCrawlerVerified===true,permanentDeliveryGuaranteed:false};
}
module.exports={assessDriveAsset};
