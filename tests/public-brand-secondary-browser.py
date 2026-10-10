"""Public logo presentation only. Production scripts and network are never executed."""
from pathlib import Path
from urllib.parse import urlsplit
import re,json,subprocess
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/public-brand-secondary';OUT.mkdir(parents=True,exist_ok=True)
ORIGIN='http://127.0.0.1:4198';BASE='7f86913bc3089eaf02632dc74c4743c937dac4d1';before=False;blocked=[];errors=[];checks=[];cache={}
wordmarks=['convite','minha-carioca','minha-carioca/login','minha-carioca/acesso','campanha','roda-de-samba']
symbols=['parceiro/programa','parceiro/manual','parceiro/conduta','parceiro/regulamento','produtor/solicitar']
def source(path):
 if not before:return (ROOT/path).read_bytes()
 if path not in cache:
  local=ROOT.parent/'public-brand-audit-base'/path
  cache[path]=local.read_bytes() if local.exists() else subprocess.check_output(['git','show',f'{BASE}:{path}'],cwd=ROOT)
 return cache[path]
def route(r):
 u=urlsplit(r.request.url)
 if u.scheme+'://'+u.netloc!=ORIGIN or r.request.method!='GET':blocked.append(r.request.url);return r.abort()
 path=u.path.lstrip('/')+('index.html' if u.path.endswith('/') else '');f=ROOT/path
 if not f.is_file():return r.fulfill(status=204,body='')
 data=source(path)
 if f.suffix=='.html':
  text=data.decode();text=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',text,flags=re.I)
  text=re.sub(r'<iframe\b[^>]*>[\s\S]*?</iframe>','',text,flags=re.I)
  text=re.sub(r'<link\b[^>]*href=["\']https?://[^>]*>','',text,flags=re.I)
  text=re.sub(r'<link\b[^>]*rel=["\'](?:manifest|prefetch|preconnect|dns-prefetch)["\'][^>]*>','',text,flags=re.I)
  # The producer-request loader is controlled by auth; hide it only in this static visual fixture.
  if path=='produtor/solicitar/index.html':text=text.replace('</head>','<style>#loading{display:none!important}</style></head>')
  data=text.encode()
 return r.fulfill(content_type={'.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}.get(f.suffix,'text/plain'),body=data)
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,args=['--no-sandbox']);context=browser.new_context(service_workers='block');context.route('**/*',route);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 for name in wordmarks+symbols:
  path='/'+name+'/';slug=name.replace('/','-');sel='.public-brand-wordmark' if name in wordmarks else '.brand'
  baseline='a.brand' if name=='convite' else '.top a:has(img)' if name.startswith('minha-carioca') else 'img.logo' if name in ['campanha','roda-de-samba'] else '.brand'
  for width in [320,390,768,1440]:
   for scale in [100,150]:
    page.set_viewport_size({'width':width,'height':900});before=True;page.goto(ORIGIN+path);page.evaluate('v=>document.documentElement.style.fontSize=v+"px"',16*scale/100)
    old=page.locator(baseline);href=old.get_attribute('href')
    if scale==100 and width in [320,1440]:old.screenshot(path=str(OUT/f'{slug}-before-{width}.png'))
    before=False;page.goto(ORIGIN+path);page.evaluate('v=>document.documentElement.style.fontSize=v+"px"',16*scale/100)
    logo=page.locator(sel);assert logo.count()==1 and logo.get_attribute('href')==href
    img=logo.locator('img');assert img.evaluate('e=>e.complete && e.naturalWidth>0');assert img.get_attribute('alt')=='Carioca Ticket'
    assert img.get_attribute('src')=='/assets/carioca-ticket-'+('logo' if name in wordmarks else 'simbolo')+'.png'
    box=logo.bounding_box();assert box['width']>=44 and box['height']>=44,(name,box)
    assert box['x']>=-1 and box['x']+box['width']<=width+1,(name,width,scale,box)
    assert img.evaluate('e=>getComputedStyle(e).backgroundColor')=='rgba(0, 0, 0, 0)'
    if href:
     logo.focus();assert logo.evaluate('e=>e===document.activeElement');assert logo.evaluate('e=>getComputedStyle(e).outlineStyle')!='none',(name,'focus')
    if width in [320,1440]:
     logo.screenshot(path=str(OUT/f'{slug}-after-{width}-{scale}.png'))
     if scale==100:page.screenshot(path=str(OUT/f'{slug}-context-{width}.png'),full_page=False)
    checks.append([name,width,scale])
  if href:
   page.goto(ORIGIN+path);page.locator(sel).focus()
   with page.expect_navigation(wait_until='load'):page.keyboard.press('Enter')
   assert page.url==ORIGIN+href
   page.go_back();assert page.url==ORIGIN+path
 context.close();browser.close()
assert not blocked,blocked
assert not errors,errors
(OUT/'results.json').write_text(json.dumps({'cases':len(checks),'matrix':checks,'externalRequests':blocked,'errors':errors,'keyboardLinksBack':True,'productionScriptsExecuted':False},indent=2))
print(f'{len(checks)} public logo cases; official artwork, layout, focus, links and Back verified.')
