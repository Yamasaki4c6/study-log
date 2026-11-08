// 端末内 DB（IndexedDB）。Dexie というライブラリで、テーブルのように扱えるようにしている。
// データはこのブラウザの中だけに保存され、サーバーやリポジトリには送られない。

import Dexie, { type EntityTable } from 'dexie'
import { DEFAULT_DAY_SETTINGS } from './day'
import type { Attempt, Material, Question, QuestionImage, Settings } from './types'

interface SettingRow {
  key: 'settings'
  value: Settings
}

/** 同期の設定と状態（トークンはこの端末の中だけに保存し、どこにも送らない） */
export interface SyncRow {
  key: 'sync'
  token?: string
  owner: string
  repo: string
  deviceId: string
  knownShas: Record<string, string> // リポジトリ内のファイルごとの指紋（変わったものだけ取りに行く）
  pushedHashes: Record<string, string> // この端末が最後に送った内容の指紋（変わっていなければ送らない）
  lastSyncAt?: string
  status: 'off' | 'syncing' | 'ok' | 'offline' | 'error'
  message?: string
}

export const db = new Dexie('study-log') as Dexie & {
  materials: EntityTable<Material, 'id'>
  questions: EntityTable<Question, 'id'>
  images: EntityTable<QuestionImage, 'id'>
  attempts: EntityTable<Attempt, 'id'>
  settings: EntityTable<SettingRow, 'key'>
  sync: EntityTable<SyncRow, 'key'>
}

// 先頭が主キー、残りは検索に使う列（インデックス）
db.version(1).stores({
  materials: 'id, title',
  questions: 'id, materialId, fingerprint, *tags',
  images: 'id, questionId',
  attempts: 'id, questionId, answeredAt',
  settings: 'key',
})
db.version(2).stores({
  sync: 'key',
})

export function newId(): string {
  return crypto.randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}

export async function getSettings(): Promise<Settings> {
  const row = await db.settings.get('settings')
  return { ...DEFAULT_DAY_SETTINGS, ...row?.value }
}

export async function saveSettings(value: Settings): Promise<void> {
  await db.settings.put({ key: 'settings', value })
}

/** ブラウザに「このサイトのデータを勝手に消さないで」と頼む（Android の Chrome ではほぼ許可される） */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}
