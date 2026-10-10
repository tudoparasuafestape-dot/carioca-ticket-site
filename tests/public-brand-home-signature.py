"""Read-only, script-isolated public-brand visual regression. All traffic stays local."""
from pathlib import Path
from urllib.parse import urlsplit
import re,json,subprocess
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/public-brand/home-signature';OUT.mkdir(parents=True,exist_ok=True)
ORIGIN='http://127.0.0.1:4196';BASE='a555b3acdfa94490d33475b09404de38d07062d2';before=False;blocked=[];errors=[];checks=[];cache={}
pages={'/':('header .brand','footer .footer-home-link'),'/anuncie/':('header .ad-brand','footer .ad-brand'),'/como-funciona/':('header .brand','footer .brand')}
for name in ['ajuda','sobre','termos','privacidade','cancelamento-reembolso']:pages['/'+name+'/']=('header .brand','footer .footer-home-logo')
def source(path):
 if not before:return (ROOT/path).read_bytes()
 if path not in cache:
  local=ROOT.parent/'logo-light-home-base'/path
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
def luminance(rgb):
 values=[int(v)/255 for v in re.findall(r'\d+',rgb)[:3]]
 linear=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values]
 return sum(x*y for x,y in zip(linear,[.2126,.7152,.0722]))
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,args=['--no-sandbox']);context=browser.new_context(service_workers='block');context.route('**/*',route);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 for width in [320,390,768,1440]:
  for scale in [100,150]:
   for theme in ['light','dark']:
    for locale in ['pt-BR','en-US','es','zh-Hans']:
     page.set_viewport_size({'width':width,'height':900});before=True;page.goto(ORIGIN+'/');page.evaluate('v=>document.documentElement.dataset.homeTheme=v',theme);page.evaluate('v=>document.documentElement.style.fontSize=v+"px"',16*scale/100)
     if scale==100 and width in [320,1440] and locale=='pt-BR':page.locator('footer').screenshot(path=str(OUT/f'before-{width}-{theme}.png'))
     before=False;page.goto(ORIGIN+'/');page.evaluate('v=>document.documentElement.dataset.homeTheme=v',theme);page.evaluate('v=>document.documentElement.style.fontSize=v+"px"',16*scale/100);page.locator('html').evaluate('(e,v)=>e.lang=v',locale)
     logo=page.locator('.footer-home-link');header=page.locator('header .brand');assert logo.get_attribute('href')=='/' and logo.get_attribute('aria-label')=='Carioca Ticket'
     assert logo.locator('img').get_attribute('src')==header.locator('img').get_attribute('src')=='/assets/carioca-ticket-simbolo.png'
     assert logo.locator('img').get_attribute('alt')=='';assert logo.locator('img').evaluate('e=>e.complete && e.naturalWidth>0')
     assert logo.locator('span').inner_text()==header.locator('span').inner_text()
     assert logo.locator('img').evaluate('e=>getComputedStyle(e).filter')=='none'
     assert logo.evaluate('e=>getComputedStyle(e).backgroundColor')=='rgba(0, 0, 0, 0)'
     box=logo.bounding_box();assert box['width']>=44 and box['height']>=44 and box['x']>=0 and box['x']+box['width']<=width+1,(width,scale,theme,box)
     assert logo.evaluate('e=>e.scrollWidth<=e.clientWidth+1'),(width,scale,'brand overflow')
     fg=logo.locator('span').evaluate('e=>getComputedStyle(e).color');bg=page.locator('footer').evaluate('e=>getComputedStyle(e).backgroundColor');a,b=sorted([luminance(fg),luminance(bg)]);ratio=(b+.05)/(a+.05);assert ratio>=7,(theme,ratio)
     logo.focus();assert logo.evaluate('e=>e===document.activeElement');assert logo.evaluate('e=>getComputedStyle(e).outlineStyle')!='none'
     page.evaluate('document.activeElement.blur()')
     if locale=='pt-BR' and width in [320,1440]:
      page.locator('footer').screenshot(path=str(OUT/f'after-{width}-{scale}-{theme}.png'))
      page.locator('header').screenshot(path=str(OUT/f'header-{width}-{scale}-{theme}.png'))
     checks.append([width,scale,theme,locale,round(ratio,2)])
 page.goto(ORIGIN+'/');page.locator('.footer-home-link').focus()
 with page.expect_navigation(wait_until='load'):page.keyboard.press('Enter')
 assert page.url==ORIGIN+'/'
 context.close();browser.close()
assert not blocked,blocked
assert not errors,errors
(OUT/'results.json').write_text(json.dumps({'cases':len(checks),'matrix':checks,'textContrastAtLeast':7,'sameOfficialSymbolAndNameAsHeader':True,'noShadowOrBacking':True,'externalRequests':blocked,'errors':errors},indent=2))
print(f'{len(checks)} footer signature cases: theme-aware text contrast >=7:1, official existing header identity, focus/home preserved.')
