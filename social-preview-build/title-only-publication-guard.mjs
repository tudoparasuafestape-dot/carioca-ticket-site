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
export const POLICY = Object.freeze({
  baselineSha: '011a1a7f50aa637d0797f5d875b67c50e3bffba4',
  candidateSha: '94012a21105b88e0ab56546a086885c789a5295a',
  reviewedCandidateSha: '94012a21105b88e0ab56546a086885c789a5295a',
  candidateTreeSha: 'c53275edf9495faa71aa97b7b09e934d5678aee8',
  expectedMainSha: 'PENDING_APPROVED_GUARD_SHA',
  baselinePublicationRunId: 41495873659,
  baselineTitleHash: 'a22c20c4bfa2149dd17e11af9e6a09d3089f8e7913e4dba23d11900b3c541c64',
  candidateTitleHash: 'd5bcaa92bcea146d911c6b972a991629f73254fff62607708b22000e03cd361f',
  publishedReceiptHash: '3959290f2ce8783be5e6441f36270cf5268b2dc1caa515225f598a644fa8863a',
  publishedRevision: '3b562007b1d295c57ff7e7b117346892144e88ddf4c567693d8f5ce19bddba1d',
  publishedServerNow: '2026-11-02T17:57:16.203Z',
  executionRef: 'refs/heads/main',
});
export const CRITICAL_RUNTIME = Object.freeze(['checkout/index.html', 'checkout-v2/index.html', 'ingresso/index.html', 'index.html', 'evento/index.html']);
const CHANGES = [TITLE, 'tests/ticket-language.browser.cjs', 'tests/ticket-language.dom.cjs'].sort();
const OMIT = new Set(['.git', '.github', 'node_modules', 'social-preview-build']);
const HEX = /^[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,219}$/;
const MAX_BYTES = 256 * 1024 * 1024;
export const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error('CT_TITLE_ONLY_DENIED: ' + message); };
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
  check(receipt.revision === previous.receipt.revision, 'catalog revision changed');
  check(instant(receipt.sourceServerNow, 'candidate serverNow') >= instant(previous.receipt.sourceServerNow, 'published serverNow'), 'watermark rollback');
  check(Number.isFinite(now) && Date.parse(receipt.sourceServerNow) <= now + 60000 && now - Date.parse(receipt.sourceServerNow) <= 60000 &&
    Date.parse(receipt.sourceValidUntil) > now && Date.parse(receipt.sourceValidUntil) - Date.parse(receipt.sourceServerNow) <= 300000,
    'candidate temporal validity expired/incoherent');
  const sortedExcluded = r => [...r.excluded].sort((a, b) => a.eventId.localeCompare(b.eventId));
  equal(sortedExcluded(receipt), sortedExcluded(previous.receipt), 'excluded changed');
  equal(Object.keys(receipt.hashes).sort(), Object.keys(previous.receipt.hashes).sort(), 'derivative inventory changed');
  equal([...candidateFiles.keys()].filter(p => derived(p) && p !== RECEIPT).sort(), Object.keys(receipt.hashes).sort(), 'artifact derivative inventory mismatch');
  for (const [p, expected] of Object.entries(receipt.hashes)) {
    const bytes = candidateFiles.get(p);
    check(Buffer.isBuffer(bytes) && hash(bytes) === expected, 'candidate bytes/hash mismatch: ' + p);
    if (p !== INDEX) check(expected === previous.receipt.hashes[p], 'published derivative hash changed: ' + p);
  }
  const index = normalizedIndex(candidateFiles.get(INDEX), receipt);
  equal(index, previous.index, 'index changed beyond generatedAt');
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
  realDirectory(repo);
  check(git(repo, 'rev-parse', 'HEAD').toString().trim() === policy.candidateSha, 'candidate checkout SHA unexpected');
  check(git(repo, 'rev-parse', policy.candidateSha + '^{tree}').toString().trim() === policy.candidateTreeSha,
    'candidate tree differs from reviewed PR248');
  const base = gitTree(repo, policy.baselineSha), candidate = gitTree(repo, policy.candidateSha);
  check(git(repo, 'merge-base', policy.baselineSha, policy.candidateSha).toString().trim() === policy.baselineSha, 'baseline is not candidate ancestor');
  const changes = [...new Set([...base.keys(), ...candidate.keys()])].filter(p =>
    canonical(base.get(p)) !== canonical(candidate.get(p))).sort();
  equal(changes, CHANGES, 'git diff outside approved three files');
  for (const p of changes) check(base.has(p) && candidate.has(p) && base.get(p).mode === candidate.get(p).mode, 'addition/removal/mode change denied');
  const getBlob = entry => git(repo, 'cat-file', 'blob', entry.blob);
  check(hash(getBlob(base.get(TITLE))) === policy.baselineTitleHash, 'baseline title bytes unexpected');
  check(hash(getBlob(candidate.get(TITLE))) === policy.candidateTitleHash, 'candidate title bytes unexpected');
  const disk = readTree(repo, { skipGit: true });
  equal([...disk.keys()].sort(), [...candidate.keys()].sort(), 'untracked/missing worktree file');
  const baselineStatic = new Map(), candidateStatic = new Map();
  for (const [p, entry] of candidate) {
    const bytes = getBlob(entry);
    check(disk.get(p).equals(bytes), 'dirty worktree bytes: ' + p);
    if (!omitted(p) && !derived(p)) {
      candidateStatic.set(p, bytes);
      const original = getBlob(base.get(p));
      baselineStatic.set(p, original);
      if (!CHANGES.includes(p)) check(bytes.equals(original), 'runtime differs from baseline: ' + p);
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
  return { schema: 'CT_TITLE_ONLY_SEAL_V1', baselineSha: policy.baselineSha,
    candidateSha: policy.candidateSha, archiveSha256, files: result.manifest,
    receipt: result.receipt };
}
export function sealStage(options) {
  const result = verifyStage(options), archive = packVerifiedFiles(result.files);
  return { archive, seal: sealMetadata(result, hash(archive), options.policy || POLICY) };
}
