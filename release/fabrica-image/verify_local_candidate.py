"""Explicit offline proof; inputs supplied by operator, never downloaded/uploaded."""
import json,pathlib,sys
from artifact_guard import prepare,inventory,sha,ASSET
from release_guard import CANDIDATE_TAR
if __name__=='__main__':
 baseline,png=map(pathlib.Path,sys.argv[1:])
 candidate,seal=prepare(baseline.read_bytes(),png.read_bytes())
 assert sha(candidate)==CANDIDATE_TAR
 assert seal['unchangedEntries']==642 and seal['addedEntries']==1
 print(json.dumps({'offlineOnly':True,'unchangedEntries':642,'addedPath':ASSET,'candidateTarSha256':sha(candidate),'sourcePngSha256':sha(png.read_bytes()),'sourcePngBytes':png.stat().st_size,'backendNotModified':True,'salesNotAssessed':True,'deploymentAuthorized':False},indent=2))
