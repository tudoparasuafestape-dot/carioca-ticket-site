"""Release only the approved producer-cover draft files on top of live Pages."""
import hashlib, io, json, os, pathlib, re, subprocess, sys, tarfile, urllib.error
import urllib.parse, urllib.request, zipfile

repo = 'tudoparasuafestape-dot/carioca-ticket-site'
base = 'b0ce3bae934de52c4f88d621bbb4f0b8e0bf964c'
base_deployment = 8037214122
base_artifact = 14951714065
base_run = 45460908776
base_zip_sha = '1b82cf9ab3568816235bc6a5b7afa974d577c7ce1bde423361704bbc526155f4'
base_zip_size = 64317578
origin = 'https://cariocaticket.com.br'
scope = 'PUBLICAR_SOMENTE_ANEXO_CAPA_RASCUNHO'
wf = '.github/workflows/ct-producer-cover-draft-exact.yml'
here = 'release/producer-cover/guard.py'
changed = 'eventos-v2/index.html'
unmodified = {'/':'index.html', '/evento/':'evento/index.html',
              '/checkout/':'checkout/index.html','/checkout-v2/':'checkout-v2/index.html',
              '/assets/public-event-catalog.js':'assets/public-event-catalog.js'}

def check(value,message):
    if not value: raise RuntimeError(message)
def sh(data):
    return hashlib.sha256(data).hexdigest()
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None
def request(url,headers=None,max_bytes=4_200_000):
    rq=urllib.request.Request(url,headers=headers or {},method='GET')
    with urllib.request.build_opener(NoRedirect).open(rq,timeout=30) as r:
        data=r.read(max_bytes+1)
        check(r.status==200 and len(data)<=max_bytes,'unexpected HTTP response')
        return data,r.headers.get_content_type()
def api(path):
    check(path.startswith('/') and not path.startswith('//') and '..' not in path,'GitHub read path')
    return json.loads(request('https://api.github.com/repos/'+repo+path,
          {'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json',
           'X-GitHub-Api-Version':'2022-11-28'})[0])
def archive(artifact):
    try:
        return request('https://api.github.com/repos/'+repo+'/actions/artifacts/'+str(artifact)+'/zip',
            {'Authorization':'Bearer '+os.environ['GH_TOKEN']},70_000_000)[0]
    except urllib.error.HTTPError as e:
        check(e.code==302,'artifact acquisition')
        target=e.headers.get('Location','')
        u=urllib.parse.urlsplit(target)
        check(u.scheme=='https' and u.hostname and not u.username and not u.password and
              not u.fragment and u.port is None and (u.hostname.endswith('.blob.core.windows.net') or
              u.hostname.endswith('.githubusercontent.com')),'unsafe artifact redirect')
        return request(target,None,70_000_000)[0]
def tar_from_zip(z):
    with zipfile.ZipFile(io.BytesIO(z)) as f:
        check(f.namelist()==['artifact.tar'] and f.getinfo('artifact.tar').file_size<70_000_000,'archive content')
        return f.read('artifact.tar')
def readtar(blob):
    values={}
    with tarfile.open(fileobj=io.BytesIO(blob),mode='r:') as tf:
        for m in tf:
            check(m.name not in values and (m.isfile() or m.isdir()),'unexpected archive member')
            values[m.name]=(m,tf.extractfile(m).read() if m.isfile() else None)
    return values
def baseline():
    a=api('/actions/artifacts/'+str(base_artifact))
    w=a.get('workflow_run') or {}
    check(a.get('name')=='github-pages' and not a.get('expired') and
          a.get('digest')=='sha256:'+base_zip_sha and a.get('size_in_bytes')==base_zip_size and
          w.get('id')==base_run and w.get('head_sha')==base and w.get('head_branch')=='main','baseline provenance')
    z=archive(base_artifact)
    check(len(z)==base_zip_size and sh(z)==base_zip_sha,'baseline hash')
    return readtar(tar_from_zip(z))
def context():
    e=os.environ; sha=e['GITHUB_SHA']; run=e['GITHUB_RUN_ID']
    check(re.fullmatch(r'[a-f0-9]{40}',sha) and e['CT_REVIEWED_SHA']==sha and run.isdigit(),'reviewed identity')
    for k,v in {'GITHUB_REPOSITORY':repo,'GITHUB_REF':'refs/heads/main','GITHUB_EVENT_NAME':'workflow_dispatch',
                'GITHUB_RUN_ATTEMPT':'1','GITHUB_WORKFLOW_REF':repo+'/'+wf+'@refs/heads/main',
                'CT_RELEASE_SCOPE':scope}.items(): check(e.get(k)==v,'workflow context: '+k)
    return sha,run
