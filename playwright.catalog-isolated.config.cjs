const { defineConfig } = require('@playwright/test');
// This file cannot inherit HOMOLOGACAO.md's production default.
// Match the independent branch-network guard introduced by PR168.
process.env.CT_BRANCH_MODE = '1';
module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: 'public-event-catalog.spec.js',
  outputDir: './test-results/catalog-isolated',
  timeout: 30000, expect: { timeout: 5000 }, workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/catalog-isolated-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4174', browserName: 'chromium', offline: true, serviceWorkers: 'block', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { viewport: { width: 1365, height: 768 } } },
    { name: 'mobile-chromium', use: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true } }
  ]
});
