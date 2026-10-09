'use strict';
const { test: base, expect } = require('@playwright/test');
const path = require('node:path');
const { installIsolatedNetwork } = require('../../safety/isolated-network.cjs');
const { createFixtures } = require('../../fixtures/public-canary.cjs');
const ORIGIN = 'http://127.0.0.1:4173';
const test = base.extend({
  _isolatedNetwork: [async ({ context, baseURL }, use, testInfo) => {
    if (baseURL !== ORIGIN || testInfo.project.use.offline !== true || testInfo.project.use.serviceWorkers !== 'block') {
      throw new Error('Use playwright.canary.config.cjs: explicit loopback, offline and serviceWorkers=block are required');
    }
    const guard = await installIsolatedNetwork(context, { root: path.resolve(__dirname, '../../..'), origin: ORIGIN, ...createFixtures() });
    await use(guard);
    await context.close();
    await testInfo.attach('isolated-network.json', { body: JSON.stringify(guard.state, null, 2), contentType: 'application/json' });
    guard.assertClean();
  }, { auto: true }]
});
module.exports = { test, expect, ORIGIN };