def live(sha,run,post=False):
    check(api('/git/ref/heads/main').get('object',{}).get('sha')==sha,'main moved')
    p=api('/pages'); check(p.get('build_type')=='workflow' and p.get('cname')=='cariocaticket.com.br','Pages origin')
    for dep in api('/deployments?environment=github-pages&per_page=100'):
        state=api('/deployments/'+str(dep['id'])+'/statuses?per_page=1')
        check(state and isinstance(state,list),'deployment status')
        s=state[0]
        if post:
            check(dep.get('sha')==sha and s.get('state')=='success' and
                ('/actions/runs/'+run) in (s.get('log_url') or '') and
                s.get('environment_url') in [origin,origin+'/'],'release not recorded as active')
            return
        if dep.get('id')==base_deployment:
            check(dep.get('sha')==base and s.get('state')=='success' and
                s.get('environment_url') in [origin,origin+'/'],'baseline not active')
            return
        check(dep.get('sha')==sha and s.get('state') in ['queued','pending','waiting','in_progress'] and
            ('/actions/runs/'+run) in (s.get('log_url') or ''),'another deployment may have moved the baseline')
    raise RuntimeError('missing active Pages deployment')
def current_public(entries, current_producer, post=False):
    expected=dict(unmodified)
    expected['/eventos-v2/']=changed
    if post:
        expected.update(('/'+p,p) for p in review if p!=changed)
    for route, name in expected.items():
        actual,mime=request(origin+route,{'Accept-Encoding':'identity','Cache-Control':'no-cache'},4_200_000)
        need=current_producer if name==changed else entries['./'+name][1]
        check(actual==need,'served bytes differ: '+route)
        if name.endswith('.js'):check(mime in ['application/javascript','text/javascript'],'module MIME: '+route)
with pathlib.Path('release/producer-cover/expected.json').open() as f:
    review=json.load(f)
def candidate(prior,output):
    names=subprocess.check_output(['git','diff','--name-only',base,'HEAD'],text=True).splitlines()
    check(set(names)==set(review)|{wf,here,'release/producer-cover/expected.json'},'files outside reviewed scope')
    desired={name:pathlib.Path(name).read_bytes() for name in review}
    check(all(sh(data)==review[name] for name,data in desired.items()),'candidate payload hash')
    check(sh(prior['./'+changed][1])=='c60e2e95e40ca3ecf1bade2d7106a31bea10b64a5a73ef8f5a86d02b2a0305a2','baseline HTML')
    with tarfile.open(output,'x',format=tarfile.PAX_FORMAT) as tf:
        for item,(m,data) in prior.items():
            if item=='./'+changed:
                data=desired[changed];m.size=len(data)
            tf.addfile(m,io.BytesIO(data) if data is not None else None)
        for name,data in desired.items():
            if name==changed:continue
            path='./'+name
            check(path not in prior and name.startswith('assets/ct-producer-cover-') and name.endswith('-v1.js'),'asset name')
            m=tarfile.TarInfo(path);m.size=len(data);m.mode=0o644
            tf.addfile(m,io.BytesIO(data))
    cand=readtar(pathlib.Path(output).read_bytes())
    check(set(cand)-set(prior)=={'./'+n for n in desired if n!=changed},'extra paths')
    check(not (set(prior)-set(cand)) and set(name for name,(_,original) in prior.items() if cand[name][1]!=original)=={'./'+changed},'unrelated bytes changed')
    check(all(cand['./'+n][1]==data for n,data in desired.items()),'exact candidate mismatch')
    return cand

if __name__=='__main__':
    cmd,dest=sys.argv[1:3];sha,run=context();out=pathlib.Path(dest)
    if cmd in ('prepare','inspect'):
        live(sha,run);prior=baseline();current_public(prior,prior['./'+changed][1])
        out.mkdir(parents=True,exist_ok=False)
        result=candidate(prior,out/'artifact.tar')
    elif cmd=='recheck':
        live(sha,run);prior=baseline();current_public(prior,prior['./'+changed][1])
        artifact=int(os.environ['CT_UPLOADED_ARTIFACT'])
        m=api('/actions/artifacts/'+str(artifact));w=m.get('workflow_run') or {}
        check(m.get('name')=='github-pages' and w.get('head_sha')==sha and str(w.get('id'))==run,'new artifact provenance')
        z=archive(artifact);check(m.get('digest')=='sha256:'+sh(z),'new artifact ZIP hash')
        check(tar_from_zip(z)==(out/'artifact.tar').read_bytes(),'uploaded archive differs')
        live(sha,run)
    elif cmd=='post':
        live(sha,run,True);prior=baseline();out.mkdir(parents=True,exist_ok=False)
        result=candidate(prior,out/'artifact.tar')
        current_public(result,result['./'+changed][1],True)
    else:raise RuntimeError('unknown stage')
    print('Verified: producer-cover draft only, unchanged agenda and checkout.')
