// 設定：日の切り替え時刻、バックアップ（書き出し・読み込み）、回答記録の書き出し。

import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { attemptsToCsv, downloadText, exportBackup, importBackup } from '../lib/backup'
import { db, saveSettings } from '../lib/db'
import { learningDay } from '../lib/day'
import { useSettings } from '../lib/hooks'

export function Settings() {
  const settings = useSettings()
  const [message, setMessage] = useState<string>()
  const persisted = useLiveQuery(async () => (navigator.storage?.persisted ? navigator.storage.persisted() : false), [])
  const counts = useLiveQuery(async () => ({
    questions: (await db.questions.toArray()).filter((q) => !q.deletedAt).length,
    attempts: await db.attempts.count(),
  }))

  const today = learningDay(new Date(), settings)

  const backup = async () => {
    const b = await exportBackup()
    downloadText(`study-log-backup-${today}.studylog.json`, JSON.stringify(b))
    setMessage('バックアップを書き出しました。Googleドライブなどに保存しておくと安心です。')
  }

  const restore = async (file: File | undefined) => {
    if (!file) return
    try {
      const r = await importBackup(await file.text())
      setMessage(`読み込みました：問題 ${r.questions}件、回答記録 ${r.attempts}件、画像 ${r.images}件を追加・更新`)
    } catch (e) {
      setMessage(`読み込めませんでした：${(e as Error).message}`)
    }
  }

  const exportCsv = async () => {
    const [attempts, questions, materials] = await Promise.all([
      db.attempts.toArray(),
      db.questions.toArray(),
      db.materials.toArray(),
    ])
    // Excel で文字化けしないように先頭に BOM を付ける
    downloadText(`study-log-attempts-${today}.csv`, '﻿' + attemptsToCsv(attempts, questions, materials, settings), 'text/csv')
  }

  return (
    <div className="page settings">
      <section className="card">
        <h2>日の切り替え</h2>
        <label>
          この時刻で日付が変わる（日本時間）
          <select
            value={settings.dayStartHour}
            onChange={(e) => saveSettings({ ...settings, dayStartHour: Number(e.target.value) })}
          >
            {Array.from({ length: 12 }, (_, h) => (
              <option key={h} value={h}>
                午前{h}時
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">変更すると、過去の記録もこの時刻で数え直します。</p>
      </section>

      <section className="card">
        <h2>バックアップ・端末間の同期</h2>
        <p className="muted small">
          データはこのブラウザの中だけに保存されています（問題 {counts?.questions ?? 0}問、回答記録 {counts?.attempts ?? 0}件）。
          {persisted ? '消えにくい保存（永続ストレージ）が有効です。' : '永続ストレージが有効になっていません。こまめにバックアップしてください。'}
        </p>
        <button onClick={backup}>バックアップを書き出す</button>
        <label className="file-label">
          バックアップを読み込む（合体）
          <input type="file" accept=".json,application/json" onChange={(e) => restore(e.target.files?.[0])} />
        </label>
        <p className="muted small">
          読み込みは上書きではなく合体です。スマホで書き出したファイルを PC で読み込めば、両方の記録が1つになります。
        </p>
      </section>

      <section className="card">
        <h2>回答記録の書き出し</h2>
        <p className="muted small">CSV を Claude や Muse に渡すと、苦手分野の分析や似た問題の作成を頼めます。</p>
        <button onClick={exportCsv}>CSV を書き出す</button>
      </section>

      {message && <p className="success">{message}</p>}
    </div>
  )
}
