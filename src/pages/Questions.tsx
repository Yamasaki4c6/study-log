// 問題一覧：検索・教材で絞り込み、編集・削除への入口。

import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../lib/db'
import { reviewStates } from '../lib/queue'
import { activeMaterials, activeQuestions } from '../lib/store'

export function Questions() {
  const [materialId, setMaterialId] = useState('')
  const [query, setQuery] = useState('')
  const materials = useLiveQuery(activeMaterials, [])
  const questions = useLiveQuery(activeQuestions, [])
  const states = useLiveQuery(async () => reviewStates(await db.attempts.toArray()), [])

  const q = query.trim().toLowerCase()
  const list = (questions ?? [])
    .filter((x) => !materialId || x.materialId === materialId)
    .filter((x) => !q || [x.label, x.body, x.answer, ...x.tags].some((s) => s.toLowerCase().includes(q)))
    .sort((a, b) => a.materialId.localeCompare(b.materialId) || a.label.localeCompare(b.label, 'ja', { numeric: true }))
  const titleOf = new Map(materials?.map((m) => [m.id, m.title]))

  return (
    <div className="page questions">
      <div className="filters">
        <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} aria-label="教材で絞り込み">
          <option value="">すべての教材</option>
          {materials?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </select>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="検索" />
      </div>
      <Link to="/questions/new" className="button">
        ＋ 手動で問題を登録
      </Link>
      <p className="muted">{list.length}問</p>
      <ul className="question-list">
        {list.map((x) => {
          const s = states?.get(x.id)
          return (
            <li key={x.id}>
              <Link to={`/questions/${x.id}`}>
                <div className="row-between">
                  <b>{x.label}</b>
                  <span className={`mark ${s ? (s.lastCorrect ? 'good' : 'bad') : ''}`}>
                    {s ? `${s.lastCorrect ? '○' : '×'} ${s.attempts}回` : '未出題'}
                  </span>
                </div>
                <div className="muted small">{titleOf.get(x.materialId)}</div>
                <div className="ellipsis">{x.body}</div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
