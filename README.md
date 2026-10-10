# home — おうちアプリ

家族用のWebアプリ置き場。各アプリは1フォルダ＝1アプリ（静的HTML）。

- `mission/` — 子ども用ミッション＆ポイントアプリ
- `index.html` — アプリ一覧（トップページ）

公開: GitHub Pages（Settings → Pages → Branch: main / root）

## 変更時のルール
- `mission/index.html` を変えたら `qa/run.js` を全件パスさせてから push
- 画面下のバージョン表記（vNN）を上げる
