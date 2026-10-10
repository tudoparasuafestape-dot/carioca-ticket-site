const { test, expect } = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path');
const { fixture, events } = require('./rail-fixture.cjs');
const ROOT = path.resolve(__dirname, '../..'), ORIGIN = 'http://127.0.0.1:4174';
const languages = {
  'pt-BR': ['Compartilhar no WhatsApp', 'Confira este evento na Carioca Ticket.'],
  'en-US': ['Share on WhatsApp', 'Check out this event on Carioca Ticket.'],
  es: ['Compartir en WhatsApp', 'Descubre este evento en Carioca Ticket.'],
  'zh-Hans': ['通过 WhatsApp 分享', '在 Carioca Ticket 查看此活动。']
};
const eventData = { id:'PUBLIC & festa/中文', nome:'Festa <img src=x> & amigos', data:'20/12/2030', horario:'18h', local:'Casa da música', cidade:'Recife', uf:'PE', token:'PRIVATE-TOKEN', convite:'PRIVATE-INVITE' };
async function prepare(page, surface, locale) {
  const network = [];
  const errors = []; page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({locale,eventData,surface}) => {
    localStorage.setItem('ct-home-locale', locale);
    localStorage.setItem('ct-home-font', '150');
    window.shareCalls = []; window.copyCalls = [];
    Object.defineProperty(navigator, 'share', { configurable:true, value:async value => { window.shareCalls.push(value); } });
    Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{ writeText:async value => { window.copyCalls.push(value); } } });
    // Synthetic responses only; submitting a real form is never allowed here.
    if (surface !== 'home' && surface !== 'card') HTMLFormElement.prototype.submit = function () {
      const fields = new FormData(this);
      if (fields.get('metodo') !== 'ctEventoPublicoCarregarPROD') return;
      setTimeout(() => dispatchEvent(new MessageEvent('message', { origin:'https://script.google.com', data:{ctMinhaCariocaPost:true,id:fields.get('ctMinhaCariocaRequestId'),ok:true,resultado:{sucesso:true,evento:eventData,visual:{},tipos:[]}} })), 0);
    };
  }, {locale,eventData,surface});
  if (surface === 'home' || surface === 'card') {
    // Home fixture owns its intercepted synthetic catalog transport.
    await fixture(page, { result:{sucesso:true,eventos:[{...events[0],...eventData}]} });
    await page.goto(ORIGIN+'/?token=PRIVATE-TOKEN#PRIVATE-HASH');
  } else {
    await page.context().route('**/*', route => {
      const req=route.request(), url=new URL(req.url());
      if (req.method() !== 'GET' || url.origin !== ORIGIN) { network.push(req.method()+' '+url.origin+url.pathname); return route.abort(); }
      if (url.pathname === '/pwa-register.js' || url.pathname.includes('ct-analytics')) return route.fulfill({contentType:'text/javascript',body:''});
      const file=path.resolve(ROOT,url.pathname.endsWith('/')?url.pathname.slice(1)+'index.html':url.pathname.slice(1));
      if (!file.startsWith(ROOT+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({status:404,body:'Missing fixture'});
      return route.fulfill({contentType:file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'image/png',body:fs.readFileSync(file)});
    });
    await page.goto(ORIGIN+(surface==='program'?'/parceiro/programa/':'/'+surface+'/')+'?evento='+encodeURIComponent(eventData.id)+'&token=PRIVATE-TOKEN#PRIVATE-HASH');
  }
  if (surface === 'evento' || surface === 'evento-v2') {
    await expect(page.locator('#app')).toBeVisible();
    await page.locator('#shareHero').click();
    return { link:page.locator('#shareWhatsAppAction'), network, errors };
  }
  return {link:page.locator('[data-public-share="'+(surface==='card'?'event':surface)+'"] .ct-whatsapp-share'),network,errors};
}
async function blockNavigation(page) {
  await page.evaluate(() => document.addEventListener('click', event => {
    if (!event.target.closest('.ct-whatsapp-share')) return;
    event.preventDefault(); window.whatsAppClicks = (window.whatsAppClicks || 0) + 1;
  }, true));
}
for (const surface of ['home','card','program','evento','evento-v2']) for (const [locale,[label,cta]] of Object.entries(languages)) {
  test(`WhatsApp explicit public navigation / ${surface} / ${locale}`, async ({page},testInfo) => {
    await page.setViewportSize({width:320,height:1100});
    const {link,network,errors}=await prepare(page,surface,locale);
    await expect(link).toBeVisible(); await expect(link).toHaveText(label);
    await expect(link).toHaveAttribute('target','_blank'); await expect(link).toHaveAttribute('rel','noopener noreferrer');
    const url=new URL(await link.getAttribute('href'));
    expect(url.origin).toBe('https://wa.me'); expect(url.pathname).toBe('/'); expect([...url.searchParams.keys()]).toEqual(['text']);
    const message=url.searchParams.get('text');
    if (['card','evento','evento-v2'].includes(surface)) {
      expect(message).toBe([eventData.nome,eventData.data+' · '+eventData.horario,eventData.local+' · '+eventData.cidade+' · '+eventData.uf,cta].join(' · ')+' https://cariocaticket.com.br/evento/?evento='+encodeURIComponent(eventData.id));
    } else expect(message).toBe(surface==='home'?'Carioca Ticket https://cariocaticket.com.br/':'Programa Parceiro Carioca Ticket https://cariocaticket.com.br/parceiro/programa/');
    expect(message).not.toMatch(/PRIVATE|undefined|null/);
    expect(await page.evaluate(()=>window.whatsAppClicks || 0)).toBe(0);
    for (const width of [320,1440]) for (const theme of ['light','dark']) {
      await page.setViewportSize({width,height:1100});
      await page.evaluate(theme=>{ document.documentElement.dataset.homeTheme=theme; document.documentElement.style.fontSize='24px'; },theme);
      expect(await page.evaluate(()=>getComputedStyle(document.documentElement).fontSize)).toBe('24px');
      await link.scrollIntoViewIfNeeded();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      const box=await link.boundingBox(); expect(box.height).toBeGreaterThanOrEqual(44); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x+box.width).toBeLessThanOrEqual(width+1);
      if(locale==='pt-BR') await page.screenshot({path:testInfo.outputPath(`whatsapp-${surface}-${width}-${theme}.png`)});
    }
    await blockNavigation(page);
    await link.focus(); await expect(link).toBeFocused(); await page.keyboard.press('Enter');
    expect(await page.evaluate(()=>window.whatsAppClicks)).toBe(1);
    expect(await page.evaluate(()=>[shareCalls.length,copyCalls.length])).toEqual([0,0]);
    expect(network.filter(url=>url.includes('wa.me')||url.includes('whatsapp'))).toEqual([]);
    expect(errors).toEqual([]);
    if (surface.startsWith('evento')) {
      await expect(page.locator('#shareMenu')).toBeHidden();
      await page.locator('#shareHero').click(); await expect(link).toBeVisible();
      await page.locator('#shareNativeAction').click(); expect(await page.evaluate(()=>shareCalls.length)).toBe(1);
    }
  });
}

