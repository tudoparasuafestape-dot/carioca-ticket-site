"""Offline orchestration tests. Synthetic bytes replace digest pins only in test context."""
import contextlib, io, json, pathlib, tempfile, unittest, urllib.error, zipfile
from unittest.mock import patch
import release_guard as g
from test_release_guard import env

def zipped(entries):
 b=io.BytesIO()
 with zipfile.ZipFile(b,'w') as z:
  for name,data in entries.items():z.writestr(name,data)
 return b.getvalue()

class RollbackApi:
 def __init__(self):
  self.expired_current=False;self.expired_backup=False;self.corrupt_current=False;self.corrupt_backup=False;self.bad_seal=False;self.conclusion='failure';self.calls=[]
 def get(self,p):
  self.calls.append(p)
  if p=='/pages':return {'build_type':'workflow'}
  if p=='/git/ref/heads/main':return {'object':{'sha':'a'*40}}
  if p.startswith('/deployments?'):return [{'id':999,'sha':'b'*40}]
  if p.startswith('/deployments/999/statuses?'):return [{'state':'success','environment_url':g.ORIGIN,'log_url':'https://github.com/'+g.REPO+'/actions/runs/456/job/1'}]
  if p=='/actions/runs/456':return {'status':'completed','event':'workflow_dispatch','conclusion':self.conclusion,'head_sha':'b'*40,'path':g.WORKFLOW}
  if p=='/actions/runs/456/artifacts?name=github-pages&per_page=100':return {'artifacts':[{'id':1,'expired':self.expired_current}]}
  if p=='/actions/runs/456/artifacts?name=fabrica-image-rollback-and-seal&per_page=100':return {'artifacts':[{'id':2,'expired':self.expired_backup}]}
  raise AssertionError(p)
 def archive(self,id):
  if id==1:return zipped({'artifact.tar':b'bad' if self.corrupt_current else b'candidate'})
  if id==2:return zipped({'rollback.tar':b'bad' if self.corrupt_backup else b'baseline','seal.json':json.dumps({'artifactSha256':'bad' if self.bad_seal else g.CANDIDATE_TAR,'state':{'mode':'publish'}}).encode()})
  raise AssertionError(id)

class RollbackTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.out=pathlib.Path(self.tmp.name)/'stage'
  self.e={**env(),'CT_MODE':'rollback','CT_CONFIRMATION':'ROLLBACK_FABRICA_PNG_ONLY','CT_EXPECTED_DEPLOYMENT':'999'}
  self.stack=contextlib.ExitStack();self.addCleanup(self.stack.close)
  self.stack.enter_context(patch.object(g,'TAR_SHA',g.sha(b'baseline')))
  self.stack.enter_context(patch.object(g,'CANDIDATE_TAR',g.sha(b'candidate')))
  self.stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
 def run_guard(self,command,api):g.run(command,self.tmp.name,self.out,self.e,api)
 def test_complete_prepare_and_recheck(self):
  api=RollbackApi();self.run_guard('prepare',api)
  self.assertEqual((self.out/'artifact.tar').read_bytes(),b'baseline')
  self.assertEqual((self.out/'rollback.tar').read_bytes(),b'baseline')
  self.assertEqual(json.loads((self.out/'seal.json').read_text())['expected']['reversesRunId'],456)
  self.run_guard('recheck',api)
 def test_expired_artifacts_fail_before_local_stage(self):
  for flag in ('expired_current','expired_backup'):
   with self.subTest(flag=flag):
    api=RollbackApi();setattr(api,flag,True)
    with self.assertRaises(ValueError):self.run_guard('prepare',api)
    self.assertFalse(self.out.exists())
 def test_corrupt_archives_or_seal_fail(self):
  for flag in ('corrupt_current','corrupt_backup','bad_seal'):
   with self.subTest(flag=flag):
    api=RollbackApi();setattr(api,flag,True)
    with self.assertRaises(ValueError):self.run_guard('prepare',api)
    self.assertFalse(self.out.exists())
 def test_canceled_previous_run_not_accepted(self):
  api=RollbackApi();api.conclusion='cancelled'
  with self.assertRaises(ValueError):self.run_guard('prepare',api)
 def test_recheck_detects_local_tampering(self):
  api=RollbackApi();self.run_guard('prepare',api);(self.out/'artifact.tar').write_bytes(b'bad')
  with self.assertRaises(ValueError):self.run_guard('recheck',api)
 def test_repeat_prepare_never_overwrites(self):
  api=RollbackApi();self.run_guard('prepare',api)
  with self.assertRaises(ValueError):self.run_guard('prepare',api)
  self.assertEqual((self.out/'artifact.tar').read_bytes(),b'baseline')
 def test_retained_expiry_after_prepare_blocks_recheck(self):
  # Current Pages artifact is revalidated too, not merely the local seal.
  api=RollbackApi();self.run_guard('prepare',api);api.expired_current=True
  with self.assertRaises(ValueError):self.run_guard('recheck',api)

class DownloadTests(unittest.TestCase):
 def test_disallowed_redirect_variants(self):
  for url in ('http://safe.blob.core.windows.net/x','https://safe.blob.core.windows.net.evil.test/x','https://user:password@safe.blob.core.windows.net/x','file:///tmp/x','https://github.com/x'):
   with self.subTest(url=url):
    api=g.Api('secret');error=urllib.error.HTTPError('api',302,'redirect',{'Location':url},None)
    with patch.object(api,'raw',side_effect=error),self.assertRaises(ValueError):api.archive(1)
 def test_size_bound(self):
  class Response(io.BytesIO):status=200
  api=g.Api('secret')
  with patch.object(api,'raw',return_value=Response(b'12345')),patch.object(g,'MAX',4),self.assertRaises(ValueError):api.archive(1)
 def test_second_redirect_never_followed(self):
  self.assertIsNone(g.NoRedirect().redirect_request(None,None,302,'',{},'https://other.test/'))
 def test_non302_api_error_fails_closed(self):
  api=g.Api('secret');error=urllib.error.HTTPError('api',403,'forbidden',{},None)
  with patch.object(api,'raw',side_effect=error),self.assertRaises(ValueError):api.archive(1)
 def test_missing_api_token(self):
  with self.assertRaises(ValueError):g.Api('')

class WorkflowTests(unittest.TestCase):
 def test_proposed_workflow_contract(self):
  s=pathlib.Path(__file__).with_name('workflow.yml.proposed').read_text()
  self.assertIn('group: ct-pages-production',s)
  self.assertIn('cancel-in-progress: false',s)
  self.assertIn('github.run_attempt == 1',s)
  self.assertNotIn('workflow_run:',s);self.assertNotIn('schedule:',s);self.assertNotIn('push:',s)
  self.assertLess(s.index('Final live baseline gate'),s.index('id: deploy'))
  self.assertLess(s.index('Preserve rollback'),s.index('Upload only reviewed Pages TAR'))
  for line in s.splitlines():
   if 'uses: actions/' in line:
    import re
    self.assertRegex(line,r'@[a-f0-9]{40}$')
if __name__=='__main__':unittest.main()
