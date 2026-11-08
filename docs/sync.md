# GitHub 同期（study-log-data）

問題と回答記録を、非公開リポジトリ `Yamasaki4c6/study-log-data` を通してスマホと PC でそろえる。サーバーは使わず、ブラウザから GitHub の REST API を直接呼ぶ。

## リポジトリの中身
```
study-log-data/
├── questions/*.json                       … Claude が追加する問題ファイル（study-log/v1、各問題に固定 id）
└── devices/<端末ID>/
    ├── attempts-YYYY-MM.json              … その端末の回答記録（UTC の月ごと、1行1件）
    └── edits.json                         … その端末で手動登録・編集・削除・貼り付け取り込みした問題と教材
```

## 同期の手順（src/lib/sync.ts の syncOnce）
1. `git/trees/<default branch>?recursive=1` でファイル一覧と sha を取る
2. 前回から sha が変わったファイルだけ `git/blobs/<sha>` で読む
   - questions/ … 取り込む（id で照合。手で編集した問題＝editedAt ありは上書きしない）
   - attempts … id で和集合（回答記録は書き換えないので足すだけ）
   - edits.json … 手で編集した問題を優先し、両方編集済みなら updatedAt が新しいほう
3. この端末のファイルを作り、前回送った内容と違うものだけ `contents/<path>` に PUT
4. 書き込みが衝突したら（409/422）一覧から読み直して1回だけやり直す

- 端末ごとに別ファイルへ書くので、端末どうしの書き込みは衝突しない
- 同期のきっかけ：起動時、画面に戻ったとき、ネットにつながったとき、回答・編集の3秒後、設定画面のボタン
- 教材 ID は教材名の SHA-256 から作る（どの端末でも同じ）
- 手で添付した画像は同期しない（バックアップで移す）

## トークン
- Fine-grained personal access token。対象は `study-log-data` だけ、権限は Contents: Read and write
- 端末ごとに設定画面で貼る。IndexedDB にだけ保存し、どこにも送らない（GitHub API への Authorization ヘッダーを除く）
- 401/403 は「トークンが無効・期限切れ・権限不足」としてホームと設定画面に表示する

## Claude が問題を追加するとき
- `questions/YYYY-MM-DD-<教材名>.json` に study-log/v1 形式で置く
- 各問題に固定 id を付ける（例：`<教材の略称>-<章>-<番号>`）。同じ問題の id は変えない
- 同じファイルを直したときは、同じ id のまま中身を書き換える（端末で手編集した問題は上書きされない）
