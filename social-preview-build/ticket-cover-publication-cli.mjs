// REVIEW DRAFT. Network commands run ONLY from the explicitly gated CLI below.
// Remote reads are fixed-origin static files and GitHub metadata, never backend.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  POLICY, CRITICAL_RUNTIME, INDEX, RECEIPT, hash, safePath, verifyGit, readTree,
  authenticatePublished, comparePublishedTree, assertUnchanged, compareDerivatives, sealStage, verifyStage, sealMetadata,
} from './ticket-cover-publication-guard.mjs';
import { inspectArchive, readArchive, readSeal } from './official-pages-archive.mjs';

const ORIGIN = 'https://cariocaticket.com.br';
const REPOSITORY = 'tudoparasuafestape-dot/carioca-ticket-site';
const API = 'https://api.github.com/repos/' + REPOSITORY;
const fail = message => { throw new Error('CT_COVER_ONLY_DENIED: ' + message); };
const check = (ok, message) => { if (!ok) fail(message); };
export function validateExecution(env = process.env, policy = POLICY) {
  check(env.CT_APPROVED_COVER_ONLY_PUBLICATION === '1', 'explicit approved publication context missing');
  check(env.CT_COVER_ONLY === 'true' && !env.CT_INITIAL_RECEIPT_404 && !env.FIRST_PUBLICATION,
    'ticket-cover required; init/skip/fallback forbidden');
  check(env.GITHUB_REPOSITORY === REPOSITORY && env.GITHUB_REF === policy.executionRef, 'execution repository/ref not approved');
  check(/^[a-f0-9]{40}$/.test(env.CT_EXPECTED_GUARD_SHA || '') && env.GITHUB_SHA === env.CT_EXPECTED_GUARD_SHA,
    'guard execution SHA unexpected');
}
export function publicationPolicy(env = process.env) {
  // The site is the authorized cover site commit, whose WHOLE tree remains pinned to
  // reviewed two-file cover change. Main/this workflow execute at the separately approved guard
  // commit. These distinct identities must never be substituted for each other.
  check(/^[a-f0-9]{40}$/.test(env.CT_EXPECTED_SITE_SHA || ''), 'authorized site SHA still pending');
  check(/^[a-f0-9]{40}$/.test(env.CT_EXPECTED_GUARD_SHA || ''), 'approved guard SHA still pending');
  return { ...POLICY, candidateSha: env.CT_EXPECTED_SITE_SHA, expectedMainSha: env.CT_EXPECTED_GUARD_SHA };
}
async function bytesFrom(response, limit) {
  check(response && response.status === 200 && !response.redirected, 'HTTP status/redirect denied');
  const declared = response.headers.get('content-length');
  check(!declared || /^\d+$/.test(declared) && Number(declared) <= limit, 'HTTP size exceeds limit');
  check(response.body, 'HTTP body missing');
  const chunks = []; let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length; check(total <= limit, 'HTTP body exceeds limit'); chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
export async function readStatic(relative, { fetchImpl = fetch, nonce = Date.now() } = {}) {
  safePath(relative);
  const url = new URL(relative, ORIGIN + '/');
  url.searchParams.set('ct_cover_guard', String(nonce));
  check(url.origin === ORIGIN, 'static origin escaped');
  return bytesFrom(await fetchImpl(url.href, { method: 'GET', redirect: 'error', cache: 'no-store',
    signal: AbortSignal.timeout(30000), headers: { 'cache-control': 'no-cache', accept: 'application/octet-stream' } }), 64 * 1024 * 1024);
}
async function readGithub(suffix, { token, fetchImpl = fetch }) {
  check(typeof token === 'string' && token.length > 0, 'GitHub read token missing');
  const bytes = await bytesFrom(await fetchImpl(API + suffix, { method: 'GET', redirect: 'error',
    signal: AbortSignal.timeout(30000), headers: { authorization: 'Bearer ' + token,
      accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'cache-control': 'no-cache' } }), 4 * 1024 * 1024);
  try { return JSON.parse(bytes.toString('utf8')); } catch { fail('invalid GitHub response'); }
}
export async function readPublicationState({ token, fetchImpl = fetch, policy = POLICY }) {
  const main = await readGithub('/git/ref/heads/main', { token, fetchImpl });
  check(main.ref === 'refs/heads/main' && main.object?.type === 'commit' && main.object.sha === policy.expectedMainSha, 'main changed/unexpected');
  check(Array.isArray(policy.publisherAnchors) && policy.publisherAnchors.map(a => a.workflow).join(',') ===
    'ct-pages-publication.yml,ct-title-only-publication.yml,ct-ticket-cover-only-publication.yml', 'publisher anchors missing/duplicated/unexpected');
  const observed = [];
  for (const anchor of policy.publisherAnchors) {
    check(['ct-pages-publication.yml', 'ct-title-only-publication.yml', 'ct-ticket-cover-only-publication.yml'].includes(anchor.workflow), 'publisher workflow unexpected');
    const runs = await readGithub('/actions/workflows/' + anchor.workflow + '/runs?status=success&per_page=1', { token, fetchImpl });
    check(Array.isArray(runs.workflow_runs), 'publication run list missing');
    const latest = runs.workflow_runs[0];
    if (anchor.runId === null) check(runs.workflow_runs.length === 0 && runs.total_count === 0, 'cover publisher already ran successfully');
    else check(latest?.id === anchor.runId && latest.head_sha === anchor.headSha && latest.status === 'completed' &&
      latest.conclusion === 'success' && latest.path === '.github/workflows/' + anchor.workflow && latest.event === 'workflow_dispatch',
      'last successful publication baseline changed/unknown: ' + anchor.workflow);
    observed.push({ workflow: anchor.workflow, runId: latest?.id ?? null });
  }
  const finalMain = await readGithub('/git/ref/heads/main', { token, fetchImpl });
  check(finalMain.ref === 'refs/heads/main' && finalMain.object?.type === 'commit' && finalMain.object.sha === main.object.sha, 'main changed during publisher checks');
  return { mainSha: main.object.sha, publicationRunId: policy.baselinePublicationRunId, publishers: observed };
}
function newDirectory(destination) {
  const resolved = path.resolve(destination), parent = path.dirname(resolved);
  check(fs.realpathSync(parent) === parent && !fs.existsSync(resolved), 'destination must be new and outside symlink');
  fs.mkdirSync(resolved, { mode: 0o700 }); return resolved;
}
function newFile(file, bytes, mode = 0o400) {
  const resolved = path.resolve(file), parent = path.dirname(resolved);
  check(fs.realpathSync(parent) === parent, 'output ancestor symlink');
  const fd = fs.openSync(resolved, 'wx', mode);
  try {
    fs.writeFileSync(fd, bytes);
    // Normalize transport metadata despite umask, without reopening the path.
    fs.fchmodSync(fd, mode);
  } finally { fs.closeSync(fd); }
}
export async function capturePublished({ repo, published, token, fetchImpl = fetch, policy = POLICY }) {
  const gitState = verifyGit(repo, policy);
  const initial = await readPublicationState({ token, fetchImpl, policy });
  const receiptBytes = await readStatic(RECEIPT, { fetchImpl });
  const indexBytes = await readStatic(INDEX, { fetchImpl });
  const { receipt } = authenticatePublished(receiptBytes, indexBytes, policy);
  const files = new Map([[RECEIPT, receiptBytes], [INDEX, indexBytes]]);
  for (const p of [...new Set([...CRITICAL_RUNTIME, ...Object.keys(receipt.hashes)])]) {
    if (!files.has(p)) files.set(p, await readStatic(p, { fetchImpl }));
  }
  comparePublishedTree(files, gitState, policy);
  const end = await readPublicationState({ token, fetchImpl, policy });
  assertUnchanged({ ...end, receiptBytes: await readStatic(RECEIPT, { fetchImpl }), initialReceiptBytes: receiptBytes, policy });
  const output = newDirectory(published);
  for (const [p, bytes] of files) {
    const file = path.join(output, p); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o400 });
  }
  return { ...initial, observedFiles: files.size, receiptSha256: hash(receiptBytes) };
}
export function writeSeal({ repo, stage, published, archive, seal, now = Date.now(), policy = POLICY }) {
  check(path.resolve(archive) !== path.resolve(seal), 'archive/seal path collision');
  const result = sealStage({ repo, stage, published, now, policy });
  // Pages transport follows the official action's regular 0644 TAR. Integrity
  // remains bound to the sealed SHA-256 and the final same-file recheck.
  newFile(archive, result.archive, 0o644); newFile(seal, JSON.stringify(result.seal, null, 2) + '\n');
  return { archiveSha256: result.seal.archiveSha256, files: Object.keys(result.seal.files).length };
}
export async function recheckBeforeDeploy({ repo, stage, published, archive, seal, token, fetchImpl = fetch, clock = Date.now, policy = POLICY }) {
  const recordBytes = readSeal(seal), record = JSON.parse(recordBytes);
  check(record.schema === 'CT_COVER_ONLY_SEAL_V1' && record.baselineSha === policy.baselineSha && record.candidateSha === policy.candidateSha,
    'seal identity changed');
  const archiveBytes = readArchive(archive, { requiredMode: 0o644 });
  check(hash(archiveBytes) === record.archiveSha256, 'sealed archive changed');
  // No tar process or repackaging here. Inspect this same sealed file against
  // freshly verified Git/runtime/catalog bytes; metadata may be nondeterministic.
  const result = verifyStage({ repo, stage, published, now: clock(), policy });
  const inspected = inspectArchive(archiveBytes, result.files);
  const expectedSeal = sealMetadata(result, inspected.archiveSha256, policy);
  check(JSON.stringify(expectedSeal) === JSON.stringify(record), 'stage/seal changed');
  const initialFiles = readTree(published);
  // Last remote operations immediately precede the deploy step. Locking every
  // publisher is still required; these reads are not an atomic compare-and-swap.
  const state = await readPublicationState({ token, fetchImpl, policy });
  const current = await readStatic(RECEIPT, { fetchImpl });
  assertUnchanged({ ...state, receiptBytes: current, initialReceiptBytes: initialFiles.get(RECEIPT), policy });
  check(hash(readArchive(archive, { requiredMode: 0o644 })) === record.archiveSha256, 'archive changed during remote checks');
  check(readSeal(seal).equals(recordBytes), 'seal changed during remote checks');
  const finalFiles = readTree(stage);
  const finalManifest = Object.fromEntries([...finalFiles].sort(([a], [b]) => a.localeCompare(b)).map(([p, b]) => [p, hash(b)]));
  check(JSON.stringify(finalManifest) === JSON.stringify(result.manifest), 'stage changed during remote checks');
  compareDerivatives({ publishedReceiptBytes: current, publishedIndexBytes: initialFiles.get(INDEX), candidateFiles: finalFiles, now: clock(), policy });
  return { verified: true, archiveSha256: record.archiveSha256 };
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  validateExecution();
  const [command, repo, published, stage, archive, seal, ...extra] = process.argv.slice(2);
  check(repo && published && !extra.length, 'usage COMMAND REPO PUBLISHED [STAGE ARCHIVE SEAL]');
  const opts = { repo, published, stage, archive, seal, token: process.env.GITHUB_TOKEN, policy: publicationPolicy() };
  let result;
  if (command === 'capture' && !stage && !archive && !seal) result = await capturePublished(opts);
  else if (command === 'seal' && stage && archive && seal) result = writeSeal(opts);
  else if (command === 'recheck' && stage && archive && seal) result = await recheckBeforeDeploy(opts);
  else fail('unknown command/arguments; no fallback');
  console.log(JSON.stringify(result));
}
