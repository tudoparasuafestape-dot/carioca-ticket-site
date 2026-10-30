const { test, expect } = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path');
const { fixture, events } = require('./rail-fixture.cjs');
const { temporalEnvelope, legacyNoEndTemporal, PROFILE_MS } = require('../fixtures/public-temporal-envelope.cjs');
const ROOT = path.resolve(__dirname, '../..'), ORIGIN = 'http://127.0.0.1:4174';
const languages = {
  'pt-BR': ['Compartilhar no WhatsApp', 'Confira este evento na Carioca Ticket.'],
  'en-US': ['Share on WhatsApp', 'Check out this event on Carioca Ticket.'],
  es: ['Compartir en WhatsApp', 'Descubre este evento en Carioca Ticket.'],
  'zh-Hans': ['通过 WhatsApp 分享', '在 Carioca Ticket 查看此活动。']
};
const eventData = { id:'PUBLIC-FESTA-2030', nome:'Festa <img src=x> & amigos', data:'20/12/2030', horario:'18h', local:'Casa da música', cidade:'Recife', uf:'PE', token:'PRIVATE-TOKEN', convite:'PRIVATE-INVITE' };
async function prepare(page, surface, locale) {
  await page.clock.install({ time: new Date('2030-12-20T12:00:00Z') });
  const network = [];
  await page.route('**/assets/social-event-pages.json', route => {
    if (route.request().method() !== 'GET' || new URL(route.request().url()).origin !== ORIGIN) return route.abort();
    return route.fulfill({ contentType:'application/json', body:JSON.stringify({schema:'CT_PUBLISHED_SHARE_INDEX_V1',revision:'a'.repeat(64),generatedAt:'2030-12-20T12:00:00.000Z',entries:[eventData.id,'NEW-ID'].map(eventId=>({eventId,sharePath:'/compartilhar/'+eventId+'/',detailUrl:'https://cariocaticket.com.br/evento/?evento='+eventId,endsAt:'2030-12-21T12:00:00.000Z'})),fallbacks:[]}) });
  });
  await page.route('**/assets/whatsapp-brand.svg', route => route.fulfill({contentType:'image/svg+xml',body:fs.readFileSync(path.join(ROOT,'assets/whatsapp-brand.svg'))}));
  const errors = []; page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({locale,eventData,surface,detailEnvelope,detailTtl}) => {
    localStorage.setItem('ct-home-locale', locale);
    localStorage.setItem('ct-home-font', '150');
    window.shareCalls = []; window.copyCalls = []; window.popupCalls=[]; window.handoffCalls=[];
    document.addEventListener('click', event => {
      const a=event.target.closest && event.target.closest('a');
      if(!window.allowHandoff && a && a.target==='_self' && a.href.startsWith('https://wa.me/')) {
        event.preventDefault(); window.handoffCalls.push({url:a.href,target:a.target,rel:a.rel,referrerPolicy:a.referrerPolicy});
      }
    },true);
    window.open = (url,target) => { const call={url,target,closed:false,replaced:null}; window.popupCalls.push(call); return {opener:null,document:{createElement:()=>({}),head:{appendChild:()=>{}}},location:{replace:value=>{call.replaced=value;}},close:()=>{call.closed=true;}}; };
    Object.defineProperty(navigator, 'share', { configurable:true, value:async value => { window.shareCalls.push(value); } });
    Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{ writeText:async value => { window.copyCalls.push(value); } } });
    // Synthetic responses only; submitting a real form is never allowed here.
    if (surface !== 'home' && surface !== 'card') HTMLFormElement.prototype.submit = function () {
      const fields = new FormData(this);
      if (fields.get('metodo') !== 'ctEventoPublicoCarregarPROD') return;
      const nowMs = Date.now(), now = new Date(nowMs).toISOString();
      const temporal = { ...detailEnvelope, serverNow: now, temporalEvaluatedAt: now, validUntil: new Date(nowMs + detailTtl).toISOString() };
      setTimeout(() => dispatchEvent(new MessageEvent('message', { origin:'https://script.google.com', data:{ctMinhaCariocaPost:true,id:fields.get('ctMinhaCariocaRequestId'),ok:true,resultado:{sucesso:true,...temporal,evento:eventData,visual:{},tipos:[]}} })), 0);
    };
  }, {locale,eventData,surface,detailEnvelope:temporalEnvelope('detail', Date.UTC(2030,11,20,12)),detailTtl:PROFILE_MS.detail});
  if (surface === 'home' || surface === 'card') {
    // Home fixture owns its intercepted synthetic catalog transport.
    await fixture(page, { result:(_attempt,nowMs)=>({sucesso:true,...temporalEnvelope('home',nowMs),eventos:[{...events[0],...eventData,temporal:legacyNoEndTemporal()}]}) });
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
  if (surface === 'card') await page.locator('.ct-event-share-opener').click();
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
    await expect(link).toBeVisible(); if(surface==='program') await expect(link).toHaveText(label); else await expect(link).toHaveAttribute('title',label);
    await expect(link).toHaveAttribute('aria-label', ['card','evento','evento-v2'].includes(surface)?label+': '+eventData.nome:label);
    if(surface!=='program') { await expect(link.locator('img')).toHaveAttribute('src','/assets/whatsapp-brand.svg'); await expect(link.locator('img')).toHaveAttribute('aria-hidden','true'); await expect.poll(()=>link.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true); }
    await expect(link).toHaveAttribute('target','_blank'); await expect(link).toHaveAttribute('rel','noopener noreferrer');
    const isEvent=['card','evento','evento-v2'].includes(surface);
    if(isEvent) { await expect(link).not.toHaveAttribute('href'); await expect(link).toHaveAttribute('role','button'); }
    else { const url=new URL(await link.getAttribute('href')); expect(url.origin).toBe('https://wa.me'); expect(url.pathname).toBe('/'); expect([...url.searchParams.keys()]).toEqual(['text']); expect(url.searchParams.get('text')).toBe(surface==='home'?'Carioca Ticket https://cariocaticket.com.br/':'Programa Parceiro Carioca Ticket https://cariocaticket.com.br/parceiro/programa/'); }
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
    if(isEvent) {
      await expect.poll(()=>page.evaluate(()=>handoffCalls[0]&&handoffCalls[0].url)).toBeTruthy();
      const url=new URL(await page.evaluate(()=>handoffCalls[0].url));
      expect(url.origin).toBe('https://wa.me'); expect(url.pathname).toBe('/'); expect([...url.searchParams.keys()]).toEqual(['text']);
      const message=url.searchParams.get('text');
      expect(message).toBe([eventData.nome,eventData.data+' · '+eventData.horario,eventData.local+' · '+eventData.cidade+' · '+eventData.uf,cta].join(' · ')+' https://cariocaticket.com.br/compartilhar/'+eventData.id+'/');
      expect(message).not.toMatch(/PRIVATE|undefined|null/);
      expect(await page.evaluate(()=>popupCalls.length)).toBe(0);
      expect(await page.evaluate(()=>({target:handoffCalls[0].target,rel:handoffCalls[0].rel,referrerPolicy:handoffCalls[0].referrerPolicy}))).toEqual({target:'_self',rel:'noopener noreferrer',referrerPolicy:'no-referrer'});
    }
    expect(await page.evaluate(()=>[shareCalls.length,copyCalls.length])).toEqual([0,0]);
    expect(network.filter(url=>url.includes('wa.me')||url.includes('whatsapp'))).toEqual([]);
    expect(errors).toEqual([]);
    if (surface.startsWith('evento')) {
      await expect(page.locator('#shareMenu')).toBeHidden();
      await page.locator('#shareHero').click(); await expect(link).toBeVisible();
      await page.locator('#shareNativeAction').click(); await expect.poll(()=>page.evaluate(()=>shareCalls.length)).toBe(1); expect(await page.evaluate(()=>shareCalls[0].url)).toBe('https://cariocaticket.com.br/compartilhar/'+eventData.id+'/');
    }
  });
}

