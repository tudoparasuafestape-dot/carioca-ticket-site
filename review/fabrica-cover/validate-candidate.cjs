'use strict';
// Review-only validator. No network, RPC, credentials, filesystem writes or deployment.
const crypto = require('node:crypto');
const ASSET = Object.freeze({ path: 'assets/eventos/fabrica-de-samba-20261129-7089258579f37d13.png', sha256: '7089258579f37d13baaf82d909a65cee5ed361459656590446a9c40bc3cdde2f', bytes: 2060262, width: 1672, height: 941 });
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
function requireTrue(ok, reason) { if (!ok) throw new Error('CT_FABRICA_ASSET_DENIED:' + reason); }
function inventory(tree) {
  requireTrue(tree instanceof Map && tree.size > 0 && tree.size <= 10000, 'inventory');
  let total = 0;
  for (const [p,b] of tree) {
    requireTrue(typeof p === 'string' && /^[A-Za-z0-9._/-]+$/.test(p) && !p.startsWith('/') && p.split('/').every(x => x && x !== '.' && x !== '..'), 'path');
    requireTrue(Buffer.isBuffer(b) && b.length <= 64*1024*1024 && (total += b.length) <= 256*1024*1024, 'bytes');
  }
}
function validateCandidate(baseline, candidate, evidence) {
  // Caller must supply an independently authenticated last-published artifact.
  // This module deliberately does NOT fetch, approve or deploy it.
  inventory(baseline); inventory(candidate);
  requireTrue(evidence && Object.keys(evidence).sort().join(',') === 'baselineManifestSha256,publishedCommit,publishedRunId', 'evidence');
  requireTrue(/^[a-f0-9]{40}$/.test(evidence.publishedCommit) && Number.isSafeInteger(evidence.publishedRunId) && evidence.publishedRunId > 0, 'publication');
  const manifest = [...baseline].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([p,b]) => [p,hash(b)]);
  requireTrue(hash(Buffer.from(JSON.stringify(manifest))) === evidence.baselineManifestSha256, 'baseline-hash');
  requireTrue(!baseline.has(ASSET.path) && candidate.size === baseline.size + 1, 'inventory-delta');
  for (const [p,b] of baseline) requireTrue(candidate.has(p) && b.equals(candidate.get(p)), 'changed-existing');
  const b = candidate.get(ASSET.path);
  requireTrue(Buffer.isBuffer(b) && b.length === ASSET.bytes && hash(b) === ASSET.sha256, 'asset-hash');
  requireTrue(b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) && b.toString('ascii',12,16) === 'IHDR' && b.readUInt32BE(16) === ASSET.width && b.readUInt32BE(20) === ASSET.height, 'png');
  return Object.freeze({status:'OFFLINE_CANDIDATE_ONLY',assetPath:ASSET.path,sha256:ASSET.sha256,bytes:ASSET.bytes,deploymentAuthorized:false,backendLinked:false,salesReady:false});
}
module.exports = {ASSET,hash,validateCandidate};
