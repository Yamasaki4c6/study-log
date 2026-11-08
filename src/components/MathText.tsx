// 文章の中の $...$（インライン）と $$...$$（独立した行）を KaTeX で数式として表示する。
// 数式以外の部分は普通の文字として表示する（HTML として解釈しないので安全）。

import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useMemo } from 'react'

type Part = { kind: 'text'; value: string } | { kind: 'math'; value: string; display: boolean }

export function splitMath(text: string): Part[] {
  const parts: Part[] = []
  // \$ は数式の区切りではなく「$」という文字として扱う
  const re = /\$\$([\s\S]+?)\$\$|(?<!\\)\$((?:\\\$|[^$\n])+?)\$/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) parts.push({ kind: 'text', value: text.slice(last, m.index) })
    parts.push({ kind: 'math', value: m[1] ?? m[2], display: m[1] !== undefined })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) })
  return parts.map((p) => (p.kind === 'text' ? { ...p, value: p.value.replace(/\\\$/g, '$') } : p))
}

export function MathText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => splitMath(text), [text])
  return (
    <div className={`math-text ${className ?? ''}`}>
      {parts.map((p, i) =>
        p.kind === 'text' ? (
          <span key={i}>{p.value}</span>
        ) : (
          <span
            key={i}
            className={p.display ? 'math-display' : undefined}
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(p.value, { displayMode: p.display, throwOnError: false }),
            }}
          />
        ),
      )}
    </div>
  )
}
