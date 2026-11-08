import { describe, expect, it } from 'vitest'
import { extractJson, fingerprint, parseImport } from './importFormat'

const sample = {
  format: 'study-log/v1',
  material: { title: '○○検定 2024年度', year: 2024 },
  questions: [
    {
      label: '問1',
      body: '正しいものはどれか。',
      type: 'choice',
      choices: [
        { key: 'ア', text: 'A' },
        { key: 'イ', text: 'B' },
      ],
      answer: 'イ',
      tags: ['第1章'],
    },
    { label: '問2', body: '$x^2=9$ の正の解は？', type: 'numeric', answer: 3 },
  ],
}

describe('parseImport（取り込み形式の検証）', () => {
  it('正しい JSON を読み込める', () => {
    const r = parseImport(JSON.stringify(sample))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.material).toEqual({ title: '○○検定 2024年度', year: 2024 })
    expect(r.data.questions).toHaveLength(2)
    expect(r.data.questions[1]).toMatchObject({ type: 'numeric', answer: '3', tags: [] })
  })

  it('AI の返答にありがちな前置きやコードブロックを取り除く', () => {
    const text = 'はい、作りました。\n```json\n' + JSON.stringify(sample) + '\n```\nほかに必要ですか？'
    expect(parseImport(text).ok).toBe(true)
    expect(extractJson('結果: {"a":1} です')).toBe('{"a":1}')
  })

  it('問題の配列だけでも受け付ける', () => {
    const r = parseImport(JSON.stringify(sample.questions))
    expect(r.ok && r.data.questions.length).toBe(2)
  })

  it('誤りは何問目の何が悪いかを日本語で返す', () => {
    const bad = {
      questions: [
        { body: '', answer: 'ア', type: 'choice', choices: [{ key: 'ア', text: '' }] },
        { body: 'Q', answer: 'ウ', type: 'choice', choices: ['x', 'y'] },
        { body: 'Q', answer: 'A', type: 'essay' },
      ],
    }
    const r = parseImport(JSON.stringify(bad))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors).toContain('1問目：問題文（body）がありません')
    expect(r.errors).toContain('1問目：選択式なのに選択肢（choices）が2つ以上ありません')
    expect(r.errors).toContain('2問目：解答「ウ」が選択肢の記号にありません')
    expect(r.errors.some((e) => e.startsWith('3問目：type は'))).toBe(true)
  })

  it('JSON でなければその旨を返す', () => {
    const r = parseImport('問題を作れませんでした')
    expect(r.ok).toBe(false)
  })
})

describe('fingerprint（重複検知）', () => {
  it('空白や全角半角の違いだけなら同じ指紋になる', async () => {
    const a = await fingerprint('教材', 'x = 1 のとき', '２')
    const b = await fingerprint('教材', 'x=1のとき', '2')
    expect(a).toBe(b)
  })

  it('教材や解答が違えば別の指紋になる', async () => {
    const a = await fingerprint('教材A', '問題', '1')
    expect(await fingerprint('教材B', '問題', '1')).not.toBe(a)
    expect(await fingerprint('教材A', '問題', '2')).not.toBe(a)
  })
})
