// 取り込み画面：AI が作った問題 JSON を貼り付けて（または共有メニューから受け取って）取り込む。

import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { MathText } from '../components/MathText'
import { parseImport, type ImportData } from '../lib/importFormat'
import { decodeImportData } from '../lib/importLink'
import { activeMaterials, importQuestions, previewImport, type ImportPreviewItem } from '../lib/store'
import promptTemplate from '../prompts/question-generation.md?raw'

const NEW = '__new__'

export function Import() {
  const location = useLocation()
  const shared = (location.state as { sharedText?: string } | null)?.sharedText
  const [text, setText] = useState(shared ?? '')
  const [materialId, setMaterialId] = useState(NEW)
  const [newTitle, setNewTitle] = useState('')
  const [preview, setPreview] = useState<ImportPreviewItem[]>()
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [result, setResult] = useState<string>()
  const [copied, setCopied] = useState(false)
  const materials = useLiveQuery(activeMaterials, [])

  useEffect(() => {
    if (shared) setText(shared)
  }, [shared])

  // 「タップで取り込めるリンク」（#/import?d=...）で開かれたら、中身を貼り付け欄に入れる
  const [params, setParams] = useSearchParams()
  const linkData = params.get('d')
  useEffect(() => {
    if (!linkData) return
    decodeImportData(linkData)
      .then((t) => setText(t))
      .catch(() => setText(''))
      .finally(() => setParams({}, { replace: true }))
  }, [linkData, setParams])

  const parsed = useMemo(() => (text.trim() ? parseImport(text) : null), [text])
  const data: ImportData | null = parsed?.ok ? parsed.data : null

  // JSON に教材名があれば、既存の教材と一致するか見て、なければ新規作成の欄に入れる
  useEffect(() => {
    if (!data?.material || !materials) return
    const match = materials.find((m) => m.title === data.material!.title)
    if (match) setMaterialId(match.id)
    else {
      setMaterialId(NEW)
      setNewTitle(data.material.title)
    }
  }, [data, materials])

  const materialTitle = materialId === NEW ? newTitle.trim() : materials?.find((m) => m.id === materialId)?.title

  // 重複チェック
  useEffect(() => {
    setPreview(undefined)
    if (!data || !materialTitle) return
    let cancelled = false
    void previewImport(data, { title: materialTitle }).then((p) => !cancelled && setPreview(p))
    return () => {
      cancelled = true
    }
  }, [data, materialTitle])

  const duplicates = preview?.filter((p) => p.duplicateOf).length ?? 0

  const run = async () => {
    if (!data || !materialTitle) return
    const r = await importQuestions(
      data,
      materialId === NEW ? { newTitle: materialTitle, year: data.material?.year } : { materialId },
      skipDuplicates,
    )
    setResult(`${r.added}問を追加しました` + (r.updated ? `、${r.updated}問を上書きしました` : '') + (r.skipped ? `（${r.skipped}問は登録済みのためスキップ）` : ''))
    setText('')
  }

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(promptTemplate)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="page import">
      <section className="card">
        <h2>1. AI に問題を作ってもらう</h2>
        <p className="muted">
          下の指示文をコピーして、Claude や Muse に素材（問題文・解答・写真など）と一緒に渡してください。返ってきた JSON を下に貼り付けます。
        </p>
        <button onClick={copyPrompt}>{copied ? 'コピーしました' : '指示文をコピー'}</button>
        <details>
          <summary>指示文の中身を見る</summary>
          <pre className="prompt">{promptTemplate}</pre>
        </details>
      </section>

      <section className="card">
        <h2>2. 結果を貼り付ける</h2>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setResult(undefined)
          }}
          rows={8}
          placeholder='{"format": "study-log/v1", "questions": [...]}'
        />
        <label className="file-label">
          ファイルから読み込む
          <input type="file" accept=".json,application/json,text/plain" onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) setText(await f.text())
          }} />
        </label>
        {parsed && !parsed.ok && (
          <ul className="errors">
            {parsed.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {result && (
          <p className="success">
            {result}。<Link to="/quiz">さっそく解く</Link>
          </p>
        )}
      </section>

      {data && (
        <section className="card">
          <h2>3. 確認して取り込む（{data.questions.length}問）</h2>
          <label>
            教材
            <select value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
              <option value={NEW}>新しい教材を作る</option>
              {materials?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
          {materialId === NEW && (
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="教材名（例：○○問題集、2024年度 本試験）" />
          )}
          {duplicates > 0 && (
            <div className="warning">
              {duplicates}問はすでに登録されています。
              <label className="inline">
                <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />
                登録済みの問題はスキップする（外すと上書き）
              </label>
            </div>
          )}
          <ol className="preview-list">
            {data.questions.map((q, i) => (
              <li key={i} className={preview?.[i]?.duplicateOf ? 'dup' : ''}>
                <b>{q.label}</b> <span className="muted">[{typeLabel[q.type]}]</span>
                {preview?.[i]?.duplicateOf && <span className="badge">登録済み</span>}
                <MathText text={q.body.length > 120 ? q.body.slice(0, 120) + '…' : q.body} />
                <div className="muted small">解答：{q.answer}</div>
              </li>
            ))}
          </ol>
          <button className="primary wide" disabled={!materialTitle} onClick={run}>
            取り込む
          </button>
        </section>
      )}

      <p className="muted small">
        図が必要な問題は <Link to="/questions/new">手動で登録</Link> して画像を添付できます。
      </p>
    </div>
  )
}

const typeLabel = { choice: '選択式', numeric: '数値', text: '記述式' } as const