test('WhatsApp card updates language and ignores inert cards',async({page})=>{
  const {link}=await prepare(page,'card','pt-BR');
  await page.evaluate(()=>CTHome.setLocale('en-US'));
  // Language refresh replaces catalog nodes; reopen the new event's chooser.
  await page.locator('.ct-event-share-opener').click();
  await expect(link).toHaveAttribute('aria-label',languages['en-US'][0]+': '+eventData.nome);
  await expect(link).not.toHaveAttribute('href');
  await link.click(); await expect.poll(()=>page.evaluate(()=>handoffCalls[0]&&handoffCalls[0].url)).toBeTruthy();
  expect(new URL(await page.evaluate(()=>handoffCalls[0].url)).searchParams.get('text')).toContain(languages['en-US'][1]);
  await link.evaluate(link=>link.closest('.catalog-card').setAttribute('inert',''));
  const prevented=await link.evaluate(link=>!link.dispatchEvent(new MouseEvent('click',{bubbles:false,cancelable:true})));
  expect(prevented).toBe(true); expect(await page.evaluate(()=>handoffCalls.length)).toBe(1); expect(await page.evaluate(()=>popupCalls.length)).toBe(0);
});

test('event link clears stale data and remounts without duplicate click callbacks',async({page})=>{
  const {link}=await prepare(page,'evento','pt-BR');
  await page.evaluate(()=>{
    const link=document.getElementById('shareWhatsAppAction'); window.callbackCalls=0;
    for(let i=0;i<3;i++) { CTPublicShare.clearEventWhatsApp(link); CTPublicShare.eventWhatsApp(link,{nome:'Somente nome',token:'PRIVATE'},'NEW-ID',()=>window.callbackCalls++); }
  });
  await expect(link).not.toHaveAttribute('href');
  await blockNavigation(page);
  await link.click(); await expect.poll(()=>page.evaluate(()=>callbackCalls)).toBe(1);
  const message=new URL(await page.evaluate(()=>handoffCalls[0].url)).searchParams.get('text');
  expect(message).toBe('Somente nome · Confira este evento na Carioca Ticket. https://cariocaticket.com.br/compartilhar/NEW-ID/');
  expect(message).not.toMatch(/PRIVATE|undefined|null/);
  await page.evaluate(()=>CTPublicShare.clearEventWhatsApp(document.getElementById('shareWhatsAppAction')));
  await expect(link).toBeHidden(); await expect(link).not.toHaveAttribute('href');
});


