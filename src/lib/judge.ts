// 回答の自動判定。選択式と数値だけ自動で判定し、記述式は自分で○×を付ける。

import type { Question } from './types'

/** 全角・半角や空白の違いを吸収する（「ア」「ｱ」、「１」「1」を同じ扱いにする） */
export function normalize(s: string): string {
  return s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** "1,234.5" や "１２３" を数値にする。数値でなければ null */
export function parseNumber(s: string): number | null {
  const cleaned = normalize(s).replace(/,/g, '').replace(/−/g, '-')
  if (cleaned === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/.test(cleaned)) return null
  return Number(cleaned)
}

/** 自動判定できる問題なら true/false、できないなら null（自分で判定する） */
export function autoJudge(q: Pick<Question, 'type' | 'answer' | 'tolerance'>, response: string): boolean | null {
  if (q.type === 'choice') {
    return normalize(response) === normalize(q.answer)
  }
  if (q.type === 'numeric') {
    const expected = parseNumber(q.answer)
    const actual = parseNumber(response)
    if (expected === null) return null // 解答が数値として読めないときは自己判定に回す
    if (actual === null) return false
    // 許容誤差の指定がなければ、ほぼ一致（浮動小数点の誤差だけ許す）
    const tol = q.tolerance ?? 1e-9 * Math.max(1, Math.abs(expected))
    return Math.abs(actual - expected) <= tol
  }
  return null
}
