'use strict';
const { test: base, expect } = require('@playwright/test');
const path = require('node:path');
const { installIsolatedNetwork } = require('../../safety/isolated-network.cjs');
const { createFixtures } = require('../../fixtures/public-canary.cjs');
// Existing per-test backend mocks remain authoritative. Requests they do not
// fulfill reach this closed fallback; continue() is not used by those mocks.
const test = base.extend({
  _branchNetwork: [async ({ context, baseURL }, use, testInfo) => {
    if (process.env.CT_BRANCH_MODE !== '1' || !baseURL || new URL(baseURL).hostname !== '127.0.0.1' ||
      testInfo.project.use.offline !== true || testInfo.project.use.serviceWorkers !== 'block') {
      throw new Error('Branch suites require CT_BRANCH_MODE=1, explicit loopback CT_BASE_URL, offline and serviceWorkers=block');
    }
    const guard = await installIsolatedNetwork(context, { root: path.resolve(__dirname, '../../..'), origin: new URL(baseURL).origin, ...createFixtures() });
    await use(guard);
    await context.close();
    await testInfo.attach('branch-network.json', { body: JSON.stringify(guard.state, null, 2), contentType: 'application/json' });
    guard.assertClean();
  }, { auto: true }]
});
module.exports = { test, expect };
