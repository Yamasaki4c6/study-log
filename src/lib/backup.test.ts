import { describe, expect, it } from 'vitest'
import { mergeById, newAttempts } from './backup'
import type { Attempt } from './types'

describe('バックアップの合体', () => {
  it('同じ id は updatedAt が新しいほうを残し、新しい id は追加する', () => {
    const local = [
      { id: 'a', updatedAt: '2026-11-01', v: 'local' },
      { id: 'b', updatedAt: '2026-11-05', v: 'local' },
    ]
    const incoming = [
      { id: 'a', updatedAt: '2026-11-03', v: 'incoming' },
      { id: 'b', updatedAt: '2026-11-02', v: 'incoming' },
      { id: 'c', updatedAt: '2026-11-01', v: 'incoming' },
    ]
    const { merged, changed } = mergeById(local, incoming)
    expect(Object.fromEntries(merged.map((x) => [x.id, x.v]))).toEqual({ a: 'incoming', b: 'local', c: 'incoming' })
    expect(changed.map((x) => x.id)).toEqual(['a', 'c'])
  })

  it('回答ログは id がまだないものだけ追加する（スマホと PC の記録が合わさる）', () => {
    const a = (id: string): Attempt => ({ id, questionId: 'q', answeredAt: '2026-11-08T00:00:00Z', correct: true, judgedBy: 'self' })
    expect(newAttempts([a('1'), a('2')], [a('2'), a('3')]).map((x) => x.id)).toEqual(['3'])
  })
})
