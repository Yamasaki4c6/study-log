// アプリで扱うデータの形。端末内 DB（IndexedDB）にこの形で保存する。
// 時刻はすべて UTC の ISO 文字列。削除は deletedAt を入れる「論理削除」で、行は消さない。

export type QuestionType = 'choice' | 'numeric' | 'text'

export interface Material {
  id: string
  title: string // 教材名（問題集名、試験の年度など）
  year?: number
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface Choice {
  key: string // 「ア」「1」「A」など
  text: string
}

export interface Question {
  id: string
  materialId: string
  label: string // 表示用の番号。例：「問1」「第2問(3)」
  body: string // 問題文。$...$ で数式（LaTeX）
  type: QuestionType
  choices?: Choice[]
  answer: string // 解答（正解・模範解答）
  tolerance?: number // 数値問題の許容誤差
  explanation?: string // 解説
  tags: string[]
  source?: string // 出典
  fingerprint: string // 重複検知用のハッシュ
  createdAt: string
  updatedAt: string
  deletedAt?: string
  // この端末（または他の端末）で手動登録・編集・削除した時刻。
  // これがある問題は同期の edits.json に入り、問題ファイルの再取り込みで上書きされない
  editedAt?: string
}

export interface QuestionImage {
  id: string
  questionId: string
  role: 'question' | 'answer'
  blob: Blob
  createdAt: string
}

export type JudgedBy = 'auto' | 'self'

/** 回答ログ。ストリークの唯一の根拠なので、決して削除しない */
export interface Attempt {
  id: string
  questionId: string
  answeredAt: string // UTC
  response?: string // 自分の回答
  correct: boolean
  judgedBy: JudgedBy
  deviceId?: string // どの端末で回答したか（同期で使う。同期を始める前の記録にはない）
}

export interface Settings {
  timeZone: string
  dayStartHour: number
}
