// ストリーク（連続学習日数）の計算。
// カウンタを保存して増減するのではなく、毎回「回答ログ」から計算し直す。
// こうしておけば、問題を削除しても、日の切り替え時刻を変えても、記録が食い違わない。

import { addDays, learningDay, type DayKey, type DaySettings } from './day'

export type StreakStatus =
  | 'done_today' // 今日すでに1問以上解いた
  | 'pending_today' // 昨日までは続いている（今日はまだ）
  | 'broken' // 途切れている
  | 'none' // まだ一度も解いていない

export interface StreakSummary {
  current: number // 現在の連続日数
  longest: number // 最長記録
  status: StreakStatus
  today: DayKey
  todayCount: number // 今日の回答数
  countsByDay: Map<DayKey, number> // ヒートマップ用：学習日ごとの回答数
}

/** 回答時刻（UTC の ISO 文字列）の一覧から、ストリークを計算する */
export function summarizeStreak(
  answeredAts: string[],
  now: Date,
  settings: DaySettings,
): StreakSummary {
  // 1. 各回答を学習日に変換して、日ごとの回答数を数える
  const countsByDay = new Map<DayKey, number>()
  for (const at of answeredAts) {
    const day = learningDay(at, settings)
    countsByDay.set(day, (countsByDay.get(day) ?? 0) + 1)
  }

  const today = learningDay(now, settings)
  const todayCount = countsByDay.get(today) ?? 0

  // 2. 現在の連続日数：今日（なければ昨日）から1日ずつさかのぼって数える
  let status: StreakStatus
  let start: DayKey | null
  if (todayCount > 0) {
    status = 'done_today'
    start = today
  } else if (countsByDay.has(addDays(today, -1))) {
    status = 'pending_today'
    start = addDays(today, -1)
  } else {
    status = countsByDay.size === 0 ? 'none' : 'broken'
    start = null
  }

  let current = 0
  if (start) {
    let day = start
    while (countsByDay.has(day)) {
      current++
      day = addDays(day, -1)
    }
  }

  // 3. 最長記録：学習日を並べて、連続している区間の最大の長さを探す
  const days = [...countsByDay.keys()].sort()
  let longest = 0
  let run = 0
  let prev: DayKey | null = null
  for (const day of days) {
    run = prev !== null && addDays(prev, 1) === day ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = day
  }

  return { current, longest, status, today, todayCount, countsByDay }
}
