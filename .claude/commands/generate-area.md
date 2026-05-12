# /generate-area

選挙区に対応する市区町村および町丁目の一覧を生成します。

## 手順
1. ユーザーから「衆議院選挙区」を受け取る。
2. `skills/district-to-city/SKILL.md` を実行し、該当する市区町村リストを取得する。
3. 取得した市区町村リストと `data/postal.csv` を照合する（`skills/filter-address/SKILL.md` のロジックを適用）。
4. 「市区町村＋町丁目」の形式で改行区切りで出力する。
