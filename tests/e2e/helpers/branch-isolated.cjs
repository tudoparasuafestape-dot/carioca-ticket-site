'use strict';
const { test: base, expect: baseExpect } = require('@playwright/test');
const path = require('node:path');
const { installIsolatedNetwork } = require('../../safety/isolated-network.cjs');
const { createFixtures } = require('../../fixtures/public-canary.cjs');
const { mockRoute, mockFailure, fixtureError, observedExpect } = require('../../safety/declared-mocks.cjs');
const expect = observedExpect(baseExpect);
// Every request is observed independently. Custom mocks must declare exact
// RPC/action/resource contracts; raw page/context routes cannot bypass this.
const test = base.extend({
  _branchNetwork: [async ({ context, baseURL }, use, testInfo) => {
    if (process.env.CT_BRANCH_MODE !== '1' || !baseURL || new URL(baseURL).hostname !== '127.0.0.1' ||
      testInfo.project.use.offline !== true || testInfo.project.use.serviceWorkers !== 'block') {
      throw new Error('Branch suites require CT_BRANCH_MODE=1, explicit loopback CT_BASE_URL, offline and serviceWorkers=block');
    }
    const guard = await installIsolatedNetwork(context, { root: path.resolve(__dirname, '../../..'), origin: new URL(baseURL).origin, ...createFixtures(), auditMocks: true });
    await use(guard);
    guard.beginClose();
    await context.close();
    await testInfo.attach('branch-network.json', { body: JSON.stringify(guard.state, null, 2), contentType: 'application/json' });
    guard.assertClean();
  }, { auto: true }]
});
module.exports = { test, expect, mockRoute, mockFailure, fixtureError };
