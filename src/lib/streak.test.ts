import { describe, expect, it } from 'vitest'
import { addDays, learningDay, DEFAULT_DAY_SETTINGS as JST4 } from './day'
import { summarizeStreak } from './streak'

// 日本時間の時刻を UTC の ISO 文字列にする（テストを読みやすくするため）
const jst = (s: string) => new Date(`${s}+09:00`).toISOString()

describe('learningDay（学習日の判定）', () => {
  it('日本時間 03:59 は前日、04:00 は当日', () => {
    expect(learningDay(jst('2026-11-08T03:59:59'), JST4)).toBe('2026-11-07')
    expect(learningDay(jst('2026-11-08T04:00:00'), JST4)).toBe('2026-11-08')
  })

  it('UTC と日本時間で日付がずれる時間帯も日本時間で判定する', () => {
    // UTC 11/7 20:00 = 日本時間 11/8 05:00
    expect(learningDay('2026-11-07T20:00:00.000Z', JST4)).toBe('2026-11-08')
    // UTC 11/7 18:30 = 日本時間 11/8 03:30 → 前日扱い
    expect(learningDay('2026-11-07T18:30:00.000Z', JST4)).toBe('2026-11-07')
  })

  it('月またぎ・年またぎ', () => {
    expect(learningDay(jst('2026-12-01T02:00:00'), JST4)).toBe('2026-11-30')
    expect(learningDay(jst('2027-01-01T03:00:00'), JST4)).toBe('2026-12-31')
    expect(learningDay(jst('2027-01-01T04:00:00'), JST4)).toBe('2027-01-01')
  })

  it('切り替え時刻を 0 時にすると普通の日付になる', () => {
    const midnight = { ...JST4, dayStartHour: 0 }
    expect(learningDay(jst('2026-11-08T00:00:00'), midnight)).toBe('2026-11-08')
    expect(learningDay(jst('2026-11-07T23:59:59'), midnight)).toBe('2026-11-07')
  })

  it('addDays は月末・うるう年をまたげる', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
  })
})

describe('summarizeStreak（連続日数）', () => {
  const now = new Date(jst('2026-11-08T12:00:00'))

  it('回答が1つもなければ 0 日・none', () => {
    const s = summarizeStreak([], now, JST4)
    expect(s).toMatchObject({ current: 0, longest: 0, status: 'none', todayCount: 0 })
  })

  it('今日を含めて3日連続', () => {
    const s = summarizeStreak(
      [jst('2026-11-06T21:00:00'), jst('2026-11-07T08:00:00'), jst('2026-11-08T09:00:00')],
      now,
      JST4,
    )
    expect(s).toMatchObject({ current: 3, longest: 3, status: 'done_today', todayCount: 1 })
  })

  it('今日はまだでも、昨日まで続いていれば継続中（今日はまだ）', () => {
    const s = summarizeStreak([jst('2026-11-06T21:00:00'), jst('2026-11-07T08:00:00')], now, JST4)
    expect(s).toMatchObject({ current: 2, status: 'pending_today', todayCount: 0 })
  })

  it('一昨日で止まっていたら途切れ', () => {
    const s = summarizeStreak([jst('2026-11-05T21:00:00'), jst('2026-11-06T08:00:00')], now, JST4)
    expect(s).toMatchObject({ current: 0, longest: 2, status: 'broken' })
  })

  it('深夜 03:59 の回答は前日の分として数える', () => {
    // 11/7 の夜に解かず、11/8 03:59 に解いた → 学習日 11/7 として連続が保たれる
    const s = summarizeStreak(
      [jst('2026-11-06T22:00:00'), jst('2026-11-08T03:59:00'), jst('2026-11-08T10:00:00')],
      now,
      JST4,
    )
    expect(s).toMatchObject({ current: 3, status: 'done_today' })
  })

  it('04:00 ちょうどの回答は当日扱いなので、前日の穴は埋まらない', () => {
    const s = summarizeStreak([jst('2026-11-06T22:00:00'), jst('2026-11-08T04:00:00')], now, JST4)
    expect(s).toMatchObject({ current: 1, longest: 1, status: 'done_today' })
  })

  it('「今日」も午前4時で切り替わる（深夜2時は前日扱い）', () => {
    const lateNight = new Date(jst('2026-11-09T02:00:00'))
    const s = summarizeStreak([jst('2026-11-08T10:00:00')], lateNight, JST4)
    expect(s.today).toBe('2026-11-08')
    expect(s.status).toBe('done_today')
  })

  it('月またぎ・年またぎでも連続が続く', () => {
    const newYear = new Date(jst('2027-01-01T12:00:00'))
    const s = summarizeStreak(
      [jst('2026-12-30T20:00:00'), jst('2026-12-31T20:00:00'), jst('2027-01-01T05:00:00')],
      newYear,
      JST4,
    )
    expect(s.current).toBe(3)
  })

  it('同じ日に何問解いても1日として数え、回答数は日ごとに集計する', () => {
    const s = summarizeStreak(
      [jst('2026-11-08T05:00:00'), jst('2026-11-08T06:00:00'), jst('2026-11-08T23:00:00')],
      now,
      JST4,
    )
    expect(s.current).toBe(1)
    expect(s.todayCount).toBe(3)
    expect(s.countsByDay.get('2026-11-08')).toBe(3)
  })

  it('最長記録は過去の一番長い連続区間', () => {
    const s = summarizeStreak(
      [
        jst('2026-10-01T10:00:00'),
        jst('2026-10-02T10:00:00'),
        jst('2026-10-03T10:00:00'),
        jst('2026-10-04T10:00:00'),
        jst('2026-11-07T10:00:00'),
        jst('2026-11-08T10:00:00'),
      ],
      now,
      JST4,
    )
    expect(s).toMatchObject({ current: 2, longest: 4 })
  })

  it('回答の並び順に関係なく同じ結果になる', () => {
    const ats = [jst('2026-11-08T10:00:00'), jst('2026-11-06T10:00:00'), jst('2026-11-07T10:00:00')]
    expect(summarizeStreak(ats, now, JST4).current).toBe(3)
    expect(summarizeStreak([...ats].reverse(), now, JST4).current).toBe(3)
  })
})
