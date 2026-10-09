"""Isolated browser QA. All positions are fixtures; never calls device geolocation."""
from playwright.sync_api import sync_playwright
from pathlib import Path
from urllib.parse import urlsplit
import json,re,time,os
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/location';OUT.mkdir(parents=True,exist_ok=True)
ORIGIN='http://127.0.0.1:4198';requests=[];errors=[];results=[]
def route(r):
 u=r.request.url;p=urlsplit(u).path
 assert u.startswith(ORIGIN),u
 requests.append(p)
 if p=='/':
  s=(ROOT/'index.html').read_text();s=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',s,flags=re.I)
  s=re.sub(r'<link[^>]+rel="(?:manifest|prefetch)"[^>]*>','',s)
  s=s.replace('</body>',''.join('<script src="/assets/'+n+'.js"></script>' for n in ['home-i18n','home-controls','home-location'])+'</body>')
  return r.fulfill(content_type='text/html',body=s)
 if p=='/navigation-fixture':return r.fulfill(content_type='text/html',body='<!doctype html><title>Navigation fixture</title><p>Local fixture</p>')
 f=ROOT/p.lstrip('/')
 if f.is_file():return r.fulfill(content_type={'.json':'application/json','.css':'text/css','.js':'text/javascript'}.get(f.suffix,'text/plain'),body=f.read_bytes())
 return r.fulfill(status=200,content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')
INIT="""
window.__calls=[];Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,error,options){window.__calls.push({ok,error,options});}}});
window.__geoOK=()=>{let c=window.__calls.at(-1);c.ok({coords:{longitude:-34.9,latitude:-8.06,accuracy:30}});};
window.__long=[];new PerformanceObserver(list=>{window.__long.push(...list.getEntries().map(e=>e.duration));}).observe({entryTypes:['longtask']});
"""
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH',pw.chromium.executable_path),headless=True,args=['--no-sandbox'])
 context=browser.new_context(service_workers='block');context.route('**/*',route);context.add_init_script(INIT)
 page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 def fresh(locale='pt-BR',width=320):
  requests.clear();page.set_viewport_size({'width':width,'height':900});page.goto(ORIGIN);page.evaluate('(l)=>CTHome.setLocale(l)',locale);page.locator('.location-trigger').first.click();page.wait_for_function('!document.querySelector("#location-apply").disabled');assert page.evaluate('__calls.length')==0;assert not any('/geo-ibge-' in p for p in requests)
 def begin():page.locator('#location-use-device').click();assert page.evaluate('__calls.length')==1
 for locale in ['pt-BR','en-US','es','zh-Hans']:
  for width in [320,1440]:
   page.evaluate('localStorage.clear()') if page.url.startswith(ORIGIN) else None
   fresh(locale,width);page.locator('#location-use-device').focus();page.keyboard.press('Enter');start=time.perf_counter();page.evaluate('__long=[];__geoOK()');page.wait_for_function('!document.querySelector("#location-device-confirm").parentElement.hidden');elapsed=round((time.perf_counter()-start)*1000)
   assert page.evaluate('CTHome.filters.location') is None
   assert 'Recife' in page.locator('#location-device-status').inner_text()
   assert page.locator('#location-device-confirm').evaluate('e=>e===document.activeElement')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   assert page.locator('#location-dialog').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
   assert sorted(set(p for p in requests if '/geo-ibge-' in p))==['/assets/geo-ibge-2025/PE.json','/assets/geo-ibge-2025/UF.json']
   if width==320:page.screenshot(path=str(OUT/(locale+'-320.png')))
   long=page.evaluate('__long');page.keyboard.press('Enter');assert page.evaluate('CTHome.filters.location.id')=='2611606';assert not page.locator('#location-dialog').evaluate('e=>e.open')
   results.append({'locale':locale,'width':width,'suggestionMs':elapsed,'mainThreadLongTasksMs':long})
 # Error callbacks and accuracy fallback preserve the current manual selection.
 for code,status in [(1,'denied'),(2,'unavailable'),(3,'timeout')]:
  fresh();begin();page.evaluate('(code)=>__calls[0].error({code})',code);assert page.locator('#location-device-confirm').is_hidden();assert page.locator('#location-device-status').inner_text();assert not any('/geo-ibge-' in p for p in requests);assert page.evaluate('CTHome.filters.location.id')=='2611606'
 fresh();begin();page.evaluate('__calls[0].ok({coords:{longitude:-34.9,latitude:-8.06,accuracy:10000}})');assert 'imprecisa' in page.locator('#location-device-status').inner_text();assert not any('/geo-ibge-' in p for p in requests)
 # Cancel, Escape, manual edits and manual apply all invalidate late callbacks.
 for action in ['cancel','escape','manual','apply']:
  fresh();begin()
  if action=='cancel':page.locator('#location-device-cancel').click()
  elif action=='escape':page.keyboard.press('Escape')
  else:
   page.select_option('#location-uf','SP')
   if action=='apply':page.locator('#location-apply').click()
  page.evaluate('__geoOK()');page.wait_for_timeout(50);assert not any('/geo-ibge-' in p for p in requests);assert page.locator('#location-device-confirm').is_hidden()
  if action=='apply':assert page.evaluate('CTHome.filters.location.uf')=='SP'
 # A canceled in-flight worker cannot install a suggestion afterwards.
 fresh();page.evaluate("() => { window.Worker=class{constructor(){window.__fakeWorker=this}postMessage(){}terminate(){this.terminated=true}}; }")
 begin();page.evaluate('__geoOK()');page.wait_for_function('!!window.__fakeWorker');page.locator('#location-device-cancel').click();page.evaluate('__fakeWorker.onmessage({data:{status:"found",id:"2611606",uf:"PE"}})');assert page.locator('#location-device-confirm').is_hidden();assert page.evaluate('__fakeWorker.terminated')
 # Overall deadline, including an unanswered browser permission prompt.
 fresh();page.evaluate('() => { window.__realTimeout=setTimeout;window.setTimeout=(f,ms,...args)=>__realTimeout(f,ms===25000?30:ms,...args); }');begin();page.wait_for_function('!document.querySelector("#location-use-device").disabled');assert 'demorou' in page.locator('#location-device-status').inner_text();page.evaluate('__geoOK()');assert page.locator('#location-device-confirm').is_hidden()
 # Real navigation: stale location work must not survive leaving or Back/Forward.
 fresh();begin();page.goto(ORIGIN+'/navigation-fixture');requests.clear();page.go_back();page.wait_for_function('!!window.CTHome');page.wait_for_timeout(50)
 assert not any('/geo-ibge-' in p for p in requests)
 page.evaluate('if (__calls.length) __geoOK()');page.wait_for_timeout(50);assert page.locator('#location-device-confirm').is_hidden()
 page.go_forward();requests.clear();page.go_back();page.wait_for_function('!!window.CTHome');page.wait_for_timeout(50)
 assert not any('/geo-ibge-' in p for p in requests);assert page.locator('#location-device-confirm').is_hidden()
 # Storage can be denied by privacy mode; confirm and manual selection still work.
 context.close();context=browser.new_context(service_workers='block');context.route('**/*',route);context.add_init_script(INIT)
 context.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('storage denied')}})")
 page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));fresh();begin();page.evaluate('__geoOK()');page.wait_for_function('!document.querySelector("#location-device-confirm").parentElement.hidden');page.locator('#location-device-confirm').click()
 assert page.evaluate('CTHome.filters.location.id')=='2611606'
 page.locator('.location-trigger').first.click();page.select_option('#location-uf','SP');page.locator('#city-search').fill('São Paulo');page.locator('[data-city-id="3550308"]').click();page.locator('#location-apply').click()
 assert page.evaluate('CTHome.filters.location.id')=='3550308';assert not context.cookies()
 assert not errors,errors
 context.close();browser.close()
(OUT/'results.json').write_text(json.dumps({'matrix':results,'errorCallbacks':True,'manualRace':True,'cancelRace':True,'workerRace':True,'keyboard':True,'permissionDeadline':True,'backForward':True,'storageDenied':True,'noCookies':True,'realGeolocationCalls':0,'externalRequests':0,'errors':errors},indent=2))
print(json.dumps(results));print('All isolated browser checks passed.')
