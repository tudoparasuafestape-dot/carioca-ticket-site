from artifact_guard import prepare as cover_prepare
from pathlib import Path
from hashlib import sha256
import io,json,tarfile,zipfile
CHECKOUT='./checkout/index.html'
PNG='./assets/eventos/fabrica-de-samba-20261129-7089258579f37d13.png'
Z='07c90dc72a12df7013239d69eb9141fb2acc3860c1d4a5973183edfe8725f66f'
B='d42bc4c6e8c45e36960f959a11fb461129932f0f39dee67fec0cd2c2ba5178e5'
CP='4f7e2e783ba37aea8caf57e4e6e7c8f711e752a78d4222b6d37b7672adc0f97d'
PS='7089258579f37d13baaf82d909a65cee5ed361459656590446a9c40bc3cdde2f'
H0='fff11422c78ff7054d13edfe82043f73ef0708247bc653911ee22cdde67a7696'
H1='e3543e71ff75ba7ecacf3406c826740972930395e80fdefa944f4ef7e052ec34'
def sha(b): return sha256(b).hexdigest()
def require(ok, detail):
    if not ok: raise ValueError(detail)
def inventory(b):
    with tarfile.open(fileobj=io.BytesIO(b),mode='r:') as f:
        ms=f.getmembers(); end=f.offset
    require(len({m.name.removeprefix('./') for m in ms})==len(ms),'duplicate')
    require(all((m.isfile() or m.isdir()) and not m.name.startswith('/') and
                '..' not in m.name.split('/') for m in ms),'invalid member')
    require(len(b)-end>=1024 and not any(b[end:]),'nonzero trailer')
    return {m.name:(m,b[m.offset:n]) for m,n in zip(ms,[m.offset for m in ms[1:]]+[end])},end
def write_exact(path,b):
    if path.exists(): require(path.read_bytes()==b,str(path)+' differs')
    else:
        with path.open('xb') as f: f.write(b)
CANDIDATE="232d80d15e607c22086958560ee2fb3c38ff43715b15acc578060b942d2edfee"
def build(z,approved):
    require(sha(z)==Z,'baseline ZIP hash')
    cover,_=cover_prepare(z,approved)
    with zipfile.ZipFile(io.BytesIO(z)) as f:
        require(f.namelist()==['artifact.tar'],'zip inventory'); raw=f.read('artifact.tar')
    require(sha(raw)==B,'baseline TAR hash')
    require(sha(cover)==CP,'cover-only TAR hash')
    old,end=inventory(raw); cover_members,_=inventory(cover)
    require(len(old)==642 and list(cover_members)==list(old)+[PNG],'cover inventory')
    m,png_entry=cover_members[PNG]
    require(sha(approved)==PS and len(approved)==2060262 and m.isfile() and
            cover[m.offset_data:m.offset_data+m.size]==approved,'approved PNG bytes')
    m,entry=old[CHECKOUT]
    require(m.isfile() and not m.pax_headers and m.offset_data-m.offset==512,'checkout header layout')
    original=entry[512:512+m.size]
    anchor=b"'EVT-29112026-ANIVERSARIO-TONY-BURGUER-6-ANOS-4F761E02'\n            ].indexOf(state.eventId)>=0;"
    delta=b",\n              'EVT-29112026-FABRICA-DE-SAMBA-CE2EF10E'"
    require(sha(original)==H0 and original.count(anchor)==1 and len(delta)==56,'exact checkout sources')
    expected=original.replace(anchor,anchor.replace(b"'\n",b"'"+delta+b"\n",1),1)
    require(sha(expected)==H1,'checkout must have only Fábrica delta')
    header=bytearray(entry[:512]);header[124:136]=f'{len(expected):011o}'.encode()+b'\0'
    header[148:156]=b' '*8;header[148:156]=f'{sum(header):06o}'.encode()+b'\0 '
    changed=bytes(header)+expected+b'\0'*((-len(expected))%512)
    body=raw[:m.offset]+changed+raw[m.offset+len(entry):end]+png_entry
    output=body+b'\0'*(1024+((-len(body)-1024)%10240))
    out,_=inventory(output)
    require(list(out)==list(old)+[PNG],'output inventory')
    require([n for n in old if old[n][1]!=out[n][1]]==[CHECKOUT],'unrelated raw record drift')
    require(out[PNG][1]==png_entry,'PNG record drift')
    h1,h2=entry[:512],out[CHECKOUT][1][:512]
    require(h1[:124]+h1[136:148]+h1[156:]==h2[:124]+h2[136:148]+h2[156:],'checkout metadata drift')
    require(out[CHECKOUT][0].size==len(expected) and out[CHECKOUT][1][512:512+len(expected)]==expected,'checkout readback')
    require(sha(output)==CANDIDATE,'candidate TAR drift')
    return raw,output
