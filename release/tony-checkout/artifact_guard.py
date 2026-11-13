"""Offline reviewed-artifact overlay. No network or deployment. Refuses all other changes."""
import hashlib,io,json,pathlib,tarfile,sys,zipfile
ZIP_SHA='bae1541fb86b3089f78d1fa61dfed4e616e938bd8ac2e8fc9187b3aa22d72b97'
TAR_SHA='7272e1fb65238fb3c9f19863fd2d25dd8506ade348d69fe9d26341c9f0f63eb1'
OLD='fd97b14f21476e91f83f04e7cbf4535414d0c27ed81246deeab63e6b843b3412'
NEW='fff11422c78ff7054d13edfe82043f73ef0708247bc653911ee22cdde67a7696'
TARGET='checkout/index.html'
def sha(b): return hashlib.sha256(b).hexdigest()
def require(ok,msg):
 if not ok: raise ValueError(msg)
def members(raw):
 t=tarfile.open(fileobj=io.BytesIO(raw));seen=set();out=[]
 for m in t.getmembers():
  p=m.name.removeprefix('./').rstrip('/')
  if p in ('','.') and m.isdir(): continue
  require(not p.startswith('/') and all(x not in ('','..','.') for x in p.split('/')),'unsafe path')
  require(p not in seen,'duplicate path');seen.add(p)
  require(m.isfile() or m.isdir(),'links/special entries forbidden')
  require(not (m.mode & 0o6000),'setuid/setgid forbidden')
  out.append((m,p,t.extractfile(m).read() if m.isfile() else None))
 return out
def prepare(zipbytes,candidate):
 require(sha(zipbytes)==ZIP_SHA,'baseline ZIP changed')
 z=zipfile.ZipFile(io.BytesIO(zipbytes));require(z.namelist()==['artifact.tar'],'ZIP inventory changed')
 raw=z.read('artifact.tar');require(sha(raw)==TAR_SHA,'baseline TAR changed')
 require(sha(candidate)==NEW,'candidate checkout changed')
 original=members(raw);old={p:sha(b) for m,p,b in original if b is not None}
 require(len(old)==546 and old.get(TARGET)==OLD,'baseline inventory/checkout mismatch')
 buf=io.BytesIO()
 with tarfile.open(fileobj=buf,mode='w',format=tarfile.PAX_FORMAT) as out:
  for m,p,b in original:
   if p==TARGET: b=candidate;m.size=len(b)
   out.addfile(m,io.BytesIO(b) if b is not None else None)
 result=buf.getvalue();new={p:sha(b) for m,p,b in members(result) if b is not None}
 require(old.keys()==new.keys(),'file addition/deletion')
 require([p for p in old if old[p]!=new[p]]==[TARGET],'unexpected changed files')
 return result,{'baselineRunId':42628636941,'baselineDeploymentId':7656353597,'baselineArtifactId':13679502447,'baselineZipSha256':ZIP_SHA,'rollbackTarSha256':TAR_SHA,'candidateCommit':'b4e817610dc90af77b631db44404cb90d166ba70','candidateTree':'b79fc7d53405703399f74700b2fe26175f2297ce','candidateTarSha256':sha(result),'fileCount':len(new),'changed':[TARGET],'oldCheckoutSha256':OLD,'newCheckoutSha256':NEW}
if __name__=='__main__':
 z,c,d=map(pathlib.Path,sys.argv[1:]);require(not d.exists(),'output must not exist');result,seal=prepare(z.read_bytes(),c.read_bytes());d.mkdir(mode=0o700);(d/'artifact.tar').write_bytes(result);(d/'seal.json').write_text(json.dumps(seal,indent=2))
