/* IBGE revision 2025, local-only lookup. No coordinates leave this worker.
 * Minimal TopoJSON Polygon/MultiPolygon decoder, no map library. */
(function (scope) {
  'use strict';
  var STATE_CODES = {11:'RO',12:'AC',13:'AM',14:'RR',15:'PA',16:'AP',17:'TO',21:'MA',22:'PI',23:'CE',24:'RN',25:'PB',26:'PE',27:'AL',28:'SE',29:'BA',31:'MG',32:'ES',33:'RJ',35:'SP',41:'PR',42:'SC',43:'RS',50:'MS',51:'MT',52:'GO',53:'DF'};
  // Conservative UX margin for simplified geometry, not a surveyed error bound.
  var MARGIN = 500, MAX_ACCURACY = 5000;
  function decode(topology) {
    if (!topology || topology.type !== 'Topology' || !topology.transform || !Array.isArray(topology.arcs)) throw Error('INVALID_MESH');
    var transform = topology.transform;
    var arcs = topology.arcs.map(function (arc) {
      var x=0,y=0;
      return arc.map(function (p) { x+=p[0];y+=p[1];return [x*transform.scale[0]+transform.translate[0],y*transform.scale[1]+transform.translate[1]]; });
    });
    function ring(indices) {
      var points=[];
      indices.forEach(function (index) {
        var a=arcs[index<0?~index:index]; if (!a) throw Error('INVALID_ARC');
        a=index<0?a.slice().reverse():a;
        if(points.length) points.pop();
        for(var i=0;i<a.length;i++) points.push(a[i]);
      });
      if(points.length<4) throw Error('INVALID_RING');
      return points;
    }
    return Object.keys(topology.objects).flatMap(function (key) {
      return topology.objects[key].geometries.map(function (g) {
        if(g.type!=='Polygon' && g.type!=='MultiPolygon') throw Error('INVALID_GEOMETRY');
        var polygons=(g.type==='Polygon'?[g.arcs]:g.arcs).map(function (p) {return p.map(ring);});
        var bbox=[Infinity,Infinity,-Infinity,-Infinity];
        polygons.forEach(function(p){p.forEach(function(r){r.forEach(function(v){bbox[0]=Math.min(bbox[0],v[0]);bbox[1]=Math.min(bbox[1],v[1]);bbox[2]=Math.max(bbox[2],v[0]);bbox[3]=Math.max(bbox[3],v[1]);});});});
        return {id:String(g.properties.codarea),polygons:polygons,bbox:bbox};
      });
    });
  }
  function inRing(point,ring) {
    var inside=false,x=point[0],y=point[1];
    for(var i=0,j=ring.length-1;i<ring.length;j=i++) {
      var a=ring[i],b=ring[j];
      if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
    }
    return inside;
  }
  function contains(point,feature) {
    var b=feature.bbox;
    if(point[0]<b[0] || point[0]>b[2] || point[1]<b[1] || point[1]>b[3]) return false;
    return feature.polygons.some(function(p){return inRing(point,p[0]) && !p.slice(1).some(function(r){return inRing(point,r);});});
  }
  function edgeDistance(point,feature) {
    var sx=111320*Math.cos(point[1]*Math.PI/180),sy=110574,min=Infinity;
    feature.polygons.forEach(function(p){p.forEach(function(r){
      for(var i=0,j=r.length-1;i<r.length;j=i++) {
        var ax=(r[j][0]-point[0])*sx,ay=(r[j][1]-point[1])*sy,bx=(r[i][0]-point[0])*sx,by=(r[i][1]-point[1])*sy;
        var dx=bx-ax,dy=by-ay,d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/d)):0;
        min=Math.min(min,Math.hypot(ax+t*dx,ay+t*dy));
      }
    });});
    return min;
  }
  function locate(features,point,accuracy) {
    if(!Array.isArray(point) || !point.every(Number.isFinite) || !Number.isFinite(accuracy) || accuracy<0 || accuracy>MAX_ACCURACY || Math.abs(point[0])>180 || Math.abs(point[1])>90) return {status:'uncertain'};
    var matches=features.filter(function(f){return contains(point,f);});
    if(matches.length!==1) return {status:'uncertain'};
    if(edgeDistance(point,matches[0])<=accuracy+MARGIN) return {status:'uncertain'};
    return {status:'found',id:matches[0].id};
  }
  var api={decode:decode,contains:contains,inRing:inRing,edgeDistance:edgeDistance,locate:locate,STATE_CODES:STATE_CODES};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  if(typeof WorkerGlobalScope!=='undefined' && scope instanceof WorkerGlobalScope) {
    async function mesh(name) {
      if(name!=='UF' && !Object.values(STATE_CODES).includes(name)) throw Error('INVALID_UF');
      var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},8000);
      try {
        var response=await fetch('/assets/geo-ibge-2025/'+name+'.json',{credentials:'omit',signal:controller.signal});
        if(!response.ok) throw Error('MESH_UNAVAILABLE');
        var text=await response.text(); if(text.length>8000000) throw Error('MESH_TOO_LARGE');
        return decode(JSON.parse(text));
      } finally {clearTimeout(timer);}
    }
    scope.onmessage=async function(event) {
      try {
        var point=event.data.point,accuracy=event.data.accuracy;
        if(!Array.isArray(point) || !point.every(Number.isFinite) || !Number.isFinite(accuracy) || accuracy<0 || accuracy>MAX_ACCURACY) {scope.postMessage({status:'uncertain'});return;}
        var state=locate(await mesh('UF'),point,accuracy);
        if(state.status!=='found' || !STATE_CODES[state.id]) {scope.postMessage({status:'uncertain'});return;}
        var uf=STATE_CODES[state.id],city=locate(await mesh(uf),point,accuracy);
        scope.postMessage({status:city.status,id:city.id,uf:uf});
      } catch(_) {scope.postMessage({status:'unavailable'});}
    };
  }
}(typeof self!=='undefined'?self:globalThis));
