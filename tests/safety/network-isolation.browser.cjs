'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const { installIsolatedNetwork, RPC_ENDPOINT } = require('./isolated-network.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-isolation-'));
fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>Local safety fixture</title>');
const origin = 'http://127.0.0.1:4173';
(async () => {
  const browser = await chromium.launch({ headless: true,
    proxy: { server: 'http://127.0.0.1:9', bypass: '<-loopback>' },
    args: ['--disable-background-networking', '--disable-quic', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
  let passed = 0;
  try {
    for (const kind of ['fetch', 'xhr', 'beacon', 'iframe', 'popup', 'websocket', 'worker', 'unknown-rpc']) {
      const context = await browser.newContext({ offline: true, serviceWorkers: 'block', baseURL: origin });
      const guard = await installIsolatedNetwork(context, { root, origin });
      const page = await context.newPage();
      await page.goto('/');
      await page.evaluate(({ kind, endpoint }) => {
        const target = 'https://unexpected.invalid/write?private=DO-NOT-LOG';
        if (kind === 'fetch') fetch(target, { method: 'POST', body: 'DO-NOT-LOG' }).catch(() => {});
        if (kind === 'xhr') { const x = new XMLHttpRequest(); x.open('POST', target); x.send('DO-NOT-LOG'); }
        if (kind === 'beacon') navigator.sendBeacon(target, 'DO-NOT-LOG');
        if (kind === 'iframe') { const f = document.createElement('iframe'); f.src = target; document.body.appendChild(f); }
        if (kind === 'popup') window.open(target);
        if (kind === 'websocket') new WebSocket('wss://unexpected.invalid/socket');
        if (kind === 'worker') new Worker(URL.createObjectURL(new Blob([`fetch(${JSON.stringify(target)},{method:'POST'}).catch(()=>{});`], { type: 'text/javascript' })));
        if (kind === 'unknown-rpc') {
          const frame = document.createElement('iframe'); frame.name = 'rpc'; document.body.appendChild(frame);
          const form = document.createElement('form'); form.method = 'POST'; form.action = endpoint; form.target = frame.name;
          for (const [name, value] of Object.entries({ ctMinhaCariocaAction: 'publicRpc', ctMinhaCariocaRequestId: 'local',
            metodo: 'ctCheckoutPixPublicoIniciarPROD', argsJson: '[{"token":"DO-NOT-LOG"}]' })) {
            const input = document.createElement('input'); input.name = name; input.value = value; form.appendChild(input);
          }
          document.body.appendChild(form); form.submit();
        }
      }, { kind, endpoint: RPC_ENDPOINT });
      for (let n = 0; n < 30 && !guard.state.unexpected.length; n++) await page.waitForTimeout(50);
      assert(guard.state.unexpected.length > 0, kind + ': unexpected request was not observed');
      assert.throws(() => guard.assertClean(), /Unexpected network/);
      assert.equal(guard.state.forwarded, 0);
      assert(!JSON.stringify(guard.state).includes('DO-NOT-LOG'));
      await context.close(); console.log('PASS blocked and failed before egress: ' + kind); passed++;
    }
    const context = await browser.newContext({ offline: true, serviceWorkers: 'block' });
    const guard = await installIsolatedNetwork(context, { root, origin });
    const page = await context.newPage(); await page.goto(origin);
    const registered = await page.evaluate(() => navigator.serviceWorker.register('/unapproved-sw.js').then(registration => Boolean(registration), () => false));
    assert.equal(registered, false); assert.equal(context.serviceWorkers().length, 0); guard.assertClean();
    await context.close(); passed++;
    console.log('PASS ' + passed + ' browser isolation controls; no production request executed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
