const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/safety/fixtures', testMatch: 'branch-guard.cases.cjs',
  timeout: 10000, workers: 1, retries: 0, reporter: 'json',
  outputDir: 'test-results/branch-guard-proof',
  use: { baseURL: 'http://127.0.0.1:4173', offline: true, serviceWorkers: 'block',
    launchOptions: { proxy: { server: 'http://127.0.0.1:9', bypass: '<-loopback>' },
      args: ['--disable-background-networking', '--disable-quic', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] } }
});
