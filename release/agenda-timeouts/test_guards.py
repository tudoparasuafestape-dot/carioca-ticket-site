import unittest,copy,io,tarfile,pathlib
from artifact_guard import *
import release_guard as g
class Tests(unittest.TestCase):
 def test_identity(self):
  env={'GITHUB_REPOSITORY':g.REPO,'GITHUB_REF':'refs/heads/main','GITHUB_EVENT_NAME':'workflow_dispatch','CT_EXPECTED_GUARD_SHA':'a'*40,'GITHUB_SHA':'a'*40,'CT_CONFIRMATION':'PUBLISH_AGENDA_TIMEOUTS_ONLY'}
  self.assertEqual(g.identity(env),('a'*40,None))
  for k in env:
   e=dict(env);e[k]='wrong'
   with self.subTest(k=k),self.assertRaises(ValueError):g.identity(e)
 def test_zip_tampered(self):
  with self.assertRaises(ValueError):prepare(b'not approved artifact')
 def test_tar_paths_and_types(self):
  for name,kind in [('../bad',tarfile.REGTYPE),('/bad',tarfile.REGTYPE),('ok',tarfile.SYMTYPE)]:
   b=io.BytesIO()
   with tarfile.open(fileobj=b,mode='w') as t:
    m=tarfile.TarInfo(name);m.type=kind;t.addfile(m)
   with self.subTest(name=name,kind=kind),self.assertRaises(ValueError):members(b.getvalue())
 def test_duplicate(self):
  b=io.BytesIO()
  with tarfile.open(fileobj=b,mode='w') as t:
   t.addfile(tarfile.TarInfo('same'));t.addfile(tarfile.TarInfo('same'))
  with self.assertRaises(ValueError):members(b.getvalue())
 def test_exact_ci(self):
  e={'GITHUB_REPOSITORY':g.REPO,'GITHUB_REF':'refs/heads/main','GITHUB_EVENT_NAME':'workflow_dispatch','CT_EXPECTED_GUARD_SHA':'a'*40,'GITHUB_SHA':'a'*40,'CT_CONFIRMATION':'PUBLISH_AGENDA_TIMEOUTS_ONLY'}
  class API:
   def get(self,p):return {'workflow_runs':self.runs}
  api=API()
  for runs in [[],[{'head_sha':'b'*40,'path':'.github/workflows/homologacao-automatica.yml','status':'completed','conclusion':'success'}],[{'head_sha':'a'*40,'path':'.github/workflows/homologacao-automatica.yml','status':'completed','conclusion':'failure'}]]:
   api.runs=runs
   with self.assertRaises(ValueError):g.ci(api,e)
 def test_deployment_and_main_pins(self):
  e={'GITHUB_REPOSITORY':g.REPO,'GITHUB_REF':'refs/heads/main','GITHUB_EVENT_NAME':'workflow_dispatch','CT_EXPECTED_GUARD_SHA':'a'*40,'GITHUB_SHA':'a'*40,'CT_CONFIRMATION':'PUBLISH_AGENDA_TIMEOUTS_ONLY','GITHUB_RUN_ID':'999'}
  base={'/pages':{'build_type':'workflow'},'/git/ref/heads/main':{'object':{'sha':'a'*40}},'/deployments?environment=github-pages&per_page=100':[{'id':123,'sha':g.BASE_SHA}],'/deployments/123/statuses?per_page=100':[{'state':'success','log_url':'https://github.com/x/actions/runs/'+str(g.BASE_RUN)+'/job/1'}],'/actions/runs/'+str(g.BASE_RUN):{'head_sha':g.BASE_SHA,'status':'completed','conclusion':'success','event':'workflow_dispatch','path':'.github/workflows/ct-tony-checkout-only-publication.yml'},'/actions/artifacts/'+str(g.BASE_ARTIFACT):{'name':'github-pages','expired':False,'digest':'sha256:'+ZIP_SHA,'workflow_run':{'id':g.BASE_RUN}}}
  class API:
   def __init__(self,d):self.d=d
   def get(self,p):return self.d[p]
  self.assertEqual(g.state(API(base),e)['deploymentId'],123)
  mutations=[('/pages',{'build_type':'legacy'}),('/git/ref/heads/main',{'object':{'sha':'b'*40}}),('/deployments?environment=github-pages&per_page=100',[]),('/deployments/123/statuses?per_page=100',[{'state':'inactive'}]),('/actions/runs/'+str(g.BASE_RUN),{'head_sha':'wrong'}),('/actions/artifacts/'+str(g.BASE_ARTIFACT),{'expired':True})]
  for key,value in mutations:
   changed=copy.deepcopy(base);changed[key]=value
   with self.subTest(key=key),self.assertRaises(ValueError):g.state(API(changed),e)
  changed=copy.deepcopy(base);changed['/deployments?environment=github-pages&per_page=100'].insert(0,{'id':456,'sha':'a'*40});changed['/deployments/456/statuses?per_page=100']=[{'state':'success','log_url':'https://github.com/x/actions/runs/555/job/1'}]
  with self.assertRaises(ValueError):g.state(API(changed),e)
 def test_resealed_zip_tar_and_other_file_changes(self):
  from unittest.mock import patch
  import zipfile
  p=pathlib.Path(__file__).with_name('baseline.zip')
  if not p.exists():self.skipTest('real baseline absent')
  zbytes=p.read_bytes();raw=zipfile.ZipFile(io.BytesIO(zbytes)).read('artifact.tar')
  mutated=raw[:-1]+bytes([raw[-1]^1]);b=io.BytesIO()
  with zipfile.ZipFile(b,'w') as z:z.writestr('artifact.tar',mutated)
  with patch('artifact_guard.ZIP_SHA',sha(b.getvalue())),self.assertRaisesRegex(ValueError,'TAR mismatch'):prepare(b.getvalue())
  with zipfile.ZipFile(io.BytesIO(zbytes)) as z:original=z.read('artifact.tar')
  changed=bytearray(zbytes);changed[len(changed)//2]^=1
  with self.assertRaisesRegex(ValueError,'ZIP mismatch'):prepare(bytes(changed))
 def test_real_artifact_if_present(self):
  p=pathlib.Path(__file__).with_name('baseline.zip')
  if not p.exists():self.skipTest('46MB baseline not bundled; prepare verifies production bytes')
  result,raw,seal=prepare(p.read_bytes());self.assertEqual(sha(result),g.CANDIDATE_TAR);self.assertEqual(seal['changed'],[TARGET]);self.assertEqual(len(members(result)),len(members(raw)))
if __name__=='__main__':unittest.main()
