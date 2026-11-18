"""Agenda-only publication preflight. GET GitHub only; never calls site/backend."""
import io,json,os,pathlib,re,sys,urllib.error,urllib.parse,urllib.request
from artifact_guard import prepare,sha,require,TAR_SHA,ZIP_SHA,NEW
REPO='tudoparasuafestape-dot/carioca-ticket-site'
BASE_RUN=43425385424
BASE_SHA='b47e80028d4a2eed4b9c69a6a85a4493b3ce605e'
BASE_ARTIFACT=14037465102
CANDIDATE_TAR='6c23723cb583f5a5f727f366a7c0626d0bd9a39cd5283f672b0b92e700ceaa37'
SHA=re.compile(r'^[a-f0-9]{40}$')
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

def identity(e):
 require(e.get('GITHUB_REPOSITORY')==REPO,'repository')
 require(e.get('GITHUB_REF')=='refs/heads/main' and e.get('GITHUB_EVENT_NAME')=='workflow_dispatch','manual main only')
 guard=e.get('CT_EXPECTED_GUARD_SHA','');require(bool(SHA.fullmatch(guard)) and e.get('GITHUB_SHA')==guard,'guard SHA')
 require(e.get('CT_CONFIRMATION')=='PUBLISH_AGENDA_TIMEOUTS_ONLY','confirmation')
 return guard,None
def state(api,e):
 guard,expected=identity(e)
 require(api.get('/pages').get('build_type')=='workflow','Pages mode')
 require(api.get('/git/ref/heads/main').get('object',{}).get('sha')==guard,'main changed')
 ds=api.get('/deployments?environment=github-pages&per_page=100');require(isinstance(ds,list) and ds,'deployment list')
 found=None
 for d in ds:
  statuses=api.get('/deployments/'+str(d['id'])+'/statuses?per_page=100');require(statuses,'statuses missing');s=statuses[0]
  fragment='/actions/runs/'+e.get('GITHUB_RUN_ID','')+'/'
  own=(d.get('sha')==guard and s.get('state') in ('queued','pending','in_progress','waiting') and fragment in s.get('log_url',''))
  if own:continue
  # First non-own deployment must be the exact known successful baseline.
  # Never search past a newer external failure, pending deployment or success.
  require(s.get('state')=='success','newer/non-success deployment')
  expected=d['id'];found=(d,s);break
 require(found is not None,'expected deployment missing');d,s=found
 match=re.search(r'/actions/runs/(\d+)(?:/|$)',s.get('log_url',''));require(match is not None and int(match[1])==BASE_RUN,'baseline run')
 run=api.get('/actions/runs/'+str(BASE_RUN));require(run.get('head_sha')==BASE_SHA and d.get('sha')==BASE_SHA and run.get('status')=='completed' and run.get('conclusion')=='success' and run.get('event')=='workflow_dispatch' and run.get('path')=='.github/workflows/ct-tony-checkout-only-publication.yml','baseline provenance')
 a=api.get('/actions/artifacts/'+str(BASE_ARTIFACT));require(a.get('name')=='github-pages' and a.get('expired') is False and a.get('digest')=='sha256:'+ZIP_SHA and a.get('workflow_run',{}).get('id')==BASE_RUN,'artifact provenance')
 require(api.get('/git/ref/heads/main').get('object',{}).get('sha')==guard,'main changed during checks')
 return {'deploymentId':expected,'runId':BASE_RUN,'guardSha':guard}
def ci(api,e):
 guard,_=identity(e)
 runs=api.get('/actions/runs?head_sha='+guard+'&per_page=100').get('workflow_runs',[])
 matched=[r for r in runs if r.get('head_sha')==guard and r.get('path')=='.github/workflows/homologacao-automatica.yml']
 require(bool(matched),'CI missing for exact SHA')
 require(matched[0].get('status')=='completed' and matched[0].get('conclusion')=='success','latest homologacao not successful')
def main():
 mode,out=sys.argv[1],pathlib.Path(sys.argv[2]);e=os.environ;api=Api(e.get('GH_TOKEN',''));initial=state(api,e);ci(api,e)
 if mode=='prepare':
  require(not out.exists(),'output exists');result,raw,seal=prepare(api.archive(BASE_ARTIFACT));require(sha(result)==CANDIDATE_TAR,'candidate TAR pin');require(state(api,e)==initial,'state changed');seal['deploymentState']=initial
  out.mkdir();(out/'artifact.tar').write_bytes(result);(out/'rollback.tar').write_bytes(raw);(out/'seal.json').write_text(json.dumps(seal,indent=2))
 elif mode=='recheck':
  seal=json.loads((out/'seal.json').read_text());require(seal.get('deploymentState')==initial,'deployment changed');require(sha((out/'artifact.tar').read_bytes())==CANDIDATE_TAR,'sealed artifact changed');require(sha((out/'rollback.tar').read_bytes())==TAR_SHA,'backup changed')
 else:raise ValueError('unknown operation')
 print(json.dumps({'verified':True,'operation':mode,'scope':'agenda-timeouts-only','baselineRun':BASE_RUN}))
if __name__=='__main__':main()
