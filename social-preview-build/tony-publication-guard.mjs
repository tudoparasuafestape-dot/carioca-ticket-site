import { PUBLISHED_STATIC_MANIFEST } from './published-static-manifest.mjs';
// REVIEW DRAFT. No network, deployment or implicit execution in this module.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { packVerifiedFiles } from './official-pages-archive.mjs';
export { packVerifiedFiles as makeTar } from './official-pages-archive.mjs';

export const INDEX = 'assets/social-event-pages.json';
export const RECEIPT = 'assets/social-publication-receipt.json';
export const TITLE = 'ingresso/index.html';
export const COVER = 'assets/eventos/tony-burguer-6-anos-20261129-5c2997ca87bdefb7.png';
export const RUNTIME = Object.freeze([TITLE, COVER]);
export const SUPPORT = Object.freeze(['tests/scanner-session.runtime.cjs', 'tests/scanner-session.browser.cjs', 'docs/checkin-validation-screen-20261107.md', 'tests/scanner-feedback.browser.cjs', '.github/workflows/scanner-session.yml']);
// These files were already restored/excluded by the last successful reader guard.
export const HISTORICAL_SUPPORT = Object.freeze(['tests/scanner-session.runtime.cjs', 'tests/scanner-session.browser.cjs', 'docs/checkin-used-qr-feedback-20261107.md']);
const RESTORE_SUPPORT = Object.freeze([...new Set([...SUPPORT, ...HISTORICAL_SUPPORT])]);
export const POLICY = Object.freeze({
  baselineSha: '1ab0610b25d17818778ca0932bf9ce3578288085',
  baselineTreeSha: 'aaa3d8f1da14fbde223c6344a31d0f3691407525',
  publishedSiteSha: '6cc7c5e5b275032cf14164e19a94bdeff9c7f4f7',
  publishedSiteTreeSha: 'a21256d58c9d569046ae384c0f34b38d48c441da',
  validationSupportSha: 'dde027425c03c6e1c42a797e6613842048e0a038',
  validationSupportTreeSha: '321310d206e25471895ffe6379b8b064f16f56fd',
  publishedArtifactId: 13570818556,
  publishedArtifactSha256: 'a60c122db8fa31aa661e9366e54f4760d1891b17ead64533a5bc79591f381a49',
  publishedStaticManifestHash: '80d1a8563cf2e12e5305a20a3292726e60f7355eb09bbc6543b0d265e9e44c0a',
  publishedStaticManifest: PUBLISHED_STATIC_MANIFEST,
  historicalSupportSha: 'f70896115ca6040fb85ca03e9dd4e85853a08deb',
  historicalSupportTreeSha: '9cac79563699f15ceb81f2460dca89dd8895bb44',
  candidateSha: null,
  candidateTreeSha: '82fa3e96d3c80b7b25917c3614b91aad77d8591d',
  expectedMainSha: null,
  baselinePublicationRunId: 42364613042,
  publisherAnchors: Object.freeze([
    Object.freeze({ workflow: 'ct-pages-publication.yml', runId: 41495873659, headSha: '011a1a7f50aa637d0797f5d875b67c50e3bffba4' }),
    Object.freeze({ workflow: 'ct-title-only-publication.yml', runId: 42323153462, headSha: '55bcb5c5eb10615551b8eeaf87fc27bec1d6d045' }),
    Object.freeze({ workflow: 'ct-ticket-cover-only-publication.yml', runId: 42327154302, headSha: 'f70896115ca6040fb85ca03e9dd4e85853a08deb' }),
    Object.freeze({ workflow: 'ct-reader-only-publication.yml', runId: 42361688366, headSha: 'dde027425c03c6e1c42a797e6613842048e0a038' }),
    Object.freeze({ workflow: 'ct-validation-only-publication.yml', runId: 42364613042, headSha: '1ab0610b25d17818778ca0932bf9ce3578288085' }),
    Object.freeze({ workflow: 'ct-tony-authorized-publication.yml', runId: null, headSha: null }),
  ]),
  baselineTitleHash: 'c16f236b15b1db590960195477c10928abfd48cc0b6bcfc62f5f2ac7e9121f3f',
  candidateTitleHash: '5e66158b037f7c5eaabfa03db86a6f417b60907a82a923477639d73fa6900da2',
  candidateCoverHash: '5c2997ca87bdefb7ed80e16aa23677b473a9401360a71205826eedb307bf036c',
  candidateCoverBytes: 2880499,
  publishedReceiptHash: '8adece60806ff6832ec2011155a68100b6307b7af88926171c230a1624187f8d',
  candidateRevision: '89ccaaab7ae276c35ba8748ce7acb39205efb0fa11f314260aa995c20592b9a8',
  publishedRevision: '3b562007b1d295c57ff7e7b117346892144e88ddf4c567693d8f5ce19bddba1d',
  publishedServerNow: '2026-11-07T10:37:33.916Z',
  executionRef: 'refs/heads/main',
});
export const CRITICAL_RUNTIME = Object.freeze(['checkin/checkin.js', 'checkin/checkin.css', 'checkout/index.html', 'checkout-v2/index.html', 'ingresso/index.html', 'index.html', 'evento/index.html']);
const CHANGES = [...RUNTIME].sort();
const OMIT = new Set(['.git', '.github', 'node_modules', 'social-preview-build']);
const HEX = /^[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,219}$/;
const MAX_BYTES = 256 * 1024 * 1024;
export const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error('CT_TONY_AUTHORIZED_DENIED: ' + message); };
const check = (ok, message) => { if (!ok) fail(message); };
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const canonical = v => JSON.stringify(v && typeof v === 'object'
  ? Array.isArray(v) ? v.map(x => JSON.parse(canonical(x)))
    : Object.fromEntries(Object.keys(v).sort().map(k => [k, JSON.parse(canonical(v[k]))])) : v);
