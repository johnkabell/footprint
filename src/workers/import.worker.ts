import { parseTimeline } from '../domain/parseTimeline';
self.onmessage = async (event:MessageEvent<{file?:File; demo?:unknown}>) => {
  try {
    const input = event.data.file ? JSON.parse(await event.data.file.text()) : event.data.demo;
    self.postMessage({data:parseTimeline(input)});
  } catch { self.postMessage({error:'読み込みに失敗しました。JSON構文と、ルートが配列であることを確認してください。'}); }
};
