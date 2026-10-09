"""Isolated UI checks: python tests/advertise-browser.py (Playwright + Chromium)."""
from playwright.sync_api import sync_playwright
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
import json,os
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/advertise';OUT.mkdir(parents=True,exist_ok=True)
ORIGIN='http://127.0.0.1:4197';checks=[];blocked=[];errors=[]
def route(r):
 u=r.request.url;p=urlsplit(u).path
 if u.startswith(ORIGIN) and r.request.method=='GET':
  if p=='/':return r.fulfill(content_type='text/html',body='<h1>Home fixture</h1>')
  f=ROOT/(p.lstrip('/')+('index.html' if p.endswith('/') else ''))
  if f.is_file():return r.fulfill(content_type={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png'}.get(f.suffix,'text/plain'),body=f.read_bytes())
 blocked.append(u);r.abort()
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH',pw.chromium.executable_path),headless=True,args=['--no-sandbox'])
 context=browser.new_context(service_workers='block');context.route('**/*',route);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 for width in [320,390,768,1440]:
  for theme in ['light','dark']:
   page.set_viewport_size({'width':width,'height':1000});page.goto(ORIGIN+'/anuncie/');page.select_option('#home-theme',theme)
   for locale in ['pt-BR','en-US','es','zh-Hans']:
    page.select_option('#advertise-language',locale)
    assert page.locator('html').get_attribute('lang')==locale
    if not page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'):
     page.screenshot(path=str(OUT/f'overflow-{width}-{theme}-{locale}.png'),full_page=True)
     print(page.evaluate("[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>[e.tagName,e.className,e.getBoundingClientRect().right])"))
     raise AssertionError((width,theme,locale))
    for a in page.locator('[data-proposal]').all():
     u=urlsplit(a.get_attribute('href'));q=parse_qs(u.query)
     assert u.scheme=='https' and u.netloc=='wa.me' and u.path=='/5581999311509'
     assert len(q['text'][0])>20 and 'Carioca Ticket' in q['text'][0]
     assert a.get_attribute('target')=='_blank' and a.get_attribute('rel')=='noopener noreferrer'
     b=a.bounding_box();assert b['width']>=44 and b['height']>=44
    assert page.locator('[data-ad-text]').evaluate_all('(nodes)=>nodes.every(n=>n.textContent.trim()&&n.lang===document.documentElement.lang)')
    if locale=='pt-BR' and width in [320,1440]:page.screenshot(path=str(OUT/f'advertise-{width}-{theme}.png'),full_page=True)
    checks.append([width,theme,locale])
 page.select_option('#advertise-language','en-US');page.reload();assert page.locator('html').get_attribute('lang')=='en-US'
 page.set_viewport_size({'width':320,'height':1000});page.evaluate("document.documentElement.style.fontSize='24px'")
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'150% text'
 page.locator('.skip-link').focus();page.keyboard.press('Enter');assert page.locator('#conteudo').evaluate('(e)=>e===document.activeElement')
 page.locator('.ad-brand').first.focus();assert page.locator('.ad-brand').first.evaluate("e=>getComputedStyle(e).outlineStyle")=='solid'
 page.keyboard.press('Enter');page.wait_for_url(ORIGIN+'/');page.go_back();page.wait_for_url(ORIGIN+'/anuncie/')
 page.locator('a[href="#planos"]').click();page.go_back();assert page.url==ORIGIN+'/anuncie/'
 context.close()
 context=browser.new_context(java_script_enabled=False);context.route('**/*',route);page=context.new_page();page.goto(ORIGIN+'/anuncie/');assert page.locator('[data-proposal]').count()==5;assert page.locator('.ad-preferences').is_hidden();context.close()
 context=browser.new_context();context.route('**/*',route);context.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('disabled')}})");page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(ORIGIN+'/anuncie/');page.select_option('#advertise-language','es');assert page.locator('html').get_attribute('lang')=='es';context.close();browser.close()
assert not errors,errors
assert not blocked,blocked
(OUT/'results.json').write_text(json.dumps({'matrix':checks,'keyboard':True,'history':True,'noScript':True,'blockedStorage':True,'text150':True,'externalRequests':blocked,'errors':errors},indent=2))
print(f'{len(checks)} responsive/theme/language cases passed; keyboard, history, no-JS, disabled storage and 150% text passed.')
