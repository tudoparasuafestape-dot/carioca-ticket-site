"""Read-only source/production provenance checks: deployment occurs only through the pinned action."""
import json, os, re, sys, urllib.error, urllib.parse, urllib.request
from pathlib import Path
from build import build, sha, require, Z, B, CANDIDATE, PNG, PS, H1, inventory
REPO='tudoparasuafestape-dot/carioca-ticket-site'
WF='.github/workflows/ct-fabrica-pages-exact.yml'
BASE_DEP=7765206641
BASE_RUN=43425385424
BASE_SHA='b47e80028d4a2eed4b9c69a6a85a4493b3ce605e'
BASE_ART=14037465102
ORIGIN='https://cariocaticket.com.br/'
CHECK=('index.html','checkout/index.html','checkout-v2/index.html','evento/index.html','assets/event-cover-picker.js','assets/public-event-catalog.js')
ASSET=PNG.removeprefix('./')
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None
def request(url,headers=None):
    return urllib.request.build_opener(NoRedirect).open(urllib.request.Request(url,headers=headers or {}),timeout=35)
class Api:
    def __init__(self,token):
        require(bool(token),'missing workflow token');self.token=token
    def open(self,path):
        require(path.startswith('/') and not path.startswith('//') and '..' not in path,'api path')
        return request('https://api.github.com/repos/'+REPO+path,{'Authorization':'Bearer '+self.token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
    def get(self,path):
        with self.open(path) as r:
            b=r.read(4_194_305);require(r.status==200 and len(b)<=4_194_304,'api response');return json.loads(b)
    def archive(self):
        try:return self._zip(self.open('/actions/artifacts/'+str(BASE_ART)+'/zip'))
        except urllib.error.HTTPError as e:
            require(e.code==302,'baseline artifact fetch');url=e.headers.get('Location','');u=urllib.parse.urlsplit(url)
            require(u.scheme=='https' and not u.username and not u.password and not u.fragment and u.port is None and u.hostname and (u.hostname.endswith('.blob.core.windows.net') or u.hostname.endswith('.githubusercontent.com')),'artifact redirect destination')
            return self._zip(request(url))  # Anonymous; do not forward the Actions token.
    def _zip(self,response):
        with response as r:
            b=r.read(46077084);require(r.status==200 and len(b)==46077083 and sha(b)==Z,'artifact archive hash');return b
def context(e):
    commit=e.get('GITHUB_SHA','');run=e.get('GITHUB_RUN_ID','')
    require(re.fullmatch('[0-9a-f]{40}',commit) and e.get('CT_REVIEWED_COMMIT')==commit and run.isdigit(),'reviewed commit/run')
    for k,v in {'GITHUB_REPOSITORY':REPO,'GITHUB_REF':'refs/heads/main','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_RUN_ATTEMPT':'1','RUNNER_ENVIRONMENT':'github-hosted','GITHUB_WORKFLOW_REF':REPO+'/'+WF+'@refs/heads/main','CT_BASE_DEPLOYMENT':str(BASE_DEP),'CT_SCOPE':'PUBLISH_FABRICA_PNG_AND_CHECKOUT_ONLY'}.items():
        require(e.get(k)==v,'workflow guard '+k)
    return commit,int(run)
def run_from(url):
    m=re.fullmatch(r'https://github.com/'+re.escape(REPO)+r'/actions/runs/(\d+)(?:/job/\d+)?/?',url or '')
    require(m,'deployment run identity');return int(m[1])
def current(api,e):
    commit,run=context(e)
    require(api.get('/pages').get('build_type')=='workflow','Pages source drift')
    require(api.get('/git/ref/heads/main').get('object',{}).get('sha')==commit,'main drift')
    ds=api.get('/deployments?environment=github-pages&per_page=100')
    require(isinstance(ds,list) and ds,'deployment history absent')
    for d in ds:
        id=d.get('id');require(type(id)==int and id>0,'deployment id')
        statuses=api.get('/deployments/'+str(id)+'/statuses?per_page=1');require(bool(statuses),'unknown deployment status')
        s=statuses[0]
        if id==BASE_DEP:
            require(d.get('sha')==BASE_SHA and s.get('state')=='success' and s.get('environment_url')==ORIGIN and run_from(s.get('log_url'))==BASE_RUN,'wrong active Pages baseline')
            break
        require(d.get('sha')==commit and s.get('state') in ('queued','pending','in_progress','waiting') and run_from(s.get('log_url'))==run,'newer competing or unknown deployment')
    else:raise ValueError('baseline deployment not found')
    job=api.get('/actions/runs/'+str(BASE_RUN))
    require(job.get('event')=='workflow_dispatch' and job.get('status')=='completed' and job.get('conclusion')=='success' and job.get('head_sha')==BASE_SHA and job.get('path')=='.github/workflows/ct-tony-checkout-only-publication.yml','baseline publisher identity')
    require(api.get('/git/ref/heads/main').get('object',{}).get('sha')==commit,'main drift during read')
def public_fetch(path):
    require(path in CHECK+(ASSET,),'unapproved public path')
    try:
        with request(ORIGIN+path,{'Accept-Encoding':'identity','Cache-Control':'no-cache'}) as r:
            body=r.read(2_100_001);require(len(body)<=2_100_000,'unexpected static size')
            return r.status,r.headers.get_content_type(),body
    except urllib.error.HTTPError as e:
        if e.code==404:return 404,'',b''
        raise
def static(tar,post,fetch=public_fetch):
    require(sha(tar)==(CANDIDATE if post else B),'static evidence TAR drift')
    old,_=inventory(tar)
    for path in CHECK:
        m,record=old['./'+path]
        offset=m.offset_data-m.offset
        status,_,body=fetch(path)
        require(status==200 and body==record[offset:offset+m.size],'critical bytes drift: '+path)
    code,mime,b=fetch(ASSET)
    require(code==200 and mime=='image/png' and len(b)==2060262 and sha(b)==PS if post else code==404,'Fábrica asset neighborhood drift')
def command(stage,dir_,e,api,fetch=public_fetch):
    commit,run=context(e);out=Path(dir_)
    if stage=='post':
        ds=api.get('/deployments?environment=github-pages&per_page=1');require(bool(ds),'deployment missing after publish')
        d=ds[0];s=api.get('/deployments/'+str(d['id'])+'/statuses?per_page=1')[0]
        require(d.get('sha')==commit and s.get('state')=='success' and s.get('environment_url')==ORIGIN and run_from(s.get('log_url'))==run,'latest is not this successful deployment')
        static((out/'artifact.tar').read_bytes(),True,fetch)
    else:
        current(api,e)
        if stage=='prepare':
            meta=api.get('/actions/artifacts/'+str(BASE_ART))
            require(meta.get('name')=='github-pages' and not meta.get('expired') and meta.get('digest')=='sha256:'+Z and meta.get('workflow_run',{}).get('id')==BASE_RUN and meta.get('workflow_run',{}).get('head_sha')==BASE_SHA,'baseline artifact metadata mismatch')
            png=Path(__file__).with_name('approved-fabrica.png')
            require(png.is_file() and not png.is_symlink() and png.stat().st_size==2060262,'approved PNG missing or unsafe')
            baseline,candidate=build(api.archive(),png.read_bytes());static(baseline,False,fetch);current(api,e)
            out.mkdir(mode=0o700)
            for path,b in [('artifact.tar',candidate),('rollback.tar',baseline),('seal.json',json.dumps({'sha':CANDIDATE,'baseline':B,'productionBackendUntouched':True},sort_keys=True).encode())]:
                with (out/path).open('xb') as f:f.write(b)
        elif stage=='recheck':
            require(sha((out/'artifact.tar').read_bytes())==CANDIDATE and sha((out/'rollback.tar').read_bytes())==B,'sealed files drifted')
            static((out/'rollback.tar').read_bytes(),False,fetch);current(api,e)
        else:raise ValueError('unknown stage')
    print(json.dumps({'stage':stage,'candidateSha256':CANDIDATE,'siteStaticCheckPassed':True}))
if __name__=='__main__':
    try:command(*sys.argv[1:],os.environ,Api(os.environ.get('GH_TOKEN')))
    except (urllib.error.HTTPError,urllib.error.URLError,TimeoutError) as err:
        sys.exit('Fábrica stage blocked: transport failure') # No token/redirect details in logs.
