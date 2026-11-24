"""Manual release wrapper. All methods here are GETs; deploy is only the pinned Action."""
import io,json,os,re,sys,tarfile,urllib.error,urllib.parse,urllib.request,zipfile
from pathlib import Path
from seal import BASE_TAR,BASE_ZIP,BASE_ZIP_SIZE,CANDIDATE,TAR_SIZE,PNG,PATCHES,check,compose,get,sha,unzip,verify
from versioned import ALLOWED_VERSIONED,verify_versioned

REPO='tudoparasuafestape-dot/carioca-ticket-site'
REPO_ID=1375140732
WF='.github/workflows/ct-producer-modal-exact.yml'
BASE_SHA='3b01f38858f16c0ee1a0d5e98bd8a4d906d0bf99'
BASE_RUN=45453892337
BASE_JOB=138658260566
BASE_VERIFY=138658720125
BASE_ART=14949092664
BASE_WORKFLOW='.github/workflows/ct-producer-welcome-exact.yml'
ORIGIN='https://cariocaticket.com.br'
SCOPE='PUBLISH_PRODUCER_MODAL_ONLY'
CHECK={
 '/':'./index.html',
 '/checkout/':'./checkout/index.html',
 '/checkout-v2/':'./checkout-v2/index.html',
 '/evento/':'./evento/index.html',
 '/ajuda/':'./ajuda/index.html',
 '/assets/public-catalog-clock.js':'./assets/public-catalog-clock.js',
 '/assets/public-event-catalog.js':'./assets/public-event-catalog.js',
 '/assets/home-i18n.js':'./assets/home-i18n.js',
 '/assets/public-privacy.js':'./assets/public-privacy.js',
 '/assets/public-privacy.css':'./assets/public-privacy.css',
 '/'+PNG.removeprefix('./'):PNG,
}
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def get_https(url,headers=None):
    req=urllib.request.Request(url,headers=headers or {},method='GET')
    return urllib.request.build_opener(NoRedirect).open(req,timeout=30)

class Api:
    def __init__(self,token):
        check(bool(token),'missing workflow token')
        self.headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}
    def open(self,path):
        check(path.startswith('/') and not path.startswith('//') and '..' not in path,'API path')
        return get_https('https://api.github.com/repos/'+REPO+path,self.headers)
    def get(self,path):
        with self.open(path) as r:
            b=r.read(4_194_305);check(r.status==200 and len(b)<=4_194_304,'API response')
            return json.loads(b)
    def archive(self,id):
        check(type(id)==int and id>0,'artifact identity')
        def read(r):
            with r:
                b=r.read(70_000_001);check(r.status==200 and len(b)<=70_000_000,'artifact response')
                return b
        try:
            return read(self.open('/actions/artifacts/'+str(id)+'/zip'))
        except urllib.error.HTTPError as err:
            check(err.code==302,'artifact fetch')
            target=err.headers.get('Location','');u=urllib.parse.urlsplit(target)
            check(u.scheme=='https' and u.hostname and u.port is None and not u.fragment and not u.username and not u.password
                  and (u.hostname.endswith('.blob.core.windows.net') or u.hostname.endswith('.githubusercontent.com')),'artifact redirect')
            return read(get_https(target)) # token never forwarded

def fetch_public(path):
    check(path in CHECK or path in ALLOWED_VERSIONED,'static route')
    with get_https(ORIGIN+path,{'Accept-Encoding':'identity','Cache-Control':'no-cache'}) as r:
        body=r.read(2_100_001);check(r.status==200 and len(body)<=2_100_000,'static size/status')
        return r.status,r.headers.get_content_type(),body

def identity(e):
    commit=e.get('GITHUB_SHA',''); run=e.get('GITHUB_RUN_ID','')
    check(re.fullmatch('[0-9a-f]{40}',commit) and commit==e.get('CT_REVIEWED_COMMIT') and run.isdigit(),'reviewed commit/run')
    for k,v in {
       'GITHUB_REPOSITORY':REPO,'GITHUB_REF':'refs/heads/main','GITHUB_EVENT_NAME':'workflow_dispatch',
       'GITHUB_RUN_ATTEMPT':'1','RUNNER_ENVIRONMENT':'github-hosted','GITHUB_WORKFLOW_REF':REPO+'/'+WF+'@refs/heads/main',
       'CT_BASE_RUN':str(BASE_RUN),'CT_SCOPE':SCOPE
    }.items():check(e.get(k)==v,'workflow context '+k)
    return commit,int(run)

