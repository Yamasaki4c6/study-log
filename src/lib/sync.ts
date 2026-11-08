// 非公開リポジトリ（study-log-data）との同期。
//
// リポジトリの中身：
//   questions/*.json                  … Claude が追加する問題ファイル（study-log/v1 形式）
//   devices/<端末ID>/attempts-YYYY-MM.json … その端末の回答記録（月ごと）
//   devices/<端末ID>/edits.json         … その端末で手動登録・編集・削除した問題
//
// 端末ごとに別のファイルへ書くので、スマホと PC が同時に書いても衝突しない。
// 読むときは全端末のファイルを合体する（回答記録は id で和集合、問題の編集は新しいほうを採用）。

import { mergeById } from './backup'
import { db, type SyncRow } from './db'
import { GitHubClient, SyncError, type RepoClient } from './githubClient'
import { parseImport } from './importFormat'
import { importQuestions } from './store'
import type { Attempt, Material, Question } from './types'

export const DEFAULT_REPO = { owner: 'Yamasaki4c6', repo: 'study-log-data' }

interface EditsDoc {
  materials: Material[]
  questions: Question[]
}

export interface SyncResult {
  questionsAdded: number
  attemptsAdded: number
  filesPushed: number
  problems: string[] // 読めなかった問題ファイルなど（同期自体は続ける）
}

const ATTEMPTS_RE = /^devices\/([^/]+)\/attempts-\d{4}-\d{2}\.json$/
const EDITS_RE = /^devices\/([^/]+)\/edits\.json$/

