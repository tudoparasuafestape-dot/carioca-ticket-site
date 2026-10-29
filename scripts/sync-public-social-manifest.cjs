#!/usr/bin/env node
// Coleta apenas cards elegíveis publicados na HOME oficial. Não entra em checkout.
// Destino: proposta de PR, jamais commit direto em main ou deploy.
const fs=require('node:fs');
const path=require('node:path');
const { chromium }=require('@playwright/test');

const root=path.resolve(__dirname,'..');
const origin='https://cariocaticket.com.br';
const manifest=path.join(root,'social/events-publicados.json');
const clean=(x,max=350)=>String(x||'').replace(/[\u0000-\u001f\u007f<>]/g,'').trim().slice(0,max);
const idValid=id=>/^EVT-[A-Z0-9][A-Z0-9_-]{4,215}$/.test(id);
(async()=>{
  const browser=await chromium.launch({headless:true});
  let records;
  try {
    const page=await browser.newPage({serviceWorkers:'block'});
    await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:25000});
    await page.waitForFunction(()=>{
      const status=document.querySelector('#catalog-status');
      return status&&status.hidden&&document.querySelectorAll('.catalog-card[data-event-id]').length>0;
    },{timeout:25000});
    records=await page.locator('.catalog-card[data-event-id]').evaluateAll(cards=>cards.map(card=>{
      const id=card.dataset.eventId||'';
      const title=card.querySelector('.catalog-title a')?.textContent?.trim()||'';
      const date=card.querySelector('.catalog-meta')?.textContent?.trim()||'';
      const venue=card.querySelector('.catalog-venue')?.textContent?.trim()||'';
      const image=card.querySelector('.catalog-photo img');
      const imageUrl=image?.dataset.catalogSrc||image?.getAttribute('src')||'';
      const href=card.querySelector('.event-secondary')?.getAttribute('href')||'';
      return{id,title,description:[date,venue,'Ingressos oficiais pela Carioca Ticket.'].filter(Boolean).join(' · '),imageUrl,href};
    }));
  } finally{await browser.close();}
  if(!Array.isArray(records)||records.length===0||records.length>50)throw Error('CATALOG_EMPTY_OR_TOO_LARGE: manter manifesto inalterado');
  const seen=new Set(),events=[],unsupported=[];
  for(const e of records){
    if(!idValid(e.id)||seen.has(e.id))throw Error('CATALOG_INVALID_ID');
    seen.add(e.id);
    if(!e.title||e.title.length>180)throw Error('CATALOG_INVALID_NAME');
    const img=new URL(e.imageUrl,origin);
    if(img.origin!==origin||!/^\x2fassets\x2feventos\x2f[a-z0-9][a-z0-9._-]*\.jpe?g$/i.test(img.pathname)){
      unsupported.push(e.id+': capa ainda não espelhada em /assets/eventos/*.jpg');
      continue;
    }
    const target=path.join(root,img.pathname.slice(1));
    if(!fs.existsSync(target)){unsupported.push(e.id+': arquivo de capa ausente');continue;}
    const dest=new URL(e.href,origin);
    if(dest.origin!==origin||!['/evento/','/evento-v2/'].includes(dest.pathname)||
      dest.searchParams.get('evento')!==e.id)throw Error('CATALOG_BAD_DETAIL_ROUTE');
    events.push({id:e.id,title:clean(e.title,180),description:clean(e.description,380),
      cover:img.pathname,detail:dest.pathname,public:true});
  }
  if(unsupported.length)throw Error('PREVIEW_COVER_NOT_READY: '+unsupported.join('; '));
  if(!events.length)throw Error('CATALOG_NO_SUPPORTED_EVENTS');
  events.sort((a,b)=>a.id.localeCompare(b.id));
  const next={version:1,policy:'public-catalog-only',events};
  const content=JSON.stringify(next,null,2)+'\n';
  if(fs.readFileSync(manifest,'utf8')!==content)fs.writeFileSync(manifest,content);
  console.log('CT_SOCIAL_SYNC_PUBLIC_CATALOG_OK='+events.length);
})().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
