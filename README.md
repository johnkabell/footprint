# Footprint

個人用のGoogleマップタイムライン分析ダッシュボード。Vite、React、TypeScript、MapLibre GL JS、Recharts。

## ローカル実行

Node.js 24を使用します。

```sh
npm ci
npm run dev
```

## 検証

```sh
npm run lint
npm run test
npm run build
```

合成データを使う10件のテストを含みます。実際の個人データによる検証、iPhone Safari実機は未実施です。

## GitHub Pages

リポジトリのSettings → Pages → SourceをGitHub Actionsに設定します。mainへの更新でチェック後にdistだけを自動公開します。

## プライバシー

Timeline.jsonはアプリ画面で選択し、ブラウザ内のWorkerだけで解析します。履歴を外部送信・永続保存しません。再読み込みすると消去します。
このリポジトリに含まれるtimeline-demo.jsonの座標は合成データです。個人のTimeline.jsonをリポジトリに追加しないでください。
背景地図のタイルGET通信だけは発生します。OpenStreetMapの出典を地図に表示しています。
自宅・職場の滞在点を隠しても、経路やメッシュから周辺を推測できる可能性があります。画面共有前に表示レイヤーを確認してください。
