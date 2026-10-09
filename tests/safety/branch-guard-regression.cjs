'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cli = path.join(path.dirname(require.resolve('@playwright/test/package.json')), 'cli.js');
const child = spawnSync(process.execPath, [cli, 'test', '--config=playwright.branch-guard.config.cjs'], {
  cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', maxBuffer: 5e6,
  env: {...process.env, CT_BRANCH_MODE:'1', CT_BASE_URL:'http://127.0.0.1:4173', CT_EXPECTED_HOST:'127.0.0.1', PLAYWRIGHT_JSON_OUTPUT_NAME:''}
});
fs.mkdirSync('test-results', {recursive:true});
fs.writeFileSync('test-results/branch-guard-negative-child.json', child.stdout);
assert.equal(child.status, 1, 'Real helper must fail the child run with unexpected requests');
const report = JSON.parse(child.stdout);
assert.equal(report.stats.unexpected, 5); assert.equal(report.stats.expected, 2); assert.equal(report.stats.skipped, 0);
function inspect(suite) {
  for (const spec of suite.specs || []) for (const test of spec.tests) {
    assert.equal(test.status, spec.title.startsWith('FAIL') ? 'unexpected' : 'expected');
    if (spec.title.startsWith('FAIL')) {
      assert(test.results.some(result => result.errors.some(error => error.message.includes('Unexpected network/RPC attempt'))), spec.title);
    }
  }
  for (const child of suite.suites || []) inspect(child);
}
inspect(report);
console.log('PASS real branch helper: 5 injected violations failed, 2 explicitly declared mocks passed; child exit=1 verified');
