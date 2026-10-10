"""Read-only, script-isolated public-brand visual regression. All traffic stays local."""
from pathlib import Path
from urllib.parse import urlsplit
import re,json,subprocess
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/public-brand';OUT.mkdir(parents=True,exist_ok=True)
ORIGIN='http://127.0.0.1:4196';BASE='7f86913bc3089eaf02632dc74c4743c937dac4d1';before=False;blocked=[];errors=[];checks=[];cache={}
pages={'/':('header .brand','footer .footer-home-link'),'/anuncie/':('header .ad-brand','footer .ad-brand'),'/como-funciona/':('header .brand','footer .brand')}
for name in ['ajuda','sobre','termos','privacidade','cancelamento-reembolso']:pages['/'+name+'/']=('header .brand','footer .footer-home-logo')
def source(path):
 if not before:return (ROOT/path).read_bytes()
 if path not in cache:
  local=ROOT.parent/'public-brand-audit-base'/path
  cache[path]=local.read_bytes() if local.exists() else subprocess.check_output(['git','show',f'{BASE}:{path}'],cwd=ROOT)
 return cache[path]
def route(r):
 u=urlsplit(r.request.url)
 if u.scheme+'://'+u.netloc!=ORIGIN or r.request.method!='GET':blocked.append(r.request.url);return r.abort()
 path=u.path.lstrip('/')+('index.html' if u.path.endswith('/') else '')
 f=ROOT/path
 if not f.is_file():return r.fulfill(status=204,body='')
 data=source(path)
 if f.suffix=='.html':
  text=data.decode();text=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',text,flags=re.I)
  text=re.sub(r'<iframe\b[^>]*>[\s\S]*?</iframe>','',text,flags=re.I)
  text=re.sub(r'<link\b[^>]*href=["\']https?://[^>]*>','',text,flags=re.I)
  text=re.sub(r'<link\b[^>]*rel=["\'](?:manifest|prefetch|preconnect|dns-prefetch)["\'][^>]*>','',text,flags=re.I)
  # Only static page content and styles; no production script, auth, RPC or telemetry.
  data=text.encode()
 return r.fulfill(content_type={'.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}.get(f.suffix,'text/plain'),body=data)
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,args=['--no-sandbox']);context=browser.new_context(service_workers='block');context.route('**/*',route);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 for path,selectors in pages.items():
  slug=path.strip('/') or 'home';themes=['dark','light'] if path in ['/','/anuncie/','/como-funciona/'] else ['dark']
  for theme in themes:
   for width in [320,390,768,1440]:
    for scale in [100,150]:
     page.set_viewport_size({'width':width,'height':900});before=True;page.goto(ORIGIN+path);page.evaluate('v=>document.documentElement.dataset.homeTheme=v',theme);page.evaluate('v=>document.documentElement.style.fontSize=v+"px"',16*scale/100)
     previous={s:page.locator(s).get_attribute('href') for s in selectors}
     if scale==100 and width in [320,1440]:
      for name,sel in zip(['header','footer'],selectors):page.locator(sel).screenshot(path=str(OUT/f'{slug}-{name}-before-{width}-{theme}.png'))
     before=False;page.goto(ORIGIN+path);page.evaluate('v=>document.documentElement.dataset.homeTheme=v',theme);page.evaluate('v=>document.documentElement.style.fontSize=v+"px"',16*scale/100)
     for name,sel in zip(['header','footer'],selectors):
      logo=page.locator(sel);assert logo.count()==1 and logo.get_attribute('href')==previous[sel]
      image=logo.locator('img');assert image.evaluate('e=>e.complete && e.naturalWidth>0')
      assert image.get_attribute('alt') is not None
      box=logo.bounding_box();assert box['width']>=44 and box['height']>=44,(path,sel,box)
      assert box['x']>=-1 and box['x']+box['width']<=width+1,(path,sel,width,scale,box)
      assert logo.evaluate('e=>getComputedStyle(e).backgroundColor')=='rgba(0, 0, 0, 0)',(path,sel)
      assert image.evaluate('e=>getComputedStyle(e).backgroundColor')=='rgba(0, 0, 0, 0)',(path,sel)
      logo.focus();assert logo.evaluate('e=>e===document.activeElement');assert logo.evaluate('e=>getComputedStyle(e).outlineStyle')!='none',(path,sel,'focus')
      if width in [320,1440]:logo.screenshot(path=str(OUT/f'{slug}-{name}-after-{width}-{scale}-{theme}.png'))
     if scale==100 and width in [320,1440]:
      page.locator('footer').screenshot(path=str(OUT/f'{slug}-footer-context-{width}-{theme}.png'))
      page.locator('header').screenshot(path=str(OUT/f'{slug}-header-context-{width}-{theme}.png'))
     checks.append([path,width,scale,theme])
  # Existing native navigation only; the destination is fulfilled from static files.
  for sel in selectors:
   page.goto(ORIGIN+path);page.locator(sel).focus();page.keyboard.press('Enter');page.wait_for_url(ORIGIN+'/')
   if path!='/':page.go_back();page.wait_for_url(ORIGIN+path)
 context.close();browser.close()
assert not blocked,blocked
assert not errors,errors
(OUT/'results.json').write_text(json.dumps({'matrix':checks,'cases':len(checks),'logosVerified':len(checks)*2,'externalRequests':blocked,'errors':errors,'linksKeyboardBack':True,'noProductionScripts':True},indent=2))
print(f'{len(checks)} page/viewport/font/theme cases, {len(checks)*2} logos; keyboard/native links/Back passed, no external requests.')
