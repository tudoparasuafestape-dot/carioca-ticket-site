"""Explicitly invoked GitHub-only release guard; no site/backend requests."""
import hashlib,io,json,os,pathlib,re,subprocess,sys,urllib.error,urllib.parse,urllib.request,zipfile
from artifact_guard import prepare,sha,require,TAR_SHA,ZIP_SHA
REPO='tudoparasuafestape-dot/carioca-ticket-site'
WORKFLOW='.github/workflows/ct-tony-checkout-only-publication.yml'
CANDIDATE='b4e817610dc90af77b631db44404cb90d166ba70'
TREE='b79fc7d53405703399f74700b2fe26175f2297ce'
CANDIDATE_TAR='d42bc4c6e8c45e36960f959a11fb461129932f0f39dee67fec0cd2c2ba5178e5'
BASE_DEPLOYMENT=7656353597
BASE_RUN=42628636941
BASE_SHA='247ae6ae43c52c74ee22ae6690cca27584af24f0'
BASE_ARTIFACT=13679502447
CI=[43416661377,43416661504,43416661452,43416661336,43416661483,43416661407,43416661458,43416661280,43416661464]
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

def identity(env):
 require(env.get('GITHUB_REPOSITORY')==REPO,'repository mismatch')
 require(env.get('GITHUB_REF')=='refs/heads/main' and env.get('GITHUB_EVENT_NAME')=='workflow_dispatch','manual main only')
 guard=env.get('CT_EXPECTED_GUARD_SHA','');require(bool(SHA.fullmatch(guard)) and env.get('GITHUB_SHA')==guard,'guard SHA mismatch')
 require(env.get('CT_CANDIDATE_SHA')==CANDIDATE,'candidate pin')
 mode=env.get('CT_MODE');require(mode in ('publish','rollback'),'explicit mode')
 require(env.get('CT_CONFIRMATION')==('PUBLISH_TONY_CHECKOUT_ONLY' if mode=='publish' else 'ROLLBACK_TONY_CHECKOUT_ONLY'),'scope confirmation')
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
   require(s.get('state')=='success','expected deployment not active success');found=(d,s);break
  run_fragment='/actions/runs/'+env.get('GITHUB_RUN_ID','')+'/'
  require(d.get('sha')==guard and s.get('state') in ('queued','pending','in_progress','waiting') and run_fragment in s.get('log_url',''),'another/newer deployment exists')
 require(found is not None,'expected deployment absent from bounded list')
 d,s=found
 match=re.search(r'/actions/runs/(\d+)(?:/|$)',s.get('log_url',''));require(match is not None,'deployment run link missing')
 runid=int(match[1]);run=api.get('/actions/runs/'+str(runid))
 require(run.get('conclusion')=='success' and run.get('status')=='completed' and run.get('event')=='workflow_dispatch','publication run unverified')
 if mode=='publish':
  require(runid==BASE_RUN and d.get('sha')==BASE_SHA and run.get('head_sha')==BASE_SHA and run.get('path')=='.github/workflows/ct-tony-authorized-publication.yml','baseline deployment mismatch')
 else:
  require(run.get('path')==WORKFLOW and bool(SHA.fullmatch(run.get('head_sha',''))) and d.get('sha')==run.get('head_sha'),'rollback may only reverse this reviewed workflow')
  arts=api.get('/actions/runs/'+str(runid)+'/artifacts?name=github-pages&per_page=100').get('artifacts',[])
  require(len(arts)==1 and not arts[0].get('expired'),'rollback current artifact unavailable')
  z=zipfile.ZipFile(io.BytesIO(api.archive(arts[0]['id'])));require(z.namelist()==['artifact.tar'],'current artifact inventory');require(sha(z.read('artifact.tar'))==CANDIDATE_TAR,'current publication is not exact candidate')
 require(api.get('/git/ref/heads/main').get('object',{}).get('sha')==guard,'main changed during check')
 return {'deploymentId':d['id'],'runId':runid,'guardSha':guard,'mode':mode}

def ci(api):
 for rid in CI:
  r=api.get('/actions/runs/'+str(rid));require(r.get('status')=='completed' and r.get('conclusion')=='success' and r.get('head_sha')==CANDIDATE and r.get('event')=='pull_request','required candidate CI missing/changed')

def write_new(p,b):
 with p.open('xb') as f:f.write(b)

def run(command,repo,out,env=os.environ,api=None):
 guard,mode,expected=identity(env);repo=pathlib.Path(repo).resolve();out=pathlib.Path(out).resolve();api=api or Api(env.get('GH_TOKEN'))
 def git(*args):return subprocess.check_output(['git','-C',str(repo),*args],text=True).strip()
 require(git('rev-parse','HEAD')==CANDIDATE and git('rev-parse','HEAD^{tree}')==TREE,'whole candidate tree mismatch')
 require(git('merge-base',CANDIDATE,guard)==CANDIDATE,'candidate not integrated in approved main')
 initial=current_state(api,env);ci(api)
 if command=='prepare':
  require(not out.exists(),'stage already exists')
  if mode=='publish':
   a=api.get('/actions/artifacts/'+str(BASE_ARTIFACT))
   require(a.get('name')=='github-pages' and not a.get('expired') and a.get('digest')=='sha256:'+ZIP_SHA and a.get('workflow_run',{}).get('id')==BASE_RUN,'baseline artifact identity')
   zbytes=api.archive(BASE_ARTIFACT);selected,seal=prepare(zbytes,(repo/'checkout/index.html').read_bytes())
   original=zipfile.ZipFile(io.BytesIO(zbytes)).read('artifact.tar')
  else:
   arts=api.get('/actions/runs/'+str(initial['runId'])+'/artifacts?name=checkout-rollback-and-seal&per_page=100').get('artifacts',[])
   require(len(arts)==1 and not arts[0].get('expired'),'retained rollback artifact unavailable')
   z=zipfile.ZipFile(io.BytesIO(api.archive(arts[0]['id'])))
   require(sorted(z.namelist())==['rollback.tar','seal.json'],'retained rollback inventory')
   original=z.read('rollback.tar');require(sha(original)==TAR_SHA,'retained rollback bytes mismatch')
   previous=json.loads(z.read('seal.json'));require(previous.get('artifactSha256')==CANDIDATE_TAR and previous.get('state',{}).get('mode')=='publish','retained seal mismatch')
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
 print(json.dumps({'verified':True,'mode':mode,'deploymentBaseline':expected,'candidate':CANDIDATE}))
if __name__=='__main__':run(*sys.argv[1:])
