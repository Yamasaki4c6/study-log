// 同期のテスト。本物の GitHub の代わりに、メモリ上の偽リポジトリを使う。
// 端末内 DB も fake-indexeddb（メモリ上の IndexedDB）で動かし、
// 「端末を消して別の端末として同期し直す」ことで2台の同期を再現する。

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, type SyncRow } from './db'
import type { RepoClient, RepoFile } from './githubClient'
import { SyncError } from './githubClient'
import { parseImport } from './importFormat'
import { deleteQuestion, importQuestions, recordAttempt, saveQuestion } from './store'
import { attemptsFileContent, groupAttemptsByMonth, syncOnce } from './sync'
import type { Attempt } from './types'

class FakeRepo implements RepoClient {
  files = new Map<string, { sha: string; content: string }>()
  writes = 0
  private n = 0
  put(path: string, content: string) {
    this.files.set(path, { sha: `sha${++this.n}`, content })
  }
  async listFiles(): Promise<RepoFile[]> {
    return [...this.files].map(([path, f]) => ({ path, sha: f.sha }))
  }
  async readFile(sha: string): Promise<string> {
    return [...this.files.values()].find((f) => f.sha === sha)!.content
  }
  async writeFile(path: string, content: string, currentSha: string | undefined): Promise<string> {
    if (this.files.get(path)?.sha !== currentSha) throw new SyncError('conflict', 'conflict')
    this.writes++
    this.put(path, content)
    return this.files.get(path)!.sha
  }
}

const questionFile = JSON.stringify({
  format: 'study-log/v1',
  material: { title: 'テスト問題集' },
  questions: [
    { id: 'tq-1', label: '問1', body: '1+1は？', type: 'numeric', answer: '2' },
    { id: 'tq-2', label: '問2', body: '首都は？', type: 'choice', choices: ['大阪', '東京'], answer: '2' },
  ],
})

/** 端末を1台用意する（DB を空にして、端末IDを設定する） */
async function newDevice(deviceId: string): Promise<SyncRow> {
  await Promise.all(db.tables.map((t) => t.clear()))
  const row: SyncRow = { key: 'sync', owner: 'o', repo: 'r', deviceId, knownShas: {}, pushedHashes: {}, status: 'ok', token: 't' }
  await db.sync.put(row)
  return row
}

