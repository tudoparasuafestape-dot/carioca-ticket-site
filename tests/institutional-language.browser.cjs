'use strict';
// Real Chromium DOM, isolated fixtures. This does not attest production HTML integration.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:4189';
const scripts = ['public-i18n.js', 'institutional-translations.js'];
const fixture = `<!doctype html><html lang="pt-BR" data-public-i18n-root><head><meta charset="utf-8"></head><body>
<select id="language"><option>pt-BR</option><option>en-US</option><option>es</option><option>zh-Hans</option></select>
<p id="contact"><span id="prefix" lang="pt-BR">Para parcerias, informações comerciais ou suporte, fale com a equipe pelo e-mail</span> <a href="mailto:contato@cariocaticket.com.br">contato@cariocaticket.com.br</a><span id="punctuation">.</span></p>
<p id="legal-original" lang="pt-BR">As condições específicas podem variar conforme o evento, a situação do pagamento e a legislação aplicável. Esta página não reduz direitos legalmente assegurados ao consumidor.</p>
<p id="notice"></p><p id="legal-translation"></p><div id="texts"></div>
<a id="next" href="/second/">Next fixture</a>
${scripts.map(s => '<script src="/assets/' + s + '"></script>').join('')}
<script>
CTInstitutionalTranslations.register(CTPublicI18n);
var prefix = document.querySelector('#prefix');
prefix.setAttribute('data-public-i18n', CTInstitutionalTranslations.find(prefix.textContent).key);
var original = document.querySelector('#legal-original');
var row = CTInstitutionalTranslations.find(original.textContent);
CTInstitutionalTranslations.rows.forEach(function(row){var span=document.createElement('span');span.lang='pt-BR';span.textContent=row.source;span.dataset.publicI18n=row.key;document.querySelector('#texts').appendChild(span);});
function render(){
 CTPublicI18n.apply(document);
 document.querySelector('#language').value=CTPublicI18n.getLocale();
 var result=CTPublicI18n.content({sourceText:original.textContent,sourceLanguage:'pt-BR',entry:{sourceText:row.source,sourceLanguage:'pt-BR',translations:row.translations},informative:true});
 document.querySelector('#legal-translation').textContent=result.text;document.querySelector('#legal-translation').lang=result.language;
 document.querySelector('#notice').textContent=result.notice;
}
document.addEventListener('ct:public-language',render);
document.querySelector('#language').addEventListener('change',function(e){CTPublicI18n.setLocale(e.target.value);});render();
</script></body></html>`;
(async () => {
  const options = {headless: true};
  if (process.env.CT_CHROMIUM_EXECUTABLE) options.executablePath = process.env.CT_CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch(options);
  const context = await browser.newContext({serviceWorkers: 'block'});
  const blocked = [], errors = [];
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin || request.method() !== 'GET') {blocked.push(request.url()); return route.abort();}
    if (url.pathname === '/' || url.pathname === '/second/') return route.fulfill({contentType:'text/html', body:fixture});
    const name = url.pathname.replace('/assets/', '');
    if (scripts.includes(name)) return route.fulfill({contentType:'text/javascript', body:fs.readFileSync(path.join(root,'assets',name),'utf8')});
    blocked.push(request.url()); return route.abort();
  });
  try {
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    for (const width of [320, 1440]) {
      await page.setViewportSize({width,height:900});
      for (const locale of ['pt-BR','en-US','es','zh-Hans']) {
        await page.goto(origin); await page.locator('#language').selectOption(locale);
        const data = await page.evaluate(() => ({locale:CTPublicI18n.getLocale(),saved:localStorage.getItem('ct-home-locale'),lang:document.documentElement.lang,
          rows:CTInstitutionalTranslations.rows.map(row => ({text:document.querySelector('[data-public-i18n="'+row.key+'"]').textContent,expected:CTPublicI18n.getLocale()==='pt-BR'?row.source:row.translations[CTPublicI18n.getLocale()]})),
          contact:document.querySelector('#contact a').getAttribute('href'),email:document.querySelector('#contact a').textContent,
          original:document.querySelector('#legal-original').textContent,originalLang:document.querySelector('#legal-original').lang,notice:document.querySelector('#notice').textContent}));
        assert.equal(data.locale,locale); assert.equal(data.saved,locale); assert.equal(data.lang,locale);
        for (const row of data.rows) assert.equal(row.text,row.expected);
        assert.equal(data.contact,'mailto:contato@cariocaticket.com.br'); assert.equal(data.email,'contato@cariocaticket.com.br');
        assert.equal(data.originalLang,'pt-BR'); assert.match(data.original,/Esta página não reduz direitos/);
        assert.equal(Boolean(data.notice),locale!=='pt-BR');
        await page.reload(); assert.equal(await page.locator('#language').inputValue(),locale);
        await page.locator('#next').click(); assert.equal(await page.locator('#language').inputValue(),locale);
        await page.goBack(); assert.equal(await page.locator('#language').inputValue(),locale);
      }
    }
    // Cross-tab storage synchronization uses a real browser StorageEvent.
    const second = await context.newPage(); await second.goto(origin+'/second/'); await second.locator('#language').selectOption('es');
    await page.waitForFunction(() => CTPublicI18n.getLocale()==='es');
    // Page restored from BFCache gets this event; explicitly exercise that handler.
    await page.evaluate(() => {localStorage.setItem('ct-home-locale','en-US'); window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
    assert.equal(await page.locator('#language').inputValue(),'en-US');
    const fallback = await page.evaluate(() => {
      const p=document.createElement('p');p.lang='pt-BR';p.textContent='Descrição nova';p.dataset.publicI18n='missing.content';document.body.appendChild(p);CTPublicI18n.apply(p);
      return {text:p.textContent,lang:p.lang,result:CTPublicI18n.content({sourceText:'Descrição nova',sourceLanguage:'pt-BR',entry:{sourceText:'Descrição antiga',sourceLanguage:'pt-BR',translations:{'en-US':'Old'}}})};
    });
    assert.equal(fallback.text,'Descrição nova');assert.equal(fallback.lang,'pt-BR');assert.equal(fallback.result.status,'stale');assert.equal(fallback.result.text,'Descrição nova');assert.ok(fallback.result.notice);
    assert.deepEqual(errors,[]); assert.deepEqual(blocked,[]);
    console.log('PASS: 8 viewport/language cases; 102 rows per case; reload/navigation/back; real cross-tab sync; persisted pageshow handler; source fallback; original/legal/contact preservation; zero external requests. Fixture integration only.');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
