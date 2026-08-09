import { useState } from 'react'
import ImageViewer from '../../../components/Shared/ImageViewer'
import type { TaskImage } from '../../../types'

export default function Thumbnails({ images, size = 20 }: { images: TaskImage[]; size?: number }) {
  const [viewer, setViewer] = useState<{ images: { src: string }[]; index: number } | null>(null)
  if (!images.length) return null
  const srcs = images.map((i) => ({ src: i.file_path }))
  return (
    <div className="flex gap-1.5 mt-1.5 flex-wrap">
      {images.map((img, i) => (
        <img
          key={img.id}
          src={img.file_path}
          className="rounded-lg object-cover border border-gray-200 cursor-zoom-in bg-gray-100"
          style={{ width: size * 4, height: size * 4 }}
          alt=""
          onClick={() => setViewer({ images: srcs, index: i })}
        />
      ))}
      {viewer && <ImageViewer images={viewer.images} initialIndex={viewer.index} onClose={() => setViewer(null)} />}
    </div>
  )
}
