# home — おうちアプリ 開発ルール

このリポジトリは家族用Webアプリ群（静的HTML + Supabase）。公開は GitHub Pages（https://amenowa.github.io/home/）。

## 構成
- 1フォルダ = 1アプリ（例: `mission/index.html`）。単一HTMLで完結させる
- データ・認証は Supabase（project: ffzdcylxcvinwydggfgt, Tokyo）。anon key は公開前提、service_role は使わない
- テーブル定義は `supabase/schema.sql` に追記し、RLS を必ず有効化する

## 設計原則（複数端末・複数ユーザー前提）
1. クラウドが正。端末内保存はキャッシュ扱い
2. 未使用（初期状態）の端末はクラウドを上書きしない
3. 端末間で時計を比較しない。更新の印（stamp）で判定し、未保存の変更がある間は受信を適用しない
4. 両側に本物の履歴があって食い違う場合だけ、ユーザーに選ばせる
5. 家族=1アカウント（当面）。将来は「家＋メンバー」設計へ

## 変更時のルール
- `mission/index.html` を変えたら `qa/run.js` を全件パスさせてから push（`NODE_PATH=$(npm root -g) node qa/run.js`）
- 画面下のバージョン表記（vNN）を必ず上げる
- 文字列置換で編集したら、対象が実際に置換されたことを grep で確認する（置換漏れで本番が壊れた前例あり）
- 大きなブロックを置き換えるときは、消える範囲に必要な関数が含まれていないか先に確認する
- GitHub Pages は約10分キャッシュされる。反映確認は `?r=N` 付きURLか vNN 表示で行う

## 運用メモ
- Supabase Auth: Site URL を `https://amenowa.github.io/home/mission/` にする（確認メールの戻り先）
- 親画面の暗証番号は初期 1234。クラウド保存されるので全端末共通
- iOS: ホーム画面追加版とSafari版は別ストレージ。ログインは端末ごとに1回必要
