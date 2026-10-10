'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const { installIsolatedNetwork } = require('./isolated-network.cjs');
const { createFixtures, EVENT } = require('../fixtures/public-canary.cjs');
const origin = 'http://127.0.0.1:4173', reports = [];
(async () => {
  const browser = await chromium.launch({ headless: true,
    proxy: { server: 'http://127.0.0.1:9', bypass: '<-loopback>' },
    args: ['--disable-background-networking', '--disable-quic', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
  try {
    for (const width of [1365, 412]) for (const [route, kind] of [['/', 'HOME'], ['/evento/', 'EVENTO'], ['/checkout/', 'CHECKOUT']]) {
      const context = await browser.newContext({ offline: true, serviceWorkers: 'block', viewport: {width, height: 915} });
      await context.addInitScript(() => localStorage.setItem('ct-public-privacy-v1', JSON.stringify({version:1,analytics:true,maps:false})));
      const fixtures = createFixtures(), capture = fixtures.handlers['publicRpc:ctAnalyticsMasterRegistrarLotePublicoPROD'];
      fixtures.handlers['publicRpc:ctAnalyticsMasterRegistrarLotePublicoPROD'] = (args, state) => {
        assert.equal(args[0].length, 1);
        const event = args[0][0];
        assert.equal(event.pagina, kind); assert.equal(event.origem, 'CANARIO'); assert.equal(event.eventoId, EVENT);
        assert.equal(event.dispositivo, width === 412 ? 'MOBILE' : 'DESKTOP');
        return capture(args, state);
      };
      const guard = await installIsolatedNetwork(context, {root: path.resolve(__dirname, '../..'), origin, ...fixtures});
      const report = { width, route, success: false, network: guard.state };
      reports.push(report);
      const page = await context.newPage();
      await page.goto(origin + route + '?evento=' + EVENT + '&src=CANARIO');
      await expect.poll(() => guard.state.telemetry.length, { timeout: 12000 }).toBe(1);
      assert(guard.state.rpc.some(call => call.method === 'ctAnalyticsMasterRegistrarLotePublicoPROD'));
      await context.close(); guard.assertClean();
      report.success = true;
      console.log('PASS actual analytics script -> local capture: ' + kind + ' ' + width);
    }
  } finally {
    await browser.close(); fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync('test-results/telemetry-isolated.json', JSON.stringify(reports, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