const equal = (a, b, message) => check(canonical(a) === canonical(b), message);
function keys(value, expected, label) {
  check(object(value), label + ' object missing');
  equal(Object.keys(value).sort(), [...expected].sort(), label + ' unknown/missing keys');
}
export function safePath(relative) {
  check(typeof relative === 'string' && relative.length > 0 && relative.length <= 255 &&
    /^[A-Za-z0-9._/-]+$/.test(relative) && !relative.startsWith('/') &&
    relative.split('/').every(x => x && x !== '.' && x !== '..'), 'unsafe path');
  return relative;
}
const omitted = relative => relative.split('/').some(p => OMIT.has(p));
const derived = relative => relative === INDEX || relative === RECEIPT ||
  relative.startsWith('compartilhar/') || relative.startsWith('assets/social-previews/');
function derivativePath(relative) {
  safePath(relative);
  check(relative === INDEX || /^compartilhar\/[A-Za-z0-9][A-Za-z0-9_-]{0,219}\/index\.html$/.test(relative) ||
    /^assets\/social-previews\/[a-f0-9]{64}\.jpg$/.test(relative), 'unapproved derivative path');
}
function instant(v, label) {
  check(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
    Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v, label + ' invalid time');
  return Date.parse(v);
}
function json(bytes, label) {
  check(Buffer.isBuffer(bytes) && bytes.length < 2 * 1024 * 1024, label + ' bytes missing/oversized');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail(label + ' invalid JSON'); }
}
export function validateReceipt(bytes) {
  const r = json(bytes, 'receipt');
  keys(r, ['schema', 'mode', 'status', 'revision', 'sourceServerNow', 'sourceValidUntil', 'excluded', 'hashes'], 'receipt');
  check(r.schema === 'CT_TRUSTED_BUILD_LAB_V1' && r.mode === 'TRUSTED_HTTP_CURRENT397_NOT_SIGNED242' &&
    r.status === 'LOCAL_NOT_PUBLISHED' && HEX.test(r.revision), 'receipt contract');
  check(instant(r.sourceValidUntil, 'validUntil') > instant(r.sourceServerNow, 'serverNow'), 'receipt interval');
  // The published receipt is a watermark, so expiration is NOT an error here.
  check(Array.isArray(r.excluded) && r.excluded.length <= 50, 'receipt excluded');
  const ids = new Set();
  for (const e of r.excluded) {
    keys(e, ['eventId', 'reason'], 'excluded');
    check(ID.test(e.eventId) && !ids.has(e.eventId) &&
      ['NOT_PUBLIC_ACTIVE', 'NO_VERIFIABLE_END', 'ENDED'].includes(e.reason), 'excluded identity/reason');
    ids.add(e.eventId);
  }
  check(object(r.hashes) && Object.hasOwn(r.hashes, INDEX) && Object.keys(r.hashes).length <= 101, 'receipt hashes');
  for (const [p, h] of Object.entries(r.hashes)) { derivativePath(p); check(HEX.test(h), 'invalid output hash'); }
  return r;
}
function normalizedIndex(bytes, receipt) {
  const i = json(bytes, 'index');
  keys(i, ['schema', 'revision', 'generatedAt', 'fallbacks', 'entries'], 'index');
  check(i.schema === 'CT_PUBLISHED_SHARE_INDEX_V1' && i.revision === receipt.revision &&
    i.generatedAt === receipt.sourceServerNow && Array.isArray(i.entries) && Array.isArray(i.fallbacks), 'index envelope');
  instant(i.generatedAt, 'generatedAt');
  const copy = { ...i };
  // This is the ONLY field removed from the index. Array order is preserved.
  delete copy.generatedAt;
  return copy;
}
export function authenticatePublished(receiptBytes, indexBytes, policy = POLICY) {
  check(hash(receiptBytes) === policy.publishedReceiptHash, 'published receipt changed/corrupted');
  const receipt = validateReceipt(receiptBytes);
  check(receipt.revision === policy.publishedRevision && receipt.sourceServerNow === policy.publishedServerNow,
    'published watermark mismatch');
  check(hash(indexBytes) === receipt.hashes[INDEX], 'published index unauthenticated');
  return { receipt, index: normalizedIndex(indexBytes, receipt) };
}
export function compareDerivatives({ publishedReceiptBytes, publishedIndexBytes, candidateFiles, now = Date.now(), policy = POLICY }) {
  const previous = authenticatePublished(publishedReceiptBytes, publishedIndexBytes, policy);
  const receipt = validateReceipt(candidateFiles.get(RECEIPT));
  check(previous.receipt.revision === '3b562007b1d295c57ff7e7b117346892144e88ddf4c567693d8f5ce19bddba1d' && receipt.revision === '89ccaaab7ae276c35ba8748ce7acb39205efb0fa11f314260aa995c20592b9a8', 'catalog revision changed outside exact authorized removal');
  check(instant(receipt.sourceServerNow, 'candidate serverNow') >= instant(previous.receipt.sourceServerNow, 'published serverNow'), 'watermark rollback');
  check(Number.isFinite(now) && Date.parse(receipt.sourceServerNow) <= now + 60000 && now - Date.parse(receipt.sourceServerNow) <= 60000 &&
    Date.parse(receipt.sourceValidUntil) > now && Date.parse(receipt.sourceValidUntil) - Date.parse(receipt.sourceServerNow) <= 300000,
    'candidate temporal validity expired/incoherent');
  const sortedExcluded = r => [...r.excluded].sort((a, b) => a.eventId.localeCompare(b.eventId));
  const removedId = 'EVT-07112026-TBT-DO-ASTRO-ANIVERSARIO-DE-HERMINHO-F103E26A';
  const removedPaths = ['compartilhar/' + removedId + '/index.html', 'assets/social-previews/e1e81875f7b3d9c69ef5622d01675d6ae4c1937f84609473ea72c905f556643f.jpg'];
  const oldEntry = previous.index.entries.filter(e => e.eventId === removedId);
  check(oldEntry.length === 1 && oldEntry[0].endsAt === '2026-11-08T09:00:00.000Z' && instant(oldEntry[0].endsAt, 'authorized end') <= now, 'authorized expired event mismatch');
  check(!previous.receipt.excluded.some(e => e.eventId === removedId), 'authorized exclusion already exists');
  for (const p of removedPaths) check(Object.hasOwn(previous.receipt.hashes,p) && !candidateFiles.has(p), 'authorized derivative removal mismatch');
  const expectedExcluded = previous.receipt;
  equal(sortedExcluded(receipt), sortedExcluded(expectedExcluded), 'excluded changed outside authorized Herminho removal');
  equal(Object.keys(receipt.hashes).sort(), Object.keys(previous.receipt.hashes).filter(p=>!removedPaths.includes(p)).sort(), 'derivative inventory changed outside authorized removal');
  equal([...candidateFiles.keys()].filter(p => derived(p) && p !== RECEIPT).sort(), Object.keys(receipt.hashes).sort(), 'artifact derivative inventory mismatch');
  for (const [p, expected] of Object.entries(receipt.hashes)) {
    const bytes = candidateFiles.get(p);
    check(Buffer.isBuffer(bytes) && hash(bytes) === expected, 'candidate bytes/hash mismatch: ' + p);
    if (p !== INDEX) check(expected === previous.receipt.hashes[p], 'published derivative hash changed: ' + p);
  }
  const index = normalizedIndex(candidateFiles.get(INDEX), receipt);
  equal(index, {...previous.index,revision:receipt.revision,entries:previous.index.entries.filter(e=>e.eventId!==removedId)}, 'index changed outside authorized removal/generatedAt');
  // Same revision can still lose events as time advances. Inventory/excluded above
  // catch the rebuild case; this additional test also rejects a reused stale stage.
  for (const entry of index.entries) check(instant(entry.endsAt, 'event endsAt') > now, 'event expired before publication');
  return { receipt, index };
}

