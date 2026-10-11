import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import demo from '../fixtures/timeline-demo.json';
import { jstDay, select, summarize } from './domain/stats';
import type { Filter, Timeline, Selection } from './domain/types';
const ExploreMap=lazy(()=>import('./components/ExploreMap'));
const emptySelection:Selection={visits:[],activities:[],paths:[],memories:[]};
const number=(n:number)=>n.toLocaleString('ja-JP');
const modes:Record<string,string>={walking:'徒歩',cycling:'自転車',in_bus:'バス',in_train:'鉄道',in_subway:'地下鉄',in_tram:'路面電車',in_ferry:'フェリー',in_vehicle:'車',running:'ランニング',unknown:'不明'};
const transit=['in_bus','in_train','in_subway','in_tram','in_ferry','bus','train','subway','tram','ferry','public_transport','in_public_transport'];
export default function App() {
  const [data,setData]=useState<Timeline|null>(null), [screen,setScreen]=useState<'dashboard'|'map'>('dashboard');
  const [filter,setFilter]=useState<Filter>({year:'all',month:'all',excludePrivate:true,activityType:'all'});
  const [showPrivate,setShowPrivate]=useState(false), [state,setState]=useState('データ未選択'), [error,setError]=useState(''), [loading,setLoading]=useState(false), [revision,setRevision]=useState(0);
  const worker=useRef<Worker|null>(null), input=useRef<HTMLInputElement>(null);
  useEffect(()=>()=>worker.current?.terminate(),[]);
  const importData=(file?:File)=>{
    worker.current?.terminate();setLoading(true);setError('');setState('ブラウザ内で解析中…');
    const w=new Worker(new URL('./workers/import.worker.ts',import.meta.url),{type:'module'});worker.current=w;
    const fail=(message:string)=>{setLoading(false);setError(message);setState(data?'前回のデータを保持しています':'読み込み失敗');w.terminate();};
    w.onmessage=(e:MessageEvent<{data?:Timeline;error?:string}>)=>{
      if(e.data.error) {fail(e.data.error);return;}
      if(e.data.data){setData(e.data.data);setFilter({year:'all',month:'all',excludePrivate:true,activityType:'all'});setShowPrivate(false);setRevision(v=>v+1);setState(file?'ローカルファイルを読み込みました':'合成デモを読み込みました');}
      setLoading(false);w.terminate();
    };
    w.onerror=()=>fail('解析処理を実行できませんでした。ファイルのサイズ・形式を確認してください。');
    w.postMessage(file?{file}:{demo});
  };
  const discard=()=>{worker.current?.terminate();setData(null);setShowPrivate(false);setLoading(false);setError('');setState('データを破棄しました');};
  const selection=useMemo(()=>data?select(data,filter):null,[data,filter]);
  const mapped=useMemo(()=>data?select(data,filter,true,showPrivate):null,[data,filter,showPrivate]);
  const stats=useMemo(()=>selection?summarize(selection):null,[selection]);
  const years=useMemo(()=>data?Array.from(new Set([...data.visits.map(v=>v.time),...data.activities.map(a=>a.time),...data.paths.flatMap(p=>p.points.map(v=>v.time)),...data.memories].map(t=>jstDay(t).slice(0,4)))).sort():[],[data]);
  const types=useMemo(()=>data?Array.from(new Set(data.activities.map(a=>a.type))).sort():[],[data]);
  const kpis=stats?[
    ['活動記録日数',number(stats.days),'日'],['滞在記録数',number(stats.visits),'件'],['ユニークPlace ID',number(stats.places),'ID'],
    ['徒歩の推定距離',(stats.distances.walking ?? 0).toFixed(2),'km'],['自転車の推定距離',(stats.distances.cycling ?? 0).toFixed(2),'km'],['公共交通の推定距離',transit.reduce((n,k)=>n+(stats.distances[k] ?? 0),0).toFixed(2),'km'],
  ]:[];
  return <div className="app"><header className="topbar"><a className="brand" href="#" onClick={e=>{e.preventDefault();setScreen('dashboard');}}><span className="brand-mark">f.</span>Footprint<span className="brand-sub">PERSONAL TIMELINE</span></a><span className="local-badge"><i/>ブラウザ内で処理</span></header>
    <div className="app-body"><nav className="sidebar" aria-label="画面切り替え"><span className="nav-caption">WORKSPACE</span><button className={screen==='dashboard'?'nav-button active':'nav-button'} onClick={()=>setScreen('dashboard')}><span>▥</span>行動ダッシュボード</button><button className={screen==='map'?'nav-button active':'nav-button'} onClick={()=>setScreen('map')}><span>◎</span>探索マップ</button><div className="sidebar-note"><span>YOUR DATA, YOUR DEVICE.</span><p>位置情報はこのブラウザのメモリ内だけに保持します。</p><p>再読み込みすると消去されます。</p></div></nav>
    <main><div className="page-heading"><div><div className="eyebrow">{screen==='dashboard'?'YOUR MOVEMENT, AT A GLANCE':'FIND THE GAPS IN YOUR RECORDS'}</div><h1>{screen==='dashboard'?'行動ダッシュボード':'探索マップ'}</h1><p>{screen==='dashboard'?'日々の移動を振り返り、行動の変化を見つける。':'記録のある場所と、まだ記録の少ないエリアを眺める。'}</p></div><span className="period-label">{data?.range?`${jstDay(data.range[0])} — ${jstDay(data.range[1])}`:'ローカルで始めよう'}</span></div>
      <section className="import-panel panel" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)importData(f);}} aria-label="タイムライン読み込み"><div><div className="import-title"><span className="file-icon">↥</span><h2>タイムラインを読み込む</h2></div><p className="small">Timeline.jsonを選択、またはここにドロップ。ファイルは外部送信・保存されません。</p><p className="import-status" role="status" aria-live="polite">{state}</p>{error&&<p className="error" role="alert">{error}</p>}</div><div className="import-actions"><input ref={input} type="file" accept=".json,application/json" aria-label="Timeline.jsonを選択" className="file-input" onChange={e=>{const f=e.target.files?.[0];if(f)importData(f);e.target.value='';}}/><button className="primary" onClick={()=>input.current?.click()}>JSONファイルを選択</button><button disabled={loading} onClick={()=>importData()}>合成デモを試す</button>{(data||loading)&&<button className="text-button" onClick={discard}>データを破棄</button>}</div></section>
      {data&&<><section className="filters panel" aria-label="集計フィルタ"><label>年<select value={filter.year} onChange={e=>setFilter({...filter,year:e.target.value})}><option value="all">全期間</option>{years.map(y=><option key={y}>{y}</option>)}</select></label><label>月<select value={filter.month} onChange={e=>setFilter({...filter,month:e.target.value})}><option value="all">すべての月</option>{Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0')).map(m=><option key={m} value={m}>{Number(m)}月</option>)}</select></label><label>移動種別<select value={filter.activityType} onChange={e=>setFilter({...filter,activityType:e.target.value})}><option value="all">すべての移動</option>{types.map(t=><option key={t} value={t}>{modes[t] ?? t}</option>)}</select></label><label className="check toggle"><input type="checkbox" checked={filter.excludePrivate} onChange={e=>setFilter({...filter,excludePrivate:e.target.checked})}/>自宅・職場を集計から除外</label></section>
      {screen==='dashboard'&&stats&&<><div className="section-heading"><h2>行動のサマリー</h2><span>選択期間 / 日本時間</span></div><section className="kpi-grid">{kpis.map(([label,value,unit],i)=><article className="panel kpi" key={label}><div className="kpi-label">{label}<span className="kpi-symbol">{['◷','◉','◇','↗','↗','↗'][i]}</span></div><div className="kpi-value">{value}<span>{unit}</span></div><div className="small">{i<3?['記録のある日を重複除去','開始日時で集計','施設の実数とは異なります'][i]:'activityの距離を単純合計'}</div></article>)}</section>
      <section className="panel chart-panel"><div className="section-heading"><div><h2>月ごとの行動</h2><p className="small">滞在記録と活動日数、推定移動距離の推移</p></div><span className="chart-chip">MONTHLY</span></div>{stats.months.length?<div className="chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={stats.months} margin={{top:20,right:20,bottom:10,left:0}}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e6ecef"/><XAxis dataKey="month" tick={{fontSize:12}} tickLine={false} axisLine={false}/><YAxis yAxisId="counts" tick={{fontSize:12}} tickLine={false} axisLine={false} allowDecimals={false} label={{value:'件 / 日',angle:-90,position:'insideLeft'}}/><YAxis yAxisId="distance" orientation="right" tick={{fontSize:12}} tickLine={false} axisLine={false} label={{value:'km',angle:90,position:'insideRight'}}/><Tooltip formatter={(value,name)=>[typeof value==='number'?value.toLocaleString('ja-JP',{maximumFractionDigits:3}):value,name]}/><Legend/><Bar yAxisId="counts" dataKey="visits" name="滞在記録数（件）" fill="#1a8b80" radius={[4,4,0,0]} maxBarSize={32}/><Line yAxisId="counts" dataKey="days" name="活動日数（日）" stroke="#6789a9" strokeWidth={2}/><Line yAxisId="distance" dataKey="km" name="推定移動距離（km）" stroke="#c28f41" strokeWidth={2}/></ComposedChart></ResponsiveContainer></div>:<div className="empty-chart">選択期間に集計対象の記録がありません。</div>}<p className="small footnote">滞在・activityは開始日時で期間判定し、跨日を按分しません。GPS点は各点時刻で判定します。距離は推定値です。距離欠損・異常：{stats.missingDistances}件 / 距離0：{stats.zeroDistances}件。</p></section>
      <section className="panel summary-panel"><div className="section-heading"><h2>インポート概要</h2><span>元データ全体 / フィルタ適用前</span></div><div className="summary-grid">{[['全レコード',data.total],['visit',data.counts.visit],['activity',data.counts.activity],['timelinePath',data.counts.timelinePath],['timelineMemory',data.counts.timelineMemory],['GPS点',data.gpsCount],['無効・一部除外レコード',data.invalid]].map(([label,value])=><div key={label}><span className="small">{label}</span><strong>{number(Number(value))}</strong></div>)}</div>{data.invalid>0&&<div className="invalid-reasons"><p>一部のデータを除外しました。理由別件数は重複を含みます。</p>{Object.entries(data.reasons).map(([reason,count])=><p key={reason}>{reason}：{count}件</p>)}</div>}</section></>}
      {screen==='map'&&mapped&&<Suspense fallback={<div className="panel loading">探索マップを準備しています…</div>}><ExploreMap key={revision} selection={mapped} showPrivate={showPrivate} onPrivate={setShowPrivate}/></Suspense>}
      </>}
      {!data&&screen==='map'&&<Suspense fallback={<div className="panel loading">探索マップを準備しています…</div>}><ExploreMap key={revision} selection={emptySelection} showPrivate={showPrivate} onPrivate={setShowPrivate}/></Suspense>}
      {!data&&<div className="empty-state"><div className="empty-symbol">◎</div><h2>あなたの足跡から、次の発見へ。</h2><p>Googleマップから出力したTimeline.jsonを読み込んでください。<br/>合成デモでも、ダッシュボードと探索マップを体験できます。</p><div className="empty-steps"><span>01 ファイルを選択</span><span>02 行動を振り返る</span><span>03 地図で探索する</span></div></div>}
      <footer className="privacy-note"><strong>プライバシーの確認</strong><span>自宅・職場の滞在点を隠しても、経路やメッシュから周辺を推測できる可能性があります。画面共有・スクショの公開前にレイヤーを確認してください。背景地図の表示範囲に応じたタイルGET通信のみ発生します。</span></footer>
    </main></div></div>;
}