async function sha256(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 回答記録を「1行に1件」の JSON にする（GitHub 上で差分が読みやすいように） */
export function attemptsFileContent(attempts: Attempt[]): string {
  const sorted = [...attempts].sort((a, b) => a.answeredAt.localeCompare(b.answeredAt) || a.id.localeCompare(b.id))
  return '[\n' + sorted.map(({ deviceId: _d, ...a }) => JSON.stringify(a)).join(',\n') + '\n]\n'
}

/** この端末の回答記録を、月ごとのファイルに分ける */
export function groupAttemptsByMonth(attempts: Attempt[], deviceId: string): Map<string, Attempt[]> {
  const files = new Map<string, Attempt[]>()
  for (const a of attempts) {
    // deviceId がない記録は、同期を始める前にこの端末でつけたもの
    if (a.deviceId && a.deviceId !== deviceId) continue
    const path = `devices/${deviceId}/attempts-${a.answeredAt.slice(0, 7)}.json`
    files.set(path, [...(files.get(path) ?? []), a])
  }
  return files
}

/**
 * ほかの端末で編集された問題を合体する。
 * 手で編集した問題は、問題ファイルから取り込んだだけの問題（editedAt なし）より常に優先し、
 * 両方とも編集されていれば新しいほうを採用する。返すのは書き換えが必要な問題だけ。
 */
export function mergeEditedQuestions(local: Question[], incoming: Question[]): Question[] {
  const byId = new Map(local.map((q) => [q.id, q]))
  return incoming.filter((q) => {
    const cur = byId.get(q.id)
    return !cur || !cur.editedAt || q.updatedAt > cur.updatedAt
  })
}

/** 1回分の同期：リポジトリの変更を取り込み、この端末の変更を送る */
export async function syncOnce(client: RepoClient, state: SyncRow): Promise<SyncResult> {
  const result: SyncResult = { questionsAdded: 0, attemptsAdded: 0, filesPushed: 0, problems: [] }
  const files = await client.listFiles()
  const remoteSha = new Map(files.map((f) => [f.path, f.sha]))

  // 1. 取り込み：前回から変わったファイルだけ読む
  for (const f of files) {
    if (state.knownShas[f.path] === f.sha) continue
    if (f.path.startsWith('questions/') && f.path.endsWith('.json')) {
      const parsed = parseImport(await client.readFile(f.sha))
      if (!parsed.ok) {
        result.problems.push(`${f.path}：${parsed.errors[0]}`)
      } else {
        const title = parsed.data.material?.title ?? f.path.replace(/^questions\//, '').replace(/\.json$/, '')
        const r = await importQuestions(parsed.data, { newTitle: title, year: parsed.data.material?.year }, false, true)
        result.questionsAdded += r.added
      }
    } else if (ATTEMPTS_RE.test(f.path)) {
      const deviceId = f.path.match(ATTEMPTS_RE)![1]
      const remote = (JSON.parse(await client.readFile(f.sha)) as Attempt[]).map((a) => ({ ...a, deviceId }))
      const existing = new Set(await db.attempts.toCollection().primaryKeys())
      const fresh = remote.filter((a) => !existing.has(a.id))
      await db.attempts.bulkAdd(fresh)
      result.attemptsAdded += fresh.length
    } else if (EDITS_RE.test(f.path)) {
      const doc = JSON.parse(await client.readFile(f.sha)) as EditsDoc
      await db.materials.bulkPut(mergeById(await db.materials.toArray(), doc.materials).changed)
      await db.questions.bulkPut(mergeEditedQuestions(await db.questions.toArray(), doc.questions))
    }
    state.knownShas[f.path] = f.sha
  }

  // 2. 送信：この端末の回答記録（月ごと）と、手で編集した問題
  const outgoing = new Map<string, string>()
  for (const [path, attempts] of groupAttemptsByMonth(await db.attempts.toArray(), state.deviceId)) {
    outgoing.set(path, attemptsFileContent(attempts))
  }
  const edited = (await db.questions.toArray()).filter((q) => q.editedAt)
  if (edited.length > 0) {
    const materialIds = new Set(edited.map((q) => q.materialId))
    const doc: EditsDoc = {
      materials: (await db.materials.toArray()).filter((m) => materialIds.has(m.id)),
      questions: edited,
    }
    outgoing.set(`devices/${state.deviceId}/edits.json`, JSON.stringify(doc, null, 1) + '\n')
  }

  for (const [path, content] of outgoing) {
    const hash = await sha256(content)
    if (state.pushedHashes[path] === hash && remoteSha.has(path)) continue
    const newSha = await client.writeFile(path, content, remoteSha.get(path), `同期: ${path}`)
    state.knownShas[path] = newSha
    state.pushedHashes[path] = hash
    result.filesPushed++
  }

  return result
}

// ---- 画面から使う部分：設定の保存、同期の実行（同時に2つ走らないようにする） ----

export async function getSyncRow(): Promise<SyncRow> {
  const row = await db.sync.get('sync')
  if (row) return row
  const fresh: SyncRow = {
    key: 'sync',
    ...DEFAULT_REPO,
    deviceId: 'd-' + crypto.randomUUID().slice(0, 8),
    knownShas: {},
    pushedHashes: {},
    status: 'off',
  }
  await db.sync.put(fresh)
  return fresh
}

/** 画面表示用：保存せずに読むだけ（useLiveQuery の中では書き込みできないため） */
export async function peekSyncRow(): Promise<SyncRow> {
  return (
    (await db.sync.get('sync')) ?? {
      key: 'sync',
      ...DEFAULT_REPO,
      deviceId: '',
      knownShas: {},
      pushedHashes: {},
      status: 'off',
    }
  )
}

export async function saveSyncConfig(token: string, owner: string, repo: string): Promise<void> {
  const row = await getSyncRow()
  const changedRepo = row.owner !== owner || row.repo !== repo
  await db.sync.put({
    ...row,
    token: token.trim() || undefined,
    owner: owner.trim(),
    repo: repo.trim(),
    // 別のリポジトリにしたら、最初から読み直す
    knownShas: changedRepo ? {} : row.knownShas,
    pushedHashes: changedRepo ? {} : row.pushedHashes,
    status: token.trim() ? row.status : 'off',
    message: undefined,
  })
}

let running: Promise<SyncResult | null> | null = null

/** 同期を実行する。トークン未設定なら何もしない。実行中なら、その結果を待つ */
export function runSync(): Promise<SyncResult | null> {
  running ??= (async () => {
    try {
      const row = await getSyncRow()
      if (!row.token) return null
      await db.sync.update('sync', { status: 'syncing', message: undefined })
      const client = new GitHubClient(row.token, row.owner, row.repo)
      let result: SyncResult
      try {
        result = await syncOnce(client, row)
      } catch (e) {
        // ほかの端末と同時に書いたときは、もう一度読み直してやり直す
        if (!(e instanceof SyncError && e.kind === 'conflict')) throw e
        result = await syncOnce(client, row)
      }
      await db.sync.update('sync', {
        knownShas: row.knownShas,
        pushedHashes: row.pushedHashes,
        lastSyncAt: new Date().toISOString(),
        status: 'ok',
        message: result.problems.length ? `読めなかったファイル：${result.problems.join(' / ')}` : undefined,
      })
      return result
    } catch (e) {
      const offline = e instanceof SyncError && e.kind === 'offline'
      await db.sync.update('sync', { status: offline ? 'offline' : 'error', message: (e as Error).message })
      return null
    } finally {
      running = null
    }
  })()
  return running
}

let timer: ReturnType<typeof setTimeout> | undefined

/** 回答した直後などに呼ぶ。数秒まとめてから同期する */
export function requestSync(delayMs = 3000): void {
  clearTimeout(timer)
  timer = setTimeout(() => void runSync(), delayMs)
}

/** アプリ起動時に呼ぶ：起動時・画面に戻ったとき・ネットにつながったときに同期する */
export function startAutoSync(): void {
  void runSync()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void runSync()
  })
  window.addEventListener('online', () => void runSync())
}