test('invalid event identity fails closed without sharing a stale destination',async({page})=>{
 const {link}=await prepare(page,'evento','pt-BR');
 await page.evaluate(()=>CTPublicShare.eventWhatsApp(document.getElementById('shareWhatsAppAction'),{nome:'Invalid identity'},'PUBLIC & festa/中文'));
 await link.click(); await expect(link.locator('..').locator('[role="status"]')).toContainText('indisponível');
 expect(await page.evaluate(()=>[popupCalls.length,handoffCalls.length])).toEqual([0,0]);
 await expect(link.locator('..').locator('[role="status"]')).toContainText('indisponível');
 expect(await page.evaluate(()=>[shareCalls.length,copyCalls.length])).toEqual([0,0]);
});


for (const surface of ['card','evento','evento-v2']) test(`One filled share opener below art / ${surface}`, async({page},testInfo)=>{
  const {errors}=await prepare(page,surface,'pt-BR');
  const card=surface==='card';
  const opener=page.locator(card?'.ct-event-share-opener':'#shareHero');
  if(card) await page.keyboard.press('Escape'); else await page.locator('#shareMenuClose').click();
  for(const width of [320,1440]) for(const theme of ['light','dark']) {
    await page.setViewportSize({width,height:1100});
    await page.evaluate(theme=>{document.documentElement.dataset.homeTheme=theme;document.documentElement.style.fontSize='16px';},theme);
    await opener.scrollIntoViewIfNeeded();
    const cover=page.locator(card?'.catalog-photo':'#cover'),buy=page.locator(card?'.catalog-actions .btn-primary':'#buyHero');
    const art=await cover.boundingBox(),button=await opener.boundingBox();
    expect(button.y).toBeGreaterThanOrEqual(art.y+art.height-1);
    expect(Math.abs(button.x+button.width/2-art.x-art.width/2)).toBeLessThan(2);
    expect(button.height).toBeGreaterThanOrEqual(44);
    const colors=el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.backgroundImage,s.color]};
    expect(await opener.evaluate(colors)).toEqual(await buy.evaluate(colors));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`whatsapp-one-share-${surface}-${width}-${theme}.png`)});
    await opener.click();
    const modal=page.locator(card?'dialog[open]':'#shareMenu');await expect(modal).toBeVisible();
    await page.screenshot({path:testInfo.outputPath(`whatsapp-one-share-dialog-${surface}-${width}-${theme}.png`)});
    if(card) {
      await page.keyboard.press('Tab');expect(await modal.evaluate(d=>d.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');await expect(modal).toHaveCount(0);
    } else await page.locator('#shareMenuClose').click();
    await expect(opener).toBeFocused();
  }
  expect(errors).toEqual([]);
});

