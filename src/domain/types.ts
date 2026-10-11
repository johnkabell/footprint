export type Coord = [number, number];
export type Kind = 'visit' | 'activity' | 'timelinePath' | 'timelineMemory';
export interface Point { coord: Coord; time: number }
export interface Visit extends Point { id: number; placeID: string; semanticType: string }
export interface Activity { id: number; time: number; endTime: number; type: string; distance: number | null; start?: Coord; end?: Coord }
export interface Path { id: number; points: Point[]; segments: [Point, Point][] }
export interface Timeline {
  total: number; counts: Record<Kind, number>; invalid: number; reasons: Record<string, number>;
  visits: Visit[]; activities: Activity[]; paths: Path[]; memories: number[]; gpsCount: number;
  range: [number, number] | null;
}
export interface Filter { year: string; month: string; excludePrivate: boolean; activityType: string }
export interface Selection { visits: Visit[]; activities: Activity[]; paths: Path[]; memories: number[]; distanceType?: string }
export const isPrivate = (v: Visit) => /^(home|work)$/i.test(v.semanticType);
