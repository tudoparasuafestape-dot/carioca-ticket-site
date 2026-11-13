"""Independent rollback review tests; synthetic archives, no network."""
import io,json,pathlib,tempfile,unittest,zipfile
from unittest.mock import patch
import release_guard as g
from test_release_guard import MockApi,ENV

def zipbytes(files):
 b=io.BytesIO()
 with zipfile.ZipFile(b,'w') as z:
  for n,v in files.items():z.writestr(n,v)
 return b.getvalue()
ROLLBACK_ENV=dict(ENV,CT_MODE='rollback',CT_CONFIRMATION='ROLLBACK_TONY_CHECKOUT_ONLY',CT_EXPECTED_DEPLOYMENT='888')
class RollbackReview(unittest.TestCase):
 def test_prior_publisher_sha_may_differ_from_current_reviewed_guard(self):
  api=MockApi();api.data['/deployments?environment=github-pages&per_page=100']=[{'id':888,'sha':'b'*40}]
  api.data['/deployments/888/statuses?per_page=100']=[{'state':'success','log_url':'https://github.com/'+g.REPO+'/actions/runs/999/job/1'}]
  api.data['/actions/runs/999']={'status':'completed','conclusion':'success','event':'workflow_dispatch','path':g.WORKFLOW,'head_sha':'b'*40}
  api.data['/actions/runs/999/artifacts?name=github-pages&per_page=100']={'artifacts':[{'id':111,'expired':False}]}
  api.archive=lambda _:zipbytes({'artifact.tar':b'candidate'})
  with patch.object(g,'CANDIDATE_TAR',g.sha(b'candidate')):self.assertEqual(g.current_state(api,ROLLBACK_ENV)['runId'],999)
 def prepare_rollback(self,tamper=False):
  api=MockApi();api.data['/actions/runs/999/artifacts?name=checkout-rollback-and-seal&per_page=100']={'artifacts':[{'id':111,'expired':False}]}
  # BASE_ARTIFACT absent: attempting to fetch it would fail this test.
  api.archive=lambda _:zipbytes({'rollback.tar':b'tampered' if tamper else b'original','seal.json':json.dumps({'artifactSha256':g.CANDIDATE_TAR,'state':{'mode':'publish'}}).encode()})
  with tempfile.TemporaryDirectory() as root:
   out=pathlib.Path(root)/'out'
   with patch.object(g.subprocess,'check_output',side_effect=[g.CANDIDATE+'\n',g.TREE+'\n',g.CANDIDATE+'\n']),patch.object(g,'current_state',return_value={'mode':'rollback','runId':999}),patch.object(g,'ci'),patch.object(g,'TAR_SHA',g.sha(b'original')):
    g.run('prepare',root,str(out),ROLLBACK_ENV,api)
   self.assertEqual((out/'artifact.tar').read_bytes(),b'original')
 def test_rollback_uses_retained_artifact_not_expired_baseline(self):self.prepare_rollback()
 def test_tampered_retained_rollback_rejected(self):
  with self.assertRaisesRegex(ValueError,'retained rollback bytes mismatch'):self.prepare_rollback(tamper=True)
if __name__=='__main__':unittest.main()