test('catalog chooser native copy denial close pending and cleanup remain isolated',async({page})=>{
  const {errors}=await prepare(page,'card','pt-BR');
  const dialog=page.locator('.ct-share-dialog'),opener=page.locator('.ct-event-share-opener');
  const native=dialog.locator('.ct-share-dialog-action').first(),copy=dialog.locator('.ct-share-dialog-action').last();
  await copy.click(); await expect.poll(()=>page.evaluate(()=>copyCalls.length)).toBe(1); expect(await page.evaluate(()=>shareCalls.length)).toBe(0);
  await native.click(); await expect.poll(()=>page.evaluate(()=>shareCalls.length)).toBe(1);
  await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('Cancelled','AbortError')}}));
  await native.click();expect(await page.evaluate(()=>copyCalls.length)).toBe(1);
  await page.evaluate(()=>CTPublishedShareIndex.resolve=async()=> 'https://cariocaticket.com.br/');
  await copy.click();await expect(dialog.locator('p[role=status]')).toContainText('indisponível');expect(await page.evaluate(()=>copyCalls.length)).toBe(1);
  await page.evaluate(()=>CTPublishedShareIndex.resolve=()=>new Promise(resolve=>window.releaseShare=resolve));
  await copy.click();await expect.poll(()=>page.evaluate(()=>typeof releaseShare)).toBe('function');
  await page.keyboard.press('Escape');await expect(opener).toBeFocused();
  await page.evaluate(()=>releaseShare('https://cariocaticket.com.br/compartilhar/PUBLIC-FESTA-2030/'));
  await expect(native).toBeEnabled();expect(await page.evaluate(()=>copyCalls.length)).toBe(1);
  await opener.click();await expect(dialog).toBeVisible();
  await page.evaluate(()=>document.querySelector('.catalog-card').remove());await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

