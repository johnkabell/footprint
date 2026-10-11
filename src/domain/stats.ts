import { isPrivate, type Filter, type Selection, type Timeline } from './types';
export const jstDay = (t: number) => new Date(t+9*3600000).toISOString().slice(0,10);
export const jstMonth = (t: number) => jstDay(t).slice(0,7);
export function inPeriod(t: number, f: Filter): boolean {
  const day=jstDay(t);
  return (f.year==='all' || day.slice(0,4)===f.year) && (f.month==='all' || day.slice(5,7)===f.month);
}
export function select(data: Timeline, f: Filter, map = false, showPrivate = false): Selection {
  return {
    visits:data.visits.filter(v => inPeriod(v.time,f) && (!(map ? !showPrivate : f.excludePrivate) || !isPrivate(v))),
    activities:data.activities.filter(a => inPeriod(a.time,f) && (!map || f.activityType==='all' || a.type===f.activityType)),
    distanceType:f.activityType,
    paths:data.paths.map(p => ({...p,points:p.points.filter(v => inPeriod(v.time,f)),segments:p.segments.filter(([a,b]) => inPeriod(a.time,f) && inPeriod(b.time,f))})),
    memories:data.memories.filter(t => inPeriod(t,f)),
  };
}
export function summarize(s: Selection) {
  const days=new Set<string>(), places=new Set<string>(), distances: Record<string, number>={};
  const months: Record<string,{month:string; visits:number; days:Set<string>; km:number}>={};
  const record=(t:number) => { const day=jstDay(t), key=day.slice(0,7); days.add(day); months[key] ??= {month:key,visits:0,days:new Set(),km:0}; months[key].days.add(day); return months[key]; };
  s.visits.forEach(v => { record(v.time).visits++; places.add(v.placeID); });
  s.activities.forEach(a => { const month=record(a.time); if(!s.distanceType || s.distanceType==='all' || a.type===s.distanceType) {month.km+=(a.distance ?? 0)/1000; distances[a.type]=(distances[a.type] ?? 0)+(a.distance ?? 0)/1000;} });
  s.paths.forEach(p => p.points.forEach(v => record(v.time)));
  s.memories.forEach(t => record(t));
  return {days:days.size,visits:s.visits.length,places:places.size,distances,missingDistances:s.activities.filter(a=>a.distance===null).length,zeroDistances:s.activities.filter(a=>a.distance===0).length,months:Object.values(months).sort((a,b)=>a.month.localeCompare(b.month)).map(m=>({month:m.month,visits:m.visits,days:m.days.size,km:m.km}))};
}