def run_from(url):
    m=re.fullmatch(r'https://github.com/'+re.escape(REPO)+r'/actions/runs/(\d+)(?:/job/\d+)?/?',url or '')
    check(m,'release log identity')
    return int(m[1])
def status(api,id):
    ss=api.get('/deployments/'+str(id)+'/statuses?per_page=1')
    check(isinstance(ss,list) and len(ss)==1,'deployment status missing')
    return ss[0]
def history(api):
    ds=api.get('/deployments?environment=github-pages&per_page=100')
    check(isinstance(ds,list) and ds,'deployment history missing')
    return ds
def pages(api,commit):
    site=api.get('/pages')
    check(site.get('build_type')=='workflow' and site.get('cname')=='cariocaticket.com.br','Pages source or custom domain drift')
    check(re.fullmatch('[a-f0-9]{40}',commit) is not None,'Pages deployment identity')
    result=api.get('/pages/deployments/'+commit)
    check(result.get('status')=='succeed','dedicated Pages success not proven')
def main_at(api,commit):
    check(api.get('/git/ref/heads/main').get('object',{}).get('sha')==commit,'reviewed main drift')
def site_origin(s):return s in (ORIGIN,ORIGIN+'/')

def previous_run(api):
    run=api.get('/actions/runs/'+str(BASE_RUN))
    check(run.get('id')==BASE_RUN and run.get('head_sha')==BASE_SHA and run.get('head_branch')=='main'
          and run.get('event')=='workflow_dispatch' and run.get('status')=='completed' and run.get('run_attempt')==1
          and run.get('conclusion')=='success' and run.get('path')==BASE_WORKFLOW,'baseline publisher run')
    job=api.get('/actions/jobs/'+str(BASE_JOB))
    check(job.get('id')==BASE_JOB and job.get('run_id')==BASE_RUN and job.get('name')=='publish'
          and job.get('status')=='completed' and job.get('conclusion')=='success','baseline publish job')
    deploy=[step for step in job.get('steps',[]) if step.get('name')=='Deploy exact sealed archive']
    check(len(deploy)==1 and deploy[0].get('number')==7 and deploy[0].get('conclusion')=='success','baseline action did not prove Pages publication')
    verify=api.get('/actions/jobs/'+str(BASE_VERIFY))
    check(verify.get('id')==BASE_VERIFY and verify.get('run_id')==BASE_RUN and verify.get('name')=='verify'
          and verify.get('status')=='completed' and verify.get('conclusion')=='success'
          and any(s.get('name')=='Verify successful environment job, Pages status, and canonical public bytes'
                  and s.get('conclusion')=='success' for s in verify.get('steps',[])),'baseline postverification job')

def baseline(api,commit,run):
    main_at(api,commit)
    pages(api,BASE_SHA)
    previous_run(api)
    for d in history(api):
        ident=d.get('id');check(type(ident)==int and ident>0,'deployment record')
        s=status(api,ident)
        if d.get('sha')==BASE_SHA:
            check(s.get('state')=='success' and site_origin(s.get('environment_url'))
                  and run_from(s.get('log_url'))==BASE_RUN,'baseline active deployment drift')
            break
        check(d.get('sha')==commit and d.get('environment')=='github-pages' and s.get('state') in ['queued','pending','in_progress','waiting']
              and run_from(s.get('log_url'))==run,'competing or unknown newer deployment')
    else:raise ValueError('expected active agenda record absent')
    main_at(api,commit)

def metadata(api,id,run,commit,digest=None):
    a=api.get('/actions/artifacts/'+str(id))
    w=a.get('workflow_run') or {}
    check(a.get('id')==id and a.get('name')=='github-pages' and a.get('expired') is False and
          w.get('id')==run and w.get('head_sha')==commit and w.get('head_branch')=='main' and
          w.get('repository_id')==REPO_ID and w.get('head_repository_id')==REPO_ID,'artifact provenance')
    if digest is not None:
        check(a.get('digest')=='sha256:'+digest and a.get('size_in_bytes')==BASE_ZIP_SIZE,'baseline ZIP metadata')
    else:
        check(re.fullmatch('sha256:[0-9a-f]{64}',a.get('digest') or '') is not None and
              type(a.get('size_in_bytes')) is int and 0<a['size_in_bytes']<=70_000_000,'uploaded ZIP metadata')
    return a

def verify_uploaded(api,id,commit,run):
    a=metadata(api,id,run,commit); blob=api.archive(id)
    check(len(blob)==a['size_in_bytes'] and 'sha256:'+sha(blob)==a['digest'],'uploaded ZIP digest')
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        check(z.namelist()==['artifact.tar'] and z.getinfo('artifact.tar').file_size==TAR_SIZE,'uploaded ZIP inventory')
        candidate=z.read('artifact.tar')
    check(sha(candidate)==CANDIDATE,'uploaded TAR changed')
    return candidate

