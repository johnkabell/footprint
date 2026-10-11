import type { Coord, Kind, Point, Timeline } from './types';
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
export function numeric(v: unknown): number | null {
  if ((typeof v !== 'number' && typeof v !== 'string') || (typeof v==='string' && !v.trim())) return null;
  const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null;
}
export function coordinate(v: unknown): Coord | null {
  if (typeof v !== 'string') return null;
  const match = /^geo:\s*([+-]?\d+(?:\.\d+)?),\s*([+-]?\d+(?:\.\d+)?)\s*$/.exec(v);
  if (!match) return null;
  const lat = Number(match[1]), lng = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lng, lat] : null;
}
export function distance(a: Coord, b: Coord): number {
  const rad = Math.PI / 180, dlat = (b[1]-a[1])*rad, dlng = (b[0]-a[0])*rad;
  const h = Math.sin(dlat/2)**2 + Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dlng/2)**2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function connect(points: (Point | null)[]): [Point, Point][] {
  const segments: [Point, Point][] = [];
  for (let i=1; i<points.length; i++) {
    const a=points[i-1], b=points[i];
    if (a && b && b.time >= a.time && b.time-a.time <= 900000 && distance(a.coord,b.coord) <= 500) segments.push([a,b]);
  }
  return segments;
}
const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) ? Date.parse(v) : NaN;
export function parseTimeline(input: unknown): Timeline {
  if (!Array.isArray(input)) throw new Error('JSONのルートは配列である必要があります。');
  const result: Timeline = { total: input.length, counts: {visit:0, activity:0, timelinePath:0, timelineMemory:0}, invalid:0, reasons:{}, visits:[], activities:[], paths:[], memories:[], gpsCount:0, range:null };
  const badRecords = new Set<number>();
  const bad = (id: number, reason: string) => { badRecords.add(id); result.reasons[reason]=(result.reasons[reason] ?? 0)+1; };
  const includeTime = (t: number) => { result.range = result.range ? [Math.min(t,result.range[0]),Math.max(t,result.range[1])] : [t,t]; };
  input.forEach((value, id) => {
    const r=obj(value), kinds=(['visit','activity','timelinePath','timelineMemory'] as Kind[]).filter(k => k in r);
    kinds.forEach(k => result.counts[k]++);
    if (kinds.length !== 1) { bad(id,'記録種別が不明・複数'); return; }
    const time=date(r.startTime), endTime=date(r.endTime);
    if (!Number.isFinite(time) || !Number.isFinite(endTime) || endTime<time) { bad(id,'開始・終了日時が無効'); return; }
    const kind=kinds[0], body=obj(r[kind]), candidate=obj(body.topCandidate);
    for (const probability of [body.probability,candidate.probability]) {
      if (probability !== undefined && (numeric(probability) === null || Number(probability)>1)) { bad(id,'確率が無効'); return; }
    }
    if (kind==='visit') {
      const coord=coordinate(candidate.placeLocation);
      if (!coord || typeof candidate.placeID !== 'string' || !candidate.placeID.trim()) { bad(id,'滞在座標・Place IDが無効'); return; }
      result.visits.push({id, time, coord, placeID:candidate.placeID, semanticType:typeof candidate.semanticType==='string' ? candidate.semanticType : 'Unknown'});
      includeTime(time); includeTime(endTime);
    } else if (kind==='activity') {
      if (typeof candidate.type!=='string' || !candidate.type.trim()) { bad(id,'移動種別が無効'); return; }
      const dist=body.distanceMeters===undefined ? null : numeric(body.distanceMeters);
      if (body.distanceMeters!==undefined && dist===null) bad(id,'移動距離が無効（距離を除外）');
      const start=coordinate(body.start), end=coordinate(body.end);
      if (!start || !end) bad(id,'移動端点が欠損・無効（該当端点を除外）');
      result.activities.push({id,time,endTime,type:candidate.type.toLowerCase(),distance:dist,start:start ?? undefined,end:end ?? undefined});
      includeTime(time); includeTime(endTime);
    } else if (kind==='timelinePath') {
      if (!Array.isArray(r.timelinePath)) { bad(id,'timelinePathが配列ではない'); return; }
      const rawPoints: (Point|null)[] = r.timelinePath.map((raw: unknown) => {
        const p=obj(raw), coord=coordinate(p.point), offset=numeric(p.durationMinutesOffsetFromStartTime);
        const t=offset===null ? NaN : time+offset*60000;
        if (!coord || !Number.isFinite(new Date(t).getTime())) { bad(id,'GPS座標・時刻オフセットが無効'); return null; }
        includeTime(t); return {coord,time:t};
      });
      const points=rawPoints.filter((p): p is Point => p!==null);
      result.paths.push({id,points,segments:connect(rawPoints)}); result.gpsCount+=points.length;
    } else { result.memories.push(time); includeTime(time); includeTime(endTime); }
  });
  result.invalid=badRecords.size; return result;
}
