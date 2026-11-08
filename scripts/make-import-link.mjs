// 問題 JSON ファイルから「タップで取り込めるリンク」を作る。
// 使い方: node scripts/make-import-link.mjs 問題.json
// 形式は src/lib/importLink.ts と同じ（deflate-raw で圧縮 → base64url）。

import { readFileSync } from 'node:fs'
import { deflateRawSync } from 'node:zlib'

const BASE = 'https://yamasaki4c6.github.io/study-log/'

const file = process.argv[2]
if (!file) {
  console.error('使い方: node scripts/make-import-link.mjs 問題.json')
  process.exit(1)
}
// 改行や空白を詰めてから圧縮すると、リンクが短くなる
const json = JSON.stringify(JSON.parse(readFileSync(file, 'utf8')))
const encoded = deflateRawSync(Buffer.from(json, 'utf8'), { level: 9 }).toString('base64url')
console.log(`${BASE}#/import?d=${encoded}`)
