const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: ['canary-real.spec.js', 'public-journey.spec.js', 'partner-public-production.spec.js', 'operational-entry.spec.js'],
  timeout: 45000, expect: { timeout: 10000 }, fullyParallel: false, workers: 1, retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/canary-isolated.json' }]],
  use: { baseURL: 'http://127.0.0.1:4173', offline: true, serviceWorkers: 'block', acceptDownloads: false,
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: { proxy: { server: 'http://127.0.0.1:9', bypass: '<-loopback>' },
      args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-quic',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] } },
  projects: [ { name: 'desktop-chromium', use: { viewport: { width: 1365, height: 768 }, offline: true, serviceWorkers: 'block' } },
    { name: 'mobile-chromium', use: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, offline: true, serviceWorkers: 'block' } } ]
});
