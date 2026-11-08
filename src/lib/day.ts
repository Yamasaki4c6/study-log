// 「学習日」の計算。
// 回答時刻は UTC（ISO 文字列）で保存し、表示や集計のときだけ日本時間の「学習日」に変換する。
// 日の切り替えは午前4時（設定で変更可）なので、03:59 の回答は前日の学習日になる。

/** 学習日を表す文字列。例: "2026-11-08" */
export type DayKey = string

export interface DaySettings {
  timeZone: string // 例: "Asia/Tokyo"
  dayStartHour: number // 0〜23。4 なら午前4時で日付が変わる
}

export const DEFAULT_DAY_SETTINGS: DaySettings = {
  timeZone: 'Asia/Tokyo',
  dayStartHour: 4,
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

// Intl.DateTimeFormat は作るのが重いので、タイムゾーンごとに使い回す
const formatters = new Map<string, Intl.DateTimeFormat>()
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    formatters.set(timeZone, f)
  }
  return f
}

/**
 * ある時刻がどの学習日に属するかを返す。
 * 考え方：時刻を dayStartHour 時間だけ前にずらしてから、そのタイムゾーンでの日付を読む。
 * 例：日本時間 11/8 03:59 → 4時間前は 11/7 23:59 → 学習日は 11/7
 */
export function learningDay(at: Date | string, settings: DaySettings = DEFAULT_DAY_SETTINGS): DayKey {
  const t = typeof at === 'string' ? Date.parse(at) : at.getTime()
  const shifted = new Date(t - settings.dayStartHour * HOUR_MS)
  // en-CA ロケールは YYYY-MM-DD 形式で出力される
  return formatterFor(settings.timeZone).format(shifted)
}

/** 学習日を n 日ずらす（タイムゾーンに関係しない、純粋な暦の計算） */
export function addDays(day: DayKey, n: number): DayKey {
  const t = Date.parse(`${day}T00:00:00Z`) + n * DAY_MS
  return new Date(t).toISOString().slice(0, 10)
}
