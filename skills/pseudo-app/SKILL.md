# 擬似アプリ化スキル（GAS + HTML Web App）

## 概要
Google Spreadsheetをデータベースとして使いながら、
GAS の `doGet()` + HTMLで本格的なモバイルアプリ画面を提供する。
スタッフはスプレッドシートを一切開かずにURLだけで操作できる。

## アーキテクチャ

```
スタッフ → URL（またはQRコード）
               ↓
           app.html（Webアプリ画面）
               ↓ google.script.run
           gas_v2.gs（バックエンド）
               ↓
           Googleスプレッドシート（DB）
```

## ファイル構成

| ファイル | 役割 |
|---|---|
| `scripts/gas.gs` | 本番用（絶対触らない）🔒 |
| `scripts/gas_v2.gs` | v2開発用（コピースプシ向け）🚧 |
| `scripts/app.html` | モバイルアプリUI |
| `scripts/map_dashboard.html` | 戦況マップUI（管理者用） |

## gas_v2.gs の doGet()

```javascript
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('app')
    .setTitle('ポスティングアプリ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
}

function getBranchName() {
  return SpreadsheetApp.getActiveSpreadsheet().getName().split(/[ 　]/)[0] || "支部";
}
```

## app.html の構造

- **固定ヘッダー**：支部名・進捗率
- **縦スクロールコンテンツ**（横スクロールなし）
- **固定ボトムナビ**：3タブ（ガイド・エリア・進捗）

### タブ構成
1. 📋 **ガイド** - 6ステップの使い方説明（カード形式）
2. 📍 **エリア** - エリア一覧 + 進捗バー（`getMapData()` から取得）
3. 📊 **進捗** - KPIカード + スタッフランキング

## デプロイ手順（コピースプシ側）

1. GASエディタを開く
2. `gas_v2.gs` の内容を貼り付け
3. 「app」という名前でHTMLファイルを新規作成 → `app.html` を貼り付け
4. 「デプロイ」→「新しいデプロイ」→ ウェブアプリ
5. 実行ユーザー：自分、アクセス：自分のみ（テスト）
6. URLを発行 → LINEなどでスマホに送ってテスト

## 現在の状態（2026-05-03時点）

- ✅ app.html が正常にスマホで表示される
- ✅ ヘッダー・ウェルカム画面・ガイドタブ が動作
- ✅ getMapData() が summary を正しく返す
- ✅ 縦スクロールのみ（横スクロールなし）
- 🚧 エリアタブ：データ連携は基本実装済み（デザイン未完成）
- 🚧 完了チェック・枚数入力のHTML操作は未実装
- 🚧 本番スプシへの適用は未実施

## 次回の作業

- app.html のエリアタブを完成させる
- 完了チェック・枚数入力・担当選択をHTML上で操作できるようにする
- デザインを磨いてアプリ感を高める
- テスト完了後、本番スプシに適用