test('WhatsApp card updates language and ignores inert cards',async({page})=>{
  const {link}=await prepare(page,'card','pt-BR');
  await page.evaluate(()=>CTHome.setLocale('en-US'));
  await expect(link).toHaveText(languages['en-US'][0]);
  expect(new URL(await link.getAttribute('href')).searchParams.get('text')).toContain(languages['en-US'][1]);
  await link.evaluate(link=>link.closest('.catalog-card').setAttribute('inert',''));
  const prevented=await link.evaluate(link=>!link.dispatchEvent(new MouseEvent('click',{bubbles:false,cancelable:true})));
  expect(prevented).toBe(true);
});

test('event link clears stale data and remounts without duplicate click callbacks',async({page})=>{
  const {link}=await prepare(page,'evento','pt-BR');
  await page.evaluate(()=>{
    const link=document.getElementById('shareWhatsAppAction'); window.callbackCalls=0;
    for(let i=0;i<3;i++) { CTPublicShare.clearEventWhatsApp(link); CTPublicShare.eventWhatsApp(link,{nome:'Somente nome',token:'PRIVATE'},'NEW & ID',()=>window.callbackCalls++); }
  });
  const message=new URL(await link.getAttribute('href')).searchParams.get('text');
  expect(message).toBe('Somente nome · Confira este evento na Carioca Ticket. https://cariocaticket.com.br/evento/?evento=NEW%20%26%20ID');
  await blockNavigation(page);
  await link.click(); expect(await page.evaluate(()=>callbackCalls)).toBe(1);
  await page.evaluate(()=>CTPublicShare.clearEventWhatsApp(document.getElementById('shareWhatsAppAction')));
  await expect(link).toBeHidden(); await expect(link).not.toHaveAttribute('href');
});

