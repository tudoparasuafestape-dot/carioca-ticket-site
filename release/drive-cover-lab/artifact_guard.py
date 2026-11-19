"""Offline single-HTML overlay. Never deploys, replaces or edits existing members."""
import hashlib, io, json, pathlib, tarfile, zipfile

ZIP_SHA = '07c90dc72a12df7013239d69eb9141fb2acc3860c1d4a5973183edfe8725f66f'
TAR_SHA = 'd42bc4c6e8c45e36960f959a11fb461129932f0f39dee67fec0cd2c2ba5178e5'
HTML_SHA = 'd9eca449faa9c0f4c8d3086b73fcb1befdb6d4121c9b99644f4386c23347eebd'
ASSET = 'review/drive-cover-lab/index.html'
MAX = 256 * 1024 * 1024

def sha(b): return hashlib.sha256(b).hexdigest()
def require(ok, message):
    if not ok: raise ValueError(message)

def inventory(raw):
    require(len(raw) <= MAX, 'oversized tar')
    entries = {}
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:') as tar:
        members = tar.getmembers()
        require(len(members) <= 10000, 'too many entries')
        total = 0
        for m in members:
            name = m.name[2:] if m.name.startswith('./') else m.name
            if name == '.': name = ''
            require(not name.startswith('/') and '\\' not in name and all(x not in ('', '.', '..') for x in name.split('/')) if name else m.isdir(), 'unsafe path')
            require(name not in entries and (m.isfile() or m.isdir()), 'duplicate or nonregular entry')
            total += m.size
            require(0 <= m.size <= MAX and total <= MAX, 'oversized content')
            content = tar.extractfile(m).read() if m.isfile() else b''
            entries[name] = (m.get_info(), content)
    return entries

def prepare(zip_bytes, html):
    require(sha(zip_bytes) == ZIP_SHA, 'baseline ZIP mismatch')
    require(sha(html) == HTML_SHA, 'reviewed HTML mismatch')
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        require(z.namelist() == ['artifact.tar'], 'ZIP inventory mismatch')
        require(z.getinfo('artifact.tar').file_size <= MAX, 'expanded archive too large')
        baseline=z.read('artifact.tar')
    require(sha(baseline)==TAR_SHA,'baseline TAR mismatch')
    before=inventory(baseline)
    require(ASSET not in before,'target already exists')
    stream=io.BytesIO(baseline)
    with tarfile.open(fileobj=stream,mode='a',format=tarfile.PAX_FORMAT) as tar:
        entry=tarfile.TarInfo('./'+ASSET);entry.size=len(html);entry.mode=0o644;entry.mtime=0
        tar.addfile(entry,io.BytesIO(html))
    candidate=stream.getvalue();after=inventory(candidate)
    require(set(after)==set(before)|{ASSET},'inventory delta mismatch')
    require(all(after[k]==v for k,v in before.items()),'existing member modified')
    require(after[ASSET][1]==html,'HTML bytes mismatch')
    return candidate,{'status':'OFFLINE_NOT_AUTHORIZED','baselineArtifact':14037465102,'baselineRun':43425385424,'baselineZipSha256':ZIP_SHA,'baselineTarSha256':TAR_SHA,'candidateTarSha256':sha(candidate),'addedPath':ASSET,'htmlSha256':HTML_SHA,'unchangedEntries':len(before),'addedEntries':1,'imageUploaded':False,'databaseTouched':False,'sharingChanged':False,'deploymentAuthorized':False,'currentDeploymentRecheckRequired':True}
if __name__=='__main__':
    import sys
    z,h,o=map(pathlib.Path,sys.argv[1:]);candidate,evidence=prepare(z.read_bytes(),h.read_bytes())
    with o.open('xb') as f:f.write(candidate)
    with o.with_suffix('.json').open('x') as f:json.dump(evidence,f,indent=2)
    print(json.dumps(evidence))