def static(raw,seal,fetch):
    entries=verify(raw,seal); observed_index=None
    for url,member in CHECK.items():
        code,mime,b=fetch(url)
        check(code==200 and b==get(entries,member),'static bytes drift '+url)
        if member==PNG:check(mime=='image/png','Fábrica PNG MIME drift')
        if url=='/':observed_index=b
    verify_versioned(seal,observed_index,fetch)
def local(out,name,sha256):
    p=out/name
    check(p.is_file() and not p.is_symlink() and p.stat().st_size<=70_000_000,'local artifact path')
    b=p.read_bytes();check(sha(b)==sha256,'local sealed bytes drift')
    return b
def command(stage,out,e,api,fetch=fetch_public):
    commit,run=identity(e);out=Path(out)
    if stage in ('inspect','prepare'):
        baseline(api,commit,run)
        metadata(api,BASE_ART,BASE_RUN,BASE_SHA,BASE_ZIP)
        origin=unzip(api.archive(BASE_ART))
        static(origin,BASE_TAR,fetch)
        candidate=compose(origin)
        baseline(api,commit,run)
        if stage=='inspect':
            print(json.dumps({'stage':'inspect','TAR':CANDIDATE,'published':False}));return
        out.mkdir(mode=0o700)
        for name,blob in [('artifact.tar',candidate),('rollback.tar',origin)]:
            with (out/name).open('xb') as handle:handle.write(blob)
        (out/'seal.json').write_text(json.dumps({'baseline':BASE_TAR,'candidate':CANDIDATE},sort_keys=True)+'\n')
    elif stage in ('recheck','post'):
        entered=e.get('CT_UPLOAD_ART','')
        check(entered.isdigit() and int(entered)>0,'workflow-uploaded artifact ID absent')
        if stage=='recheck':
            baseline(api,commit,run)
        published=verify_uploaded(api,int(entered),commit,run)
        if stage=='recheck':
            fresh=local(out,'rollback.tar',BASE_TAR)
            check(published==local(out,'artifact.tar',CANDIDATE),'upload/local TAR drift')
            static(fresh,BASE_TAR,fetch)
            baseline(api,commit,run)
        else:
            # Separate read-only job AFTER the environment job completed.
            def post_identity():
                pages(api,commit)
                d=history(api)[0];st=status(api,d['id'])
                check(d.get('sha')==commit and d.get('environment')=='github-pages' and st.get('state')=='success' and
                      site_origin(st.get('environment_url')) and run_from(st.get('log_url'))==run,'post deployment drift')
                jobs=api.get('/actions/runs/'+str(run)+'/attempts/1/jobs?per_page=100').get('jobs',[])
                publisher=[j for j in jobs if j.get('name')=='publish']
                check(len(publisher)==1 and publisher[0].get('run_id')==run
                      and publisher[0].get('head_sha')==commit and publisher[0].get('conclusion')=='success'
                      and any(x.get('name')=='Deploy exact sealed archive' and x.get('conclusion')=='success'
                              for x in publisher[0].get('steps',[])), 'post publisher identity drift')
            post_identity()
            static(published,CANDIDATE,fetch)
            post_identity()
    else:raise ValueError('unknown stage')
    print(json.dumps({'stage':stage,'TAR':CANDIDATE,'productionBackendUntouched':True}))
if __name__=='__main__':
    try:
        if len(sys.argv)!=3:raise ValueError('required stage and runner-private path')
        command(sys.argv[1],sys.argv[2],os.environ,Api(os.environ.get('GH_TOKEN')))
    except (urllib.error.URLError,TimeoutError,tarfile.TarError,zipfile.BadZipFile) as err:
        sys.exit('Agenda copy release blocked: transport/archive error')
    except (ValueError,KeyError,AttributeError,TypeError,IndexError) as err:
        # Error messages originate from fixed guards; do not print arbitrary data or transport URLs.
        message=str(err)
        known=('unreconciled historical generic deployment failure','competing or unknown newer deployment',
               'reviewed main drift','expected active agenda record absent','dedicated Pages success not proven',
               'artifact provenance','baseline ZIP metadata','post deployment drift',
               'noncanonical versioned home scripts','versioned home script drift',
               'Pages source or custom domain drift','post publisher identity drift',
               'unreconciled baseline environment','baseline environment/run',
               'observed index does not match the sealed navigation base')
        sys.exit('Agenda copy release blocked: '+(message if message in known else 'validation guard'))
