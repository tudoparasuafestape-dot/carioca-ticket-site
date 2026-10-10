"""Real public login rendering with empty isolated storage and every external request blocked."""
from pathlib import Path
from urllib.parse import urlsplit
import re,json,subprocess
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/public-login-markup';OUT.mkdir(parents=True,exist_ok=True)
ORIGIN='http://127.0.0.1:4199';BASE='b9083c93ff81299d09e60ce3243fb5f98efc5b65';before=False;blocked=[];errors=[];checks=[];cache={}
def source(path):
 if not before:return (ROOT/path).read_bytes()
 if path not in cache:cache[path]=subprocess.check_output(['git','show',f'{BASE}:{path}'],cwd=ROOT)
 return cache[path]
def route(r):
 u=urlsplit(r.request.url)
 if u.scheme+'://'+u.netloc!=ORIGIN or r.request.method!='GET':blocked.append(r.request.url);return r.abort()
 path=u.path.lstrip('/')+('index.html' if u.path.endswith('/') else '');f=ROOT/path
 if not f.is_file():return r.fulfill(status=204,body='')
 data=source(path)
 if f.suffix=='.html':
  # No remote bridge document is loaded; empty storage causes the real script to render its local login form.
  text=re.sub(r'<iframe\b[^>]*>[\s\S]*?</iframe>','',data.decode(),flags=re.I);data=text.encode()
 return r.fulfill(content_type={'.html':'text/html','.png':'image/png','.css':'text/css'}.get(f.suffix,'text/plain'),body=data)
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,args=['--no-sandbox']);context=browser.new_context(service_workers='block');context.route('**/*',route);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 for name in ['login','acesso']:
  for width in [320,390,768,1440]:
   for scale in [100,150]:
    page.set_viewport_size({'width':width,'height':900});before=True;page.goto(ORIGIN+'/minha-carioca/'+name+'/');page.evaluate('v=>document.documentElement.style.fontSize=v+"px"',16*scale/100)
    assert 'function officialPurchaseLink' in page.locator('body').inner_text()
    if scale==100 and width in [320,1440]:page.screenshot(path=str(OUT/f'{name}-before-{width}.png'))
    before=False;page.goto(ORIGIN+'/minha-carioca/'+name+'/');page.evaluate('v=>document.documentElement.style.fontSize=v+"px"',16*scale/100)
    assert 'function officialPurchaseLink' not in page.locator('body').inner_text()
    assert page.locator('#app input').count()>0
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    assert page.evaluate('localStorage.length')==0
    logo=page.locator('.public-brand-wordmark');assert logo.get_attribute('href')=='/';logo.focus();assert logo.evaluate('e=>e===document.activeElement')
    if width in [320,1440]:page.screenshot(path=str(OUT/f'{name}-after-{width}-{scale}.png'))
    checks.append([name,width,scale])
 context.close();browser.close()
assert not errors,errors
assert not blocked,blocked
(OUT/'results.json').write_text(json.dumps({'cases':len(checks),'matrix':checks,'externalRequests':blocked,'pageErrors':errors,'storageEmpty':True,'noAuthInteraction':True},indent=2))
print(f'{len(checks)} real public login renders: no stray source text, no overflow, no remote/auth requests, empty storage preserved.')