function realDirectory(directory) {
  const absolute = path.resolve(directory);
  for (let current = absolute; ; current = path.dirname(current)) {
    const st = fs.lstatSync(current);
    check(st.isDirectory() && !st.isSymbolicLink(), 'symlink/non-directory ancestor');
    if (current === path.dirname(current)) break;
  }
  return absolute;
}
export function readTree(directory, { skipGit = false } = {}) {
  const root = realDirectory(directory), files = new Map();
  let total = 0;
  function walk(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix + entry.name, full = path.join(dir, entry.name);
      safePath(relative);
      const st = fs.lstatSync(full);
      check(!st.isSymbolicLink(), 'symlink denied: ' + relative);
      if (skipGit && relative === '.git') { check(st.isDirectory(), 'git metadata must be a directory'); continue; }
      if (st.isDirectory()) walk(full, relative + '/');
      else {
        check(st.isFile() && st.nlink === 1, 'special file/hardlink denied: ' + relative);
        check(st.size <= 64 * 1024 * 1024 && (total += st.size) <= MAX_BYTES && files.size < 10000, 'tree resource limit');
        files.set(relative, fs.readFileSync(full));
      }
    }
  }
  walk(root);
  return files;
}
function git(repo, ...args) {
  return execFileSync('git', ['--no-replace-objects', '-C', repo, ...args], {
    maxBuffer: MAX_BYTES, env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_OPTIONAL_LOCKS: '0' },
  });
}
function gitTree(repo, sha) {
  check(SHA.test(sha), 'invalid git SHA');
  check(git(repo, 'rev-parse', '--verify', sha + '^{commit}').toString().trim() === sha, 'not exact git commit');
  const rows = git(repo, 'ls-tree', '-rz', '--full-tree', sha).toString('utf8').split('\0').filter(Boolean);
  const tree = new Map();
  for (const row of rows) {
    const match = /^(\d+) (\w+) ([a-f0-9]{40})\t(.+)$/.exec(row);
    check(match && ['100644', '100755'].includes(match[1]) && match[2] === 'blob', 'git symlink/submodule/special entry');
    safePath(match[4]); check(!tree.has(match[4]), 'duplicate git path');
    tree.set(match[4], { mode: match[1], blob: match[3] });
  }
  return tree;
}
export function verifyGit(repo, policy = POLICY) {
  validatePins(policy);
  realDirectory(repo);
  check(git(repo, 'rev-parse', 'HEAD').toString().trim() === policy.candidateSha, 'candidate checkout SHA unexpected');
  check(git(repo, 'rev-parse', policy.candidateSha + '^{tree}').toString().trim() === policy.candidateTreeSha,
    'candidate tree differs from reviewed Tony candidate');
  check(git(repo, 'rev-parse', policy.baselineSha + '^{tree}').toString().trim() === policy.baselineTreeSha, 'baseline tree unexpected');
  check(git(repo, 'rev-parse', policy.publishedSiteSha + '^{tree}').toString().trim() === policy.publishedSiteTreeSha, 'published site tree unexpected');
  check(SHA.test(policy.expectedMainSha) && git(repo, 'rev-parse', '--verify', policy.expectedMainSha + '^{commit}').toString().trim() === policy.expectedMainSha, 'guard/main commit unavailable or unexpected');
  check(git(repo, 'merge-base', policy.candidateSha, policy.expectedMainSha).toString().trim() === policy.candidateSha, 'Tony site is not integrated in approved guard/main commit');
  const base = gitTree(repo, policy.baselineSha), candidate = gitTree(repo, policy.candidateSha);
  const deployed = gitTree(repo, policy.publishedSiteSha);
  check(git(repo, 'merge-base', policy.publishedSiteSha, policy.baselineSha).toString().trim() === policy.publishedSiteSha, 'published site is not baseline ancestor');
  check(git(repo, 'rev-parse', policy.historicalSupportSha + '^{tree}').toString().trim() === policy.historicalSupportTreeSha, 'historical support tree unexpected');
  check(git(repo, 'merge-base', policy.historicalSupportSha, policy.publishedSiteSha).toString().trim() === policy.historicalSupportSha, 'historical support not published ancestor');
  const historical = gitTree(repo, policy.historicalSupportSha);
  check(git(repo, 'rev-parse', policy.validationSupportSha + '^{tree}').toString().trim() === policy.validationSupportTreeSha, 'validation support tree unexpected');
  check(git(repo, 'merge-base', policy.validationSupportSha, policy.publishedSiteSha).toString().trim() === policy.validationSupportSha, 'validation support not published ancestor');
  const validationSupport = gitTree(repo, policy.validationSupportSha);
  const projectPublished = tree => {
    const projected = new Map(tree);
    // Reproduce the latest validation artifact's projection in the same order:
    // new validation support restored from its baseline, then older reader support.
    for (const [paths, source] of [[SUPPORT, validationSupport], [HISTORICAL_SUPPORT, historical]]) {
      for (const p of paths) { if (source.has(p)) projected.set(p, source.get(p)); else projected.delete(p); }
    }
    return projected;
  };
  const effectiveBase = projectPublished(base), effectiveDeployed = projectPublished(deployed);
  const runtimePaths = tree => [...tree.keys()].filter(p => !omitted(p) && !derived(p)).sort();
  equal(runtimePaths(effectiveBase), runtimePaths(effectiveDeployed), 'baseline/published runtime inventory differs');
  for (const p of runtimePaths(effectiveBase)) equal(effectiveBase.get(p), effectiveDeployed.get(p), 'baseline/published runtime bytes or mode differ: ' + p);
  check(git(repo, 'merge-base', policy.baselineSha, policy.candidateSha).toString().trim() === policy.baselineSha, 'baseline is not candidate ancestor');
  const changes = [...new Set([...base.keys(), ...candidate.keys()])].filter(p =>
    canonical(base.get(p)) !== canonical(candidate.get(p))).sort();
  equal(changes, CHANGES, 'git diff outside approved Tony HTML/PNG');
  check(base.has(TITLE) && candidate.has(TITLE) && base.get(TITLE).mode === candidate.get(TITLE).mode, 'title removal/mode change denied');
  check(!base.has(COVER) && candidate.has(COVER) && candidate.get(COVER).mode === '100644', 'cover must be a new regular 0644 file');
  const getBlob = entry => git(repo, 'cat-file', 'blob', entry.blob);
  check(hash(getBlob(base.get(TITLE))) === policy.baselineTitleHash, 'baseline title bytes unexpected');
  check(hash(getBlob(candidate.get(TITLE))) === policy.candidateTitleHash, 'candidate title bytes unexpected');
  const cover = getBlob(candidate.get(COVER));
  check(hash(cover) === policy.candidateCoverHash && cover.length === policy.candidateCoverBytes, 'candidate cover bytes unexpected');
  check(cover.length >= 24 && cover.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
    cover.toString('ascii', 12, 16) === 'IHDR' && cover.readUInt32BE(16) === 1920 && cover.readUInt32BE(20) === 1080, 'candidate cover PNG dimensions/type unexpected');
  const disk = readTree(repo, { skipGit: true });
  equal([...disk.keys()].sort(), [...candidate.keys()].sort(), 'untracked/missing worktree file');
  const baselineStatic = new Map();
  for (const p of runtimePaths(effectiveBase)) baselineStatic.set(p, getBlob(effectiveBase.get(p)));
  const baselineManifest = Object.fromEntries([...baselineStatic].map(([p, b]) => [p, hash(b)]));
  equal(baselineManifest, policy.publishedStaticManifest, 'baseline does not match reviewed last-publication artifact inventory/bytes');
  const candidateStatic = new Map(baselineStatic);
  for (const [p, entry] of candidate) {
    const bytes = getBlob(entry);
    check(disk.get(p).equals(bytes), 'dirty worktree bytes: ' + p);
    if (!omitted(p) && !derived(p)) {
      if (RUNTIME.includes(p)) candidateStatic.set(p, bytes);
      else if (!RESTORE_SUPPORT.includes(p)) check(baselineStatic.has(p) && bytes.equals(baselineStatic.get(p)), 'runtime differs from baseline: ' + p);
    }
  }
  return { baselineStatic, candidateStatic };
}
export function comparePublishedTree(published, gitState, policy = POLICY) {
  const previous = authenticatePublished(published.get(RECEIPT), published.get(INDEX), policy);
  // This is a bounded HTTP corroboration, NOT an inventory of the live server.
  // The full static baseline comes from the pinned Git tree and independently
  // confirmed last publication run. Dotfiles/tests are not required HTTP reads.
  const expected = new Map();
  for (const p of CRITICAL_RUNTIME) {
    check(gitState.baselineStatic.has(p), 'critical runtime absent in baseline: ' + p);
    expected.set(p, gitState.baselineStatic.get(p));
  }
  for (const [p, h] of Object.entries(previous.receipt.hashes)) {
    check(published.has(p) && hash(published.get(p)) === h, 'published output bytes/hash mismatch: ' + p);
    expected.set(p, published.get(p));
  }
  expected.set(RECEIPT, published.get(RECEIPT));
  equal([...published.keys()].sort(), [...expected.keys()].sort(), 'published snapshot inventory incomplete/extra');
  for (const [p, bytes] of expected) check(published.get(p).equals(bytes), 'published runtime differs from pinned baseline: ' + p);
  return previous;
}
export function verifyStage({ repo, stage, published, now = Date.now(), policy = POLICY }) {
  const gitState = verifyGit(repo, policy);
  const publishedFiles = readTree(published);
  comparePublishedTree(publishedFiles, gitState, policy);
  const files = readTree(stage);
  const result = compareDerivatives({ publishedReceiptBytes: publishedFiles.get(RECEIPT), publishedIndexBytes: publishedFiles.get(INDEX), candidateFiles: files, now, policy });
  const expected = new Set([...gitState.candidateStatic.keys(), ...Object.keys(result.receipt.hashes), RECEIPT]);
  equal([...files.keys()].sort(), [...expected].sort(), 'artifact files added/removed');
  for (const [p, bytes] of gitState.candidateStatic) check(files.get(p).equals(bytes), 'artifact runtime bytes changed: ' + p);
  return { files, receipt: result.receipt, manifest: Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)).map(([p, b]) => [p, hash(b)])) };
}
export function assertUnchanged({ mainSha, receiptBytes, initialReceiptBytes, policy = POLICY }) {
  check(mainSha === policy.expectedMainSha, 'main changed/unexpected');
  check(Buffer.isBuffer(receiptBytes) && Buffer.isBuffer(initialReceiptBytes) && receiptBytes.equals(initialReceiptBytes), 'published receipt changed before deploy');
  check(hash(receiptBytes) === policy.publishedReceiptHash, 'published receipt corrupt before deploy');
}
// The official GNU command packages a private materialization of verified buffers.
// The resulting archive is independently inspected before it can be sealed.
export function sealMetadata(result, archiveSha256, policy = POLICY) {
  return { schema: 'CT_TONY_AUTHORIZED_SEAL_V1', baselineSha: policy.baselineSha,
    historicalSupportSha: policy.historicalSupportSha, historicalSupportTreeSha: policy.historicalSupportTreeSha,
    validationSupportSha: policy.validationSupportSha, validationSupportTreeSha: policy.validationSupportTreeSha,
    candidateSha: policy.candidateSha, publishedSiteSha: policy.publishedSiteSha,
    candidateTreeSha: policy.candidateTreeSha, titleSha256: policy.candidateTitleHash, coverSha256: policy.candidateCoverHash,
    publishedArtifactId: policy.publishedArtifactId, publishedArtifactSha256: policy.publishedArtifactSha256,
    publishedStaticManifestHash: policy.publishedStaticManifestHash,
    archiveSha256, files: result.manifest, receipt: result.receipt };
}

