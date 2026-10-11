import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/timeline-demo.json';
import { connect, coordinate, parseTimeline } from './parseTimeline';
import { inPeriod, jstDay, select, summarize } from './stats';
import { cellID, coverage, polygon, status, visibleCells } from './coverage';
import type { Filter, Point } from './types';
const filter:Filter={year:'all',month:'all',excludePrivate:true,activityType:'all'};
const data=parseTimeline(fixture);
describe('Timeline import',()=>{
  it('recognizes the fixture without double counting',()=>{
    expect(data.total).toBe(7); expect(data.counts).toEqual({visit:3,activity:2,timelinePath:1,timelineMemory:1});
    expect(data.gpsCount).toBe(3); expect(data.invalid).toBe(0); expect(data.visits[0].coord).toEqual([139.7,35.65]);
    expect(data.paths[0].segments).toHaveLength(1); expect(jstDay(data.paths[0].points[0].time)).toBe('2026-01-02');
    expect(data.paths[0].points[1].time-data.paths[0].points[0].time).toBe(300000);
  });
  it('rejects invalid roots and coordinates',()=>{
    expect(()=>parseTimeline({})).toThrow(); expect(()=>parseTimeline(JSON.parse('{'))).toThrow();
    expect(coordinate('geo:91,10')).toBeNull(); expect(coordinate('geo:0,181')).toBeNull();
    expect(coordinate('geo:0,0')).toEqual([0,0]);
    const invalid=parseTimeline([{}, {...fixture[0],visit:{topCandidate:{placeID:'x',placeLocation:'geo:999,10'}}}]);
    expect(invalid.invalid).toBe(2); expect(invalid.visits).toHaveLength(0);
  });
  it('retains valid points and breaks at a malformed sample',()=>{
    const p=fixture[4];
    const parsed=parseTimeline([{...p,timelinePath:[p.timelinePath![0],{point:'bad',durationMinutesOffsetFromStartTime:'2'},p.timelinePath![1]]}]);
    expect(parsed.invalid).toBe(1); expect(parsed.gpsCount).toBe(2); expect(parsed.paths[0].segments).toHaveLength(0);
  });
  it('distinguishes missing, zero and abnormal distances and skips bad probability',()=>{
    const make=(distanceMeters:unknown)=>({...fixture[3],activity:{...fixture[3].activity,distanceMeters}});
    const parsed=parseTimeline([make(undefined),make('0'),make('-1'),make('NaN'),{...fixture[0],visit:{...fixture[0].visit,probability:'1.2'}}]);
    expect(parsed.activities.map(a=>a.distance)).toEqual([null,0,null,null]); expect(parsed.invalid).toBe(3);
    expect(summarize(select(parsed,filter)).zeroDistances).toBe(1);
  });
  it('cuts gaps, reversed times and separate records',()=>{
    const a:Point={coord:[139.7,35.65],time:0};
    expect(connect([a,{...a,time:900001}])).toHaveLength(0);
    expect(connect([{...a,time:1},a])).toHaveLength(0);
    expect(connect([a,{coord:[140,35.65],time:1}])).toHaveLength(0);
    expect(connect([a,{...a,time:900000}])).toHaveLength(1);
    const parsed=parseTimeline([fixture[4],fixture[4]]); expect(parsed.paths).toHaveLength(2); expect(parsed.paths.flatMap(p=>p.segments)).toHaveLength(2);
  });
});
describe('JST filtering and statistics',()=>{
  it('computes fixture KPIs and decimal kilometers',()=>{
    const result=summarize(select(data,filter)); expect(result.visits).toBe(2); expect(result.places).toBe(1); expect(result.days).toBe(3);
    expect(result.distances.walking).toBe(0.5005); expect(result.distances.cycling).toBe(1.25);
    expect(result.months).toEqual([{month:'2026-01',visits:2,days:3,km:1.7505}]);
    expect(summarize(select(data,{...filter,excludePrivate:false})).places).toBe(2);
    const work=parseTimeline([{...fixture[1],visit:{...fixture[1].visit,topCandidate:{...fixture[1].visit!.topCandidate,semanticType:'Work'}}}]);
    expect(select(work,filter).visits).toHaveLength(0);
  });
  it('uses half-open month boundaries in JST',()=>{
    const f={...filter,year:'2026',month:'02'};
    expect(inPeriod(Date.parse('2026-01-31T14:59:59Z'),f)).toBe(false);
    expect(inPeriod(Date.parse('2026-01-31T15:00:00Z'),f)).toBe(true);
    expect(inPeriod(Date.parse('2026-02-28T15:00:00Z'),f)).toBe(false);
    const path=parseTimeline([{startTime:'2026-01-31T14:55:00Z',endTime:'2026-01-31T15:05:00Z',timelinePath:[{point:'geo:35,139',durationMinutesOffsetFromStartTime:'0'},{point:'geo:35,139',durationMinutesOffsetFromStartTime:'10'}]}]);
    expect(select(path,f).paths[0].points).toHaveLength(1);
    expect(summarize(select(path,f)).months[0].month).toBe('2026-02');
  });
  it('applies mode only to activity and hides private map pins explicitly',()=>{
    const s=select(data,{...filter,activityType:'cycling'}); expect(s.activities).toHaveLength(2); expect(s.visits).toHaveLength(2); expect(s.paths[0].points).toHaveLength(3);
    expect(summarize(s).distances).toEqual({cycling:1.25}); expect(summarize(s).days).toBe(3);
    expect(select(data,{...filter,activityType:'cycling'},true).activities).toHaveLength(1);
    expect(select(data,{...filter,excludePrivate:false},true).visits).toHaveLength(2);
    expect(select(data,filter,true,true).visits).toHaveLength(3); expect(data.counts.visit).toBe(3);
  });
});
describe('fixed coverage grid',()=>{
  it('remains fixed across viewports and prioritizes visits',()=>{
    const s=select(data,filter), cells=coverage(s), id=cellID(data.visits[0].coord);
    expect(status(cells.get(id)!)).toBe('滞在記録'); expect(polygon(id)).toHaveLength(5);
    const a=visibleCells([139.69,35.64,139.71,35.66],cells)!;
    const b=visibleCells([139.695,35.645,139.705,35.655],cells)!;
    expect(a.find(c=>c.id===id)).toEqual(b.find(c=>c.id===id));
    expect(visibleCells([-180,-85,180,85],cells)).toBeNull();
  });
  it('counts endpoints without interpolating routes or GPS segments',()=>{
    const s={visits:[],paths:[],memories:[],activities:[{id:0,time:0,endTime:1,type:'walking',distance:10000,start:[139,35] as [number,number],end:[140,35] as [number,number]}]};
    const cells=coverage(s); expect(cells.size).toBe(2); expect(cells.has(cellID([139.5,35]))).toBe(false);
    expect([...cells.values()].map(status)).toEqual(['通過・移動記録','通過・移動記録']);
    expect(status({id:'0:0',visits:0,gps:0,endpoints:0,last:null})).toBe('記録なし');
  });
});
