// 問題の手動登録・編集。画像（写真・スクショ）を問題や解答に添付できる。
// PC ではファイルをドラッグ＆ドロップ、スマホではカメラやギャラリーから選べる。

import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type DragEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { QuestionImages } from '../components/QuestionImages'
import { db } from '../lib/db'
import { activeMaterials, addImage, createMaterial, deleteQuestion, saveQuestion } from '../lib/store'
import type { Choice, QuestionImage, QuestionType } from '../lib/types'

const NEW = '__new__'

interface Form {
  materialId: string
  newMaterial: string
  label: string
  type: QuestionType
  body: string
  choices: string // 1行に1つ「ア 選択肢の文」
  answer: string
  tolerance: string
  explanation: string
  tags: string
  source: string
}

const empty: Form = {
  materialId: NEW,
  newMaterial: '',
  label: '',
  type: 'text',
  body: '',
  choices: '',
  answer: '',
  tolerance: '',
  explanation: '',
  tags: '',
  source: '',
}

function parseChoices(text: string): Choice[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(\S+?)[\s.:：．、)）]+(.*)$/)
      return m ? { key: m[1], text: m[2] } : { key: l, text: '' }
    })
}

export function QuestionEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id || id === 'new'
  const [form, setForm] = useState<Form>(empty)
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const materials = useLiveQuery(activeMaterials, [])

  useEffect(() => {
    if (isNew) {
      setForm((f) => ({ ...empty, materialId: f.materialId }))
      return
    }
    void db.questions.get(id).then((q) => {
      if (!q) return
      setForm({
        materialId: q.materialId,
        newMaterial: '',
        label: q.label,
        type: q.type,
        body: q.body,
        choices: (q.choices ?? []).map((c) => `${c.key} ${c.text}`).join('\n'),
        answer: q.answer,
        tolerance: q.tolerance?.toString() ?? '',
        explanation: q.explanation ?? '',
        tags: q.tags.join(' '),
        source: q.source ?? '',
      })
    })
  }, [id, isNew])

  // 新規のときは、最後に使った教材を初期値にする
  useEffect(() => {
    if (isNew && form.materialId === NEW && materials?.length) setForm((f) => ({ ...f, materialId: materials[0].id }))
  }, [materials])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setSaved(false)
  }

  const save = async () => {
    setError(undefined)
    if (!form.body.trim() && isNew) return setError('問題文を入力してください（画像だけの問題なら「画像を参照」などと書いてください）')
    if (!form.answer.trim()) return setError('解答を入力してください（画像だけなら「画像を参照」でもOK）')
    const choices = form.type === 'choice' ? parseChoices(form.choices) : undefined
    if (choices && choices.length < 2) return setError('選択肢を2つ以上、1行に1つずつ入力してください')
    let materialId = form.materialId
    if (materialId === NEW) {
      if (!form.newMaterial.trim()) return setError('教材名を入力してください')
      materialId = (await createMaterial(form.newMaterial)).id
    }
    const tol = form.tolerance.trim() ? Number(form.tolerance) : undefined
    const q = await saveQuestion({
      id: isNew ? undefined : id,
      materialId,
      label: form.label.trim() || '（番号なし）',
      type: form.type,
      body: form.body.trim(),
      choices,
      answer: form.answer.trim(),
      tolerance: Number.isFinite(tol) ? tol : undefined,
      explanation: form.explanation.trim() || undefined,
      tags: form.tags.split(/[\s,、]+/).filter(Boolean),
      source: form.source.trim() || undefined,
    })
    setSaved(true)
    if (isNew) navigate(`/questions/${q.id}`, { replace: true })
  }

  const remove = async () => {
    if (!id || isNew) return
    // 確認ダイアログの代わりに2度押しで削除する
    if (!confirmDelete) return setConfirmDelete(true)
    await deleteQuestion(id)
    navigate('/questions')
  }

  return (
    <div className="page edit">
      <h2>{isNew ? '問題を登録' : '問題を編集'}</h2>
      <label>
        教材
        <select value={form.materialId} onChange={(e) => set('materialId', e.target.value)}>
          <option value={NEW}>新しい教材を作る</option>
          {materials?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </select>
      </label>
      {form.materialId === NEW && (
        <input value={form.newMaterial} onChange={(e) => set('newMaterial', e.target.value)} placeholder="教材名" />
      )}
      <div className="row">
        <label>
          番号
          <input value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="問1" />
        </label>
        <label>
          形式
          <select value={form.type} onChange={(e) => set('type', e.target.value as QuestionType)}>
            <option value="text">記述式（自分で○×）</option>
            <option value="choice">選択式</option>
            <option value="numeric">数値</option>
          </select>
        </label>
      </div>
      <label>
        問題文（数式は $x^2$ のように書く）
        <textarea rows={5} value={form.body} onChange={(e) => set('body', e.target.value)} />
      </label>
      {form.type === 'choice' && (
        <label>
          選択肢（1行に1つ。「ア 選択肢の文」の形）
          <textarea rows={4} value={form.choices} onChange={(e) => set('choices', e.target.value)} placeholder={'ア りんご\nイ みかん'} />
        </label>
      )}
      <div className="row">
        <label>
          解答{form.type === 'choice' && '（記号）'}
          <input value={form.answer} onChange={(e) => set('answer', e.target.value)} />
        </label>
        {form.type === 'numeric' && (
          <label>
            許容誤差
            <input inputMode="decimal" value={form.tolerance} onChange={(e) => set('tolerance', e.target.value)} placeholder="0.01" />
          </label>
        )}
      </div>
      <label>
        解説（最初の段落が要点、空行のあとが詳しい解説）
        <textarea rows={4} value={form.explanation} onChange={(e) => set('explanation', e.target.value)} />
      </label>
      <label>
        タグ（スペース区切り）
        <input value={form.tags} onChange={(e) => set('tags', e.target.value)} />
      </label>
      <label>
        出典
        <input value={form.source} onChange={(e) => set('source', e.target.value)} />
      </label>

      {error && <p className="errors">{error}</p>}
      <button className="primary wide" onClick={save}>
        {saved ? '保存しました' : '保存'}
      </button>

      {isNew ? (
        <p className="muted small">画像は、一度保存すると添付できるようになります。</p>
      ) : (
        <>
          <ImageDrop questionId={id!} role="question" title="問題の画像" />
          <ImageDrop questionId={id!} role="answer" title="解答の画像" />
          <div className="row-between">
            <Link to={`/questions/new`}>続けて新しい問題を登録</Link>
            <button className="danger" onClick={remove}>
              {confirmDelete ? '本当に削除する' : '削除'}
            </button>
          </div>
          <p className="muted small">削除しても、これまでの回答記録と連続日数は消えません。</p>
        </>
      )}
    </div>
  )
}

function ImageDrop({ questionId, role, title }: { questionId: string; role: QuestionImage['role']; title: string }) {
  const [over, setOver] = useState(false)
  const addFiles = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) if (f.type.startsWith('image/')) await addImage(questionId, role, f)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    void addFiles(e.dataTransfer.files)
  }
  return (
    <section
      className={`card drop ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <h3>{title}</h3>
      <QuestionImages questionId={questionId} role={role} onDelete={(imgId) => db.images.delete(imgId)} />
      <label className="file-label">
        画像を追加（ドラッグ＆ドロップも可）
        <input type="file" accept="image/*" multiple onChange={(e) => addFiles(e.target.files)} />
      </label>
    </section>
  )
}
