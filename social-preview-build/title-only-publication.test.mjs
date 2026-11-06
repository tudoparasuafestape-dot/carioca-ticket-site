import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  POLICY, CRITICAL_RUNTIME, INDEX, RECEIPT, TITLE, hash, readTree, verifyGit,
  authenticatePublished, compareDerivatives, verifyStage, assertUnchanged, sealStage,
} from './title-only-publication-guard.mjs';
import {
  validateExecution, publicationPolicy, capturePublished, writeSeal, recheckBeforeDeploy,
} from './title-only-publication-cli.mjs';

const NOW = Date.parse('2026-11-06T22:30:00.000Z');
const iso = ms => new Date(ms).toISOString();
const bytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const put = (root, relative, content) => { const p = path.join(root, relative); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); };
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-title-guard-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repo = path.join(dir, 'repo'), stage = path.join(dir, 'stage'), published = path.join(dir, 'published');
  for (const p of [repo, stage, published]) fs.mkdirSync(p);
  const baseline = new Map(CRITICAL_RUNTIME.map(p => [p, Buffer.from('UNCHANGED BASE ' + p)]));
  baseline.set('assets/runtime.js', Buffer.from('window.noCheckoutChange = true;'));
  baseline.set('tests/ticket-language.dom.cjs', Buffer.from('old DOM test'));
  baseline.set('tests/ticket-language.browser.cjs', Buffer.from('old browser test'));
  baseline.set('.gitignore', Buffer.from('node_modules\n'));
  const baselineTitleHash = hash(baseline.get(TITLE));
  for (const [p, b] of baseline) put(repo, p, b);
  put(repo, '.github/workflows/ct-pages-publication.yml', 'GUARD EXCLUDED');
  put(repo, 'social-preview-build/existing-builder.mjs', 'BUILDER EXCLUDED');
  git(repo, 'init', '-q'); git(repo, 'config', 'user.email', 'fixture@example.invalid'); git(repo, 'config', 'user.name', 'Offline fixture');
  git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'baseline'); const baselineSha = git(repo, 'rev-parse', 'HEAD');
  const candidate = new Map(baseline);
  candidate.set(TITLE, Buffer.from('REVIEWED TITLE ONLY'));
  candidate.set('tests/ticket-language.dom.cjs', Buffer.from('reviewed DOM test'));
  candidate.set('tests/ticket-language.browser.cjs', Buffer.from('reviewed browser test'));
  for (const [p, b] of candidate) put(repo, p, b);
  git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'reviewed title candidate');
  const candidateSha = git(repo, 'rev-parse', 'HEAD'), candidateTreeSha = git(repo, 'rev-parse', 'HEAD^{tree}');
  const revision = hash(Buffer.from('UNCHANGED CATALOG'));
  const imageBytes = Buffer.from('synthetic JPG bytes; no real event data'), image = 'assets/social-previews/' + hash(imageBytes) + '.jpg';
  const page = 'compartilhar/EVT-FIXTURE/index.html', pageBytes = Buffer.from('<title>OFFLINE SYNTHETIC EVENT</title>');
  const oldTime = '2026-11-02T17:57:16.203Z';
  const index = { schema: 'CT_PUBLISHED_SHARE_INDEX_V1', revision, generatedAt: oldTime,
    fallbacks: [{ eventId: 'EVT-LEGACY', detailUrl: 'https://cariocaticket.com.br/evento/?evento=EVT-LEGACY', reason: 'NO_VERIFIABLE_END' }],
    entries: [{ eventId: 'EVT-FIXTURE', sharePath: '/compartilhar/EVT-FIXTURE/', detailUrl: 'https://cariocaticket.com.br/evento/?evento=EVT-FIXTURE', endsAt: '2026-12-01T00:00:00.000Z' }] };
  const previous = { schema: 'CT_TRUSTED_BUILD_LAB_V1', mode: 'TRUSTED_HTTP_CURRENT397_NOT_SIGNED242', status: 'LOCAL_NOT_PUBLISHED', revision,
    sourceServerNow: oldTime, sourceValidUntil: '2026-11-02T18:02:16.203Z', excluded: [{ eventId: 'EVT-LEGACY', reason: 'NO_VERIFIABLE_END' }],
    hashes: { [page]: hash(pageBytes), [image]: hash(imageBytes), [INDEX]: hash(bytes(index)) } };
  for (const p of CRITICAL_RUNTIME) put(published, p, baseline.get(p));
  for (const [p, b] of [[page, pageBytes], [image, imageBytes], [INDEX, bytes(index)], [RECEIPT, bytes(previous)]]) put(published, p, b);
  const currentIndex = { ...index, generatedAt: iso(NOW) };
  const current = { ...previous, sourceServerNow: iso(NOW), sourceValidUntil: iso(NOW + 120000), hashes: { ...previous.hashes, [INDEX]: hash(bytes(currentIndex)) } };
  for (const [p, b] of candidate) put(stage, p, b);
  for (const [p, b] of [[page, pageBytes], [image, imageBytes], [INDEX, bytes(currentIndex)], [RECEIPT, bytes(current)]]) put(stage, p, b);
  const policy = { ...POLICY, baselineSha, candidateSha, candidateTreeSha, expectedMainSha: candidateSha,
    baselineTitleHash, candidateTitleHash: hash(candidate.get(TITLE)), publishedReceiptHash: hash(bytes(previous)),
    publishedRevision: revision, publishedServerNow: oldTime, baselinePublicationRunId: 123 };
  const receipt = () => JSON.parse(fs.readFileSync(path.join(stage, RECEIPT)));
  const changeReceipt = fn => { const r = receipt(); fn(r); put(stage, RECEIPT, bytes(r)); };
  const changeIndex = fn => { const i = JSON.parse(fs.readFileSync(path.join(stage, INDEX))); fn(i); put(stage, INDEX, bytes(i)); changeReceipt(r => r.hashes[INDEX] = hash(bytes(i))); };
  const options = { repo, stage, published, policy, now: NOW };
  return { dir, repo, stage, published, policy, options, previous, current, image, page, receipt, changeReceipt, changeIndex };
}
const validate = f => verifyStage(f.options);
function mockedFetch(f, mutate = () => {}) {
  return async url => {
    mutate(String(url));
    const u = new URL(url);
    if (u.hostname === 'api.github.com') {
      if (u.pathname.endsWith('/git/ref/heads/main')) return new Response(JSON.stringify({ ref: 'refs/heads/main', object: { type: 'commit', sha: f.policy.expectedMainSha } }));
      if (u.pathname.endsWith('/runs')) return new Response(JSON.stringify({ workflow_runs: [{ id: f.policy.baselinePublicationRunId, head_sha: f.policy.baselineSha, status: 'completed', conclusion: 'success' }] }));
      throw Error('unexpected API URL ' + u.href);
    }
    assert.equal(u.origin, 'https://cariocaticket.com.br');
    assert.ok(!u.pathname.includes('script.google.com'));
    const file = path.join(f.published, u.pathname.slice(1));
    return fs.existsSync(file) ? new Response(fs.readFileSync(file)) : new Response('', { status: 404 });
  };
}