describe('同期', () => {
  let repo: FakeRepo
  beforeEach(() => {
    repo = new FakeRepo()
    repo.put('README.md', '# data')
    repo.put('questions/2026-11-08-test.json', questionFile)
  })

  it('リポジトリの問題ファイルを、固定IDのまま取り込む', async () => {
    const phone = await newDevice('phone')
    const r = await syncOnce(repo, phone)
    expect(r.questionsAdded).toBe(2)
    expect((await db.questions.get('tq-1'))?.body).toBe('1+1は？')
    expect(await db.materials.count()).toBe(1)
  })

  it('変わっていないファイルは2回目に読み直さず、何も送らない', async () => {
    const phone = await newDevice('phone')
    await syncOnce(repo, phone)
    const r = await syncOnce(repo, phone)
    expect(r).toMatchObject({ questionsAdded: 0, filesPushed: 0 })
    expect(repo.writes).toBe(0)
  })

  it('スマホで解いた記録が PC に届き、PC で解いた記録もスマホに届く', async () => {
    // スマホで2問解いて同期
    const phone = await newDevice('phone')
    await syncOnce(repo, phone)
    await recordAttempt('tq-1', true, 'auto', '2')
    await recordAttempt('tq-2', false, 'auto', '1')
    expect((await syncOnce(repo, phone)).filesPushed).toBe(1)
    const phoneAttempts = await db.attempts.toArray()

    // PC で同期すると、スマホの記録が入る。PC でも1問解いて同期
    const pc = await newDevice('pc')
    const r = await syncOnce(repo, pc)
    expect(r.attemptsAdded).toBe(2)
    await recordAttempt('tq-1', true, 'self')
    await syncOnce(repo, pc)
    // PC は自分の記録だけを自分のファイルに書く（スマホのファイルには触らない）
    expect([...repo.files.keys()].filter((p) => p.startsWith('devices/pc/'))).toHaveLength(1)
    const pcFile = JSON.parse([...repo.files].find(([p]) => p.startsWith('devices/pc/'))![1].content) as Attempt[]
    expect(pcFile).toHaveLength(1)

    // スマホに戻って同期すると、合計3件になる
    await Promise.all(db.tables.map((t) => t.clear()))
    await db.attempts.bulkAdd(phoneAttempts)
    await db.sync.put(phone)
    const back = await syncOnce(repo, phone)
    expect(back.attemptsAdded).toBe(1)
    expect(await db.attempts.count()).toBe(3)
  })

  it('手で編集・削除した問題はほかの端末にも反映され、問題ファイルの再取り込みで上書きされない', async () => {
    const phone = await newDevice('phone')
    await syncOnce(repo, phone)
    const q = (await db.questions.get('tq-1'))!
    await saveQuestion({ ...q, body: '1+1は？（編集）' })
    await deleteQuestion('tq-2')
    await syncOnce(repo, phone)
    expect(repo.files.has('devices/phone/edits.json')).toBe(true)

    // 問題ファイルが更新されても、編集した問題はそのまま
    repo.put('questions/2026-11-08-test.json', questionFile.replace('1+1は？', '1+1は何？'))
    await syncOnce(repo, phone)
    expect((await db.questions.get('tq-1'))?.body).toBe('1+1は？（編集）')

    // PC でも、編集と削除が反映される
    const pc = await newDevice('pc')
    await syncOnce(repo, pc)
    expect((await db.questions.get('tq-1'))?.body).toBe('1+1は？（編集）')
    expect((await db.questions.get('tq-2'))?.deletedAt).toBeDefined()
  })

  it('画面から貼り付け・リンクで取り込んだ問題も、ほかの端末に届く', async () => {
    const phone = await newDevice('phone')
    const parsed = parseImport(JSON.stringify({ questions: [{ body: '手で貼った問題', answer: 'A' }] }))
    if (!parsed.ok) throw new Error()
    await importQuestions(parsed.data, { newTitle: '自分で作った問題' }, true)
    await syncOnce(repo, phone)

    await newDevice('pc')
    await syncOnce(repo, (await db.sync.get('sync'))!)
    const qs = await db.questions.toArray()
    expect(qs.map((q) => q.body)).toContain('手で貼った問題')
    expect((await db.materials.toArray()).map((m) => m.title)).toContain('自分で作った問題')
  })

  it('読めない問題ファイルがあっても、ほかの同期は続ける', async () => {
    repo.put('questions/broken.json', '{"questions": "x"}')
    const phone = await newDevice('phone')
    const r = await syncOnce(repo, phone)
    expect(r.questionsAdded).toBe(2)
    expect(r.problems[0]).toContain('questions/broken.json')
  })
})

describe('回答記録のファイル分け', () => {
  const a = (id: string, answeredAt: string, deviceId?: string): Attempt => ({
    id,
    questionId: 'q',
    answeredAt,
    correct: true,
    judgedBy: 'self',
    deviceId,
  })

  it('この端末の記録だけを月ごとに分ける（同期前の記録はこの端末のものとして扱う）', () => {
    const files = groupAttemptsByMonth(
      [a('1', '2026-10-31T23:00:00Z'), a('2', '2026-11-01T00:00:00Z', 'phone'), a('3', '2026-11-02T00:00:00Z', 'pc')],
      'phone',
    )
    expect([...files.keys()].sort()).toEqual(['devices/phone/attempts-2026-10.json', 'devices/phone/attempts-2026-11.json'])
  })

  it('ファイルの中身は時刻順・1行1件で、端末IDは書かない', () => {
    const text = attemptsFileContent([a('2', '2026-11-02T00:00:00Z', 'phone'), a('1', '2026-11-01T00:00:00Z', 'phone')])
    const lines = text.trim().split('\n')
    expect(lines).toHaveLength(4)
    expect(JSON.parse(text).map((x: Attempt) => x.id)).toEqual(['1', '2'])
    expect(text).not.toContain('deviceId')
  })
})
