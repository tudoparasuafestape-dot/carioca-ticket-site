'use strict';
// Runs only local scripts, synthetic fixtures and built-in Node APIs.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const jobs = [
  [['--test', 'tests/public-catalog-clock.test.cjs', 'tests/public-event-expiry.mjs', 'tests/temporal-integrated-pages.test.cjs', 'tests/temporal-integrated-invariants.test.cjs'], {}],
  [['tests/checkout-era-beauty.dom.js'], {}],
  [['tests/checkout-language.dom.cjs'], {}],
  [['tests/checkout-language.dom.cjs'], { CT_LOCALE_ROUTE: 'checkout-v2' }]
];
for (const [args, env] of jobs) {
  const result = spawnSync(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Offline integrated slice passed: 146 node:test + 75 checkout + 100 language + 35 language V2 = 356 checks. No browser or real RPC was run.');
