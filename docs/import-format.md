# 取り込み形式 study-log/v1

既存の AI に問題を作ってもらい、その JSON をアプリに貼り付けて取り込む。AI に渡す指示文は `src/prompts/question-generation.md`（アプリの「取り込み」画面でコピーできる）。

```json
{
  "format": "study-log/v1",
  "material": { "title": "○○検定 2024年度", "year": 2024 },
  "questions": [
    {
      "label": "問1",
      "body": "問題文。数式は $x^2$",
      "type": "choice",
      "choices": [{ "key": "ア", "text": "..." }, { "key": "イ", "text": "..." }],
      "answer": "イ",
      "explanation": "要点（2〜3行）\n\n詳しい解説",
      "tags": ["第3章"],
      "source": "出典や参照 URL"
    }
  ]
}
```

| 項目 | 必須 | 説明 |
|---|---|---|
| material.title | 任意 | 教材名。既存の教材と同じ名前なら、その教材に追加される |
| questions[].body | 必須 | 問題文。`$...$` / `$$...$$` で LaTeX |
| questions[].type | 任意 | `choice`（自動判定）/ `numeric`（自動判定）/ `text`（自己判定）。省略時は `text` |
| questions[].choices | choice で必須 | 2つ以上。文字列の配列でもよい（key は 1, 2, … になる） |
| questions[].answer | 必須 | choice は key、numeric は数値、text は模範解答 |
| questions[].tolerance | 任意 | numeric の許容誤差 |
| questions[].explanation | 任意 | 最初の段落が要点、空行のあとが「詳しい解説」 |
| questions[].label / tags / source | 任意 | 番号・タグ・出典 |

- 前置きの文章や ```json のコードブロックが付いていても、JSON 部分だけを取り出す。
- 問題の配列だけを貼っても受け付ける。
- 重複検知：教材名＋問題文＋解答を正規化（全角半角・空白を無視）して SHA-256 にした指紋で判定する。登録済みはスキップか上書きを選べる。

## タップで取り込めるリンク
`node scripts/make-import-link.mjs 問題.json` で、`https://yamasaki4c6.github.io/study-log/#/import?d=…` 形式のリンクを作れる。
タップすると取り込み画面が中身入りで開き、「取り込む」を押すだけで登録できる。

- `d` は JSON を deflate-raw で圧縮して base64url にしたもの（アプリ側は src/lib/importLink.ts で戻す）
- データは「#」より後ろにあるので、GitHub のサーバーには送られない
- 数十問程度なら問題なく開ける長さに収まる（5問で約1.4KB）
