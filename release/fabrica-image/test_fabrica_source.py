import io,json,pathlib,tarfile,tempfile,unittest,zipfile
from unittest.mock import patch
import artifact_guard as a
import release_guard as g
from test_release_guard import env,Fake

def synthetic():
 png=b'\x89PNG\r\n\x1a\n'+b'x'*(2060262-8)
 b=io.BytesIO()
 with tarfile.open(fileobj=b,mode='w') as t:
  for name in g.CRITICAL:
   data=name.encode();m=tarfile.TarInfo(name);m.mode=0o640;m.mtime=123;m.size=len(data);t.addfile(m,io.BytesIO(data))
 tar=b.getvalue();z=io.BytesIO()
 with zipfile.ZipFile(z,'w') as f:f.writestr('artifact.tar',tar)
 return png,tar,z.getvalue()

class SourceTests(unittest.TestCase):
 def test_wrong_size_and_hash(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/'approved-fabrica.png';p.write_bytes(b'wrong')
   with self.assertRaisesRegex(ValueError,'size'):g.approved_source(d)
   p.write_bytes(b'x'*2060262)
   with self.assertRaisesRegex(ValueError,'hash'):g.approved_source(d)
 def test_symlink_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);(p/'other').write_bytes(b'x'*2060262);(p/'approved-fabrica.png').symlink_to(p/'other')
   with self.assertRaisesRegex(ValueError,'regular'):g.approved_source(p)
 def test_rollback_requires_detached_backend(self):
  e={**env(),'CT_MODE':'rollback','CT_CONFIRMATION':'ROLLBACK_FABRICA_PNG_ONLY','CT_EXPECTED_DEPLOYMENT':'999','CT_BACKEND_DETACHED':'false'}
  with self.assertRaisesRegex(ValueError,'backend'):g.identity(e)
 def test_complete_publish_prepare_and_recheck_synthetic(self):
  png,tar,z=synthetic()
  from contextlib import ExitStack,redirect_stdout
  with tempfile.TemporaryDirectory() as d,ExitStack() as stack:
   for module in (a,g):
    for name,value in [('PNG_SHA',a.sha(png)),('TAR_SHA',a.sha(tar)),('ZIP_SHA',a.sha(z))]:stack.enter_context(patch.object(module,name,value))
   candidate,proof=a.prepare(z,png);self.assertTrue(proof['backendNotModified']);self.assertTrue(proof['salesNotAssessed']);self.assertNotIn('backendLinked',proof);self.assertNotIn('salesReady',proof);stack.enter_context(patch.object(g,'CANDIDATE_TAR',a.sha(candidate)))
   package=pathlib.Path(d)/'package';package.mkdir();(package/'approved-fabrica.png').write_bytes(png)
   api=Fake();old=api.get
   def get(p):
    if p=='/actions/artifacts/'+str(g.BASE_ARTIFACT):return {'name':'github-pages','expired':False,'digest':'sha256:'+g.ZIP_SHA,'workflow_run':{'id':g.BASE_RUN}}
    return old(p)
   api.get=get;api.archive=lambda id:z;out=pathlib.Path(d)/'stage'
   with redirect_stdout(io.StringIO()):g.run('prepare',package,out,env(),api);g.run('recheck',package,out,env(),api)
   self.assertEqual((out/'artifact.tar').read_bytes(),candidate)
   self.assertEqual((out/'rollback.tar').read_bytes(),tar)
   before=a.inventory(tar);after=a.inventory(candidate)
   self.assertEqual(set(after),set(before)|{a.ASSET})
   for k in before:self.assertEqual(before[k],after[k])
   self.assertEqual(after[a.ASSET][1],png)
 def test_bad_png_public_mime_fails(self):
  with patch.object(g,'sha',return_value=g.TAR_SHA),patch.object(g,'inventory',return_value={p:({},b'old') for p in g.CRITICAL}):
   with self.assertRaisesRegex(ValueError,'PNG HTTP'):g.verify_static(b'baseline','publish',lambda p:(200,'text/html',b'x'*2060262) if p==g.ASSET else (200,'text/html',b'old'))
 def test_tar_unsafe_paths_types_duplicate(self):
  for name,kind in [('../outside',tarfile.REGTYPE),('/absolute',tarfile.REGTYPE),('symlink',tarfile.SYMTYPE)]:
   b=io.BytesIO()
   with tarfile.open(fileobj=b,mode='w') as t:m=tarfile.TarInfo(name);m.type=kind;t.addfile(m)
   with self.assertRaises(ValueError):a.inventory(b.getvalue())
class PostVerificationTests(unittest.TestCase):
 def test_strict_run_log(self):
  self.assertEqual(g.run_id_from_log('https://github.com/'+g.REPO+'/actions/runs/123/job/9'),123)
  for url in ['https://evil.test/actions/runs/123/job/9','https://github.com/other/repo/actions/runs/123/job/9','https://github.com/'+g.REPO+'/actions/runs/123/job/9?redirect=evil']:
   with self.assertRaises(ValueError):g.run_id_from_log(url)
 def test_successful_postverify_uses_current_own_success_and_exact_bytes(self):
  class API:
   def get(self,p):
    if p.startswith('/deployments?'):return [{'id':999,'sha':'a'*40}]
    return [{'state':'success','environment_url':g.ORIGIN,'log_url':'https://github.com/'+g.REPO+'/actions/runs/123/job/9'}]
  with tempfile.TemporaryDirectory() as d,patch.object(g,'verify_static') as verify:
   (pathlib.Path(d)/'rollback.tar').write_bytes(b'baseline')
   g.postverify(d,env(),API(),lambda p:None);verify.assert_called_once()
 def test_foreign_postverify_rejected_before_http(self):
  class API:
   def get(self,p):
    if p.startswith('/deployments?'):return [{'id':999,'sha':'a'*40}]
    return [{'state':'success','environment_url':g.ORIGIN,'log_url':'https://github.com/'+g.REPO+'/actions/runs/777/job/9'}]
  with tempfile.TemporaryDirectory() as d,patch.object(g,'verify_static') as verify:
   with self.assertRaises(ValueError):g.postverify(d,env(),API())
   verify.assert_not_called()
if __name__=='__main__':unittest.main()
