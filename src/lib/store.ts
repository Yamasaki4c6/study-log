// 画面から呼ぶデータ操作。DB への書き込みはここに集める。

import { db, newId, nowIso } from './db'
import { fingerprint, type ImportData } from './importFormat'
import type { Attempt, JudgedBy, Material, Question, QuestionImage } from './types'

/**
 * 教材のIDは教材名から決める（同じ名前ならどの端末でも同じID）。
 * こうしておくと、同期したときに同じ教材が2つに分かれない。
 */
export async function materialIdFor(title: string): Promise<string> {
  const bytes = new TextEncoder().encode(title.trim().normalize('NFKC'))
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return 'm-' + [...hash.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 同じ名前の教材があればそれを、なければ新しく作って返す */
export async function createMaterial(title: string, year?: number): Promise<Material> {
  const t = title.trim()
  const existing = (await db.materials.where('title').equals(t).toArray()).find((m) => !m.deletedAt)
  if (existing) return existing
  const now = nowIso()
  const m: Material = { id: await materialIdFor(t), title: t, year, createdAt: now, updatedAt: now }
  await db.materials.put(m)
  return m
}

export async function activeMaterials(): Promise<Material[]> {
  const all = await db.materials.toArray()
  return all.filter((m) => !m.deletedAt).sort((a, b) => a.title.localeCompare(b.title, 'ja'))
}

export async function activeQuestions(): Promise<Question[]> {
  return (await db.questions.toArray()).filter((q) => !q.deletedAt)
}

export interface ImportPreviewItem {
  index: number
  duplicateOf?: Question // すでに同じ問題が登録されていれば、その問題
}

/** 取り込み前の確認：どの問題がすでに登録済みか調べる */
export async function previewImport(data: ImportData, material: Material | { title: string }) {
  const items: ImportPreviewItem[] = []
  for (const [index, q] of data.questions.entries()) {
    const fp = await fingerprint(material.title, q.body, q.answer)
    const dup = (await db.questions.where('fingerprint').equals(fp).toArray()).find((x) => !x.deletedAt)
    items.push({ index, duplicateOf: dup })
  }
  return items
}

/**
 * 問題を取り込む。重複している問題は、skipDuplicates が true なら飛ばし、false なら上書きする。
 * fromSync が false（画面から貼り付け・リンクで取り込んだ）なら「この端末で追加した問題」として印を付け、
 * 同期で他の端末にも届くようにする。
 */
export async function importQuestions(
  data: ImportData,
  target: { materialId: string } | { newTitle: string; year?: number },
  skipDuplicates: boolean,
  fromSync = false,
): Promise<{ added: number; updated: number; skipped: number }> {
  const material =
    'materialId' in target ? (await db.materials.get(target.materialId))! : await createMaterial(target.newTitle, target.year)
  // 指紋の計算（crypto）は DB のトランザクションの外で先に済ませる。
  // トランザクションの途中で DB 以外の非同期処理を待つと、トランザクションが自動で閉じてしまうため。
  const fps = await Promise.all(data.questions.map((q) => fingerprint(material.title, q.body, q.answer)))

  return db.transaction('rw', db.questions, async () => {
    let added = 0
    let updated = 0
    let skipped = 0
    for (const [i, q] of data.questions.entries()) {
      const now = nowIso()
      // 固定IDのある問題（同期用の問題ファイル）は ID で、ない問題は指紋で、登録済みか調べる
      const dup = q.id
        ? await db.questions.get(q.id)
        : (await db.questions.where('fingerprint').equals(fps[i]).toArray()).find((x) => !x.deletedAt)
      const editedAt = fromSync ? undefined : now
      if (dup && (skipDuplicates || (fromSync && dup.editedAt))) {
        // 手で編集・削除した問題は、取り込み直しで上書きしない
        skipped++
      } else if (dup) {
        await db.questions.update(dup.id, { ...q, id: dup.id, fingerprint: fps[i], updatedAt: now, ...(editedAt && { editedAt }) })
        updated++
      } else {
        await db.questions.add({
          ...q,
          id: q.id ?? newId(),
          materialId: material.id,
          fingerprint: fps[i],
          createdAt: now,
          updatedAt: now,
          editedAt,
        })
        added++
      }
    }
    return { added, updated, skipped }
  })
}

/** 問題を保存する（手動登録・編集）。問題文や解答が変わったら指紋も作り直す */
export async function saveQuestion(
  q: Omit<Question, 'id' | 'fingerprint' | 'createdAt' | 'updatedAt'> & { id?: string },
): Promise<Question> {
  const material = await db.materials.get(q.materialId)
  const fp = await fingerprint(material?.title ?? '', q.body, q.answer)
  const now = nowIso()
  if (q.id) {
    const existing = (await db.questions.get(q.id))!
    const next: Question = { ...existing, ...q, id: q.id, fingerprint: fp, updatedAt: now, editedAt: now }
    await db.questions.put(next)
    return next
  }
  const created: Question = { ...q, id: newId(), fingerprint: fp, createdAt: now, updatedAt: now, editedAt: now }
  await db.questions.add(created)
  return created
}

/** 論理削除。回答ログは残るので、ストリークや記録は変わらない */
export async function deleteQuestion(id: string): Promise<void> {
  const now = nowIso()
  await db.questions.update(id, { deletedAt: now, updatedAt: now, editedAt: now })
}

export async function recordAttempt(
  questionId: string,
  correct: boolean,
  judgedBy: JudgedBy,
  response?: string,
): Promise<Attempt> {
  const deviceId = (await db.sync.get('sync'))?.deviceId
  const a: Attempt = { id: newId(), questionId, answeredAt: nowIso(), correct, judgedBy, response, deviceId }
  await db.attempts.add(a)
  return a
}

/** 写真は大きいので、長辺 1600px に縮めて JPEG で保存する */
export async function addImage(questionId: string, role: QuestionImage['role'], file: File): Promise<void> {
  const blob = await shrinkImage(file, 1600)
  await db.images.add({ id: newId(), questionId, role, blob, createdAt: nowIso() })
}

async function shrinkImage(file: File, maxSide: number): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size < 800_000) return file
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.85))
}
