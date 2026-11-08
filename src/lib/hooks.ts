// 画面で使うデータの読み込み。useLiveQuery は DB が変わると自動で再描画してくれる。

import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings } from './db'
import { DEFAULT_DAY_SETTINGS } from './day'
import { summarizeStreak } from './streak'

export function useSettings() {
  return useLiveQuery(getSettings, [], DEFAULT_DAY_SETTINGS)
}

export function useStreak() {
  const settings = useSettings()
  return useLiveQuery(async () => {
    const attempts = await db.attempts.toArray()
    return summarizeStreak(
      attempts.map((a) => a.answeredAt),
      new Date(),
      settings,
    )
  }, [settings])
}
