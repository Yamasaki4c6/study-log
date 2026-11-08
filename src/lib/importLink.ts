// 「タップするだけで取り込み画面が開くリンク」の読み書き。
// 問題 JSON を圧縮（deflate）して URL に入れられる文字（base64url）にし、
// https://…/study-log/#/import?d=<ここ> の形にする。
// データは「#」より後ろに入るので、ブラウザからサーバー（GitHub）には送られない。
// リンクを作る側のスクリプトは scripts/make-import-link.mjs（同じ形式で作る）。

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export async function encodeImportData(text: string): Promise<string> {
  return toBase64Url(await pipe(new TextEncoder().encode(text), new CompressionStream('deflate-raw')))
}

export async function decodeImportData(encoded: string): Promise<string> {
  return new TextDecoder().decode(await pipe(fromBase64Url(encoded), new DecompressionStream('deflate-raw')))
}
