const { defineConfig } = require('@playwright/test');
// This suite cannot inherit the production default from playwright.config.js.
module.exports = defineConfig({
  testDir: './tests/home',
  outputDir: './test-results/home-stage1',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/home-stage1-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4174',
    browserName: 'chromium',
    serviceWorkers: 'block',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
});
