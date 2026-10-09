"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, expect } = require('@playwright/test');
const root = path.resolve(__dirname, '../..');
const allowed = new Set(['/__pwa__/', '/manifest.webmanifest', '/sw.js', '/assets/carioca-ticket-icon-192.png', '/assets/carioca-ticket-icon-512.png', '/assets/carioca-ticket-icon-maskable-512.png']);
(async () => {
 const unexpected = [], requests = [];
 const server = http.createServer((req,res) => {
  const name = new URL(req.url,'http://127.0.0.1').pathname;
  requests.push({method:req.method,path:name});
  if(req.method!=='GET'||!allowed.has(name)){unexpected.push('server rejected request');res.writeHead(405);res.end();return;}
  if(name==='/__pwa__/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>PWA local fixture</title><link rel="manifest" href="/manifest.webmanifest">');return;}
  const file=path.join(root,name);
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.webmanifest')?'application/manifest+json':'image/png');
  res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 // A real service worker cannot run offline. This proxy forwards only the
 // exact local fixture origin and fixed static paths; CONNECT is always denied.
 const proxy=http.createServer((req,res)=>{
  let target;try{target=new URL(req.url);}catch{res.writeHead(400);res.end();return;}
  if(req.method!=='GET'||target.origin!==origin||!allowed.has(target.pathname)){
   unexpected.push('proxy denied destination');res.writeHead(403);res.end();return;
  }
  const upstream=http.get(target,local=>{res.writeHead(local.statusCode,local.headers);local.pipe(res);});
  upstream.on('error',()=>{res.writeHead(502);res.end();});
 });
 proxy.on('connect',(_req,socket)=>{socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');});
 await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,proxy:{server:'http://127.0.0.1:'+proxy.address().port,bypass:'<-loopback>'},args:['--disable-background-networking','--disable-quic','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
 try {
  for(const width of [1365,412]) {
   const context=await browser.newContext({serviceWorkers:'allow',viewport:{width,height:915}});
   context.on('request',request=>{const u=new URL(request.url());if(u.origin!==origin||!allowed.has(u.pathname)||request.method()!=='GET')unexpected.push('browser unexpected request');});
   await context.route('**/*',route=>{const request=route.request(),u=new URL(request.url());if(u.origin===origin&&allowed.has(u.pathname)&&request.method()==='GET')return route.continue();unexpected.push('blocked request');return route.abort();});
   await context.routeWebSocket('**/*',socket=>{unexpected.push('websocket');socket.close();});
   const page=await context.newPage();await page.goto(origin+'/__pwa__/');
    const pwa = await page.evaluate(async () => {
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
      const deadline = Date.now() + 90000;
      let status = 0;
      let manifest = null;

      while (Date.now() < deadline) {
        try {
          const response = await fetch('/manifest.webmanifest?e2e=' + Date.now(), {
            cache: 'no-store'
          });
          status = response.status;
          manifest = await response.json();

          const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
          const ready =
            icons.some(icon =>
              icon.src === '/assets/carioca-ticket-icon-192.png' &&
              icon.sizes === '192x192'
            ) &&
            icons.some(icon =>
              icon.src === '/assets/carioca-ticket-icon-512.png' &&
              icon.sizes === '512x512'
            ) &&
            icons.some(icon =>
              icon.src === '/assets/carioca-ticket-icon-maskable-512.png' &&
              icon.sizes === '512x512' &&
              String(icon.purpose || '').includes('maskable')
            );

          if (ready) break;
        } catch (_) {}

        await sleep(2000);
      }

      async function measure(src) {
        return await new Promise(resolve => {
          const img = new Image();
          img.onload = () => resolve({ ok: true, width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => resolve({ ok: false, width: 0, height: 0 });
          img.src = src + '?e2e=' + Date.now();
        });
      }

      let swReady = false;
      if ('serviceWorker' in navigator) {
        try {
          await navigator.serviceWorker.register('/sw.js', { scope: '/' });
          await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, reject) => setTimeout(() => reject(new Error('SW_TIMEOUT')), 15000))
          ]);
          swReady = true;
        } catch (_) {}
      }

      return {
        status,
        manifest,
        icon192: await measure('/assets/carioca-ticket-icon-192.png'),
        icon512: await measure('/assets/carioca-ticket-icon-512.png'),
        mask512: await measure('/assets/carioca-ticket-icon-maskable-512.png'),
        swSupported: 'serviceWorker' in navigator,
        swReady
      };
    });

    expect(pwa.status).toBe(200);
    expect(pwa.manifest.name).toBe('Carioca Ticket');
    expect(pwa.manifest.display).toBe('standalone');
    expect(pwa.manifest.icons.some(icon =>
      icon.src === '/assets/carioca-ticket-icon-192.png' &&
      icon.sizes === '192x192'
    )).toBe(true);
    expect(pwa.manifest.icons.some(icon =>
      icon.src === '/assets/carioca-ticket-icon-512.png' &&
      icon.sizes === '512x512'
    )).toBe(true);
    expect(pwa.manifest.icons.some(icon =>
      icon.src === '/assets/carioca-ticket-icon-maskable-512.png' &&
      icon.sizes === '512x512' &&
      String(icon.purpose || '').includes('maskable')
    )).toBe(true);
    expect(pwa.icon192).toEqual({ ok: true, width: 192, height: 192 });
    expect(pwa.icon512).toEqual({ ok: true, width: 512, height: 512 });
    expect(pwa.mask512).toEqual({ ok: true, width: 512, height: 512 });
    expect(pwa.swSupported).toBe(true);
    expect(pwa.swReady).toBe(true);


   assert.deepEqual(unexpected,[]);
   await context.close();console.log('PASS original PWA manifest/icons/registration assertions at '+width+'px on loopback only');
  }
  assert(requests.every(request=>request.method==='GET'));
 } finally {await browser.close();await new Promise(resolve=>proxy.close(resolve));await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
