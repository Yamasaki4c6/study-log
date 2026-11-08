// 問題・解答に添付した画像の表示。タップで拡大表示する。

import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import type { QuestionImage } from '../lib/types'

export function QuestionImages({
  questionId,
  role,
  onDelete,
}: {
  questionId: string
  role: QuestionImage['role']
  onDelete?: (id: string) => void
}) {
  const images = useLiveQuery(
    async () => (await db.images.where('questionId').equals(questionId).toArray()).filter((i) => i.role === role),
    [questionId, role],
  )
  if (!images?.length) return null
  return (
    <div className="images">
      {images.map((img) => (
        <BlobImage key={img.id} blob={img.blob} onDelete={onDelete && (() => onDelete(img.id))} />
      ))}
    </div>
  )
}

function BlobImage({ blob, onDelete }: { blob: Blob; onDelete?: () => void }) {
  const [url, setUrl] = useState<string>()
  const [zoom, setZoom] = useState(false)
  useEffect(() => {
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  if (!url) return null
  return (
    <figure className="image">
      <img src={url} alt="" onClick={() => setZoom(true)} />
      {onDelete && (
        <button className="image-delete" onClick={onDelete} aria-label="画像を削除">
          ×
        </button>
      )}
      {zoom && (
        <div className="zoom" onClick={() => setZoom(false)}>
          <img src={url} alt="" />
        </div>
      )}
    </figure>
  )
}
