"""Pure archive checks: no I/O outside supplied bytes and pinned payload files."""
from hashlib import sha256
import io
from pathlib import Path
import tarfile, zipfile

BASE_TAR='78e8eb4e2855a9dc475542e698a36f9c17334938cf502c5384a33f4420dc33a1'
BASE_ZIP='002354f9cc48a9ced7cef7fc4ad8012fd0d0837d9b04d773171c7b28d7284d20'
BASE_ZIP_SIZE=64317578
CANDIDATE='14e3bd4150d4bc14aa31a198d372d52e4b0e64b93c0989d72d7324364f763b63'
BASE_SIZE=64317440
TAR_SIZE=64317440
PATCHES={
 './index.html':('index.html','634a2cd51703023c1878e91b85552aaec81b89b1f3cd7651b88774310e0b5733','fc6e03133d49d460024649a6fa1c1c5012e156b2e5e7e189f9cbf4bb528b30c2'),
 './assets/producer-welcome.js':('assets/producer-welcome.js','825098892f7a382e7aa577952497bc890542aefa856f87f3c7c2eadc500a2fa0','90b01b8823786ba0445535228f14cddf04bae4e6b318f954b9f15a9feb5d2c67'),
}
PNG='./assets/eventos/fabrica-de-samba-20261129-7089258579f37d13.png'
PROTECTED={
 './assets/public-privacy.css':'c32df48cce993fa674b7176be3e4230dfe49172f13adb1e0e5c3d4788db3a4db',
 './assets/public-privacy.js':'9b217b1ddcc6e93d8b143c9db1d57677b6cc7bbdfb482c6fb76bb22c5fece6ac',
 './assets/public-event-catalog.js':'8d881ed2b8a1c6fbef318521da834dee2fbc0f5809945573f8d79fb69aea3869',
 './assets/home-i18n.js':'43763d196d5039819e2ade47b4e32dde43988cca91644d16441af54390b15109',
 './checkout/index.html':'e3543e71ff75ba7ecacf3406c826740972930395e80fdefa944f4ef7e052ec34',
 './checkout-v2/index.html':'1a69e77332d6c0fc3652dd33f6672080e7f0752bd50f3a5f1e338c4abb22c42a',
 './evento/index.html':'e67655296a2085b967f5f0258e3618aedaa4ec824b6c91797970b30e002e9dc9',
 './assets/public-catalog-clock.js':'a0a4e1d6be8ee81b9440023a98f94766a4d684874040ce52cf7a04e839f1f49c',
 './ajuda/index.html':'512d3ac851b4647ca31b69e582ff1614456cbb54e8d51f44ef68eeab76f9c11b',
 PNG:'7089258579f37d13baaf82d909a65cee5ed361459656590446a9c40bc3cdde2f',
}
def sha(b):return sha256(b).hexdigest()
def check(ok,what):
    if not ok:raise ValueError(what)
def unzip(blob):
    check(len(blob)==BASE_ZIP_SIZE and sha(blob)==BASE_ZIP,'artifact ZIP digest')
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        check(z.namelist()==['artifact.tar'] and z.getinfo('artifact.tar').file_size==BASE_SIZE,'ZIP members/size')
        b=z.read('artifact.tar')
    check(len(b)==BASE_SIZE and sha(b)==BASE_TAR,'artifact TAR digest')
    return b
def inventory(raw):
    with tarfile.open(fileobj=io.BytesIO(raw),mode='r:') as f:
        entries=f.getmembers();end=f.offset
    check(len(entries)==644 and len({m.name.removeprefix('./') for m in entries})==644,'TAR inventory')
    check(all((m.isfile() or m.isdir()) and (m.name.startswith('./') or m.name=='.') and
              '..' not in m.name.split('/') for m in entries),'TAR member')
    check(len(raw)-end>=1024 and not any(raw[end:]),'TAR trailer')
    return {m.name:(m,raw[m.offset:n]) for m,n in zip(entries,[m.offset for m in entries[1:]]+[end])}
def payload(m,record):
    start=m.offset_data-m.offset
    return record[start:start+m.size]
def get(entries,k):return payload(*entries[k])
def verify(raw,expected):
    check(sha(raw)==expected,'sealed TAR digest');e=inventory(raw)
    for path,pin in PROTECTED.items():check(sha(get(e,path))==pin,'protected member '+path)
    for path,(_,old,new) in PATCHES.items():check(sha(get(e,path))==(old if expected==BASE_TAR else new),'overlay member '+path)
    return e
def compose(base,folder=Path(__file__).resolve().parent):
    before=verify(base,BASE_TAR);chunks=[]
    for path,(m,old) in before.items():
        if path not in PATCHES:chunks.append(old);continue
        name,_,new=PATCHES[path]; f=folder/name
        check(f.is_file() and not f.is_symlink() and f.stat().st_size<=100000,'replacement file')
        b=f.read_bytes();check(sha(b)==new,'replacement file digest')
        check(m.isfile() and not m.pax_headers and m.offset_data-m.offset==512,'replacement layout')
        head=bytearray(old[:512]);head[124:136]=f'{len(b):011o}'.encode()+b'\0'
        head[148:156]=b' '*8;head[148:156]=f'{sum(head):06o}'.encode()+b'\0 '
        chunks.append(bytes(head)+b+b'\0'*((-len(b))%512))
    body=b''.join(chunks)
    candidate=body+b'\0'*(1024+((-len(body)-1024)%10240))
    after=verify(candidate,CANDIDATE)
    check(list(before)==list(after),'TAR order')
    check([name for name in before if before[name][1]!=after[name][1]]==list(PATCHES) or
          {name for name in before if before[name][1]!=after[name][1]}==set(PATCHES),'unchanged raw TAR members')
    return candidate
