"""Loopback-only browser checks. Start event-language-preview.cjs first."""
import json, os, traceback
from pathlib import Path
from playwright.sync_api import sync_playwright
ORIGIN='http://127.0.0.1:42975'
OUT=Path('test-results/event-language');OUT.mkdir(parents=True,exist_ok=True)
results=[]
SPEECH="""(() => {
const log=window.__speech={said:[],cancels:0,voices:[{lang:'pt-BR',localService:true},{lang:'en-US',localService:true},{lang:'es',localService:true},{lang:'zh-CN',localService:true}]};
window.SpeechSynthesisUtterance=function(text){this.text=text;};
Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>log.voices,addEventListener:()=>{},speak:u=>{log.said.push({text:u.text,lang:u.lang});log.current=u;setTimeout(()=>u.onstart&&u.onstart(),0);},cancel:()=>log.cancels++,pause:()=>log.current.onpause(),resume:()=>log.current&&log.current.onresume&&log.current.onresume()}});
Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__clipboard=text;}}});
Object.defineProperty(navigator,'share',{value:async data=>{window.__share=data;}});
})()"""
def run(name,fn):
 try:fn();results.append({'test':name,'status':'passed'})
 except Exception as e:results.append({'test':name,'status':'failed','error':str(e),'traceback':traceback.format_exc()});print('FAIL',name,traceback.format_exc())
