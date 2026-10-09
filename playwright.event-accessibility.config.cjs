const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/event-accessibility',
  testMatch: '*.spec.cjs',
  outputDir: './test-results/event-accessibility',
  timeout: 30000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/event-accessibility-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:42971', browserName: 'chromium', serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } },
  webServer: { command: 'node tests/event-accessibility-preview.cjs', url: 'http://127.0.0.1:42971/evento/?evento=PREVIEW-EVENT', reuseExistingServer: false }
});
