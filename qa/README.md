# QA（複数端末テスト）

`node qa/run.js` で、模擬Supabase（インメモリ）＋複数ブラウザコンテキストを使い、
iPad／iPhone／別家族の端末を同時に動かして全ユースケースを自動検証する。

- 実行: `NODE_PATH=$(npm root -g) node qa/run.js`（playwright が必要）
- 変更をpushする前に必ず全件パスさせること