// Combined real catalog/share DOM lifecycle: the old foreground-popup strategy
// dispatches visibilitychange before its resolver finishes and loses its card.
test('mobile foreground-popup regression: fresh resolution does not lose catalog', async({page})=>{
 const {link}=await prepare(page,'card','pt-BR');
 await page.evaluate(()=>{
   window.resolveRelease=null;
   CTPublishedShareIndex.resolve=()=>new Promise(resolve=>window.resolveRelease=resolve);
   window.open=()=>{window.popupCalls.push('foreground');Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));return {document:{createElement:()=>({}),head:{appendChild(){}}},location:{replace(){}},close(){}}};
 });
 await link.click(); await expect.poll(()=>page.evaluate(()=>!!resolveRelease)).toBe(true);
 await expect(page.locator('.catalog-card')).toHaveCount(1);
 expect(await page.evaluate(()=>popupCalls.length)).toBe(0);
 await page.evaluate(id=>resolveRelease('https://cariocaticket.com.br/compartilhar/'+id+'/'),eventData.id);
 await expect.poll(()=>page.evaluate(()=>handoffCalls.length)).toBe(1);
 await expect(page.locator('.catalog-card')).toHaveCount(1);
 await expect(page.locator('#event-count')).not.toContainText('indisponível');
});
for(const interruption of ['hidden','focus','close','inert']) test('pending WhatsApp blocks late handoff after '+interruption,async({page})=>{
 const {link}=await prepare(page,'card','pt-BR');
 await page.evaluate(()=>{CTPublishedShareIndex.resolve=()=>new Promise(resolve=>window.resolveRelease=resolve)});
 await link.click(); await expect.poll(()=>page.evaluate(()=>!!resolveRelease)).toBe(true);
 await page.evaluate(kind=>{
   if(kind==='hidden'){Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))}
   if(kind==='focus')window.dispatchEvent(new Event('focus'));
   if(kind==='close')document.querySelector('.ct-share-dialog').close();
   if(kind==='inert')document.querySelector('.catalog-card').inert=true;
 },interruption);
 await page.evaluate(id=>resolveRelease('https://cariocaticket.com.br/compartilhar/'+id+'/'),eventData.id);
 await page.evaluate(async()=>{await Promise.resolve();await Promise.resolve()});
 expect(await page.evaluate(()=>[handoffCalls.length,popupCalls.length])).toEqual([0,0]);
});

test('same-tab handoff sends no referrer and browser Back reloads governed catalog',async({page})=>{
 const {link}=await prepare(page,'card','pt-BR'); let requestHeaders=null;
 await page.route('https://wa.me/**',async route=>{requestHeaders=await route.request().allHeaders();await route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated WhatsApp destination</title><p>Stub only</p>'})});
 await page.evaluate(()=>window.allowHandoff=true);
 await link.click(); await expect(page).toHaveURL(/^https:\/\/wa\.me\//);
 expect(requestHeaders.referer).toBeUndefined();
 await page.goBack({waitUntil:'domcontentloaded'});
 await page.clock.runFor(5100);
 await expect(page.locator('.catalog-card')).toHaveCount(1);
 await expect(page.locator('.ct-event-share-opener')).toBeVisible();
 await expect(page.locator('#event-count')).not.toContainText('indisponível');
});

for(const locale of Object.keys(languages)) test('catalog resume distinguishes revalidating from actual failure / '+locale,async({page})=>{
 await page.clock.install({time:new Date('2030-12-20T12:00:00Z')});
 await page.addInitScript(locale=>localStorage.setItem('ct-home-locale',locale),locale);
 let fail=false,releaseFailure;
 await fixture(page,{result:(_attempt,nowMs)=>fail?new Promise(resolve=>{releaseFailure=resolve}):{sucesso:true,...temporalEnvelope('home',nowMs),eventos:[{...events[0],...eventData,temporal:legacyNoEndTemporal()}]}});
 await expect(page.locator('.catalog-card')).toHaveCount(1);
 const labels=await page.evaluate(()=>({consulting:CTHome.t('consulting'),loading:CTHome.t('loading'),unavailable:CTHome.t('unavailable')}));
 fail=true; await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.locator('.catalog-card')).toHaveCount(0);
 await expect(page.locator('#event-count')).toHaveText(labels.consulting);
 await expect(page.locator('#catalog-status-message')).toHaveText(labels.loading);
 await expect(page.locator('#events-grid')).toHaveAttribute('aria-busy','true');
 await expect(page.locator('#catalog-retry')).toBeHidden();
 await page.clock.runFor(5100);
 await expect.poll(()=>typeof releaseFailure).toBe('function');
 releaseFailure({sucesso:false});
 await expect(page.locator('#event-count')).toHaveText(labels.unavailable);
 await expect(page.locator('#catalog-retry')).toBeVisible();
 await expect(page.locator('.catalog-card')).toHaveCount(0);
});
