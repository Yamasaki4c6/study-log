// 出題画面：1問ずつ出題 → 回答 → すぐ正誤 → 解説、のテンポで進む。
// 選択式・数値は自動判定、記述式は「答えを見て自分で○×」。どの形式でも自己判定を選べる。

import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MathText } from '../components/MathText'
import { QuestionImages } from '../components/QuestionImages'
import { db } from '../lib/db'
import { autoJudge } from '../lib/judge'
import { buildQueue } from '../lib/queue'
import { recordAttempt } from '../lib/store'
import { requestSync } from '../lib/sync'
import type { Question } from '../lib/types'

type Phase = { step: 'answering' } | { step: 'revealed'; result: boolean | null; response: string }

export function Quiz() {
  const [params, setParams] = useSearchParams()
  const materialId = params.get('material') ?? ''
  const tag = params.get('tag') ?? ''
  const [seen, setSeen] = useState<Set<string>>(new Set())
  const [current, setCurrent] = useState<Question | null>(null)
  const [done, setDone] = useState(0)

  const materials = useLiveQuery(async () => (await db.materials.toArray()).filter((m) => !m.deletedAt), [])
  const tags = useLiveQuery(async () => {
    const qs = (await db.questions.toArray()).filter((q) => !q.deletedAt)
    return [...new Set(qs.flatMap((q) => q.tags))].sort()
  }, [])

  // 次に出す問題を決める（このセッションで出した問題は除く）
  const pickNext = async (exclude: Set<string>) => {
    const [questions, attempts] = await Promise.all([db.questions.toArray(), db.attempts.toArray()])
    const queue = buildQueue(questions, attempts, { materialId: materialId || undefined, tag: tag || undefined }, exclude)
    setCurrent(queue[0] ?? null)
  }

  useEffect(() => {
    const fresh = new Set<string>()
    setSeen(fresh)
    void pickNext(fresh)
  }, [materialId, tag])

  const next = () => {
    if (!current) return
    const s = new Set(seen).add(current.id)
    setSeen(s)
    setDone((n) => n + 1)
    void pickNext(s)
  }

  const setFilter = (key: string, value: string) => {
    const p = new URLSearchParams(params)
    if (value) p.set(key, value)
    else p.delete(key)
    setParams(p, { replace: true })
  }

  return (
    <div className="page quiz">
      <div className="filters">
        <select value={materialId} onChange={(e) => setFilter('material', e.target.value)} aria-label="教材で絞り込み">
          <option value="">すべての教材</option>
          {materials?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </select>
        <select value={tag} onChange={(e) => setFilter('tag', e.target.value)} aria-label="タグで絞り込み">
          <option value="">すべてのタグ</option>
          {tags?.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {done > 0 && <p className="muted">このセッションで {done} 問解きました</p>}

      {current ? (
        <QuestionCard key={current.id} question={current} onNext={next} />
      ) : (
        <div className="card center">
          <p>{done > 0 ? 'この条件の問題はすべて解きました！' : '出題できる問題がありません。'}</p>
          <Link to="/" className="button">
            ホームへ
          </Link>
        </div>
      )}
    </div>
  )
}

function QuestionCard({ question: q, onNext }: { question: Question; onNext: () => void }) {
  const [phase, setPhase] = useState<Phase>({ step: 'answering' })
  const [response, setResponse] = useState('')
  const [showDetail, setShowDetail] = useState(false)
  const material = useLiveQuery(() => db.materials.get(q.materialId), [q.materialId])

  const submit = async (value: string) => {
    const result = autoJudge(q, value)
    setPhase({ step: 'revealed', result, response: value })
    // 自動判定できたら、その場で回答ログに記録する
    if (result !== null) {
      await recordAttempt(q.id, result, 'auto', value)
      requestSync()
    }
  }

  const selfJudge = async (correct: boolean) => {
    const resp = phase.step === 'revealed' ? phase.response : response
    await recordAttempt(q.id, correct, 'self', resp || undefined)
    requestSync()
    onNext()
  }

  const [summary, detail] = useMemo(() => {
    const text = q.explanation ?? ''
    const i = text.indexOf('\n\n')
    return i < 0 ? [text, ''] : [text.slice(0, i), text.slice(i + 2)]
  }, [q.explanation])

  return (
    <article className="card question-card">
      <header className="q-header">
        <span className="q-label">{q.label}</span>
        <span className="muted">{material?.title}</span>
      </header>
      <MathText text={q.body} className="q-body" />
      <QuestionImages questionId={q.id} role="question" />

      {phase.step === 'answering' && (
        <div className="answer-area">
          {q.type === 'choice' && q.choices ? (
            <div className="choices">
              {q.choices.map((c) => (
                <button key={c.key} className="choice" onClick={() => submit(c.key)}>
                  <span className="choice-key">{c.key}</span>
                  <MathText text={c.text} />
                </button>
              ))}
            </div>
          ) : q.type === 'numeric' ? (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault()
                if (response.trim()) void submit(response)
              }}
            >
              <input inputMode="decimal" value={response} onChange={(e) => setResponse(e.target.value)} placeholder="答えを入力" />
              <button className="primary">答える</button>
            </form>
          ) : (
            <textarea value={response} onChange={(e) => setResponse(e.target.value)} placeholder="自分の答え（メモ。空でもOK）" rows={3} />
          )}
          <button className="link-button" onClick={() => setPhase({ step: 'revealed', result: null, response })}>
            {q.type === 'text' ? '答えを見る' : '答えを見て自分で判定する'}
          </button>
        </div>
      )}

      {phase.step === 'revealed' && (
        <div className="reveal">
          {phase.result !== null && (
            <div className={`verdict ${phase.result ? 'correct' : 'incorrect'}`}>
              {phase.result ? '正解！' : `不正解（あなたの答え：${phase.response}）`}
            </div>
          )}
          <div className="answer-box">
            <div className="muted">解答</div>
            <MathText text={q.choices?.find((c) => c.key === q.answer) ? `${q.answer}：${q.choices.find((c) => c.key === q.answer)!.text}` : q.answer} />
            <QuestionImages questionId={q.id} role="answer" />
          </div>
          {summary && (
            <div className="explanation">
              <MathText text={summary} />
              {detail &&
                (showDetail ? (
                  <MathText text={detail} className="detail" />
                ) : (
                  <button className="link-button" onClick={() => setShowDetail(true)}>
                    詳しい解説を見る
                  </button>
                ))}
            </div>
          )}
          {q.source && <p className="muted small">出典：{q.source}</p>}

          {phase.result === null ? (
            <div className="self-judge">
              <button className="good" onClick={() => selfJudge(true)}>
                ○ できた
              </button>
              <button className="bad" onClick={() => selfJudge(false)}>
                × まちがえた
              </button>
            </div>
          ) : (
            <button className="primary wide" onClick={onNext}>
              次の問題へ
            </button>
          )}
        </div>
      )}
    </article>
  )
}
