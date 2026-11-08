// 既存の AI（Claude、Muse など）に作ってもらった問題 JSON の読み込み。
// 形式の説明は docs/import-format.md、AI に渡す指示文は src/prompts/question-generation.md。

import type { Choice, QuestionType } from './types'

export const FORMAT_ID = 'study-log/v1'

export interface ImportQuestion {
  label: string
  body: string
  type: QuestionType
  choices?: Choice[]
  answer: string
  tolerance?: number
  explanation?: string
  tags: string[]
  source?: string
}

export interface ImportData {
  material?: { title: string; year?: number }
  questions: ImportQuestion[]
}

export type ParseResult = { ok: true; data: ImportData } | { ok: false; errors: string[] }

/** AI の返答には ```json ... ``` や前置きの文章が付きがちなので、JSON 部分だけを取り出す */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  const start = text.search(/[[{]/)
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'))
  return start >= 0 && end > start ? text.slice(start, end + 1) : text.trim()
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined

export function parseImport(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(extractJson(text))
  } catch (e) {
    return { ok: false, errors: [`JSON として読めません：${(e as Error).message}`] }
  }

  // 問題の配列だけが貼られた場合も受け付ける
  const root = Array.isArray(raw) ? { questions: raw } : raw
  if (!isObj(root) || !Array.isArray(root.questions)) {
    return { ok: false, errors: ['"questions"（問題の配列）が見つかりません'] }
  }

  const errors: string[] = []
  let material: ImportData['material']
  if (isObj(root.material) && str(root.material.title)?.trim()) {
    const year = Number(root.material.year)
    material = { title: str(root.material.title)!.trim(), year: Number.isFinite(year) && year > 0 ? year : undefined }
  }

  const questions: ImportQuestion[] = []
  root.questions.forEach((item, i) => {
    const where = `${i + 1}問目`
    if (!isObj(item)) {
      errors.push(`${where}：オブジェクトではありません`)
      return
    }
    const body = str(item.body)?.trim() ?? ''
    const answer = str(item.answer)?.trim() ?? ''
    const type = (str(item.type) ?? 'text') as QuestionType
    if (!body) errors.push(`${where}：問題文（body）がありません`)
    if (!answer) errors.push(`${where}：解答（answer）がありません`)
    if (!['choice', 'numeric', 'text'].includes(type)) {
      errors.push(`${where}：type は choice / numeric / text のどれかにしてください（"${type}"）`)
    }

    let choices: Choice[] | undefined
    if (type === 'choice') {
      if (!Array.isArray(item.choices) || item.choices.length < 2) {
        errors.push(`${where}：選択式なのに選択肢（choices）が2つ以上ありません`)
      } else {
        choices = item.choices.map((c, j) =>
          isObj(c)
            ? { key: str(c.key)?.trim() || String(j + 1), text: str(c.text) ?? '' }
            : { key: String(j + 1), text: str(c) ?? '' },
        )
        if (answer && !choices.some((c) => c.key.normalize('NFKC') === answer.normalize('NFKC'))) {
          errors.push(`${where}：解答「${answer}」が選択肢の記号にありません`)
        }
      }
    }

    const tolerance = item.tolerance === undefined ? undefined : Number(item.tolerance)
    if (tolerance !== undefined && !(tolerance >= 0)) errors.push(`${where}：tolerance は0以上の数にしてください`)

    questions.push({
      label: str(item.label)?.trim() || `問${i + 1}`,
      body,
      type,
      choices,
      answer,
      tolerance,
      explanation: str(item.explanation)?.trim() || undefined,
      tags: Array.isArray(item.tags) ? item.tags.map((t) => str(t)?.trim()).filter((t): t is string => !!t) : [],
      source: str(item.source)?.trim() || undefined,
    })
  })

  if (questions.length === 0 && errors.length === 0) errors.push('問題が1つもありません')
  return errors.length > 0 ? { ok: false, errors } : { ok: true, data: { material, questions } }
}

/**
 * 重複検知用の「指紋」。教材名・問題文・解答を正規化してから SHA-256 にかける。
 * 空白や全角半角の違いだけの問題は同じものとみなす。
 */
export async function fingerprint(materialTitle: string, body: string, answer: string): Promise<string> {
  const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, '')
  const bytes = new TextEncoder().encode([materialTitle, body, answer].map(norm).join('\u0000'))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
