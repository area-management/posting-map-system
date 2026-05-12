# セキュリティ・API管理スキル

## 概要
Google Maps APIなどの機密性の高い認証情報を安全に管理し、外部漏洩を防止するための運用ルール。

## APIキーの保管場所
- **保管先**: Google Apps Script の「スクリプトプロパティ」
- **プロパティ名**: `GOOGLE_MAPS_API_KEY`
- **利点**:
  - コード（GAS/HTML）を共有・公開してもキーが露出しない。
  - プログラム実行時にのみメモリ上に読み込まれる。

## 使用ルール（厳守事項）
1. **直接記述の禁止**: 
   - `.gs` ファイルや `.html` ファイルにAPIキーを直接書き込まない。
2. **テンプレート方式の利用**: 
   - `HtmlService.createTemplateFromFile` を使用し、実行時に動的にキーを注入する。
3. **アクセスログの記録**: 
   - APIキーを読み出す際は、必ず `console.log` 等で実行者の情報を記録する。
   - 例: `[SECURITY REPORT] API Key accessed by: user@example.com`

## 実装例
```javascript
function openSecureDashboard() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GOOGLE_MAPS_API_KEY');
  
  // 使用報告（ログ）
  console.log(`[REPORT] API Key used by: ${Session.getActiveUser().getEmail()}`);
  
  const template = HtmlService.createTemplateFromFile('map_dashboard');
  template.apiKey = apiKey;
  return template.evaluate();
}
```

## 漏洩時の対応
- 万が一キーが露出した疑いがある場合は、直ちに Google Cloud Console でキーを無効化し、新しいキーを再発行してスクリプトプロパティを更新すること。
