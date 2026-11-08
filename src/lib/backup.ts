// バックアップの書き出し・読み込みと、回答記録の書き出し。
// 読み込みは「上書き」ではなく「合体（マージ）」なので、スマホと PC で別々に解いた記録も1つにまとまる。

import { db } from './db'
import { learningDay, type DaySettings } from './day'
import type { Attempt, Material, Question, QuestionImage } from './types'

export const BACKUP_FORMAT = 'study-log-backup/v1'

interface BackupImage extends Omit<QuestionImage, 'blob'> {
  dataUrl: string
}

export interface Backup {
  format: typeof BACKUP_FORMAT
  exportedAt: string
  materials: Material[]
  questions: Question[]
  attempts: Attempt[]
  images: BackupImage[]
}

type Versioned = { id: string; updatedAt: string }

/**
 * 2つの一覧を id で合体する。同じ id があれば updatedAt が新しいほうを残す。
 * 回答ログは書き換えないので、id がそろっていれば単純な和集合になる。
 */
export function mergeById<T extends Versioned>(local: T[], incoming: T[]): { merged: T[]; changed: T[] } {
  const byId = new Map(local.map((x) => [x.id, x]))
  const changed: T[] = []
  for (const x of incoming) {
    const cur = byId.get(x.id)
    if (!cur || x.updatedAt > cur.updatedAt) {
      byId.set(x.id, x)
      changed.push(x)
    }
  }
  return { merged: [...byId.values()], changed }
}

export function newAttempts(local: Attempt[], incoming: Attempt[]): Attempt[] {
  const ids = new Set(local.map((a) => a.id))
  return incoming.filter((a) => !ids.has(a.id))
}

export async function exportBackup(): Promise<Backup> {
  const images = await db.images.toArray()
  return {
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    materials: await db.materials.toArray(),
    questions: await db.questions.toArray(),
    attempts: await db.attempts.toArray(),
    images: await Promise.all(
      images.map(async ({ blob, ...rest }) => ({ ...rest, dataUrl: await blobToDataUrl(blob) })),
    ),
  }
}

export async function importBackup(text: string) {
  const b = JSON.parse(text) as Backup
  if (b.format !== BACKUP_FORMAT) throw new Error('このアプリのバックアップファイルではありません')
  // 画像の復元（fetch）はトランザクションの外で先に済ませる（途中で待つとトランザクションが閉じるため）
  const decoded: QuestionImage[] = await Promise.all(
    b.images.map(async ({ dataUrl, ...rest }) => ({ ...rest, blob: await (await fetch(dataUrl)).blob() })),
  )
  return db.transaction('rw', [db.materials, db.questions, db.attempts, db.images], async () => {
    const materials = mergeById(await db.materials.toArray(), b.materials).changed
    const questions = mergeById(await db.questions.toArray(), b.questions).changed
    const attempts = newAttempts(await db.attempts.toArray(), b.attempts)
    const existingImages = new Set(await db.images.toCollection().primaryKeys())
    const images = decoded.filter((i) => !existingImages.has(i.id))
    await db.materials.bulkPut(materials)
    await db.questions.bulkPut(questions)
    await db.attempts.bulkAdd(attempts)
    await db.images.bulkAdd(images)
    return { materials: materials.length, questions: questions.length, attempts: attempts.length, images: images.length }
  })
}

/** AI に成績を分析してもらうための CSV（表計算ソフトでも開ける） */
export function attemptsToCsv(
  attempts: Attempt[],
  questions: Question[],
  materials: Material[],
  settings: DaySettings,
): string {
  const qById = new Map(questions.map((q) => [q.id, q]))
  const mById = new Map(materials.map((m) => [m.id, m]))
  const cell = (v: string | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`
  const rows = [...attempts]
    .sort((a, b) => a.answeredAt.localeCompare(b.answeredAt))
    .map((a) => {
      const q = qById.get(a.questionId)
      return [
        learningDay(a.answeredAt, settings),
        a.answeredAt,
        q ? mById.get(q.materialId)?.title : '',
        q?.label,
        q?.tags.join(' '),
        a.correct ? '正解' : '不正解',
        a.judgedBy === 'auto' ? '自動' : '自己',
        a.response,
        q?.body.slice(0, 80),
      ]
        .map(cell)
        .join(',')
    })
  return ['学習日,回答時刻(UTC),教材,番号,タグ,結果,判定,自分の回答,問題文(先頭)', ...rows].join('\n')
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export function downloadText(filename: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
