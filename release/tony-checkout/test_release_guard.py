import copy,io,json,tarfile,unittest,zipfile
from unittest.mock import patch
import artifact_guard as a
import release_guard as g
ENV={'GITHUB_REPOSITORY':g.REPO,'GITHUB_REF':'refs/heads/main','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_SHA':'a'*40,'CT_EXPECTED_GUARD_SHA':'a'*40,'CT_CANDIDATE_SHA':g.CANDIDATE,'CT_MODE':'publish','CT_CONFIRMATION':'PUBLISH_TONY_CHECKOUT_ONLY','CT_EXPECTED_DEPLOYMENT':str(g.BASE_DEPLOYMENT),'GITHUB_RUN_ID':'123'}
class MockApi:
 def __init__(self):
  self.data={'/pages':{'build_type':'workflow'},'/git/ref/heads/main':{'object':{'sha':'a'*40}},'/deployments?environment=github-pages&per_page=100':[{'id':g.BASE_DEPLOYMENT,'sha':g.BASE_SHA}],'/deployments/'+str(g.BASE_DEPLOYMENT)+'/statuses?per_page=100':[{'state':'success','log_url':'https://github.com/'+g.REPO+'/actions/runs/'+str(g.BASE_RUN)+'/job/456'}],'/actions/runs/'+str(g.BASE_RUN):{'status':'completed','conclusion':'success','event':'workflow_dispatch','path':'.github/workflows/ct-tony-authorized-publication.yml','head_sha':g.BASE_SHA}}
  for rid in g.CI:self.data['/actions/runs/'+str(rid)]={'status':'completed','conclusion':'success','event':'pull_request','head_sha':g.CANDIDATE}
 def get(self,key):return copy.deepcopy(self.data[key])
class Identity(unittest.TestCase):
 def test_good(self):self.assertEqual(g.identity(ENV)[1],'publish')
 def test_ref(self):
  for key,value in [('GITHUB_REF','refs/heads/fix/x'),('GITHUB_EVENT_NAME','push'),('GITHUB_REPOSITORY','evil/repo'),('GITHUB_SHA','b'*40),('CT_CANDIDATE_SHA','b'*40),('CT_CONFIRMATION',''),('CT_MODE','other'),('CT_EXPECTED_DEPLOYMENT','777')]:
   with self.subTest(key=key),self.assertRaises(ValueError):g.identity(dict(ENV,**{key:value}))
 def test_rollback_requires_scope(self):
  with self.assertRaises(ValueError):g.identity(dict(ENV,CT_MODE='rollback'))
class State(unittest.TestCase):
 def test_baseline(self):self.assertEqual(g.current_state(MockApi(),ENV)['deploymentId'],g.BASE_DEPLOYMENT)
 def test_main_moved(self):
  m=MockApi();m.data['/git/ref/heads/main']['object']['sha']='b'*40
  with self.assertRaises(ValueError):g.current_state(m,ENV)
 def test_branch_pages(self):
  m=MockApi();m.data['/pages']['build_type']='legacy'
  with self.assertRaises(ValueError):g.current_state(m,ENV)
 def test_deployment_inactive(self):
  m=MockApi();m.data['/deployments/'+str(g.BASE_DEPLOYMENT)+'/statuses?per_page=100'][0]['state']='inactive'
  with self.assertRaises(ValueError):g.current_state(m,ENV)
 def test_new_publisher(self):
  m=MockApi();m.data['/deployments?environment=github-pages&per_page=100'].insert(0,{'id':999,'sha':'b'*40});m.data['/deployments/999/statuses?per_page=100']=[{'state':'success','log_url':'x'}]
  with self.assertRaises(ValueError):g.current_state(m,ENV)
 def test_own_pending_allowed(self):
  m=MockApi();m.data['/deployments?environment=github-pages&per_page=100'].insert(0,{'id':999,'sha':'a'*40});m.data['/deployments/999/statuses?per_page=100']=[{'state':'in_progress','log_url':'https://github.com/'+g.REPO+'/actions/runs/123/job/789'}];g.current_state(m,ENV)
 def test_other_pending_refused(self):
  m=MockApi();m.data['/deployments?environment=github-pages&per_page=100'].insert(0,{'id':999,'sha':'a'*40});m.data['/deployments/999/statuses?per_page=100']=[{'state':'in_progress','log_url':'https://github.com/'+g.REPO+'/actions/runs/999/job/789'}]
  with self.assertRaises(ValueError):g.current_state(m,ENV)
 def test_failed_baseline_run(self):
  m=MockApi();m.data['/actions/runs/'+str(g.BASE_RUN)]['conclusion']='failure'
  with self.assertRaises(ValueError):g.current_state(m,ENV)
 def test_ci(self):g.ci(MockApi())
 def test_ci_wrong_commit(self):
  m=MockApi();m.data['/actions/runs/'+str(g.CI[0])]['head_sha']='b'*40
  with self.assertRaises(ValueError):g.ci(m)
class Artifact(unittest.TestCase):
 def tar(self,names,type=None):
  b=io.BytesIO()
  with tarfile.open(fileobj=b,mode='w') as t:
   for n in names:
    m=tarfile.TarInfo(n);data=b'old';m.size=len(data)
    if type:m.type=type;m.linkname='x';m.size=0;data=b''
    t.addfile(m,io.BytesIO(data))
  return b.getvalue()
 def test_overlay_all_other_bytes_preserved(self):
  raw=self.tar([a.TARGET]+['file'+str(x) for x in range(545)]);buf=io.BytesIO()
  with zipfile.ZipFile(buf,'w') as z:z.writestr('artifact.tar',raw)
  zb=buf.getvalue()
  with patch.multiple(a,ZIP_SHA=a.sha(zb),TAR_SHA=a.sha(raw),OLD=a.sha(b'old'),NEW=a.sha(b'new')):
   result,seal=a.prepare(zb,b'new');files={p:b for m,p,b in a.members(result)};self.assertEqual(files[a.TARGET],b'new');self.assertEqual(len(files),546);self.assertTrue(all(b==b'old' for p,b in files.items() if p!=a.TARGET))
 def test_modified_zip(self):
  with self.assertRaises(ValueError):a.prepare(b'bad',b'bad')
 def test_unsafe_entries(self):
  for names,typ in [(['../x'],None),(['/x'],None),(['x','x'],None),(['x'],tarfile.SYMTYPE),(['x'],tarfile.LNKTYPE)]:
   with self.subTest(names=names,type=typ),self.assertRaises(ValueError):a.members(self.tar(names,typ))
if __name__=='__main__':unittest.main()
