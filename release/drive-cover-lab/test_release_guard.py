import io, pathlib, unittest, zipfile
from unittest.mock import patch
import release_guard as g

def env():
 return dict(GITHUB_REPOSITORY=g.REPO,GITHUB_REF='refs/heads/main',GITHUB_EVENT_NAME='workflow_dispatch',GITHUB_RUN_ID='123',GITHUB_RUN_ATTEMPT='1',GITHUB_SHA='a'*40,CT_EXPECTED_GUARD_SHA='a'*40,GITHUB_WORKFLOW_REF=g.REPO+'/'+g.WORKFLOW+'@refs/heads/main',RUNNER_ENVIRONMENT='github-hosted',CT_MODE='publish',CT_CONFIRMATION='PUBLISH_DRIVE_COVER_LAB_HTML_ONLY',CT_EXPECTED_DEPLOYMENT=str(g.BASE_DEPLOYMENT))
class Fake:
 def __init__(self):self.newer=[];self.state='success';self.main='a'*40
 def get(self,p):
  if p=='/pages':return {'build_type':'workflow'}
  if p=='/git/ref/heads/main':return {'object':{'sha':self.main}}
  if p.startswith('/deployments?'):return self.newer+[{'id':g.BASE_DEPLOYMENT,'sha':g.BASE_SHA}]
  if '/statuses?' in p:return [{'state':self.state,'environment_url':g.ORIGIN,'log_url':'https://github.com/'+g.REPO+'/actions/runs/'+str(g.BASE_RUN)+'/job/1'}]
  if p=='/actions/runs/'+str(g.BASE_RUN):return {'status':'completed','conclusion':'success','event':'workflow_dispatch','head_sha':g.BASE_SHA,'path':'.github/workflows/ct-tony-checkout-only-publication.yml'}
  raise AssertionError(p)
class Tests(unittest.TestCase):
 def test_identity(self):self.assertEqual(g.identity(env())[1],'publish')
 def test_identity_mutations(self):
  for key,value in [('GITHUB_REPOSITORY','other'),('GITHUB_RUN_ATTEMPT','2'),('GITHUB_REF','refs/heads/dev'),('GITHUB_EVENT_NAME','push'),('GITHUB_SHA','b'*40),('CT_CONFIRMATION','yes'),('CT_MODE','auto'),('CT_EXPECTED_DEPLOYMENT','1'),('RUNNER_ENVIRONMENT','self-hosted'),('GITHUB_WORKFLOW_REF','other')]:
   with self.subTest(key=key), self.assertRaises(ValueError):g.identity({**env(),key:value})
 def test_state(self):self.assertEqual(g.current_state(Fake(),env())['deploymentId'],g.BASE_DEPLOYMENT)
 def test_changed_main(self):
  f=Fake();f.main='b'*40
  with self.assertRaises(ValueError):g.current_state(f,env())
 def test_newer(self):
  f=Fake();f.newer=[{'id':999,'sha':'c'*40}]
  with self.assertRaises(ValueError):g.current_state(f,env())
 def test_failed_baseline(self):
  f=Fake();f.state='failure'
  with self.assertRaises(ValueError):g.current_state(f,env())
 def test_zip_bound(self):
  b=io.BytesIO()
  with zipfile.ZipFile(b,'w') as z:z.writestr('x',b'123')
  with zipfile.ZipFile(io.BytesIO(b.getvalue())) as z:
   with self.assertRaises(ValueError):g.zip_read(z,'x',2)
 def test_public_path_gate(self):
  with self.assertRaises(ValueError):g.public_get('api/payments')
 def test_static(self):
  old={p:({},p.encode()) for p in g.CRITICAL}
  def fetch(p):return (200,'text/html',b'html' if p==g.ASSET else p.encode())
  with patch.object(g,'sha',side_effect=lambda b:g.TAR_SHA if b==b'baseline' else g.HTML_SHA),patch.object(g,'inventory',return_value=old):g.verify_static(b'baseline','publish',fetch)
 def test_static_corruption(self):
  with patch.object(g,'sha',return_value=g.TAR_SHA),patch.object(g,'inventory',return_value={p:({},b'old') for p in g.CRITICAL}):
   with self.assertRaises(ValueError):g.verify_static(b'baseline','publish',lambda p:(200,'text/html',b'bad'))
 def test_rollback_absence(self):
  with patch.object(g,'sha',return_value=g.TAR_SHA),patch.object(g,'inventory',return_value={p:({},b'old') for p in g.CRITICAL}):g.verify_static(b'baseline','rollback',lambda p:(404,'',b'') if p==g.ASSET else (200,'text/html',b'old'))
 def test_archive_rejects_other_host(self):
  api=g.Api('secret')
  error=g.urllib.error.HTTPError('api',302,'redirect',{'Location':'https://evil.example/zip'},None)
  with patch.object(api,'raw',side_effect=error), self.assertRaises(ValueError):api.archive(1)
 def test_archive_does_not_forward_token(self):
  api=g.Api('secret')
  error=g.urllib.error.HTTPError('api',302,'redirect',{'Location':'https://safe.blob.core.windows.net/zip'},None)
  class Response(io.BytesIO):status=200
  class Opener:
   def open(self,req,timeout):
    assert not any(k.lower()=='authorization' for k in req.headers)
    return Response(b'zip')
  with patch.object(api,'raw',side_effect=error),patch.object(g.urllib.request,'build_opener',return_value=Opener()):self.assertEqual(api.archive(1),b'zip')
 def test_own_pending_is_allowed(self):
  f=Fake();f.newer=[{'id':999,'sha':'a'*40}];old=f.get
  def get(p):
   if p=='/deployments/999/statuses?per_page=100':return [{'state':'in_progress','log_url':'https://github.com/'+g.REPO+'/actions/runs/123/job/1'}]
   return old(p)
  f.get=get;self.assertEqual(g.current_state(f,env())['deploymentId'],g.BASE_DEPLOYMENT)
 def test_rollback_rejects_other_workflow(self):
  e={**env(),'CT_MODE':'rollback','CT_CONFIRMATION':'ROLLBACK_DRIVE_COVER_LAB_HTML_ONLY','CT_EXPECTED_DEPLOYMENT':'999'}
  f=Fake();old=f.get
  def get(p):
   if p.startswith('/deployments?'):return [{'id':999,'sha':g.BASE_SHA}]
   return old(p)
  f.get=get
  with self.assertRaisesRegex(ValueError,'only reverse'):g.current_state(f,e)
 def test_html_pin(self):self.assertEqual(g.sha(pathlib.Path(__file__).with_name('index.html').read_bytes()),g.HTML_SHA)
if __name__=='__main__':unittest.main()
