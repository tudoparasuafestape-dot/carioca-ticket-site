// Native browser audit of actual product controls; synthetic transport only.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const server = require('../event-accessibility-preview.cjs');
  const results = [];
  try {
    for (const channel of [undefined, 'msedge']) {
      let browser;
      const result = { browser: channel || 'bundled Chromium', platform: process.platform, states: [] };
      results.push(result);
      try {
        browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
        result.version = browser.version();
        const page = await browser.newPage();
        await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:42971' ? route.continue() : route.abort());
        await page.goto('http://127.0.0.1:42971/evento/?evento=PREVIEW-EVENT');
        await page.locator('#app').waitFor({ state: 'visible' });
        await page.waitForFunction(() => !document.getElementById('description-listen').disabled, null, { timeout: 10000 }).catch(() => {});
        result.available = await page.evaluate(() => 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window);
        result.voices = await page.evaluate(() => speechSynthesis.getVoices().map(v => ({ name: v.name, lang: v.lang, local: v.localService, default: v.default })));
        async function snapshot(action) {
          result.states.push({ action, ...await page.evaluate(() => ({ state: document.getElementById('description-audio').dataset.state, message: document.getElementById('description-audio-status').textContent, speaking: speechSynthesis.speaking, paused: speechSynthesis.paused, pending: speechSynthesis.pending })) });
        }
        await snapshot('initial');
        if (await page.locator('#description-listen').isEnabled()) {
          await page.locator('#description-listen').click();
          await page.waitForTimeout(1500);
          await snapshot('listen');
          if (await page.locator('#description-pause').isEnabled()) {
            await page.locator('#description-pause').click();
            await page.waitForTimeout(2500);
            await snapshot('pause');
            if (await page.locator('#description-listen').textContent() === 'Continuar descrição') {
              await page.locator('#description-listen').click();
              await page.waitForTimeout(2500);
              await snapshot('resume');
            }
          }
          if (await page.locator('#description-stop').isEnabled()) await page.locator('#description-stop').click();
          await snapshot('stop');
          await page.locator('#description-listen').click();
          await page.waitForTimeout(1000);
          await page.evaluate(() => window.addEventListener('pagehide', () => sessionStorage.setItem('speech-after-pagehide', JSON.stringify({ speaking: speechSynthesis.speaking, paused: speechSynthesis.paused, pending: speechSynthesis.pending }))));
          await page.goto('http://127.0.0.1:42971/');
          result.afterNavigation = JSON.parse(await page.evaluate(() => sessionStorage.getItem('speech-after-pagehide')));
        }
      } catch (error) { result.error = error.message; }
      finally { await browser?.close(); }
    }
    const out = path.resolve('docs/reviews/event-accessibility');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'native-speech-audit.json'), JSON.stringify({ date: new Date().toISOString(), headless: true, audioHeardByHuman: false, results }, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally { server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
