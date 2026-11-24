"""Read only the exact three script URLs as specified in the sealed observed index."""
from html.parser import HTMLParser
from seal import BASE_TAR,CANDIDATE,PATCHES,PROTECTED,sha,check

SCRIPTS=('/assets/public-event-catalog.js','/assets/home-i18n.js','/assets/producer-welcome.js')
BASE=('/assets/public-event-catalog.js?v=20261124-agenda-copy1','/assets/home-i18n.js?v=20261124-agenda-copy1','/assets/producer-welcome.js?v=20261124-producer-modal2')
VERSIONS={BASE_TAR:BASE,CANDIDATE:('/assets/public-event-catalog.js?v=20261124-agenda-response1',)+BASE[1:]}
ALLOWED_VERSIONED=frozenset(p for a in VERSIONS.values() for p in a)
class Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.sources=[]; self.has_base=False
    def handle_starttag(self,tag,attrs):
        if tag=='base':self.has_base=True
        if tag!='script':return
        values=[v for a,v in attrs if a=='src']
        if any(isinstance(v,str) and any(p in v for p in SCRIPTS) for v in values):
            check(len(values)==1,'duplicate script src')
            self.sources.append(values[0])

def verify_versioned(seal,observed_html,fetch):
    check(seal in VERSIONS,'unreviewed versioned seal')
    pos=1 if seal==BASE_TAR else 2
    check(isinstance(observed_html,bytes) and sha(observed_html)==PATCHES['./index.html'][pos],
          'observed index does not match the sealed navigation base')
    p=Parser();p.feed(observed_html.decode('utf8'));p.close()
    check(not p.has_base and p.sources==list(VERSIONS[seal]),'noncanonical versioned home scripts')
    for member,target in zip(SCRIPTS,p.sources):
        status,mime,body=fetch(target)
        check(status==200 and mime in ('text/javascript','application/javascript','application/x-javascript')
              and isinstance(body,bytes) and sha(body)==(PATCHES['.'+member][pos] if '.'+member in PATCHES else PROTECTED['.'+member]),'versioned home script drift')
