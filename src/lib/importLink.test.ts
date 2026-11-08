import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeImportData, encodeImportData } from './importLink'

const sample = JSON.stringify({
  format: 'study-log/v1',
  questions: [{ label: '問1', body: '$\\frac{1}{2}$ を小数で', type: 'numeric', answer: '0.5' }],
})

describe('取り込みリンク', () => {
  it('圧縮して URL 用の文字にし、元に戻せる（日本語・記号も）', async () => {
    const encoded = await encodeImportData(sample)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(await decodeImportData(encoded)).toBe(sample)
  })

  it('スクリプトで作ったリンクをアプリ側で読める', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'link-'))
    const file = join(dir, 'q.json')
    writeFileSync(file, sample)
    const link = execFileSync('node', ['scripts/make-import-link.mjs', file], { encoding: 'utf8' }).trim()
    expect(link.startsWith('https://yamasaki4c6.github.io/study-log/#/import?d=')).toBe(true)
    const encoded = new URL(link.replace('#/import', '')).searchParams.get('d')!
    expect(JSON.parse(await decodeImportData(encoded))).toEqual(JSON.parse(sample))
  })
})
