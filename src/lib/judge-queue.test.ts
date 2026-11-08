import { describe, expect, it } from 'vitest'
import { autoJudge, parseNumber } from './judge'
import { buildQueue } from './queue'
import type { Attempt, Question } from './types'

describe('autoJudge（自動判定）', () => {
  it('選択式は全角・半角や前後の空白を無視して比べる', () => {
    expect(autoJudge({ type: 'choice', answer: 'イ' }, ' ｲ ')).toBe(true)
    expect(autoJudge({ type: 'choice', answer: '3' }, '３')).toBe(true)
    expect(autoJudge({ type: 'choice', answer: 'イ' }, 'ア')).toBe(false)
  })

  it('数値は許容誤差つきで比べる', () => {
    expect(autoJudge({ type: 'numeric', answer: '3.14', tolerance: 0.01 }, '3.141')).toBe(true)
    expect(autoJudge({ type: 'numeric', answer: '3.14', tolerance: 0.01 }, '3.2')).toBe(false)
    expect(autoJudge({ type: 'numeric', answer: '1,200' }, '1200')).toBe(true)
    expect(autoJudge({ type: 'numeric', answer: '0.3' }, String(0.1 + 0.2))).toBe(true)
    expect(autoJudge({ type: 'numeric', answer: '5' }, 'わからない')).toBe(false)
  })

  it('記述式や、解答が数値でない数値問題は自己判定に回す', () => {
    expect(autoJudge({ type: 'text', answer: '…' }, '…')).toBeNull()
    expect(autoJudge({ type: 'numeric', answer: '約3' }, '3')).toBeNull()
  })

  it('parseNumber', () => {
    expect(parseNumber('−１２．５')).toBe(-12.5)
    expect(parseNumber('1e3')).toBe(1000)
    expect(parseNumber('abc')).toBeNull()
  })
})

const q = (id: string, createdAt: string, extra: Partial<Question> = {}): Question => ({
  id,
  materialId: 'm1',
  label: id,
  body: '',
  type: 'text',
  answer: '',
  tags: [],
  fingerprint: id,
  createdAt,
  updatedAt: createdAt,
  ...extra,
})
const at = (questionId: string, answeredAt: string, correct: boolean): Attempt => ({
  id: `${questionId}-${answeredAt}`,
  questionId,
  answeredAt,
  correct,
  judgedBy: 'self',
})

describe('buildQueue（出題順）', () => {
  const questions = [
    q('new1', '2026-11-01T00:00:00Z'),
    q('new2', '2026-11-02T00:00:00Z'),
    q('right', '2026-10-01T00:00:00Z'),
    q('wrongOld', '2026-10-01T00:00:00Z'),
    q('wrongNew', '2026-10-01T00:00:00Z'),
    q('deleted', '2026-10-01T00:00:00Z', { deletedAt: '2026-11-03T00:00:00Z' }),
  ]
  const attempts = [
    at('right', '2026-11-05T00:00:00Z', true),
    at('wrongOld', '2026-11-03T00:00:00Z', false),
    at('wrongNew', '2026-11-04T00:00:00Z', false),
    // 一度間違えたあと正解したら「正解済み」に移る
    at('right', '2026-11-01T00:00:00Z', false),
  ]

  it('間違えた問題 → 未出題 → 正解済み、の順。削除した問題は出さない', () => {
    expect(buildQueue(questions, attempts).map((x) => x.id)).toEqual([
      'wrongOld',
      'wrongNew',
      'new1',
      'new2',
      'right',
    ])
  })

  it('このセッションで出した問題は除き、教材・タグで絞り込める', () => {
    const tagged = [...questions, q('other', '2026-11-01T00:00:00Z', { materialId: 'm2', tags: ['確率'] })]
    expect(buildQueue(tagged, attempts, {}, new Set(['wrongOld'])).map((x) => x.id)[0]).toBe('wrongNew')
    expect(buildQueue(tagged, attempts, { materialId: 'm2' }).map((x) => x.id)).toEqual(['other'])
    expect(buildQueue(tagged, attempts, { tag: '確率' }).map((x) => x.id)).toEqual(['other'])
  })
})
