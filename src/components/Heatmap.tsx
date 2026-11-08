// 学習カレンダー（ヒートマップ）。1マス＝1日で、回答数が多いほど濃くなる。

import type React from 'react'
import { addDays, type DayKey } from '../lib/day'

const WEEKS = 18

export function Heatmap({ counts, today }: { counts: Map<DayKey, number>; today: DayKey }) {
  // 右端の列が今週になるように、開始日（日曜）を決める
  const todayDow = new Date(`${today}T00:00:00Z`).getUTCDay()
  const start = addDays(today, -(WEEKS - 1) * 7 - todayDow)

  const cells: { day: DayKey; count: number; future: boolean }[] = []
  for (let i = 0; i < WEEKS * 7; i++) {
    const day = addDays(start, i)
    cells.push({ day, count: counts.get(day) ?? 0, future: day > today })
  }

  const level = (n: number) => (n === 0 ? 0 : n < 3 ? 1 : n < 6 ? 2 : n < 10 ? 3 : 4)

  return (
    <div
      className="heatmap"
      role="img"
      aria-label={`過去${WEEKS}週間の学習記録`}
      style={{ '--weeks': WEEKS } as React.CSSProperties}
    >
      {cells.map((c) => (
        <div
          key={c.day}
          className={`heat-cell lv${c.future ? 'x' : level(c.count)} ${c.day === today ? 'today' : ''}`}
          title={`${c.day}：${c.count}問`}
        />
      ))}
    </div>
  )
}
