# study-log（学習記録アプリ）

Duolingo / 過去問道場を参考にした、自分専用の学習記録 PWA。「毎日1問でいい」「投げ込むだけ」の手軽さを最優先する。

## 前提（2026-11-08 決定）
- **Claude API などの AI API は使わない**（費用ゼロ）。問題づくり・リマインドは既存の AI（Claude のチャット、Meta の Muse）に任せ、アプリは AI が出した JSON を取り込むだけ。
- **GitHub Pages の静的サイト**。サーバーなし。データはブラウザ内（IndexedDB）にだけ保存する。
- 問題と回答記録は非公開リポジトリ `Yamasaki4c6/study-log-data` で同期する（docs/sync.md）。ユーザーが参考書の写真を送ったら、Claude が `questions/*.json`（固定 id つき）をそこへ追加する。アプリが自動で取り込む。
- 予備の手段：タップで取り込めるリンク、バックアップの書き出し・読み込み（合体）。
- リポジトリは Public。**教材・問題・回答記録をリポジトリにコミットしない**（著作権・プライバシー）。

## 用語
- 解答＝正解・模範解答 / 回答＝自分が答えたもの
- 学習日＝回答を1つでも送信した日。Asia/Tokyo 基準、午前4時切り替え（設定で変更可）

## ルール
- 時刻は UTC の ISO 文字列で保存。ストリークは回答ログ（attempts）から毎回計算し、カウンタを持たない。
- 問題・教材の削除は論理削除（deletedAt）。回答ログは削除しない。
- 復習状態も保存せず回答ログから求める（src/lib/queue.ts）。
- AI に渡す指示文はコードと分けて src/prompts/ に置く。取り込み形式は docs/import-format.md。
- Dexie のトランザクション内で DB 以外の非同期処理（crypto, fetch）を await しない（トランザクションが自動で閉じる）。先に計算してから入る。
- ユーザーは Python 基礎レベル。コードには要点を日本語コメントで書き、説明しながら進める。
- 各フェーズの最初に「やること・データ構造・画面・ファイル構成」を提案して承認を得てから実装する。
- 決定事項は docs/decisions.md に日付つきで追記する。

## コマンド
- `npm run dev` 開発サーバー（http://localhost:5173/study-log/）
- `npm test` テスト（Vitest）
- `npm run build` 型チェック＋ビルド（dist/）
- `node scripts/make-import-link.mjs 問題.json` タップで取り込めるリンクを作る

## 構成
- src/lib/ … ロジック（day / streak / queue / judge / importFormat / importLink / backup / store / db / sync / githubClient）。テストは *.test.ts
- src/pages/ … 画面（Home / Quiz / Import / Questions / QuestionEdit / Settings）
- src/components/ … MathText（KaTeX）/ Heatmap / QuestionImages
- src/prompts/question-generation.md … AI に問題を作らせる指示文（アプリ内でコピーできる）
