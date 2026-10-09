const fs = require('node:fs');
const path = require('node:path');
const { events, cover } = require('../fixtures/home-stage1.cjs');
const ROOT = path.resolve(__dirname, '../..');
const ORIGIN = 'http://127.0.0.1:4174';
const i18nSource = fs.readFileSync(path.join(ROOT, 'assets/home-i18n.js'), 'utf8');
const dictionaries = JSON.parse(i18nSource.match(/var dictionaries = (\{[\s\S]*?\n\});/)[1]);
async function fixture(page, options = {}) {
  await page.addInitScript(value => { Math.random = () => value; }, options.random || 0);
  const state = { methods: [], errors: [], blocked: [], attempts: 0, cities: 0 };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.context().route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === ORIGIN && request.method() === 'GET') {
      if (options.missingAds && /home-ad-(tpssf|priscila)\.png$/.test(url.pathname)) return route.fulfill({ status: 404, body: 'Missing approved artwork fixture' });
      if (options.noControls && url.pathname.endsWith('home-controls.js')) return route.fulfill({ contentType: 'text/javascript', body: '' });
      if (url.pathname.endsWith('home-municipalities.json')) { state.cities++; if (options.cityFailure && state.cities === 1) return route.fulfill({ status: 503, body: 'Unavailable fixture' }); }
      if (url.pathname.startsWith('/__fixture/')) return route.fulfill({ contentType: 'image/svg+xml', body: cover(url.pathname.includes('music') ? 'music' : 'creative') });
      if (url.pathname === '/pwa-register.js' || url.pathname.includes('ct-analytics')) return route.fulfill({ contentType: 'text/javascript', body: '' });
      if (options.missingTranslation && url.pathname === '/assets/home-i18n.js') {
        const reduced = JSON.parse(JSON.stringify(dictionaries));
        delete reduced['en-US'].mainNavigation;
        return route.fulfill({ contentType: 'text/javascript', body: i18nSource.replace(/var dictionaries = (\{[\s\S]*?\n\});/, 'var dictionaries = ' + JSON.stringify(reduced) + ';') });
      }
      const file = path.resolve(ROOT, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: 'Fixture missing' });
      const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'image/png';
      return route.fulfill({ contentType: type, body: fs.readFileSync(file) });
    }
    const params = new URLSearchParams(request.postData() || '');
    if (url.origin === 'https://script.google.com' && request.method() === 'POST' && params.get('metodo') === 'ctEventosPublicosListarPROD' && params.get('argsJson') === '[]' && params.get('ctMinhaCariocaAction') === 'publicRpc') {
      state.methods.push(params.get('metodo'));
      state.attempts++;
      const result = typeof options.result === 'function' ? options.result(state.attempts) : options.result;
      const payload = { ctMinhaCariocaPost: true, id: params.get('ctMinhaCariocaRequestId'), ok: true, resultado: result || { sucesso: true, eventos: events } };
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<script>parent.postMessage(${JSON.stringify(payload).replace(/</g, '\\u003c')}, '*')</script>` });
    }
    state.blocked.push(request.method() + ' ' + url.origin + url.pathname);
    return route.abort('blockedbyclient');
  });
  await page.goto(ORIGIN, { waitUntil: 'load' });
  return state;
}
module.exports = { fixture, events };