test('allow title-only with expected temporal metadata; expired old watermark is valid', t => {
  const f = fixture(t), result = validate(f);
  assert.equal(result.manifest[TITLE], f.policy.candidateTitleHash);
  assert.equal(result.manifest['checkout/index.html'], hash(fs.readFileSync(path.join(f.published, 'checkout/index.html'))));
  assert.equal(Object.keys(result.manifest).some(p => p.startsWith('social-preview-build/')), false);
});

const rejected = [
  ['catalog revision changed', f => f.changeReceipt(r => r.revision = 'a'.repeat(64)), /revision/],
  ['page added', f => { const p = 'compartilhar/NEW/index.html'; put(f.stage, p, 'new'); f.changeReceipt(r => r.hashes[p] = hash(Buffer.from('new'))); }, /inventory/],
  ['page removed', f => { fs.unlinkSync(path.join(f.stage, f.page)); f.changeReceipt(r => delete r.hashes[f.page]); }, /inventory/],
  ['JPG added', f => { const p = 'assets/social-previews/' + 'a'.repeat(64) + '.jpg'; put(f.stage, p, 'new'); f.changeReceipt(r => r.hashes[p] = hash(Buffer.from('new'))); }, /inventory/],
  ['JPG removed', f => { fs.unlinkSync(path.join(f.stage, f.image)); f.changeReceipt(r => delete r.hashes[f.image]); }, /inventory/],
  ['output absent despite receipt', f => fs.unlinkSync(path.join(f.stage, f.page)), /inventory/],
  ['unlisted output present', f => put(f.stage, 'compartilhar/EXTRA/index.html', 'extra'), /inventory/],
  ['page bytes tampered', f => put(f.stage, f.page, 'tampered'), /bytes\/hash/],
  ['JPG bytes tampered', f => put(f.stage, f.image, 'tampered'), /bytes\/hash/],
  ['page bytes and receipt hash changed together', f => { put(f.stage, f.page, 'tampered'); f.changeReceipt(r => r.hashes[f.page] = hash(Buffer.from('tampered'))); }, /derivative hash changed/],
  ['index bytes do not match candidate receipt', f => fs.appendFileSync(path.join(f.stage, INDEX), ' '), /bytes\/hash/],
  ['index semantic change beyond generatedAt', f => f.changeIndex(i => i.entries[0].detailUrl += '&changed=1'), /index changed/],
  ['index entries removed despite identical revision', f => f.changeIndex(i => i.entries = []), /index changed/],
  ['index unknown root key', f => f.changeIndex(i => i.unknown = true), /unknown\/missing/],
  ['excluded reason changed', f => f.changeReceipt(r => r.excluded[0].reason = 'ENDED'), /excluded changed/],
  ['excluded event added', f => f.changeReceipt(r => r.excluded.push({ eventId: 'NEW', reason: 'ENDED' })), /excluded changed/],
  ['excluded event removed', f => f.changeReceipt(r => r.excluded = []), /excluded changed/],
  ['candidate checkout SHA unexpected', f => f.policy.candidateSha = 'f'.repeat(40), /checkout SHA/],
  ['candidate tree unexpected', f => f.policy.candidateTreeSha = 'f'.repeat(40), /tree differs/],
  ['baseline title bytes unexpected', f => f.policy.baselineTitleHash = 'f'.repeat(64), /baseline title/],
  ['reviewed title bytes unexpected', f => f.policy.candidateTitleHash = 'f'.repeat(64), /candidate title/],
  ['checkout artifact changed', f => put(f.stage, 'checkout/index.html', 'payment logic changed'), /runtime bytes changed/],
  ['other runtime artifact changed', f => put(f.stage, 'assets/runtime.js', 'changed'), /runtime bytes changed/],
  ['title file broader change', f => put(f.stage, TITLE, 'unreviewed title'), /runtime bytes changed/],
  ['allowed test file broader change', f => put(f.stage, 'tests/ticket-language.dom.cjs', 'unreviewed test'), /runtime bytes changed/],
  ['runtime added', f => put(f.stage, 'unexpected.js', 'extra'), /files added\/removed/],
  ['runtime removed', f => fs.unlinkSync(path.join(f.stage, 'checkout/index.html')), /files added\/removed/],
  ['build-only guard leaked into runtime', f => put(f.stage, 'social-preview-build/guard.mjs', 'leaked'), /files added\/removed/],
  ['worktree changed', f => put(f.repo, 'checkout/index.html', 'dirty'), /dirty worktree/],
  ['worktree untracked file', f => put(f.repo, 'extra.txt', 'untracked'), /untracked/],
  ['published receipt changed/corrupt', f => fs.appendFileSync(path.join(f.published, RECEIPT), ' '), /receipt changed\/corrupted/],
  ['published index lacks authenticated hash', f => fs.appendFileSync(path.join(f.published, INDEX), ' '), /index unauthenticated/],
  ['published derivative bytes do not match receipt', f => put(f.published, f.page, 'changed'), /published output bytes\/hash/],
  ['published checkout differs from Git baseline', f => put(f.published, 'checkout/index.html', 'changed'), /published runtime/],
  ['candidate receipt invalid JSON', f => put(f.stage, RECEIPT, '{bad'), /invalid JSON/],
  ['candidate receipt initial deployment fallback', f => put(f.stage, RECEIPT, bytes({ schema: 'CT_FIRST_PUBLICATION_404_APPROVED' })), /unknown\/missing/],
  ['candidate receipt unknown schema', f => f.changeReceipt(r => r.schema = 'UNKNOWN'), /contract/],
  ['candidate freshness expired', f => f.options.now = NOW + 120001, /temporal validity/],
  ['candidate timestamp rollback', f => f.changeReceipt(r => r.sourceServerNow = '2026-11-01T00:00:00.000Z'), /rollback/],
  ['unsafe receipt path traversal', f => f.changeReceipt(r => r.hashes['../checkout/index.html'] = 'a'.repeat(64)), /unsafe path/],
  ['unsafe receipt absolute path', f => f.changeReceipt(r => r.hashes['/tmp/file'] = 'a'.repeat(64)), /unsafe path/],
  ['unsafe receipt encoded traversal', f => f.changeReceipt(r => r.hashes['compartilhar/%2e%2e/index.html'] = 'a'.repeat(64)), /unsafe path/],
  ['symlink file', f => { fs.unlinkSync(path.join(f.stage, f.page)); fs.symlinkSync(path.join(f.published, f.page), path.join(f.stage, f.page)); }, /symlink/],
  ['symlink directory', f => { fs.rmSync(path.join(f.stage, 'checkout'), { recursive: true }); fs.symlinkSync(path.join(f.published, 'checkout'), path.join(f.stage, 'checkout')); }, /symlink/],
  ['symlink root', f => { const alias = path.join(f.dir, 'alias'); fs.symlinkSync(f.stage, alias); f.options.stage = alias; }, /symlink/],
  ['hardlinked output', f => { fs.unlinkSync(path.join(f.stage, TITLE)); fs.linkSync(path.join(f.repo, TITLE), path.join(f.stage, TITLE)); }, /hardlink/],
];
for (const [name, mutate, expected] of rejected) test('deny ' + name, t => { const f = fixture(t); mutate(f); assert.throws(() => validate(f), expected); });

