// 出題順を決める。
// 1. 最後に間違えた問題（復習）… 間違えたのが古い順
// 2. まだ解いていない問題 … 登録順
// 3. 最後に正解した問題 … 最後に解いたのが古い順
// 復習状態は保存せず、毎回の回答ログから求める（ログと食い違うことがない）。

import type { Attempt, Question } from './types'

export interface ReviewState {
  lastAnsweredAt: string
  lastCorrect: boolean
  attempts: number
  wrongCount: number
}

export function reviewStates(attempts: Attempt[]): Map<string, ReviewState> {
  const states = new Map<string, ReviewState>()
  const sorted = [...attempts].sort((a, b) => a.answeredAt.localeCompare(b.answeredAt))
  for (const a of sorted) {
    const prev = states.get(a.questionId)
    states.set(a.questionId, {
      lastAnsweredAt: a.answeredAt,
      lastCorrect: a.correct,
      attempts: (prev?.attempts ?? 0) + 1,
      wrongCount: (prev?.wrongCount ?? 0) + (a.correct ? 0 : 1),
    })
  }
  return states
}

export interface QueueFilter {
  materialId?: string
  tag?: string
}

export function buildQueue(
  questions: Question[],
  attempts: Attempt[],
  filter: QueueFilter = {},
  exclude: Set<string> = new Set(), // このセッションですでに出した問題
): Question[] {
  const states = reviewStates(attempts)
  const candidates = questions.filter(
    (q) =>
      !q.deletedAt &&
      !exclude.has(q.id) &&
      (!filter.materialId || q.materialId === filter.materialId) &&
      (!filter.tag || q.tags.includes(filter.tag)),
  )

  const group = (q: Question) => {
    const s = states.get(q.id)
    if (!s) return 1 // 未出題
    return s.lastCorrect ? 2 : 0 // 間違い → 0、正解 → 2
  }

  return candidates.sort((a, b) => {
    const ga = group(a)
    const gb = group(b)
    if (ga !== gb) return ga - gb
    if (ga === 1) return a.createdAt.localeCompare(b.createdAt) || a.label.localeCompare(b.label, 'ja', { numeric: true })
    return states.get(a.id)!.lastAnsweredAt.localeCompare(states.get(b.id)!.lastAnsweredAt)
  })
}
