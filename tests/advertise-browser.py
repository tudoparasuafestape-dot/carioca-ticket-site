"""Isolated UI checks: no requests reach production or commercial services."""
from playwright.sync_api import sync_playwright
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
import json,os,re,subprocess
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/advertise';OUT.mkdir(parents=True,exist_ok=True)
ORIGIN='http://127.0.0.1:4197';checks=[];blocked=[];errors=[];baseline=False
BASE='7f86913bc3089eaf02632dc74c4743c937dac4d1'
basefiles={}
for path in ['anuncie/index.html','assets/advertise.css','assets/advertise.js']:
 local=ROOT.parent/'advertise-logo-blend-base'/path
 basefiles['/'+path]=local.read_bytes() if local.is_file() else subprocess.check_output(['git','show',f'{BASE}:{path}'],cwd=ROOT)
copies=json.loads(re.search(r'var dictionaries = ([\s\S]*?);\n  var select',(ROOT/'assets/advertise.js').read_text())[1])
plans=['monthly','quarterly','halfYear','annual']
def route(r):
 u=r.request.url;p=urlsplit(u).path
 if u.startswith(ORIGIN) and r.request.method=='GET':
  if p=='/':
   content=(ROOT/'index.html').read_text()
   content=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',content,flags=re.I)
   content=re.sub(r'<link[^>]+rel="(?:manifest|prefetch)"[^>]*>','',content)
   content=content.replace('</body>','<script src="/assets/home-i18n.js"></script></body>')
   return r.fulfill(content_type='text/html',body=content)
  name=p+('index.html' if p.endswith('/') else '')
  f=ROOT/name.lstrip('/')
  data=basefiles.get(name) if baseline else None
  if data is None and f.is_file():data=f.read_bytes()
  if data is not None:return r.fulfill(content_type={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'}.get(f.suffix,'text/plain'),body=data)
 blocked.append(u);r.abort()
def no_overflow(page,case):
 if not page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'):
  page.screenshot(path=str(OUT/'overflow.png'),full_page=True)
  raise AssertionError(('Overflow',case,page.evaluate("[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>[e.tagName,e.className,e.getBoundingClientRect().right])")))
def selected(page,plan):
 tab=page.locator('#ad-tab-'+plan);panel=page.locator('#ad-panel-'+plan)
 assert tab.get_attribute('aria-selected')=='true' and tab.get_attribute('tabindex')=='0'
 assert panel.is_visible() and panel.get_attribute('aria-labelledby')=='ad-tab-'+plan
 assert page.locator('[role="tabpanel"]:visible').count()==1
 return tab,panel
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH',pw.chromium.executable_path),headless=True,args=['--no-sandbox'])
 context=browser.new_context(service_workers='block');context.route('**/*',route);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 # Exact pre-change source, same shared theme assets and viewport as the candidate.
 baseline=True
 before_heights={}
 for width in [320,390,768,1440]:
  for theme in ['light','dark']:
   page.set_viewport_size({'width':width,'height':1000});page.goto(ORIGIN+'/anuncie/');page.select_option('#home-theme',theme)
   before_heights[width]=page.locator('header').bounding_box()['height']
   page.screenshot(path=str(OUT/f'before-{width}-{theme}.png'),full_page=True)
   page.locator('footer').screenshot(path=str(OUT/f'footer-before-{width}-{theme}.png'))
 baseline=False
 for width in [320,390,768,1440]:
  for scale in [100,150]:
   for theme in ['light','dark']:
    page.set_viewport_size({'width':width,'height':1000});page.goto(ORIGIN+'/anuncie/');page.select_option('#home-theme',theme)
    page.evaluate('(scale)=>document.documentElement.style.fontSize=(16*scale/100)+"px"',scale)
    for locale,copy in copies.items():
     page.select_option('#advertise-language',locale)
     assert page.locator('html').get_attribute('lang')==locale
     assert page.locator('html').get_attribute('data-home-theme')==theme
     case=[width,scale,theme,locale];no_overflow(page,case)
     assert page.locator('[data-ad-text]').evaluate_all('(nodes)=>nodes.every(n=>n.textContent.trim()&&n.lang===document.documentElement.lang)')
     for selector in ['#home-theme','#advertise-language']:
      b=page.locator(selector).bounding_box();assert b['width']>=44 and b['height']>=44
     logo_box=page.locator('header .ad-brand').bounding_box();prefs_box=page.locator('.ad-preferences').bounding_box()
     assert logo_box['y']+logo_box['height']<=prefs_box['y']+1 or logo_box['x']+logo_box['width']+8<=prefs_box['x'],(case,'brand/control collision')
     assert page.locator('header .ad-brand').evaluate('e=>e.scrollWidth<=e.clientWidth+1'),(case,'brand text overflow')
     for selector in ['#home-theme','#advertise-language']:
      fits=page.locator(selector).evaluate('e=>{const s=getComputedStyle(e),c=document.createElement("canvas").getContext("2d");c.font=s.font;return c.measureText(e.selectedOptions[0].text).width+parseFloat(s.paddingLeft)+parseFloat(s.paddingRight)+24<=e.clientWidth}')
      assert fits,(case,selector,'selected label clipped')
     page.evaluate('scrollTo(0,0)')
     page.locator('header').screenshot(path=str(OUT/f'header-{width}-{scale}-{theme}-{locale}.png'))
     for brand in page.locator('.ad-brand').all():
      assert brand.get_attribute('href')=='/'
      assert brand.evaluate('e=>getComputedStyle(e).backgroundColor')=='rgba(0, 0, 0, 0)'
      assert brand.locator('img').evaluate('e=>e.complete && e.naturalWidth>0')
      box=brand.bounding_box();assert box['width']>=44 and box['height']>=44
     if locale=='pt-BR':
      page.locator('footer').screenshot(path=str(OUT/f'footer-after-{width}-{scale}-{theme}.png'))
      if scale==100:
       page.locator('header .ad-brand').screenshot(path=str(OUT/f'header-logo-{width}-{theme}.png'))
       page.locator('footer .ad-brand').screenshot(path=str(OUT/f'footer-logo-{width}-{theme}.png'))
     # Two deliberate compact rows preserve the full brand and select labels on narrow screens.
     if scale==100 and width in [320,390]:assert page.locator('header').bounding_box()['height'] <= 144
     for plan in plans:
      tab=page.locator('#ad-tab-'+plan);tab.click();tab,panel=selected(page,plan)
      assert tab.get_attribute('aria-controls')==panel.get_attribute('id')
      b=tab.bounding_box();assert b['height']>=44
      a=panel.locator('[data-proposal]');u=urlsplit(a.get_attribute('href'));q=parse_qs(u.query)
      assert u.scheme=='https' and u.netloc=='wa.me' and u.path=='/5581999311509'
      assert q['text'][0]==copy['message']+' '+copy[plan]+' ('+copy[plan+'Duration']+').'
      assert a.get_attribute('target')=='_blank' and a.get_attribute('rel')=='noopener noreferrer'
      b=a.bounding_box();assert b['width']>=44 and b['height']>=44
      assert panel.locator('[data-ad-text="'+plan+'Price"]').inner_text()==copy[plan+'Price']
      assert panel.locator('[data-ad-text="'+plan+'Billing"]').inner_text()==copy[plan+'Billing']
      assert panel.locator('[data-ad-text="planTerms"]').inner_text()==copy['planTerms']
      if width==390 and scale==100:
       panel.screenshot(path=str(OUT/f'plan-{plan}-{theme}-{locale}.png'))
      no_overflow(page,case+[plan])
     if locale=='pt-BR' and ((width in [320,390] and theme=='dark') or (width==1440 and scale==100)):
      logo_box=page.locator('header .ad-brand').bounding_box();prefs_box=page.locator('.ad-preferences').bounding_box()
     assert logo_box['y']+logo_box['height']<=prefs_box['y']+1 or logo_box['x']+logo_box['width']+8<=prefs_box['x'],(case,'brand/control collision')
     assert page.locator('header .ad-brand').evaluate('e=>e.scrollWidth<=e.clientWidth+1'),(case,'brand text overflow')
     for selector in ['#home-theme','#advertise-language']:
      fits=page.locator(selector).evaluate('e=>{const s=getComputedStyle(e),c=document.createElement("canvas").getContext("2d");c.font=s.font;return c.measureText(e.selectedOptions[0].text).width+parseFloat(s.paddingLeft)+parseFloat(s.paddingRight)+24<=e.clientWidth}')
      assert fits,(case,selector,'selected label clipped')
     page.evaluate('scrollTo(0,0)');page.screenshot(path=str(OUT/f'after-{width}-{scale}-{theme}.png'),full_page=True)
     checks.append(case)
 # Keyboard roving focus; wrapping arrows, Home/End, repeated clicks and panel Tab order.
 page.goto(ORIGIN+'/anuncie/');page.set_viewport_size({'width':320,'height':1000});page.locator('#ad-tab-monthly').focus()
 for key,plan in [('ArrowLeft','annual'),('ArrowRight','monthly'),('End','annual'),('Home','monthly'),('ArrowRight','quarterly')]:
  page.keyboard.press(key);tab,panel=selected(page,plan);assert tab.evaluate('(e)=>e===document.activeElement')
  assert tab.evaluate('e=>getComputedStyle(e).outlineStyle')=='solid'
 page.keyboard.press('Tab');assert page.locator('#ad-panel-quarterly').evaluate('(e)=>e===document.activeElement')
 page.keyboard.press('Tab');assert page.locator('#ad-panel-quarterly a').evaluate('(e)=>e===document.activeElement')
 for _ in range(3):page.locator('#ad-tab-quarterly').click();selected(page,'quarterly')
 page.select_option('#advertise-language','en-US');selected(page,'quarterly')
 page.select_option('#home-theme','light');page.reload();assert page.locator('html').get_attribute('lang')=='en-US';assert page.locator('#home-theme').input_value()=='light'
 # Storage events from another same-origin tab, including removal and clear.
 other=context.new_page();other.goto(ORIGIN+'/anuncie/');other.select_option('#advertise-language','es');page.wait_for_function("document.documentElement.lang==='es'")
 other.select_option('#home-theme','dark');page.wait_for_function("document.documentElement.dataset.homeTheme==='dark'")
 other.evaluate("localStorage.removeItem('ct-home-locale')");page.wait_for_function("document.documentElement.lang==='pt-BR'")
 other.evaluate('localStorage.clear()');page.wait_for_function("document.documentElement.dataset.homeTheme==='dark'");other.close()
 page.locator('.skip-link').focus();page.keyboard.press('Enter');assert page.locator('#conteudo').evaluate('(e)=>e===document.activeElement')
 page.locator('.ad-brand').first.focus();assert page.locator('.ad-brand').first.evaluate("e=>getComputedStyle(e).outlineStyle")=='solid'
 previous=page.url;page.keyboard.press('Enter');page.wait_for_url(ORIGIN+'/');page.go_back();page.wait_for_url(previous)
 previous=page.url;page.locator('a[href="#planos"]').click();page.locator('#ad-tab-annual').click();page.go_back();assert page.url==previous
 page.goto(ORIGIN+'/')
 for locale in copies:
  page.evaluate('locale=>CTHome.setLocale(locale)',locale)
  link=page.locator('footer a[href="/anuncie/"]');assert link.count()==1
  assert link.inner_text()==page.evaluate("CTHome.t('adLabel')")
  link.click();page.wait_for_url(ORIGIN+'/anuncie/');assert page.locator('html').get_attribute('lang')==locale
  page.go_back();page.wait_for_url(ORIGIN+'/')
 assert page.locator('#advertising-contact').get_attribute('href').startswith('https://wa.me/5581999311509?text=')
 context.close()
 context=browser.new_context(java_script_enabled=False,viewport={'width':320,'height':1000});context.route('**/*',route);page=context.new_page();page.goto(ORIGIN+'/anuncie/')
 assert page.locator('[data-proposal]').count()==6;assert page.locator('.ad-preferences').is_hidden();assert page.locator('.ad-tabs').is_hidden();assert page.locator('.ad-plan:visible').count()==4
 for plan in plans:
  panel=page.locator('#ad-panel-'+plan)
  assert panel.locator('[data-ad-text="'+plan+'Price"]').inner_text()==copies['pt-BR'][plan+'Price']
  assert panel.locator('[data-ad-text="'+plan+'Billing"]').inner_text()==copies['pt-BR'][plan+'Billing']
 u=urlsplit(page.locator('[data-proposal="quarterly"]').get_attribute('href'));assert 'Trimestral (3 meses)' in parse_qs(u.query)['text'][0]
 assert page.locator('footer .ad-brand').evaluate('e=>getComputedStyle(e).backgroundColor')=='rgba(0, 0, 0, 0)'
 no_overflow(page,'no-JS');page.screenshot(path=str(OUT/'noscript-320.png'),full_page=True);context.close()
 context=browser.new_context();context.route('**/*',route);context.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('disabled')}})");page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(ORIGIN+'/anuncie/');page.select_option('#advertise-language','es');page.select_option('#home-theme','light');page.locator('#ad-tab-quarterly').click();selected(page,'quarterly');assert page.locator('html').get_attribute('lang')=='es';assert page.locator('html').get_attribute('data-home-theme')=='light';context.close();browser.close()
assert not errors,errors
assert not blocked,blocked
(OUT/'results.json').write_text(json.dumps({'matrix':checks,'planChecks':len(checks)*4,'keyboard':True,'history':True,'noScript':True,'blockedStorage':True,'storageSynchronization':True,'beforeHeaderHeights':before_heights,'externalRequests':blocked,'errors':errors},indent=2))
print(f'{len(checks)} responsive/font/theme/language cases and {len(checks)*4} plan panels passed; keyboard, history, no-JS and storage passed.')

