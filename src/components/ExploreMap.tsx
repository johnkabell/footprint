import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { type GeoJSONSource, type Map as MapInstance } from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { FeatureCollection, Feature, Geometry } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { coverage, polygon, status, visibleCells, type Cell } from '../domain/coverage';
import { jstDay } from '../domain/stats';
import type { Coord, Selection } from '../domain/types';
const collection=(features:Feature[]):FeatureCollection=>({type:'FeatureCollection',features});
const feature=(geometry:Geometry,properties:Record<string,unknown>={}):Feature=>({type:'Feature',geometry,properties});
const point=(coord:Coord)=>feature({type:'Point',coordinates:coord});
const colors={'滞在記録':'#16867c','通過・移動記録':'#74a7d8','記録なし':'#c5cdd4'};
const names={visits:'滞在地点',gps:'GPSサンプル点',lines:'観測点間の推定接続',mesh:'探索メッシュ（250m）',endpoints:'activity 始終点'};
maplibregl.setWorkerUrl(mapWorkerUrl);
type Layer = keyof typeof names;
export default function ExploreMap({selection,showPrivate,onPrivate}:{selection:Selection;showPrivate:boolean;onPrivate:(v:boolean)=>void}) {
  const container=useRef<HTMLDivElement>(null), map=useRef<MapInstance|null>(null);
  const latest=useRef(selection), cellsRef=useRef(new Map<string,Cell>());
  const [ready,setReady]=useState(false), [overload,setOverload]=useState(false), [error,setError]=useState(''), [detail,setDetail]=useState<Cell|null>(null);
  const [layers,setLayers]=useState<Record<Layer,boolean>>({visits:true,gps:false,lines:true,mesh:true,endpoints:false});
  const recorded=useMemo(()=>coverage(selection),[selection]);
  useEffect(()=>{latest.current=selection; cellsRef.current=recorded;setDetail(null);},[selection,recorded]);
  useEffect(()=>{
    if(!container.current) return;
    const m=new maplibregl.Map({container:container.current,center:[139.75,35.68],zoom:9,minZoom:2,maxZoom:18,style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',maxzoom:19}},layers:[{id:'base',type:'raster',source:'osm',paint:{'raster-saturation':-0.65}}]}});
    map.current=m; m.addControl(new maplibregl.NavigationControl(),'top-right');
    m.on('error',()=>setError('背景地図を取得できません。ネットワーク接続・WebGL対応を確認してください。位置記録の集計は利用できます。'));
    m.on('style.load',()=>{
      for(const name of Object.keys(names) as Layer[]) m.addSource(name,{type:'geojson',data:collection([])});
      m.addLayer({id:'mesh',type:'fill',source:'mesh',paint:{'fill-color':['match',['get','state'],'滞在記録',colors.滞在記録,'通過・移動記録',colors['通過・移動記録'],colors.記録なし],'fill-opacity':0.22,'fill-outline-color':'#94a6b5'}});
      m.addLayer({id:'lines',type:'line',source:'lines',paint:{'line-color':'#3e89b7','line-width':2,'line-opacity':0.65}});
      m.addLayer({id:'gps',type:'circle',source:'gps',paint:{'circle-color':'#6a91b9','circle-radius':3}});
      m.addLayer({id:'endpoints',type:'circle',source:'endpoints',paint:{'circle-color':'#b38a39','circle-radius':5,'circle-stroke-color':'white','circle-stroke-width':1}});
      m.addLayer({id:'visits',type:'circle',source:'visits',paint:{'circle-color':'#16867c','circle-radius':6,'circle-stroke-color':'white','circle-stroke-width':2}});
      setReady(true);
    });
    m.on('click','mesh',e=>{ const id=e.features?.[0]?.properties?.id as string|undefined; if(id) setDetail(cellsRef.current.get(id) ?? {id,visits:0,gps:0,endpoints:0,last:null}); });
    return ()=>{m.remove();map.current=null;};
  },[]);
  useEffect(()=>{
    const m=map.current; if(!m || !ready) return;
    const set=(id:Layer,data:FeatureCollection)=>(m.getSource(id) as GeoJSONSource).setData(data);
    set('visits',collection(selection.visits.map(v=>point(v.coord))));
    set('gps',collection(selection.paths.flatMap(p=>p.points.map(v=>point(v.coord)))));
    set('lines',collection(selection.paths.flatMap(p=>p.segments.map(([a,b])=>feature({type:'LineString',coordinates:[a.coord,b.coord]})))));
    set('endpoints',collection(selection.activities.flatMap(a=>[a.start,a.end].filter((c):c is Coord=>!!c).map(point))));
    const updateMesh=()=>{
      const b=m.getBounds(), visible=visibleCells([b.getWest(),b.getSouth(),b.getEast(),b.getNorth()],cellsRef.current);
      setOverload(!visible); set('mesh',collection((visible ?? []).map(c=>feature({type:'Polygon',coordinates:[polygon(c.id)]},{id:c.id,state:status(c)}))));
    };
    updateMesh(); m.on('moveend',updateMesh);
    return ()=>{m.off('moveend',updateMesh);};
  },[selection,ready]);
  // Fit only at mount/import. Period and layer changes preserve the user's viewport.
  useEffect(()=>{
    const m=map.current; if(!m || !ready) return;
    const s=latest.current;
    let coords=[...s.visits.map(v=>v.coord),...s.paths.flatMap(p=>p.points.map(v=>v.coord)),...s.activities.flatMap(a=>[a.start,a.end].filter((c):c is Coord=>!!c))];
    if(!coords.length) return;
    const tokyo=coords.filter(([lng,lat])=>lng>=138.5&&lng<=141&&lat>=34.5&&lat<=37);
    const extent=(cs:Coord[])=>cs.reduce((a,c)=>[Math.min(a[0],c[0]),Math.min(a[1],c[1]),Math.max(a[2],c[0]),Math.max(a[3],c[1])],[180,90,-180,-90]);
    let b=extent(coords); if((b[2]-b[0]>15 || b[3]-b[1]>15)&&tokyo.length) {coords=tokyo;b=extent(coords);}
    m.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:70,maxZoom:14,duration:0});
  },[ready]);
  useEffect(()=>{ const m=map.current; if(!m||!ready) return; (Object.keys(layers) as Layer[]).forEach(id=>m.setLayoutProperty(id,'visibility',layers[id]?'visible':'none')); },[layers,ready]);
  return <div className="map-layout">
    <aside className="panel map-options"><div className="eyebrow">MAP LAYERS</div><h3>記録を重ねて見る</h3>
      {(Object.keys(names) as Layer[]).map(id=><label className="check" key={id}><input type="checkbox" checked={layers[id]} onChange={e=>setLayers({...layers,[id]:e.target.checked})}/>{names[id]}</label>)}
      <div className="divider"/><label className="check"><input type="checkbox" checked={showPrivate} onChange={e=>onPrivate(e.target.checked)}/>自宅・職場の滞在点を表示</label>
      <p className="small">移動種別の絞り込みはactivity由来の距離と端点だけに適用されます。滞在・GPS記録は変わりません。</p>
      <div className="divider"/><h3>メッシュの凡例</h3>{Object.entries(colors).map(([label,color])=><div className="legend" key={label}><i style={{background:color}}/>{label}</div>)}
      <p className="small">「記録なし」は未訪問を意味しません。線分の途中や移動端点の間はメッシュの根拠に使いません。</p>
      {detail ? <div className="cell-detail"><h3>{status(detail)}</h3><p>滞在記録 {detail.visits}件<br/>GPS点 {detail.gps}件<br/>activity端点 {detail.endpoints}件</p><p className="small">最終記録日：{detail.last===null?'なし':jstDay(detail.last)}（JST）</p></div> : <p className="small">セルをクリックすると根拠と最終記録日を確認できます。</p>}
    </aside><div className="map-wrap"><div ref={container} className="map-canvas" aria-label="探索マップ"/>
      {layers.mesh&&overload&&<div className="map-notice">250mメッシュは拡大すると表示されます（最大2,500セル）。</div>}
      {error&&<div className="map-error" role="status">{error}</div>}
    </div></div>;
}