test('deny commit with extra checkout edit even if new SHA/tree supplied', t => {
  const f = fixture(t); put(f.repo, 'checkout/index.html', 'unapproved'); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-qm', 'unapproved');
  f.policy.candidateSha = git(f.repo, 'rev-parse', 'HEAD'); f.policy.candidateTreeSha = git(f.repo, 'rev-parse', 'HEAD^{tree}');
  assert.throws(() => validate(f), /diff outside/);
});
test('deny baseline SHA other than the actual approved base', t => {
  const f = fixture(t); f.policy.baselineSha = f.policy.candidateSha;
  assert.throws(() => validate(f), /diff outside/);
});
test('deny same revision when event expires, without assuming revision includes time', t => {
  const f = fixture(t), ended = iso(NOW - 1);
  const oldIndex = JSON.parse(fs.readFileSync(path.join(f.published, INDEX))); oldIndex.entries[0].endsAt = ended;
  const r = JSON.parse(fs.readFileSync(path.join(f.published, RECEIPT))); r.hashes[INDEX] = hash(bytes(oldIndex));
  put(f.published, INDEX, bytes(oldIndex)); put(f.published, RECEIPT, bytes(r)); f.policy.publishedReceiptHash = hash(bytes(r));
  f.changeIndex(i => i.entries[0].endsAt = ended);
  assert.throws(() => validate(f), /event expired/);
});
test('allow excluded reordering only by identity+reason', t => {
  const f = fixture(t), r = JSON.parse(fs.readFileSync(path.join(f.published, RECEIPT)));
  r.excluded.push({ eventId: 'EVT-OTHER', reason: 'ENDED' }); put(f.published, RECEIPT, bytes(r)); f.policy.publishedReceiptHash = hash(bytes(r));
  f.changeReceipt(c => c.excluded = [...r.excluded].reverse()); assert.doesNotThrow(() => validate(f));
});
test('archive is reproducible and GNU tar extracts exactly verified files', t => {
  const f = fixture(t), result = sealStage(f.options), tar = path.join(f.dir, 'artifact.tar'), unpacked = path.join(f.dir, 'unpacked');
  assert.deepEqual(result.archive, sealStage(f.options).archive); fs.writeFileSync(tar, result.archive); fs.mkdirSync(unpacked);
  execFileSync('tar', ['-xf', tar, '-C', unpacked]); const extracted = readTree(unpacked), expected = readTree(f.stage);
  assert.deepEqual([...extracted.keys()].sort(), [...expected.keys()].sort());
  for (const [p, b] of expected) assert.deepEqual(extracted.get(p), b);
});
test('predeploy main/receipt checks reject concurrent changes and corruption', t => {
  const f = fixture(t), b = fs.readFileSync(path.join(f.published, RECEIPT));
  const opts = { mainSha: f.policy.expectedMainSha, receiptBytes: b, initialReceiptBytes: b, policy: f.policy };
  assert.doesNotThrow(() => assertUnchanged(opts));
  assert.throws(() => assertUnchanged({ ...opts, mainSha: f.policy.baselineSha }), /main changed/);
  assert.throws(() => assertUnchanged({ ...opts, receiptBytes: Buffer.concat([b, Buffer.from(' ')]) }), /receipt changed/);
});
test('execution gate rejects wrong ref, SHA, disabled title-only, initialization and pending merge', () => {
  const env = { CT_APPROVED_TITLE_ONLY_PUBLICATION: '1', CT_TITLE_ONLY: 'true', GITHUB_REPOSITORY: 'tudoparasuafestape-dot/carioca-ticket-site',
    GITHUB_REF: POLICY.executionRef, GITHUB_SHA: 'a'.repeat(40), CT_EXPECTED_GUARD_SHA: 'a'.repeat(40), CT_EXPECTED_MERGE_SHA: 'b'.repeat(40) };
  assert.doesNotThrow(() => validateExecution(env));
  for (const patch of [{ GITHUB_REF: 'refs/heads/candidate/title-only-publication-guard-20261106' }, { GITHUB_SHA: 'b'.repeat(40) }, { CT_TITLE_ONLY: 'false' },
    { CT_INITIAL_RECEIPT_404: '1' }, { FIRST_PUBLICATION: 'true' }, { CT_APPROVED_TITLE_ONLY_PUBLICATION: '' }]) assert.throws(() => validateExecution({ ...env, ...patch }));
  assert.throws(() => publicationPolicy({}), /merge SHA still pending/);
  assert.equal(publicationPolicy(env).expectedMainSha, env.CT_EXPECTED_GUARD_SHA);
  assert.equal(publicationPolicy(env).candidateSha, env.CT_EXPECTED_MERGE_SHA);
  assert.notEqual(publicationPolicy(env).expectedMainSha, publicationPolicy(env).candidateSha);
  assert.equal(publicationPolicy(env).candidateTreeSha, POLICY.candidateTreeSha);
});
test('offline HTTP capture authenticates exactly critical static/derived outputs, never backend', async t => {
  const f = fixture(t), output = path.join(f.dir, 'capture'), urls = [];
  const result = await capturePublished({ repo: f.repo, published: output, token: 'synthetic-test-token', fetchImpl: mockedFetch(f, u => urls.push(u)), policy: f.policy });
  assert.equal(result.observedFiles, readTree(f.published).size);
  assert.deepEqual(readTree(output), readTree(f.published));
  assert.ok(urls.every(u => new URL(u).hostname === 'api.github.com' || new URL(u).hostname === 'cariocaticket.com.br'));
});
test('offline HTTP 404 does not initialize receipt or create capture', async t => {
  const f = fixture(t), output = path.join(f.dir, 'capture'), baseFetch = mockedFetch(f);
  await assert.rejects(capturePublished({ repo: f.repo, published: output, token: 'fixture', policy: f.policy,
    fetchImpl: u => String(u).includes('/assets/social-publication-receipt.json') ? Promise.resolve(new Response('', { status: 404 })) : baseFetch(u) }), /HTTP status/);
  assert.equal(fs.existsSync(output), false);
});
test('offline final recheck passes unchanged sealed tar, rejects owner-writable archive tampering', async t => {
  const f = fixture(t), archive = path.join(f.dir, 'artifact.tar'), seal = path.join(f.dir, 'seal.json');
  writeSeal({ ...f.options, archive, seal });
  const opts = { ...f.options, archive, seal, token: 'fixture', fetchImpl: mockedFetch(f), clock: () => NOW };
  assert.equal((await recheckBeforeDeploy(opts)).verified, true);
  assert.equal(fs.statSync(archive).mode & 0o777, 0o644);
  fs.appendFileSync(archive, 'tamper'); await assert.rejects(recheckBeforeDeploy(opts), /archive changed/);
});
test('final clock is sampled AFTER remote awaits, rejects elapsed validity', async t => {
  const f = fixture(t), archive = path.join(f.dir, 'artifact.tar'), seal = path.join(f.dir, 'seal.json');
  writeSeal({ ...f.options, archive, seal }); let clock = NOW;
  await assert.rejects(recheckBeforeDeploy({ ...f.options, archive, seal, token: 'fixture', clock: () => clock,
    fetchImpl: mockedFetch(f, u => { if (u.includes('/assets/social-publication-receipt.json')) clock = NOW + 120001; }) }), /temporal validity/);
});
test('main variant requires both identities and keeps the reviewed site tree fixed', () => {
  assert.equal(POLICY.executionRef, 'refs/heads/main');
  assert.throws(() => publicationPolicy({ CT_EXPECTED_MERGE_SHA: 'b'.repeat(40) }), /guard SHA still pending/);
  assert.throws(() => publicationPolicy({ CT_EXPECTED_GUARD_SHA: 'a'.repeat(40) }), /merge SHA still pending/);
  const policy = publicationPolicy({ CT_EXPECTED_GUARD_SHA: 'a'.repeat(40), CT_EXPECTED_MERGE_SHA: 'b'.repeat(40) });
  assert.equal(policy.expectedMainSha, 'a'.repeat(40));
  assert.equal(policy.candidateSha, 'b'.repeat(40));
  assert.equal(policy.candidateTreeSha, 'c53275edf9495faa71aa97b7b09e934d5678aee8');
});
test('allow main at guard SHA while site stays at the exact title tree', async t => {
  const f = fixture(t), output = path.join(f.dir, 'captured-main-variant');
  f.policy.expectedMainSha = 'd'.repeat(40);
  assert.notEqual(f.policy.expectedMainSha, f.policy.candidateSha);
  const result = await capturePublished({ repo: f.repo, published: output, token: 'fixture', fetchImpl: mockedFetch(f), policy: f.policy });
  assert.equal(result.mainSha, f.policy.expectedMainSha);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), f.policy.candidateSha);
  const archive = path.join(f.dir, 'artifact.tar'), seal = path.join(f.dir, 'seal.json');
  writeSeal({ ...f.options, archive, seal });
  assert.equal((await recheckBeforeDeploy({ ...f.options, archive, seal, token: 'fixture', fetchImpl: mockedFetch(f), clock: () => NOW })).verified, true);
  assert.equal(JSON.parse(fs.readFileSync(seal)).candidateSha, f.policy.candidateSha);
});
test('deny substituting site SHA for main guard SHA at predeploy check', async t => {
  const f = fixture(t); f.policy.expectedMainSha = 'd'.repeat(40);
  const archive = path.join(f.dir, 'artifact.tar'), seal = path.join(f.dir, 'seal.json');
  writeSeal({ ...f.options, archive, seal });
  const baseFetch = mockedFetch(f);
  const fetchImpl = async url => new URL(url).pathname.endsWith('/git/ref/heads/main')
    ? new Response(JSON.stringify({ ref: 'refs/heads/main', object: { type: 'commit', sha: f.policy.candidateSha } }))
    : baseFetch(url);
  await assert.rejects(recheckBeforeDeploy({ ...f.options, archive, seal, token: 'fixture', fetchImpl, clock: () => NOW }), /main changed/);
});
test('external TAR is 0644, seal stays 0400, payload/hash and same-file recheck stay identical', async t => {
  const f = fixture(t), archive = path.join(f.dir, 'artifact.tar'), seal = path.join(f.dir, 'seal.json');
  const expected = sealStage(f.options);
  const written = writeSeal({ ...f.options, archive, seal });
  assert.equal(fs.statSync(archive).mode & 0o777, 0o644);
  assert.equal(fs.statSync(seal).mode & 0o777, 0o400);
  assert.deepEqual(fs.readFileSync(archive), expected.archive);
  assert.equal(written.archiveSha256, expected.seal.archiveSha256);
  assert.equal(hash(fs.readFileSync(archive)), JSON.parse(fs.readFileSync(seal)).archiveSha256);
  const before = fs.statSync(archive);
  await recheckBeforeDeploy({ ...f.options, archive, seal, token: 'fixture', fetchImpl: mockedFetch(f), clock: () => NOW });
  const after = fs.statSync(archive);
  assert.equal(after.ino, before.ino); assert.equal(after.mtimeMs, before.mtimeMs);
  assert.deepEqual(fs.readFileSync(archive), expected.archive);
  assert.throws(() => writeSeal({ ...f.options, archive, seal }), /EEXIST/);
});
test('explicit transport/receipt modes survive a restrictive umask', t => {
  const f = fixture(t), archive = path.join(f.dir, 'artifact.tar'), seal = path.join(f.dir, 'seal.json');
  const previous = process.umask(0o077);
  try { writeSeal({ ...f.options, archive, seal }); } finally { process.umask(previous); }
  assert.equal(fs.statSync(archive).mode & 0o777, 0o644);
  assert.equal(fs.statSync(seal).mode & 0o777, 0o400);
});
test('ZIP transport records 0644 for TAR and preserves every payload byte', t => {
  const f = fixture(t), archive = path.join(f.dir, 'artifact.tar'), seal = path.join(f.dir, 'seal.json');
  writeSeal({ ...f.options, archive, seal });
  const script = "import sys,zipfile,hashlib,json; a,z=sys.argv[1:]; w=zipfile.ZipFile(z,'w'); w.write(a,'artifact.tar'); w.close(); r=zipfile.ZipFile(z); i=r.getinfo('artifact.tar'); print(json.dumps({'mode':(i.external_attr>>16)&0o777,'sha256':hashlib.sha256(r.read(i)).hexdigest()})); r.close()";
  const zipped = JSON.parse(execFileSync('python3', ['-c', script, archive, path.join(f.dir, 'artifact.zip')], { encoding: 'utf8' }));
  assert.equal(zipped.mode, 0o644);
  assert.equal(zipped.sha256, hash(fs.readFileSync(archive)));
});
