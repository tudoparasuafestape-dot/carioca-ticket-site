"""Agenda-only offline overlay: no network, no execution of artifact code."""
import hashlib,io,json,pathlib,tarfile,zipfile,copy
ZIP_SHA='07c90dc72a12df7013239d69eb9141fb2acc3860c1d4a5973183edfe8725f66f'
TAR_SHA='d42bc4c6e8c45e36960f959a11fb461129932f0f39dee67fec0cd2c2ba5178e5'
OLD='b2a15ee332c1881971fec1cd7f447dec46e1784b0596f638a66c1b6ed9815161'
NEW='a8eadd2696438206f155dc4e2f35ce5b567040964b6e44dfc99365e987d61a8e'
TARGET='assets/public-event-catalog.js'
def sha(b):return hashlib.sha256(b).hexdigest()
def require(x,msg):
 if not x:raise ValueError(msg)
def members(raw):
 t=tarfile.open(fileobj=io.BytesIO(raw));seen=set();out=[]
 for m in t.getmembers():
  p=m.name.removeprefix('./').rstrip('/')
  if p in ('','.') and m.isdir():continue
  require(not p.startswith('/') and all(x not in ('','..','.') for x in p.split('/')),'unsafe path')
  require(p not in seen,'duplicate path');seen.add(p)
  require(m.isfile() or m.isdir(),'special entry');require(not(m.mode&0o6000),'unsafe mode')
  out.append((m,p,t.extractfile(m).read() if m.isfile() else None))
 return out
def metadata(m):
 return (m.name,m.mode,m.uid,m.gid,m.uname,m.gname,m.mtime,m.type,m.linkname,m.pax_headers)
def prepare(zbytes):
 require(sha(zbytes)==ZIP_SHA,'ZIP mismatch');z=zipfile.ZipFile(io.BytesIO(zbytes));require(z.namelist()==['artifact.tar'],'ZIP inventory')
 raw=z.read('artifact.tar');require(sha(raw)==TAR_SHA,'TAR mismatch');orig=members(raw)
 files={p:b for _,p,b in orig if b is not None};require(len(files)==546 and sha(files.get(TARGET,b''))==OLD,'baseline inventory')
 old=files[TARGET];candidate=old
 for before,after in [(b'}, 20000);',b'}, 32000);'),(b'}, 18000);',b'}, 30000);')]:
  require(candidate.count(before)==1,'timeout count');candidate=candidate.replace(before,after)
 require(len(candidate)==len(old) and sha(candidate)==NEW,'candidate mismatch')
 buf=io.BytesIO()
 with tarfile.open(fileobj=buf,mode='w',format=tarfile.PAX_FORMAT) as tar:
  for m,p,b in orig:
   m=copy.deepcopy(m)
   if p==TARGET:b=candidate;m.size=len(b)
   tar.addfile(m,io.BytesIO(b) if b is not None else None)
 result=buf.getvalue();new=members(result)
 require(len(orig)==len(new),'inventory length')
 changes=[]
 for (a,p,b),(c,q,d) in zip(orig,new):
  require(p==q and metadata(a)==metadata(c),'metadata or inventory changed')
  if b!=d:changes.append(p)
 require(changes==[TARGET],'scope')
 return result,raw,{'baselineRunId':43425385424,'baselineArtifactId':14037465102,'baselineZipSha256':ZIP_SHA,'baselineTarSha256':TAR_SHA,'candidateTarSha256':sha(result),'fileCount':546,'changed':changes,'oldSha256':OLD,'newSha256':NEW}
if __name__=='__main__':
 import sys
 src,out=map(pathlib.Path,sys.argv[1:]);require(not out.exists(),'output exists');candidate,raw,seal=prepare(src.read_bytes());out.mkdir();(out/'artifact.tar').write_bytes(candidate);(out/'rollback.tar').write_bytes(raw);(out/'seal.json').write_text(json.dumps(seal,indent=2))