def page_for(browser,locale='pt-BR',blocked=False):
 context=browser.new_context(service_workers='block',viewport={'width':1440,'height':1000})
 blocked_requests=[]
 def route(r):
  if r.request.url.startswith(ORIGIN+'/'):r.continue_()
  else:blocked_requests.append(r.request.url);r.abort()
 context.route('**/*',route)
 page=context.new_page();page.add_init_script(SPEECH)
 page.add_init_script("if(window===window.top&&!sessionStorage.getItem('__fixtureLocaleSeeded')){try{localStorage.setItem('ct-home-locale',"+json.dumps(locale)+");}catch(e){}sessionStorage.setItem('__fixtureLocaleSeeded','1');}")
 if blocked:page.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked storage');}});")
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 return context,page,blocked_requests,errors
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,**({'executable_path':os.environ['CT_CHROMIUM']} if os.getenv('CT_CHROMIUM') else {}))
 for route in ['evento','evento-v2']:
  for locale in ['pt-BR','en-US','es','zh-Hans']:
   def matrix(route=route,locale=locale):
    context,page,requests,errors=page_for(browser,locale)
    try:
     page.goto(f'{ORIGIN}/{route}/?evento=PREVIEW-EVENT');page.locator('#app').wait_for(state='visible')
     assert page.locator('html').get_attribute('lang')==locale
     assert page.locator('#event-language').input_value()==locale
     assert page.locator('#eventName').inner_text()=='Encontro de música — demonstração'
     assert page.locator('#dateTime').inner_text()=='20/12/2030 · 18h às 22h'
     assert page.locator('#startingPrice').inner_text()=='R$ 35,00'
     assert page.locator('#longDescription').get_attribute('lang')=='pt-BR'
     assert page.locator('#producer-language-notice').is_visible()==(locale!='pt-BR')
     assert '/checkout'+('-v2' if route=='evento-v2' else '')+'/?evento=PREVIEW-EVENT'==page.locator('#buyHero').get_attribute('href')
     assert page.evaluate("[...document.querySelectorAll('[data-public-i18n]')].every(n=>n.textContent===CTPublicI18n.message(n.dataset.publicI18n).text)")
     overflows=[]
     for width in [320,390,1440]:
      page.set_viewport_size({'width':width,'height':1000})
      for theme in ['light','dark']:
       page.select_option('#home-theme',theme);page.wait_for_timeout(250)
       assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),f'overflow {width} {locale} {theme}'
       for selector in ['#event-language','#buyHero','#description-listen']:
        assert page.locator(selector).is_visible()
       page.screenshot(path=str(OUT/f'{route}-{locale}-{width}-{theme}.png'),full_page=True)
     page.evaluate("[...document.querySelectorAll('body *')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]).forEach(([n,s])=>n.style.fontSize=(s*1.5)+'px')")
     for width in [320,390,1440]:
      page.set_viewport_size({'width':width,'height':1000})
      page.screenshot(path=str(OUT/f'{route}-{locale}-{width}-text150.png'),full_page=True)
      if not page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'):
       overflows.append({'width':width,'elements':page.evaluate("[...document.querySelectorAll('body *')].filter(n=>{const r=n.getBoundingClientRect();return r.width&&r.right>innerWidth+1}).map(n=>({tag:n.tagName,id:n.id,cls:n.className,right:n.getBoundingClientRect().right,width:n.getBoundingClientRect().width,text:n.innerText?.slice(0,80)})).slice(-25)")})
     page.set_viewport_size({'width':1440,'height':1000})
     page.locator('#shareHero').click();assert page.locator('#shareMenu').is_visible()
     page.keyboard.press('Shift+Tab');assert page.locator('#copyLinkAction').evaluate('n=>n===document.activeElement')
     page.keyboard.press('Tab');assert page.locator('#shareMenuClose').evaluate('n=>n===document.activeElement')
     page.keyboard.press('Escape');assert page.locator('#shareMenu').is_hidden()
     assert page.locator('#shareHero').evaluate('n=>n===document.activeElement')
     for i in range(3):page.locator('#shareHero').click();page.locator('#shareMenuClose').click()
     page.locator('#shareHero').click();page.locator('#copyLinkAction').click()
     assert page.evaluate('window.__clipboard')==f'{ORIGIN}/{route}/?evento=PREVIEW-EVENT'
     page.locator('#shareHero').click();page.locator('#shareNativeAction').click()
     assert page.evaluate('window.__share.url')==f'{ORIGIN}/{route}/?evento=PREVIEW-EVENT'
     page.locator('#directions-copy').click();assert 'Rua de teste, 123' in page.evaluate('window.__clipboard')
     page.locator('#description-listen').click();page.wait_for_timeout(50)
     assert page.evaluate('__speech.said[0].lang')=='pt-BR'
     page.select_option('#event-language','es' if locale!='es' else 'en-US');assert page.evaluate('__speech.cancels')>=1
     assert page.evaluate('window.__previewCalls')==1
     page.evaluate("localStorage.setItem('ct-home-locale','zh-Hans');dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))")
     assert page.locator('#event-language').input_value()=='zh-Hans'
     page.evaluate("dispatchEvent(new StorageEvent('storage',{key:'ct-home-locale',newValue:'en-US',storageArea:localStorage}))")
     assert page.locator('#event-language').input_value()=='en-US'
     page.evaluate("dispatchEvent(new StorageEvent('storage',{key:'ct-home-locale',newValue:'es',storageArea:sessionStorage}))")
     assert page.locator('#event-language').input_value()=='en-US'
     page.evaluate("history.pushState({},'',location.href+'&preview=1')")
     page.locator('#shareHero').click();page.go_back();assert page.locator('#shareMenu').is_hidden()
     assert not errors,errors
     assert not requests,requests
     assert not overflows,overflows
    finally:context.close()
   run(route+' '+locale+' matrix',matrix)
  def fallback(route=route):
   context,page,requests,errors=page_for(browser,'pt-BR',True)
   try:
    page.goto(f'{ORIGIN}/{route}/?evento=PREVIEW-EVENT');page.locator('#app').wait_for(state='visible')
    page.select_option('#event-language','en-US');assert page.locator('html').get_attribute('lang')=='en-US'
    page.evaluate('__speech.voices=[{lang:"en-US",localService:true},{lang:"pt-BR",localService:false}]')
    page.select_option('#event-language','es');assert page.locator('#description-listen').is_disabled()
    assert not errors,errors
   finally:context.close()
  run(route+' blocked storage and no suitable local voice',fallback)
  def error(route=route):
   context,page,requests,errors=page_for(browser,'en-US')
   try:
    page.goto(f'{ORIGIN}/{route}/?evento=PREVIEW-EVENT&scenario=failure');page.locator('#errorBox').wait_for(state='visible')
    assert page.locator('#errorText').inner_text()=='Mensagem original da organização'
    assert page.locator('#errorText').get_attribute('lang')=='pt-BR'
    page.select_option('#event-language','zh-Hans');assert page.locator('#errorText').inner_text()=='Mensagem original da organização'
    page.goto(f'{ORIGIN}/{route}/');page.locator('#errorBox').wait_for(state='visible')
    assert page.locator('#errorText').inner_text()!='O link não informou qual evento deve ser aberto.'
    assert not errors,errors
   finally:context.close()
  run(route+' errors preserve source',error)
  def missing_core(route=route):
   context,page,requests,errors=page_for(browser,'en-US')
   context.route('**/assets/public-i18n.js*',lambda r:r.fulfill(content_type='text/javascript',body='// unavailable core fixture'))
   try:
    page.goto(f'{ORIGIN}/{route}/?evento=PREVIEW-EVENT&scenario=fallback-fields');page.locator('#app').wait_for(state='visible')
    assert page.locator('#eventName').inner_text()=='Evento'
    assert page.locator('#event-language').is_hidden()
    assert page.locator('#buyHero').get_attribute('href').endswith('evento=PREVIEW-EVENT')
    assert not errors,errors
    assert not requests,requests
   finally:context.close()
  run(route+' absent core falls back without blocking event',missing_core)
 def continuity():
  context,page,requests,errors=page_for(browser,'en-US')
  try:
   page.goto(ORIGIN+'/evento/?evento=PREVIEW-EVENT');page.locator('#app').wait_for(state='visible')
   page.select_option('#event-language','es')
   page.goto(ORIGIN+'/evento-v2/?evento=PREVIEW-EVENT&cupom=DEMO&src=CANARIO&csid=preview&seller=synthetic&refcode=ABC')
   page.locator('#app').wait_for(state='visible')
   assert page.locator('#event-language').input_value()=='es'
   before=page.locator('#buyHero').get_attribute('href')
   assert before=='/checkout-v2/?evento=PREVIEW-EVENT&cupom=DEMO&src=CANARIO&csid=preview&seller=synthetic&refcode=ABC'
   assert 'DEMO' in page.locator('#campaignNotice').inner_text()
   page.select_option('#event-language','zh-Hans')
   assert before==page.locator('#buyHero').get_attribute('href')
   assert not page.locator('#campaignNotice').inner_text().startswith('Você')
   page.locator('#shareHero').click();page.locator('#copyLinkAction').click()
   assert page.evaluate('window.__clipboard')==ORIGIN+'/evento-v2/?evento=PREVIEW-EVENT'
   page.go_back();page.locator('#app').wait_for(state='visible')
   print("CONTINUITY_BACK",page.evaluate("({locale:CTPublicI18n.getLocale(),stored:localStorage.getItem('ct-home-locale'),seed:sessionStorage.getItem('__fixtureLocaleSeeded'),selected:document.getElementById('event-language').value,url:location.href})"))
   page.wait_for_function("document.getElementById('event-language').value==='zh-Hans'",timeout=5000)
   assert page.locator('#event-language').input_value()=='zh-Hans',page.evaluate("({locale:CTPublicI18n.getLocale(),stored:localStorage.getItem('ct-home-locale'),seed:sessionStorage.getItem('__fixtureLocaleSeeded'),url:location.href})")
   assert not errors,errors
   assert not requests,requests
  finally:context.close()
 run('legacy/current continuity and campaign invariants',continuity)
 browser.close()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps(results,ensure_ascii=False,indent=2))
assert all(r['status']=='passed' for r in results),'Browser regression failures'
