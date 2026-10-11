import type { Coord, Selection } from './types';
const R=6378137, SIZE=250;
export function project([lng,lat]:Coord):Coord { return [R*lng*Math.PI/180,R*Math.log(Math.tan(Math.PI/4+Math.max(-85.05112878,Math.min(85.05112878,lat))*Math.PI/360))]; }
export function unproject([x,y]:Coord):Coord { return [x/R*180/Math.PI,(2*Math.atan(Math.exp(y/R))-Math.PI/2)*180/Math.PI]; }
export function cellID(coord:Coord):string { const [x,y]=project(coord); return `${Math.floor(x/SIZE)}:${Math.floor(y/SIZE)}`; }
export interface Cell { id:string; visits:number; gps:number; endpoints:number; last:number|null }
export const status=(c:Cell) => c.visits>0 ? '滞在記録' : c.gps+c.endpoints>0 ? '通過・移動記録' : '記録なし';
export function coverage(s:Selection):Map<string,Cell> {
  const cells=new Map<string,Cell>();
  const add=(coord:Coord,t:number,kind:'visits'|'gps'|'endpoints') => { const id=cellID(coord), c=cells.get(id) ?? {id,visits:0,gps:0,endpoints:0,last:null}; c[kind]++; c.last=Math.max(c.last ?? t,t); cells.set(id,c); };
  s.visits.forEach(v=>add(v.coord,v.time,'visits'));
  s.paths.forEach(p=>p.points.forEach(v=>add(v.coord,v.time,'gps')));
  s.activities.forEach(a=> { if(a.start) add(a.start,a.time,'endpoints'); if(a.end) add(a.end,a.endTime,'endpoints'); });
  return cells;
}
export function visibleCells(bounds:[number,number,number,number], recorded:Map<string,Cell>, limit=2500):Cell[]|null {
  const [w,s,e,n]=bounds;
  // A viewport crossing the antimeridian is intentionally not expanded into a world-sized grid.
  if(e<w || e-w>180) return null;
  const [x1,y1]=project([w,s]), [x2,y2]=project([e,n]);
  const a=Math.floor(x1/SIZE), b=Math.floor(x2/SIZE), c=Math.floor(y1/SIZE), d=Math.floor(y2/SIZE);
  if((b-a+1)*(d-c+1)>limit) return null;
  const cells:Cell[]=[];
  for(let x=a;x<=b;x++) for(let y=c;y<=d;y++) { const id=`${x}:${y}`; cells.push(recorded.get(id) ?? {id,visits:0,gps:0,endpoints:0,last:null}); }
  return cells;
}
export function polygon(id:string):Coord[] { const [x,y]=id.split(':').map(Number); return [[x,y],[x+1,y],[x+1,y+1],[x,y+1],[x,y]].map(([a,b])=>unproject([a*SIZE,b*SIZE])); }
