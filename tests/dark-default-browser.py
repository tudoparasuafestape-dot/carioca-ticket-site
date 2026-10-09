"""Offline browser tests: every request intercepted; no RPC, analytics or purchases."""
from pathlib import Path
from urllib.parse import urlsplit
import json, os, re
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'test-results/dark-default'; OUT.mkdir(parents=True,exist_ok=True)
ORIGIN='http://127.0.0.1:42974'; errors=[]; external=[]; checks=[]
allowed={'home-theme.js','home-i18n.js','home-advertisements.js'}
def route(r):
 u=urlsplit(r.request.url)
 if not r.request.url.startswith(ORIGIN+'/') or r.request.method!='GET': external.append(r.request.url);return r.abort()
 f=ROOT/(u.path.lstrip('/')+('index.html' if u.path.endswith('/') else ''))
 if f.suffix=='.js' and f.name not in allowed:return r.fulfill(content_type='text/javascript',body='')
 if not f.is_file():return r.fulfill(status=204,body='')
 body=f.read_bytes();mime='text/css' if f.suffix=='.css' else 'text/javascript' if f.suffix=='.js' else 'text/html' if f.suffix=='.html' else 'image/png'
 if f.suffix=='.html':
  body=re.sub(r'<script(?![^>]*\bsrc=)[^>]*>.*?</script>','',body.decode(),flags=re.S).encode()
 return r.fulfill(content_type=mime,body=body)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox'])
 for osmode in ['light','dark']:
  for saved in [None,'light','dark','system','invalid','blocked']:
   c=b.new_context(color_scheme=osmode,service_workers='block');c.route('**/*',route)
   if saved=='blocked':c.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw Error('blocked')}})")
   elif saved is not None:c.add_init_script('localStorage.setItem("ct-home-theme",'+json.dumps(saved)+')')
   c.add_init_script("window.paints=[];new PerformanceObserver(l=>{for(const e of l.getEntries())paints.push({name:e.name,theme:document.documentElement.dataset.homeTheme})}).observe({type:'paint',buffered:true})")
   page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   for path in ['/','/anuncie/','/evento/','/evento-v2/']:
    page.goto(ORIGIN+path);expected=osmode if saved=='system' else saved if saved in ['light','dark'] else 'dark'
    assert page.locator('html').get_attribute('data-home-theme')==expected,(path,osmode,saved)
    assert page.locator('#home-theme').input_value()==('system' if saved=='system' else expected)
    page.reload();assert page.locator('html').get_attribute('data-home-theme')==expected
    assert all(x['theme']==expected for x in page.evaluate('paints'))
    checks.append([path,osmode,saved,expected])
   c.close()
 # Real user changes persist, follow OS only when explicitly requested, and sync across tabs.
 c=b.new_context(color_scheme='light',service_workers='block');c.route('**/*',route);page=c.new_page();page.goto(ORIGIN+'/');other=c.new_page();other.goto(ORIGIN+'/anuncie/')
 for choice in ['light','dark','system']:
  page.select_option('#home-theme',choice);page.reload();assert page.locator('#home-theme').input_value()==choice
  other.wait_for_function('(v)=>document.querySelector("#home-theme").value===v',arg=choice)
 page.emulate_media(color_scheme='dark');page.wait_for_function("document.documentElement.dataset.homeTheme==='dark'")
 page.emulate_media(color_scheme='light');page.wait_for_function("document.documentElement.dataset.homeTheme==='light'")
 page.select_option('#home-theme','dark');page.emulate_media(color_scheme='light');assert page.locator('html').get_attribute('data-home-theme')=='dark'
 # Test rendered, cloned carousel slides; no link activation from rotation, focus, or touch cancel.
 assert page.locator('.ad-house a[href="/anuncie/"]').count()==2
 for width in [320,390,1440]:
  page.set_viewport_size(dict(width=width,height=1000))
  for slot in ['advertising-primary','advertising-secondary']:
   house=page.locator('#'+slot+' .ad-house');nextbutton=page.locator('#'+slot+' .ad-controls button').last
   if not house.is_visible():nextbutton.click()
   link=house.locator('a[href="/anuncie/"]');assert link.is_visible();assert link.inner_text()=='Saiba mais';assert house.locator('a[href^="https://wa.me/5581999311509"]').count()==1
   box=link.bounding_box();assert box['height']>=44 and box['x']>=0 and box['x']+box['width']<=width+1
   link.focus();page.keyboard.press('Tab');assert page.url==ORIGIN+'/'
   link.dispatch_event('pointerdown',dict(pointerId=1,isPrimary=True,button=0,pointerType='touch'));page.dispatch_event('body','pointercancel',dict(pointerId=1,pointerType='touch'));assert page.url==ORIGIN+'/'
   page.locator('#'+slot).screenshot(path=str(OUT/f'{slot}-{width}.png'))
 for locale,label in [('pt-BR','Saiba mais'),('en-US','Learn more'),('es','Más información'),('zh-Hans','了解更多')]:
  page.evaluate('l=>{CTHome.setLocale(l)}',locale)
  assert page.locator('.ad-house a[href="/anuncie/"]').first.inner_text()==label
 # Native explicit secondary CTA navigates to the existing destination, and Back works.
 link=page.locator('#advertising-primary .ad-house a[href="/anuncie/"]');link.click();page.wait_for_url(ORIGIN+'/anuncie/');page.go_back();assert page.url==ORIGIN+'/'
 assert page.locator('.ad-campaign[href^="https://wa.me/5581995023085"]').count()==1
 assert page.locator('.ad-campaign[href^="https://wa.me/5581996200696"]').count()==1
 c.close()
 # CSS alone is dark even under a light OS, including JS/storage failure fallback.
 c=b.new_context(java_script_enabled=False,color_scheme='light');c.route('**/*',route);page=c.new_page();page.goto(ORIGIN+'/');assert page.locator('html').evaluate('e=>getComputedStyle(e).colorScheme')=='dark';c.close();b.close()
assert not errors,errors
assert not external,external
(OUT/'results.json').write_text(json.dumps(dict(theme_checks=checks,errors=errors,external=external),indent=2))
print('48 route/theme/reload cases, persistence, OS change, cross-tab sync, no-JS and carousel CTA tests passed.')
