// Opt-in external audit with the single synthetic sentence from vlibras-proof.cjs.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const proof = require('./vlibras-proof.cjs');
(async () => {
  const server = proof.start();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const requests = [], responses = [], errors = [], blocked = [];
  const out = path.resolve('docs/reviews/event-accessibility');
  fs.mkdirSync(path.join(out, 'screenshots'), { recursive: true });
  const report = { date: new Date().toISOString(), browser: browser.version(), syntheticText: proof.syntheticText, requests, responses, errors, blocked };
  try {
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      const allowed = ['127.0.0.1', 'vlibras.gov.br', 'cdn.jsdelivr.net'].includes(url.hostname) || url.hostname.endsWith('.vlibras.gov.br');
      if (!allowed) { blocked.push(url.href); return route.abort(); }
      return route.continue();
    });
    page.on('request', request => {
      if (!request.url().startsWith('http://127.0.0.1:')) requests.push({ url: request.url(), method: request.method(), type: request.resourceType(), body: request.postData() });
    });
    page.on('response', async response => {
      if (response.url().startsWith('http://127.0.0.1:')) return;
      const headers = await response.allHeaders().catch(() => ({}));
      responses.push({ url: response.url(), status: response.status(), declaredBytes: Number(headers['content-length']) || null });
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text().slice(0,500)); });
    await page.goto(proof.shellOrigin + '/');
    await page.waitForTimeout(1000);
    report.externalRequestsBeforeActivation = requests.length;
    await page.locator('#activate').click();
    const frame = page.frameLocator('iframe');
    const access = frame.getByRole('button', { name: /Conteúdo acessível em Libras/ });
    await access.waitFor({ timeout: 25000 });
    report.bootstrapRequests = requests.length;
    await access.click();
    await page.waitForTimeout(20000);
    report.frames = page.frames().map(frame => frame.url());
    report.frameText = await frame.locator('body').innerText();
    await page.screenshot({ path: path.join(out, 'screenshots/libras-proof-390.png'), fullPage: true });
    const iframeBounds = await page.locator('iframe').boundingBox();
    const purchaseBounds = await page.locator('#purchase').boundingBox();
    report.layout = { iframeBounds, purchaseBounds, note: 'The widget cannot paint outside its separate-origin iframe; the fixed footer has priority at the shell level.' };
    await page.locator('#remove').click();
    report.framesAfterClose = page.frames().length;
  } catch (error) { report.failure = error.message; }
  finally {
    fs.writeFileSync(path.join(out, 'vlibras-audit.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ before: report.externalRequestsBeforeActivation, bootstrap: report.bootstrapRequests, requests: requests.length, responses: responses.length, blocked, errors, failure: report.failure, frameText: report.frameText }, null, 2));
    await browser.close(); server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
