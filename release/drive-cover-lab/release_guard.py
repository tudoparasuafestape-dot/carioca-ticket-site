"""Proposed release guard: read-only GitHub and static public HTTP checks. No deployment code."""
import hashlib,io,json,os,pathlib,re,subprocess,sys,urllib.error,urllib.parse,urllib.request,zipfile
from artifact_guard import prepare,sha,require,TAR_SHA,ZIP_SHA,inventory,ASSET,HTML_SHA
REPO='tudoparasuafestape-dot/carioca-ticket-site'
WORKFLOW='.github/workflows/ct-drive-cover-lab-publication.yml'
CANDIDATE_TAR='034cedd995e314932351b803499810df89f12a387eed99453e6fa01bd2cb4c8a'
BASE_DEPLOYMENT=7765206641
BASE_RUN=43425385424
BASE_SHA='b47e80028d4a2eed4b9c69a6a85a4493b3ce605e'
BASE_ARTIFACT=14037465102
SHA=re.compile(r'^[0-9a-f]{40}$')
MAX=256*1024*1024
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs): return None
class Api:
 def __init__(self,token):
  require(bool(token),'GitHub token missing');self.token=token
 def raw(self,suffix):
  require(suffix.startswith('/') and not suffix.startswith('//') and '..' not in suffix,'API path')
  req=urllib.request.Request('https://api.github.com/repos/'+REPO+suffix,headers={'Authorization':'Bearer '+self.token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
  return urllib.request.build_opener(NoRedirect).open(req,timeout=30)
 def get(self,suffix):
  with self.raw(suffix) as r:
   require(r.status==200,'API status');b=r.read(4*1024*1024+1);require(len(b)<=4*1024*1024,'API size');return json.loads(b)
 def archive(self,artifact):
  try:
   response=self.raw('/actions/artifacts/'+str(artifact)+'/zip')
  except urllib.error.HTTPError as e:
   require(e.code==302,'artifact download status');url=e.headers.get('Location','');u=urllib.parse.urlparse(url)
   require(u.scheme=='https' and not u.username and not u.password and u.hostname and (u.hostname.endswith('.blob.core.windows.net') or u.hostname.endswith('.githubusercontent.com')),'artifact redirect destination')
   # Anonymous second request: never forward GitHub authorization to storage.
   response=urllib.request.build_opener(NoRedirect).open(urllib.request.Request(url),timeout=60)
  with response as r:
   require(r.status==200,'artifact storage status');data=r.read(MAX+1);require(len(data)<=MAX,'artifact oversized');return data

def zip_read(z,name,limit=MAX):
 require(z.getinfo(name).file_size<=limit,'expanded artifact oversized')
 b=z.read(name);require(len(b)<=limit,'expanded artifact oversized');return b

def identity(env):
 require(env.get('GITHUB_REPOSITORY')==REPO,'repository mismatch')
 require(str(env.get('GITHUB_RUN_ID','')).isdigit(),'run identity missing')
 require(env.get('GITHUB_RUN_ATTEMPT')=='1','rerun forbidden; inspect previous outcome first')
 require(env.get('GITHUB_REF')=='refs/heads/main' and env.get('GITHUB_EVENT_NAME')=='workflow_dispatch','manual main only')
 guard=env.get('CT_EXPECTED_GUARD_SHA','');require(bool(SHA.fullmatch(guard)) and env.get('GITHUB_SHA')==guard,'guard SHA mismatch')
 require(env.get('GITHUB_WORKFLOW_REF')==REPO+'/'+WORKFLOW+'@refs/heads/main','workflow mismatch')
 require(env.get('RUNNER_ENVIRONMENT')=='github-hosted','hosted runner required')
 mode=env.get('CT_MODE');require(mode in ('publish','rollback'),'explicit mode')
 require(env.get('CT_CONFIRMATION')==('PUBLISH_DRIVE_COVER_LAB_HTML_ONLY' if mode=='publish' else 'ROLLBACK_DRIVE_COVER_LAB_HTML_ONLY'),'scope confirmation')
 dep=env.get('CT_EXPECTED_DEPLOYMENT','');require(dep.isdigit(),'deployment identity')
 require(int(dep)==BASE_DEPLOYMENT if mode=='publish' else int(dep)!=BASE_DEPLOYMENT,'deployment scope')
 return guard,mode,int(dep)

def current_state(api,env):
 guard,mode,expected=identity(env)
 require(api.get('/pages').get('build_type')=='workflow','Pages source must be workflows')
 require(api.get('/git/ref/heads/main').get('object',{}).get('sha')==guard,'main changed')
 # Every deployment newer than the known success must be this exact executing job,
 # not a concurrent failed/cancelled/unverified publisher or unknown environment.
 ds=api.get('/deployments?environment=github-pages&per_page=100');require(isinstance(ds,list) and ds,'deployment list missing')
 found=None
 for d in ds:
  statuses=api.get('/deployments/'+str(d['id'])+'/statuses?per_page=100');require(statuses,'deployment status missing')
  s=statuses[0]
  if d['id']==expected:
   require(s.get('state')=='success' and s.get('environment_url')=='https://cariocaticket.com.br/','expected deployment not active success');found=(d,s);break
  run_fragment='/actions/runs/'+env.get('GITHUB_RUN_ID','')+'/'
  require(d.get('sha')==guard and s.get('state') in ('queued','pending','in_progress','waiting') and run_fragment in s.get('log_url',''),'another/newer deployment exists')
 require(found is not None,'expected deployment absent from bounded list')
 d,s=found
 match=re.search(r'/actions/runs/(\d+)(?:/|$)',s.get('log_url',''));require(match is not None,'deployment run link missing')
 runid=int(match[1]);run=api.get('/actions/runs/'+str(runid))
 require(run.get('status')=='completed' and run.get('event')=='workflow_dispatch','publication run unverified')
 if mode=='publish': require(run.get('conclusion')=='success','baseline run not successful')
 else: require(run.get('conclusion') in ('success','failure'),'rollback target run incomplete')
 if mode=='publish':
  require(runid==BASE_RUN and d.get('sha')==BASE_SHA and run.get('head_sha')==BASE_SHA and run.get('path')=='.github/workflows/ct-tony-checkout-only-publication.yml','baseline deployment mismatch')
 else:
  require(run.get('path')==WORKFLOW and bool(SHA.fullmatch(run.get('head_sha',''))) and d.get('sha')==run.get('head_sha'),'rollback may only reverse this reviewed workflow')
  arts=api.get('/actions/runs/'+str(runid)+'/artifacts?name=github-pages&per_page=100').get('artifacts',[])
  require(len(arts)==1 and not arts[0].get('expired'),'rollback current artifact unavailable')
  z=zipfile.ZipFile(io.BytesIO(api.archive(arts[0]['id'])));require(z.namelist()==['artifact.tar'],'current artifact inventory');require(sha(zip_read(z,'artifact.tar'))==CANDIDATE_TAR,'current publication is not exact candidate')
 require(api.get('/git/ref/heads/main').get('object',{}).get('sha')==guard,'main changed during check')
 return {'deploymentId':d['id'],'runId':runid,'guardSha':guard,'mode':mode}

def write_new(p,b):
 with p.open('xb') as f:f.write(b)

def run(command,repo,out,env=os.environ,api=None):
 guard,mode,expected=identity(env);repo=pathlib.Path(repo).resolve();out=pathlib.Path(out).resolve();api=api or Api(env.get('GH_TOKEN'))
 initial=current_state(api,env)
 if command=='prepare':
  require(not out.exists(),'stage already exists')
  if mode=='publish':
   a=api.get('/actions/artifacts/'+str(BASE_ARTIFACT))
   require(a.get('name')=='github-pages' and not a.get('expired') and a.get('digest')=='sha256:'+ZIP_SHA and a.get('workflow_run',{}).get('id')==BASE_RUN,'baseline artifact identity')
   zbytes=api.archive(BASE_ARTIFACT);selected,seal=prepare(zbytes,(repo/'index.html').read_bytes())
   original=zip_read(zipfile.ZipFile(io.BytesIO(zbytes)),'artifact.tar')
   require(sha(selected)==CANDIDATE_TAR,'candidate bytes changed')
  else:
   arts=api.get('/actions/runs/'+str(initial['runId'])+'/artifacts?name=drive-cover-lab-rollback-and-seal&per_page=100').get('artifacts',[])
   require(len(arts)==1 and not arts[0].get('expired'),'retained rollback artifact unavailable')
   z=zipfile.ZipFile(io.BytesIO(api.archive(arts[0]['id'])))
   require(sorted(z.namelist())==['rollback.tar','seal.json'],'retained rollback inventory')
   original=zip_read(z,'rollback.tar');require(sha(original)==TAR_SHA,'retained rollback bytes mismatch')
   previous=json.loads(zip_read(z,'seal.json',65536));require(previous.get('artifactSha256')==CANDIDATE_TAR and previous.get('state',{}).get('mode')=='publish','retained seal mismatch')
   selected=original;seal={'rollbackTarSha256':TAR_SHA,'reversesRunId':initial['runId']}
  require(current_state(api,env)==initial,'publication state changed while preparing')
  out.mkdir(mode=0o700);write_new(out/'artifact.tar',selected);write_new(out/'rollback.tar',original)
  write_new(out/'seal.json',json.dumps({'state':initial,'artifactSha256':sha(selected),'expected':seal},sort_keys=True,indent=2).encode())
 elif command=='recheck':
  seal=json.loads((out/'seal.json').read_text());require(seal.get('state')==initial,'state differs from stage')
  expected_hash=CANDIDATE_TAR if mode=='publish' else TAR_SHA
  require(sha((out/'artifact.tar').read_bytes())==expected_hash==seal.get('artifactSha256'),'deploy archive changed')
  require(sha((out/'rollback.tar').read_bytes())==TAR_SHA,'rollback changed')
 else:raise ValueError('unknown command')
 print(json.dumps({'verified':True,'mode':mode,'deploymentBaseline':expected,'candidateTarSha256':CANDIDATE_TAR}))


ORIGIN='https://cariocaticket.com.br/'
CRITICAL=('index.html','checkout/index.html','evento/index.html','assets/event-cover-picker.js')
def public_get(path):
 require(path in CRITICAL+(ASSET,), 'unapproved public path')
 req=urllib.request.Request(ORIGIN+path,headers={'Accept-Encoding':'identity','Cache-Control':'no-cache'})
 try:
  with urllib.request.build_opener(NoRedirect).open(req,timeout=30) as r:
   data=r.read(10*1024*1024+1);require(len(data)<=10*1024*1024,'public response too large')
   return r.status,r.headers.get_content_type(),data
 except urllib.error.HTTPError as e:
  if e.code==404:return 404,'',b''
  raise

def verify_static(baseline,mode,fetch=public_get):
 require(sha(baseline)==TAR_SHA,'verification baseline mismatch')
 old=inventory(baseline)
 for path in CRITICAL:
  require(path in old,'critical path absent')
  status,mime,data=fetch(path)
  require(status==200 and data==old[path][1],'critical public bytes mismatch: '+path)
 status,mime,data=fetch(ASSET)
 if mode=='publish':require(status==200 and mime=='text/html' and sha(data)==HTML_SHA,'lab HTTP mismatch')
 else:require(status==404,'lab must be absent')

def postverify(out,env=os.environ,api=None,fetch=public_get):
 guard,mode,_=identity(env);api=api or Api(env.get('GH_TOKEN'))
 ds=api.get('/deployments?environment=github-pages&per_page=1');require(bool(ds),'missing deployment')
 d=ds[0];ss=api.get('/deployments/'+str(d['id'])+'/statuses?per_page=1');require(bool(ss),'missing status');s=ss[0]
 require(d.get('sha')==guard and s.get('state')=='success' and s.get('environment_url')==ORIGIN and '/actions/runs/'+env['GITHUB_RUN_ID']+'/' in s.get('log_url',''),'latest deployment not this successful run')
 verify_static((pathlib.Path(out)/'rollback.tar').read_bytes(),mode,fetch)
 print(json.dumps({'postverified':True,'deploymentId':d['id'],'mode':mode,'browserAndOgVerified':False}))

if __name__=='__main__':
 command,package,out=sys.argv[1:]
 if command=='postverify':postverify(out)
 elif command=='preflight':
  identity(os.environ);verify_static((pathlib.Path(out)/'rollback.tar').read_bytes(),'rollback' if os.environ['CT_MODE']=='publish' else 'publish')
 else:run(command,package,out)
