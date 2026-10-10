'use strict';
// One approved read of the public catalog. Never retry this run after submission.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ORIGIN = 'https://cariocaticket.com.br';
const APP = 'https://script.google.com/macros/s/AKfycbz28keO65PIIElB8dWMBt8nnEBw9CzBxWnc6nOhAKKGNDkMZnYbWjrhTtr_v-lEI2IAJA/exec';
const METHOD = 'ctEventosPublicosListarPROD';
const OUT = path.resolve('test-results/catalog-one-shot');
const exactFields = ['argsJson', 'ctMinhaCariocaAction', 'ctMinhaCariocaRequestId', 'metodo'];
function allowedCatalogPost(url, method, body, used) {
  if (used || url !== APP || method !== 'POST') return false;
  const params = new URLSearchParams(body || '');
  return JSON.stringify([...params.keys()].sort()) === JSON.stringify(exactFields) &&
    params.get('ctMinhaCariocaAction') === 'publicRpc' && params.get('metodo') === METHOD &&
    params.get('argsJson') === '[]' && /^CTCATALOG-[A-Za-z0-9-]+$/.test(params.get('ctMinhaCariocaRequestId') || '');
}
function publicHttps(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password &&
      !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(u.hostname);
  } catch (_) { return false; }
}
function allowedPostRedirect(status, location, base = APP) {
  if (status < 300 || status >= 400) return true;
  try {
    const destination = new URL(location || '', base);
    return [302,303].includes(status) && (destination.origin === 'https://script.google.com' ||
      /^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/.test(destination.origin));
  } catch (_) { return false; }
}
async function redirectPreflight(browser) {
  const http = require('node:http'); let posts = 0, redirectedPosts = 0;
  const server = http.createServer((req, res) => {
    if (req.method === 'POST') { posts++; if (req.url === '/target') redirectedPosts++; }
    if (req.url === '/post') { res.writeHead(307, { Location: '/target' }); return res.end(); }
    res.end('<!doctype html><form method="POST" action="/post"><button>Test</button></form>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    let finish; const intercepted = new Promise(resolve => { finish = resolve; });
    await context.route('**/*', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch({ maxRedirects: 0, maxRetries: 0 });
      assert.equal(response.status(), 307);
      assert.equal(allowedPostRedirect(response.status(), response.headers().location, origin), false);
      await route.abort(); finish();
    });
    await page.goto(origin);
    await page.locator('button').click({ noWaitAfter: true }); await intercepted;
    assert.equal(posts, 1); assert.equal(redirectedPosts, 0);
  } finally { await context.close(); await new Promise(resolve => server.close(resolve)); }
}
async function run() {
  assert.equal(process.env.CT_ALLOW_ONE_PUBLIC_CATALOG_READ, 'true');
  assert.equal(process.env.GITHUB_RUN_ATTEMPT, '1', 'No automatic/manual rerun may repeat the public read');
  assert.equal(process.env.GITHUB_REF, 'refs/heads/diagnose/catalog-latency-20261010-once');
  const push = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  assert.equal(push.created, true, 'Only the one branch-creation event may run');
  assert.equal(push.before, '0000000000000000000000000000000000000000');
  fs.mkdirSync(OUT, { recursive: true });
  const report = { measuredAt: new Date().toISOString(), sourceSha: process.env.GITHUB_SHA,
    environment: 'GitHub Actions Chromium, fresh anonymous context, mobile viewport; not a physical phone',
    completed: false, rpcSubmissions: 0, rpcMethod: METHOD, otherPostsAllowed: 0,
    blockedRequests: 0, blockedPosts: 0, pageErrors: 0, externalCoverRequests: 0, homeNavigations: 0,
    responsePayloadSaved: false, analyticsEnabled: false, backendOnlyDurationMs: null };
  const save = () => fs.writeFileSync(path.join(OUT, 'timings.json'), JSON.stringify(report, null, 2));
  save();
  const { chromium } = require('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  report.browser = await browser.version();
  await redirectPreflight(browser); report.localRedirectPreflightPassed = true; save();
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false,
    viewport: { width: 412, height: 915 }, reducedMotion: 'reduce' });
  await context.addInitScript({ path: path.join(__dirname, 'catalog-latency-probe.js') });
  const page = await context.newPage();
  const knownCovers = new Set();
  let submittedRequest = null, submittedFrame = null, submittedAt = null;
  page.on('pageerror', () => { report.pageErrors++; });
  page.on('response', response => {
    if (response.request() === submittedRequest) {
      report.outerPostResponseStatus = response.status();
      report.outerPostResponseWallMs = Date.now() - submittedAt;
      save();
    }
  });
  await context.route('**/*', async route => {
    const req = route.request(), raw = req.url(), url = new URL(raw), method = req.method();
    const mainFrame = req.frame() === page.mainFrame();
    if (allowedCatalogPost(raw, method, req.postData(), report.rpcSubmissions)) {
      report.rpcSubmissions = 1;
      report.rpcAttemptMayHaveRun = true;
      submittedRequest = req; submittedFrame = req.frame(); submittedAt = Date.now();
      save(); // Conservatively consume the one-call budget BEFORE continuing.
      // The POST itself is sent exactly once, without HTTP retries or automatic
      // redirects. Never replay a POST through a 307/308 redirect. Fulfill the
      // browser's original frame response, allowing only a safe GET redirect.
      let response;
      try { response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 22000 }); }
      catch (error) { report.rpcFetchFailed = error.name; save(); return route.abort(); }
      report.rpcResponseStatus = response.status();
      report.rpcHttpWallMs = Date.now() - submittedAt;
      report.rpcMeasuredThroughRouteFetch = true;
      if (!allowedPostRedirect(response.status(), response.headers().location)) { report.rpcRedirectBlocked = true; save(); return route.abort(); }
      save(); return route.fulfill({ response });
    }
    if (method !== 'GET') {
      report.blockedPosts += method === 'POST' ? 1 : 0; report.blockedRequests++; save();
      return route.abort();
    }
    if (url.origin === ORIGIN) {
      if (url.pathname.includes('ct-analytics') || url.pathname === '/pwa-register.js')
        return route.fulfill({ contentType: 'text/javascript', body: '' });
      if (url.pathname === '/produtor/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Prefetch blocked</title>' });
      if (url.pathname === '/' && req.isNavigationRequest() && mainFrame && report.homeNavigations === 0) {
        report.homeNavigations++; return route.continue();
      }
      if (url.pathname === '/manifest.webmanifest' ||
          /^\/assets\/[a-zA-Z0-9_.\/-]+\.(?:js|css|json|png|jpg|jpeg|webp|svg|woff2?)$/.test(url.pathname)) return route.continue();
    }
    // Google HTML-service infrastructure, only after the approved form submission.
    // No other POST, auth action, application RPC or top-level navigation allowed.
    const googleContent = /^https:\/\/(?:[a-z0-9-]+\.)?script\.googleusercontent\.com$/.test(url.origin) ||
      /^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/.test(url.origin);
    let ancestor = req.frame(), catalogFrame = false, chainRoot = req;
    while (ancestor) { if (ancestor === submittedFrame) { catalogFrame = true; break; } ancestor = ancestor.parentFrame(); }
    while (chainRoot.redirectedFrom()) chainRoot = chainRoot.redirectedFrom();
    if (report.rpcSubmissions === 1 && catalogFrame && !mainFrame &&
        ((url.origin === 'https://script.google.com' && ((req.isNavigationRequest() && chainRoot === submittedRequest) || url.pathname.startsWith('/static/'))) ||
         (googleContent && (url.pathname === '/userCodeAppPanel' || url.pathname === '/macros/echo')) ||
         (['https://ssl.gstatic.com','https://www.gstatic.com','https://fonts.googleapis.com','https://fonts.gstatic.com'].includes(url.origin) &&
          ['script','stylesheet','image','font'].includes(req.resourceType())))) return route.continue();
    const knownCoverOrigin = url.origin === 'https://drive.google.com' || /^https:\/\/lh[0-9]+\.googleusercontent\.com$/.test(url.origin);
    if (mainFrame && req.resourceType() === 'image' && publicHttps(raw) && knownCoverOrigin) {
      let original = req;
      while (original.redirectedFrom()) original = original.redirectedFrom();
      const rootUrl = original.url();
      const fromCatalog = knownCovers.has(rootUrl) || await page.evaluate(value =>
        Array.from(document.querySelectorAll('#events-grid .catalog-photo img')).some(img => img.src === value), rootUrl).catch(() => false);
      if (fromCatalog) { if (!knownCovers.has(rootUrl)) { knownCovers.add(rootUrl); report.externalCoverRequests++; } return route.continue(); }
    }
    report.blockedRequests++; save(); return route.abort();
  });
  try {
    await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => {
      const result = window.__ctCatalogLatencySnapshot();
      return result.outcome !== 'pending' || document.querySelector('#catalog-retry')?.hidden === false;
    }, null, { timeout: 25000 });
    let snapshot = await page.evaluate(() => window.__ctCatalogLatencySnapshot());
    if (snapshot.outcome === 'success' && snapshot.publicEventCount > 0) {
      await page.waitForFunction(() => {
        const t = window.__ctCatalogLatencySnapshot().checkpointsMsFromNavigation;
        return t.firstCoverFrameCheckpoint != null || t.firstCoverFailed != null;
      }, null, { timeout: 15000 }).catch(() => { report.coverCheckpointTimedOut = true; });
    }
    report.timings = await page.evaluate(() => window.__ctCatalogLatencySnapshot());
    report.measurementStatus = report.timings.outcome === 'success' && !report.coverCheckpointTimedOut ? 'complete' : 'partial';
    report.completed = true;
  } catch (error) {
    report.failureType = error.name; // Never save error text/URLs/payload.
    report.measurementStatus = 'partial';
    report.timings = await page.evaluate(() => window.__ctCatalogLatencySnapshot()).catch(() => null);
  } finally {
    save(); await context.close(); await browser.close();
  }
  console.log(JSON.stringify(report));
  assert.equal(report.rpcSubmissions, 1, 'Exactly one public catalog submission expected');
  assert.equal(report.timings?.outcome, 'success', 'Public catalog response was not successfully measured');
}
if (require.main === module) run().catch(error => { console.error('Diagnostic stopped: ' + error.name); process.exitCode = 1; });
module.exports = { allowedCatalogPost, allowedPostRedirect, publicHttps, APP, METHOD };
