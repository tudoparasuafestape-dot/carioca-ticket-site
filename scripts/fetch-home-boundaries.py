"""Build-time only: retrieve public IBGE v4 topology. Never sends user locations.
Review IBGE release notes before running: v4 has no documented year parameter.
This checked-in snapshot is revision 2025, announced 2026-04-27, fetched 2026-10-09.
"""
import concurrent.futures, gzip, hashlib, json, pathlib, time, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
DEST=ROOT/'assets/geo-ibge-2025'
STATES='AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split()
BASE='https://servicodados.ibge.gov.br/api/v4/malhas/'
rows=json.loads((ROOT/'assets/home-municipalities.json').read_text())
known={r[0]:r for r in rows}
def download(state):
 path='paises/BR' if state=='UF' else 'estados/'+state
 url=BASE+path+'?formato=application/json&intrarregiao='+('UF' if state=='UF' else 'municipio')+'&qualidade=maxima'
 target=DEST/(state+'.json')
 for attempt in range(3):
  try:
   raw=urllib.request.urlopen(url,timeout=60).read()
   if raw[:2]==b'\x1f\x8b':raw=gzip.decompress(raw)
   data=json.loads(raw)
   assert data['type']=='Topology'
   features=[g for v in data['objects'].values() for g in v['geometries']]
   ids=[g['properties']['codarea'] for g in features]
   assert len(ids)==len(set(ids))
   if state!='UF':
    wanted={r[0] for r in rows if r[1]==state}
    # Non-municipal water areas may be present; the client only accepts official list IDs.
    assert not wanted-set(ids), (state,sorted(wanted-set(ids)))
   target.write_bytes(raw)
   result={'url':url,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'gzipBytes':len(gzip.compress(raw)),'geometries':len(ids),'unlistedIds':sorted(set(ids)-set(known)) if state!='UF' else []}
   print(state,result['bytes'],result['gzipBytes'],flush=True)
   return state,result
  except Exception:
   if attempt==2:raise
   time.sleep(2+attempt)
DEST.mkdir(exist_ok=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: files=dict(pool.map(download,['UF']+STATES))
manifest={'source':'IBGE - API de Malhas Geográficas v4','referenceYear':2025,'releaseDate':'2026-04-27','retrievedDate':'2026-10-09','documentation':'https://servicodados.ibge.gov.br/api/docs/malhas?versao=4','quality':'maxima (simplified, not cadastral)','format':'TopoJSON','officialListCount':len(rows),'files':files}
(DEST/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('TOTAL',sum(x['bytes'] for x in files.values()),'GZIP',sum(x['gzipBytes'] for x in files.values()),flush=True)
