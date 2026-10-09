"""Isolated browser contract: synthetic RPC, no production traffic or purchases.
Run: python tests/event-directions-browser.py (Playwright + Chromium required).
"""
from pathlib import Path
import json, os
from urllib.parse import urlsplit, parse_qs
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results' / 'event-directions'
OUT.mkdir(parents=True, exist_ok=True)
ORIGIN = 'http://127.0.0.1:42973'
EVENT = dict(local='Espaço São João & Arte', endereco='Rua da Música, 120', cidade='Recife', uf='PE')
DEST = 'Espaço São João & Arte, Rua da Música, 120, Recife, PE, Brasil'
FIXTURE = dict(sucesso=True, evento=dict(EVENT, nome='Evento de demonstração', data='20/12/2030'), visual={}, tipos=[])
checks, blocked, errors = [], [], []
PRELUDE = '''HTMLFormElement.prototype.submit = function() {
 const data = new FormData(this);
 if (data.get('metodo') !== 'ctEventoPublicoCarregarPROD') throw new Error('Unexpected RPC');
 window.fixtureRpcCount = (window.fixtureRpcCount || 0) + 1;
 setTimeout(() => window.dispatchEvent(new MessageEvent('message', {
 origin: 'https://script.google.com', data: {ctMinhaCariocaPost:true, id:data.get('ctMinhaCariocaRequestId'), ok:true, resultado:FIXTURE}
 })), 0);
};
Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:async text => {window.copied=text; window.copyCount=(window.copyCount||0)+1;}}});
navigator.geolocation.getCurrentPosition = () => { throw new Error('Unexpected geolocation'); };
navigator.geolocation.watchPosition = () => { throw new Error('Unexpected geolocation'); };
'''.replace('FIXTURE', json.dumps(FIXTURE, ensure_ascii=False))

def route(r):
    u = r.request.url
    if not u.startswith(ORIGIN + '/') or r.request.method != 'GET':
        blocked.append(u); return r.abort()
    p = urlsplit(u).path
    f = ROOT / (p.lstrip('/') + ('index.html' if p.endswith('/') else ''))
    if f.is_file():
        mime = 'text/html' if f.suffix == '.html' else 'text/css' if f.suffix == '.css' else 'text/javascript'
        return r.fulfill(content_type=mime, body=f.read_bytes())
    # Unrelated PWA/analytics are deliberately inert; no service workers or external calls.
    if p.endswith('.js'): return r.fulfill(content_type='text/javascript', body='')
    if p.endswith('.png'): return r.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="118" height="48"/>')
    return r.fulfill(status=204, body='')

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None), headless=True, args=['--no-sandbox'])
    context = browser.new_context(service_workers='block')
    context.route('**/*', route)
    context.add_init_script(PRELUDE)
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    for path in ['evento', 'evento-v2']:
        for width in [320, 390, 1440]:
            for theme in ['light', 'dark']:
                page.set_viewport_size(dict(width=width, height=1000))
                page.goto(f'{ORIGIN}/{path}/?evento=SYNTHETIC')
                page.locator('#app').wait_for(state='visible')
                assert page.evaluate('window.fixtureRpcCount') == 1
                page.evaluate("theme => document.documentElement.dataset.homeTheme=theme", theme)
                assert page.locator('#directions-address').input_value() == DEST
                url = page.locator('#directions-map').get_attribute('href')
                assert urlsplit(url).netloc == 'www.google.com'
                assert parse_qs(urlsplit(url).query) == dict(api=['1'], destination=[DEST])
                assert page.locator('#directions-map').get_attribute('rel') == 'noopener noreferrer'
                assert page.locator('#directions-map').get_attribute('target') == '_blank'
                assert page.evaluate('window.copyCount || 0') == 0
                page.locator('#directions-copy').focus(); page.keyboard.press('Enter')
                assert page.evaluate('window.copied') == DEST
                assert 'Endereço copiado' in page.locator('#directions-status').inner_text()
                # Enlarged text stress is limited to this new component.
                page.locator('#event-directions').evaluate("e => {for(const x of e.querySelectorAll('*')) {if(!x.children.length)x.style.fontSize=(parseFloat(getComputedStyle(x).fontSize)*1.5)+'px';}}")
                for selector in ['#directions-map', '#directions-copy']:
                    el=page.locator(selector);el.scroll_into_view_if_needed();el.focus();box=el.bounding_box()
                    assert box['height'] >= 44 and box['width'] >= 44
                    assert box['x'] >= 0 and box['x'] + box['width'] <= width+1, (width,box)
                    assert el.evaluate('e => getComputedStyle(e).outlineStyle') == 'solid'
                page.locator('#event-directions').screenshot(path=str(OUT / f'{path}-{width}-{theme}.png'))
                checks.append(f'{path}/{width}/{theme}/150%')
        # Invalid/incomplete destinations never leave stale links or copy handlers.
        for patch in [dict(local=''),dict(endereco=''),dict(cidade=''),dict(uf='XX'),dict(local='Online'),dict(endereco='https://meet.google.com/a'),dict(local='meet.google.com/abc'),dict(endereco='<img src=x>'),dict(endereco='A definir'),dict(endereco='á'*500),dict(endereco='\ud800')]:
            page.evaluate('event => CTEventDirections.render(event)', dict(EVENT, **patch))
            assert not page.locator('#directions-details').is_visible(), patch
            assert page.locator('#directions-map').get_attribute('href') is None
            assert page.locator('#directions-address').input_value() == ''
            assert page.locator('#directions-copy').evaluate('e => e.onclick === null')
        # Visibility is not modality; PUBLICO/PRIVADO must not be interpreted.
        for value in ['PUBLICO','PRIVADO']:
            page.evaluate('event => CTEventDirections.render(event)', dict(EVENT, tipoEvento=value))
            assert page.locator('#directions-details').is_visible()
        # A denied clipboard selects the address for manual copying.
        page.evaluate("navigator.clipboard.writeText=async()=>{throw new Error('denied')}")
        page.locator('#directions-copy').click()
        assert page.locator('#directions-address').evaluate('e => document.activeElement === e && e.selectionEnd === e.value.length')
        assert 'selecionado' in page.locator('#directions-status').inner_text()
        # A pending copy cannot race a newer render, even of the same destination.
        page.evaluate("navigator.clipboard.writeText=()=>new Promise(resolve=>window.finishCopy=resolve)")
        page.locator('#directions-copy').click()
        assert page.locator('#directions-copy').is_disabled()
        page.evaluate('event => CTEventDirections.render(event)', EVENT)
        page.evaluate('window.finishCopy()')
        assert page.locator('#directions-status').inner_text() == ''
        assert not page.locator('#directions-copy').is_disabled()
        # Back/forward retains a correct destination after reload.
        page.goto(f'{ORIGIN}/{path}/?evento=SECOND'); page.locator('#app').wait_for(state='visible')
        page.go_back();page.locator('#app').wait_for(state='visible')
        assert page.locator('#directions-address').input_value() == DEST
    browser.close()
assert not blocked, blocked
assert not errors, errors
(OUT/'results.json').write_text(json.dumps(dict(layout_checks=checks, functional_pages=2, blocked=blocked, errors=errors), indent=2))
print(f'{len(checks)} layout cases and 2 functional page suites passed; zero external requests or production RPC.')
