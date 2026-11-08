import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { Heatmap } from '../components/Heatmap'
import { db } from '../lib/db'
import { useStreak } from '../lib/hooks'

const STATUS_TEXT = {
  done_today: '今日の分は達成！',
  pending_today: '継続中（今日はまだ）',
  broken: '今日から再スタート',
  none: 'まずは1問解いてみよう',
} as const

export function Home() {
  const streak = useStreak()
  const questionCount = useLiveQuery(async () => (await db.questions.toArray()).filter((q) => !q.deletedAt).length)

  if (!streak) return null
  return (
    <div className="page home">
      <section className={`streak-card ${streak.status}`}>
        <div className="streak-flame" aria-hidden>
          🔥
        </div>
        <div className="streak-number">{streak.current}</div>
        <div className="streak-unit">日連続</div>
        <div className="streak-status">{STATUS_TEXT[streak.status]}</div>
      </section>

      <div className="stats-row">
        <div>
          <b>{streak.todayCount}</b>
          <span>今日の回答</span>
        </div>
        <div>
          <b>{streak.longest}</b>
          <span>最長記録</span>
        </div>
        <div>
          <b>{questionCount ?? 0}</b>
          <span>登録した問題</span>
        </div>
      </div>

      {questionCount === 0 ? (
        <Link to="/import" className="big-button">
          問題を取り込む
        </Link>
      ) : (
        <Link to="/quiz" className="big-button">
          今日の1問
        </Link>
      )}

      <section className="card">
        <h2>学習カレンダー</h2>
        <Heatmap counts={streak.countsByDay} today={streak.today} />
      </section>
    </div>
  )
}