export function sealStage(options) {
  const result = verifyStage(options), archive = packVerifiedFiles(result.files);
  return { archive, seal: sealMetadata(result, hash(archive), options.policy || POLICY) };
}

// Keep the reviewed source/test changes in Git, but do not deploy support-file changes.
// Every restoration requires the exact reviewed candidate bytes before mutation.
export function restorePublishedSupport({ repo, stage, policy = POLICY }) {
  const state = verifyGit(repo, policy), files = readTree(stage);
  for (const p of RESTORE_SUPPORT) {
    const source = fs.readFileSync(path.join(repo, p));
    if (omitted(p)) check(!files.has(p), 'omitted support leaked into stage: ' + p);
    else check(files.has(p) && files.get(p).equals(source), 'support staging bytes unexpected: ' + p);
  }
  for (const p of RESTORE_SUPPORT.filter(p => !omitted(p))) {
    const target = path.join(stage, p);
    if (state.baselineStatic.has(p)) fs.writeFileSync(target, state.baselineStatic.get(p));
    else fs.unlinkSync(target);
  }
  return { restored: RESTORE_SUPPORT.filter(p => !omitted(p)).length };
}

// Missing pins fail closed before filesystem/network work. Manifest is extracted
// and reviewed from the attributed last successful artifact, never guessed from main.
export function validatePins(policy = POLICY) {
  for (const key of ['baselineSha','baselineTreeSha','publishedSiteSha','publishedSiteTreeSha','historicalSupportSha','historicalSupportTreeSha','validationSupportSha','validationSupportTreeSha','candidateSha','candidateTreeSha','expectedMainSha']) check(typeof policy[key] === 'string' && SHA.test(policy[key]), 'pending/invalid pin: ' + key);
  for (const key of ['baselineTitleHash','candidateTitleHash','candidateCoverHash','publishedReceiptHash','publishedRevision','candidateRevision','publishedArtifactSha256','publishedStaticManifestHash']) check(typeof policy[key] === 'string' && HEX.test(policy[key]), 'pending/invalid pin: ' + key);
  check(Number.isSafeInteger(policy.publishedArtifactId) && policy.publishedArtifactId > 0, 'pending/invalid artifact ID');
  check(Number.isSafeInteger(policy.candidateCoverBytes) && policy.candidateCoverBytes >= 24, 'invalid cover size');
  check(object(policy.publishedStaticManifest) && Object.keys(policy.publishedStaticManifest).length > 0, 'pending static manifest');
  for (const [p,h] of Object.entries(policy.publishedStaticManifest)) { safePath(p); check(!derived(p) && !omitted(p) && HEX.test(h), 'invalid static manifest entry'); }
  check(hash(Buffer.from(canonical(policy.publishedStaticManifest))) === policy.publishedStaticManifestHash, 'static manifest authentication failed');
  return policy;
}
